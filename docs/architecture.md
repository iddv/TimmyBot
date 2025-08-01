# 🏗️ TimmyBot Architecture

*Technical architecture and design decisions*

## 🎯 **Architecture Philosophy**

### Core Principles
- **Simplicity over complexity** - Single ECS service handles everything
- **Security compliance** - AWS Well-Architected Framework best practices
- **Cost control** - Server allowlist prevents runaway costs
- **Guild isolation** - Each Discord server has independent state

### Design Decisions
✅ **Single ECS Service** (vs Lambda + ECS hybrid)
- Discord bots need persistent WebSocket connections
- Voice connections require persistent audio streams
- Simpler to maintain and debug

✅ **Server Allowlist** (vs User trials/subscriptions)
- Manual approval prevents abuse
- Predictable cost control
- Industry standard pattern
- Zero external dependencies

## 🏗️ **System Architecture**

### High-Level Components
```
┌─────────────────────────────────────────────────────────────┐
│                 SIMPLIFIED ECS ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│  ECS Fargate Service  │  DynamoDB Tables  │  Secrets Manager│
│  • Discord Gateway    │  • guild-queues   │  • OAuth tokens │
│  • Slash Commands     │  • user-prefs     │  • auto-rotation│
│  • Voice Connections  │  • track-cache    │                 │
│  • Music Streaming    │                   │                 │
│  • Auto-scale 0-5     │                   │                 │
├─────────────────────────────────────────────────────────────┤
│  S3 Buckets          │  CloudWatch        │  Optional       │
│  • track-metadata    │  • monitoring      │  • Lambda OAuth │
│  • user-cache        │  • auto-scaling    │    (if needed)  │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 **ECS Service Design**

### TimmyBot Service (Main)
```kotlin
@Component
class TimmyBotService {
    
    private val guildQueues = ConcurrentHashMap<String, MutableList<TrackInfo>>()
    private val voiceConnections = ConcurrentHashMap<String, VoiceConnection>()
    private val audioPlayers = ConcurrentHashMap<String, AudioPlayer>()
    
    @PostConstruct
    fun startBot() {
        val client = DiscordClient.create(System.getenv("DISCORD_BOT_TOKEN"))
        
        client.withGateway { gateway ->
            // Handle slash commands with server authorization
            gateway.on(ChatInputInteractionEvent::class.java) { event ->
                handleSlashCommandWithAuth(event)
            }
            
            // Keep gateway connection alive
            Mono.never()
        }.block()
    }
}
```

### ECS Configuration
```yaml
Task Definition:
  CPU: 0.5 vCPU (512 CPU units)
  Memory: 1 GB
  Container Port: 8080
  Health Check: /health endpoint

Auto Scaling:
  Min Capacity: 0 tasks
  Max Capacity: 5 tasks
  Target CPU Utilization: 70%
  Target Memory Utilization: 80%
  
Scale Down Policy:
  - Scale to 0 when no active voice connections for 5 minutes
  - Scale to 1 when first voice connection established
  - Scale up based on CPU/memory pressure
```

## 🗄️ **Data Architecture**

### DynamoDB Tables

#### 1. Guild Queues (Per-Server Isolation)
```yaml
Table: guild-queues
PartitionKey: guildId (String)
Attributes:
  queue: List<Map>
    - id: String
    - title: String
    - artist: String
    - platform: String
    - requestedBy: String
    - addedAt: Number
  currentTrack: Map
  isPlaying: Boolean
  voiceChannelId: String
  lastActive: Number
  ttl: Number (24 hours from lastActive)
```

#### 2. User Preferences
```yaml
Table: user-preferences
PartitionKey: userId (String)
Attributes:
  preferredPlatform: String
  authenticatedPlatforms: List<String>
  lastActiveAt: Number
  settings:
    autoQueue: Boolean (default: true)
    notifyOnPlay: Boolean (default: false)
    preferredQuality: String (default: "high")
  ttl: Number (30 days from lastActiveAt)
```

#### 3. Track Cache
```yaml
Table: track-cache
PartitionKey: trackId (String)
SortKey: platform (String)
Attributes:
  metadata:
    title: String
    artist: String
    duration: Number
    thumbnailUrl: String
  cachedAt: Number
  ttl: Number (7 days from cachedAt)
```

### AWS Secrets Manager
```yaml
Secret Structure: /timmybot/users/{userId}/oauth
Content:
  youtubeOAuth:
    accessToken: String
    refreshToken: String
    expiresAt: Number
    scopes: List<String>
  spotifyOAuth:
    accessToken: String
    refreshToken: String  
    expiresAt: Number
    scopes: List<String>

Rotation: Automatic every 24 hours
Encryption: AWS managed keys
Access: IAM role-based with least privilege
```

## 🔄 **Guild Queue Management**

### Problem Solved
Original code had this critical bug:
```kotlin
// ❌ GLOBAL SHARED QUEUE (BUG!)
val queue: Queue<String> = LinkedList()
```

### Solution: Per-Guild Isolation
```kotlin
// ✅ GUILD-SPECIFIC QUEUES
private val guildQueues = ConcurrentHashMap<String, MutableList<TrackInfo>>()

private suspend fun addTrackToGuildQueue(guildId: String, track: TrackInfo) {
    // Store in DynamoDB for persistence
    dynamoDbClient.updateItem {
        tableName = "guild-queues"
        key = mapOf("guildId" to AttributeValue.S(guildId))
        updateExpression = "SET #queue = list_append(if_not_exists(#queue, :empty_list), :track)"
        expressionAttributeNames = mapOf("#queue" to "queue")
        expressionAttributeValues = mapOf(
            ":track" to AttributeValue.L(listOf(AttributeValue.M(track.toDynamoMap()))),
            ":empty_list" to AttributeValue.L(emptyList())
        )
    }
    
    // Also update in-memory cache
    guildQueues.computeIfAbsent(guildId) { mutableListOf() }.add(track)
}
```

### Benefits
- ✅ **Server Isolation**: Each Discord server has independent queue
- ✅ **Persistence**: Survives service restarts via DynamoDB
- ✅ **Performance**: In-memory cache for active guilds
- ✅ **Cleanup**: TTL removes inactive guild data

## 🔧 **Service Integration**

### Discord Gateway Connection
```kotlin
// Persistent WebSocket connection
client.withGateway { gateway ->
    // Handle all Discord events
    gateway.on(ChatInputInteractionEvent::class.java) { event ->
        handleSlashCommandWithAuth(event)
    }
    
    gateway.on(VoiceStateUpdateEvent::class.java) { event ->
        handleVoiceStateChange(event)
    }
    
    // Keep connection alive
    Mono.never()
}
```

### Music Service Integration
```kotlin
suspend fun searchTrack(query: String, userTokens: OAuthTokens): TrackInfo {
    // Parallel search across authenticated platforms
    val searchTasks = listOf(
        async { userTokens.youtubeToken?.let { youtubeService.search(query, it) } },
        async { userTokens.spotifyToken?.let { spotifyService.search(query, it) } },
        async { userTokens.soundcloudToken?.let { soundcloudService.search(query, it) } }
    )
    
    val results = searchTasks.awaitAll().filterNotNull().flatten()
    
    // Smart ranking: Premium > Platform preference > Quality
    return results.sortedWith(
        compareByDescending<TrackInfo> { it.isPremium }
            .thenByDescending { it.platform == userTokens.preferredPlatform }
            .thenByDescending { it.quality }
    ).first()
}
```

## 📊 **Scalability Characteristics**

### Horizontal Scaling
- **ECS Tasks**: 0-5 instances based on load
- **DynamoDB**: On-demand scaling, pay-per-request
- **Secrets Manager**: Per-user scaling (controlled by allowlist)

### Performance Targets
- **Command Response**: <500ms average
- **Voice Connection**: <1s to join
- **Track Search**: <2s across platforms
- **Queue Updates**: <100ms local, eventual consistency for persistence

### Resource Utilization
- **CPU**: Voice processing and API calls
- **Memory**: In-memory caches and Discord connections
- **Network**: Discord Gateway, music API calls, audio streaming

---

**🔄 Last Updated**: August 2025  
**📖 Related Docs**: [Access Control](access-control.md), [Authentication](authentication.md), [Deployment](deployment.md)