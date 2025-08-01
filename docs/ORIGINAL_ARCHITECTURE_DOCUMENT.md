# 🚀 TimmyBot Architecture Design Document
*Simplified AWS-Compliant Discord Music Bot with Single ECS Service & Secure OAuth Authentication*

---

## 📋 Executive Summary

**TimmyBot** is being redesigned as a **simplified single-service** Discord music bot with **server allowlist access control** that follows AWS security best practices while providing premium music streaming features through secure user OAuth authentication. This approach prioritizes cost control, simplicity, and production readiness based on unanimous zen advisor consensus.

### Key Innovations
- **Server allowlist access control** (manual approval prevents cost explosion)
- **Simplified single-service architecture** (one ECS service handles everything)
- **Self-deployment option** (users can run their own instance)
- **Proper guild isolation** (fixes shared queue bug in original code)
- **AWS security compliance** (OAuth tokens in Secrets Manager for approved users)
- **Premium features for all users** without bot subscriptions
- **Legal compliance** through direct user authentication

---

## 🎯 Business Objectives

### Primary Goals
1. **Security & Compliance**: Follow AWS Well-Architected Framework best practices
2. **Feature Differentiation**: First Discord bot with user OAuth music streaming
3. **Legal Compliance**: Eliminate ToS violations through user authentication
4. **Production Readiness**: Handle persistent connections and real-time streaming
5. **Cost Optimization**: Minimize costs while maintaining security standards

### Success Metrics
- **Security Compliance**: 100% AWS Well-Architected Framework alignment
- **User Adoption**: Premium features available to 100% of users
- **Uptime**: 99.9% availability with hybrid auto-scaling
- **Legal Risk**: Zero (users authenticate with their own accounts)
- **Cost Efficiency**: ~$415/month for enterprise-grade security and performance

---

## 🏗️ Architecture Overview

### Core Philosophy: "Bring Your Own Premium"
Instead of the bot managing music service accounts, users authenticate with their own premium subscriptions, unlocking:
- 🎵 **YouTube Premium**: Ad-free, high-quality, unlimited usage
- 🎶 **Spotify Premium**: Full catalog, no shuffle restrictions
- 🎧 **SoundCloud Pro**: High-quality streams, longer tracks
- 🍎 **Apple Music**: Lossless audio, exclusive content

### System Architecture Diagram
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

---

## 💰 Cost Analysis

### Simplified Cost Analysis with Server Allowlist

| Service | Free Tier Limit | TimmyBot Usage | Monthly Cost |
|---------|-----------------|----------------|--------------|
| **ECS Fargate** | No free tier | 0.5 vCPU, 1GB, auto-scale 0-5 | **$10-30** |
| **DynamoDB** | 25GB storage + 25 RCU/WCU | ~1GB storage, on-demand | **$0-2** |
| **S3** | 5GB storage + 20K GET requests | ~2GB cache | **$0** |
| **Secrets Manager** | No free tier | ~25-50 approved servers | **$10-20** |
| **CloudWatch** | 10 metrics + 1M API requests | Basic monitoring | **$0** |
| **TOTAL** | | | **$20-52/month** |

### Cost Control Through Server Allowlist

| Approach | Approved Servers | OAuth Users | Secrets Manager Cost | Total Monthly |
|----------|------------------|-------------|---------------------|---------------|
| **No Control** | ∞ | 1,000+ | $400+ | $450+ |
| **Server Allowlist** | 25-50 | 25-50 | $10-20 | $20-52 |
| **Self-Deploy** | N/A | User pays | $0 | $0 |

### Simplified Cost Comparison
```
❌ ORIGINAL OVER-ENGINEERED:
   Lambda + ECS + Secrets:   ~$415/month
   Complexity:               High (2 services + coordination)

✅ SIMPLIFIED ARCHITECTURE:
   Single ECS + Secrets:     ~$425/month  
   Complexity:               Low (1 main service)
   
❌ TRADITIONAL APPROACH:
   Always-on ECS:            ~$57/month
   Security:                 Poor (hardcoded secrets)
   
📊 REALITY CHECK:
   Secrets Manager cost:     ~94% of total cost
   ECS scaling savings:      ~$20-40/month vs always-on
   Simplicity benefit:       ✅ Much easier to maintain
```

---

## 🔧 Technical Architecture

### ECS Service Design

#### Single ECS Service: `timmybot-service`
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
            // Handle slash commands
            gateway.on(ChatInputInteractionEvent::class.java) { event ->
                when (event.commandName) {
                    "play" -> handlePlayCommand(event)
                    "queue" -> handleQueueCommand(event)
                    "skip" -> handleSkipCommand(event)
                    "my-playlists" -> handleMyPlaylistsCommand(event)
                    else -> event.reply("Unknown command")
                }
            }
            
            // Keep the gateway connection alive
            Mono.never()
        }.block()
    }
    
    private fun handlePlayCommand(event: ChatInputInteractionEvent): Mono<Void> {
        val guildId = event.interaction.guildId.get().asString()
        val query = event.getOption("query").get().value.get().asString()
        
        return async {
            // Get user's OAuth tokens from Secrets Manager
            val userTokens = secretsManager.getSecretValue {
                secretId = "/timmybot/users/${event.interaction.user.id.asString()}/oauth"
            }
            
            // Search across user's authenticated platforms
            val track = searchTrack(query, userTokens)
            
            // Add to guild-specific queue in DynamoDB
            addTrackToGuildQueue(guildId, track)
            
            // If not playing, start playing
            if (!isPlaying(guildId)) {
                playNextTrack(guildId)
            }
            
            event.reply("Added to queue: ${track.title}")
        }.asCompletion()
    }
    
    private suspend fun addTrackToGuildQueue(guildId: String, track: TrackInfo) {
        // Store in DynamoDB for persistence across restarts
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
        
        // Also update in-memory cache for fast access
        guildQueues.computeIfAbsent(guildId) { mutableListOf() }.add(track)
    }
    
    private fun playNextTrack(guildId: String) {
        val queue = guildQueues[guildId] ?: return
        if (queue.isEmpty()) return
        
        val track = queue.removeAt(0)
        val voiceConnection = voiceConnections[guildId] ?: return
        val audioPlayer = audioPlayers[guildId] ?: return
        
        // Stream track directly from user's authenticated service
        audioPlayer.playTrack(track.toLavaPlayerTrack())
        
        // Update DynamoDB
        removeTrackFromGuildQueue(guildId, track)
    }
}
```

**ECS Fargate Configuration:**
- CPU: 0.5 vCPU (512 CPU units) - needs more power for voice processing
- Memory: 1 GB - handles multiple guild connections  
- Auto Scaling: 0-5 tasks based on active guild connections
- Scale down to 0 when no active guilds (cost optimization)
- Health checks: HTTP endpoint on port 8080
- Expected cost: ~$10-30/month (with aggressive scaling)

## 🔒 **Server Allowlist Access Control**

### Simple Implementation Strategy
```kotlin
@Component
class ServerAccessControl {
    
    // Version-controlled allowlist for audit trail
    private val allowedGuilds = setOf(
        "123456789012345678", // Example Discord Server 1
        "987654321098765432", // Example Discord Server 2
        // Add new server IDs here after manual approval
    )
    
    fun isGuildAllowed(guildId: String): Boolean {
        return allowedGuilds.contains(guildId)
    }
    
    fun handleUnauthorizedGuild(event: ChatInputInteractionEvent): Mono<Void> {
        return event.reply()
            .withEphemeral(true)
            .withContent(buildAccessRequestMessage())
            .then()
    }
    
    private fun buildAccessRequestMessage(): String {
        return """
        🚫 **This server is not authorized to use TimmyBot**
        
        📧 **Request Access:**
        • GitHub: Contact [@yourusername](https://github.com/yourusername)
        • LinkedIn: Message me at [linkedin.com/in/yourprofile](https://linkedin.com/in/yourprofile)
        
        🔧 **Self-Deploy Option:**
        • Deploy your own instance: [GitHub Repository](https://github.com/yourusername/timmybot)
        • Full control over your bot and AWS costs
        
        ⏱️ **Response Time:** Usually 24-48 hours for manual approval
        """.trimIndent()
    }
}
```

### Access Control Integration
```kotlin
@Component
class TimmyBotService {
    
    @Autowired
    private lateinit var accessControl: ServerAccessControl
    
    private fun handleSlashCommand(event: ChatInputInteractionEvent): Mono<Void> {
        val guildId = event.interaction.guildId.orElse(null)?.asString()
        
        // Check server authorization first
        if (guildId == null || !accessControl.isGuildAllowed(guildId)) {
            return accessControl.handleUnauthorizedGuild(event)
        }
        
        // Proceed with normal command handling
        return when (event.commandName) {
            "play" -> handlePlayCommand(event)
            "queue" -> handleQueueCommand(event) 
            "skip" -> handleSkipCommand(event)
            else -> event.reply("Unknown command")
        }
    }
}
```

### Manual Approval Workflow
```yaml
Request Process:
  1. User finds bot in unauthorized server
  2. Bot displays contact information (GitHub/LinkedIn)
  3. User sends request with:
     - Discord server name and ID
     - Intended use case
     - Estimated user count
  4. Manual review (24-48 hours)
  5. Add server ID to allowlist
  6. Deploy updated configuration

Approval Criteria:
  - Legitimate Discord community
  - Reasonable expected usage
  - Clear use case description
  - Server owner contact information

Deployment:
  - Update allowedGuilds set in code
  - Commit to version control (audit trail)
  - Deploy via CI/CD pipeline
  - Test access in approved server
```

### Self-Deployment Alternative
```yaml
GitHub Repository Structure:
  /docs/
    - DEPLOYMENT.md (AWS setup guide)
    - COSTS.md (cost breakdown and optimization)
    - CONFIGURATION.md (environment variables)
  /terraform/ (optional infrastructure as code)
  /docker/ (containerization for ECS)
  
Benefits:
  - Users control their own AWS costs
  - No dependency on central service
  - Full customization capability
  - Learning opportunity for cloud deployment
  
Documentation Required:
  - Step-by-step AWS setup
  - Discord bot token configuration
  - OAuth client setup for music services
  - Cost monitoring and optimization tips
```

## 🎵 **Guild Queue Management Solution**

This addresses your question about managing queues across different servers:

### DynamoDB Schema for Guild Queues
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
  currentTrack:
    id: String
    title: String
    startedAt: Number
    requestedBy: String
  isPlaying: Boolean
  voiceChannelId: String
  lastActive: Number
  ttl: Number (24 hours from lastActive)
```

### In-Memory + DynamoDB Hybrid
- **In-memory**: Fast access for currently active guilds
- **DynamoDB**: Persistence across service restarts  
- **Automatic sync**: Updates both on every change
- **TTL cleanup**: Auto-removes inactive guild data

#### Optional: OAuth Manager (Lambda)
```kotlin
@Component
class OAuthManagerLambda {
    
    suspend fun initiateYouTubeAuth(userId: String): OAuthInitResponse {
        // Generate device flow for TV/Limited Input devices
        val deviceCodeResponse = googleOAuthClient.getDeviceCode(
            clientId = System.getenv("YOUTUBE_CLIENT_ID"),
            scopes = listOf(
                "https://www.googleapis.com/auth/youtube.readonly",
                "https://www.googleapis.com/auth/youtubepartner"
            )
        )
        
        // Store pending auth in DynamoDB with TTL
        dynamoDbClient.putItem {
            tableName = "user-auth-pending"
            item = mapOf(
                "userId" to AttributeValue.S(userId),
                "deviceCode" to AttributeValue.S(deviceCodeResponse.deviceCode),
                "userCode" to AttributeValue.S(deviceCodeResponse.userCode),
                "verificationUrl" to AttributeValue.S(deviceCodeResponse.verificationUrl),
                "ttl" to AttributeValue.N((System.currentTimeMillis() / 1000 + 900).toString()) // 15 min TTL
            )
        }
        
        return OAuthInitResponse(
            userCode = deviceCodeResponse.userCode,
            verificationUrl = deviceCodeResponse.verificationUrl,
            message = buildAuthMessage(deviceCodeResponse)
        )
    }
    
    suspend fun checkAuthStatus(userId: String): AuthStatusResponse {
        val pendingAuth = getPendingAuth(userId)
            ?: return AuthStatusResponse(status = "NO_PENDING_AUTH")
        
        // Poll OAuth provider for completion
        val tokenResponse = try {
            googleOAuthClient.getToken(pendingAuth.deviceCode)
        } catch (e: AuthPendingException) {
            return AuthStatusResponse(status = "PENDING", message = "⏳ Still waiting for authentication...")
        }
        
        // Store OAuth tokens in Secrets Manager (AWS Best Practice)
        storeUserTokensInSecretsManager(userId, tokenResponse)
        
        // Clean up pending auth
        deletePendingAuth(userId)
        
        return AuthStatusResponse(
            status = "SUCCESS",
            message = buildSuccessMessage("YouTube Premium")
        )
    }
}
```

**Configuration:**
- Memory: 256MB
- Timeout: 30 seconds
- Expected requests: ~50K/month

### ECS Fargate Auto-Scaling Configuration

#### Cost-Optimized Scaling Strategy
```yaml
Service: timmybot-music-streaming
Cluster: timmybot-cluster

Task Definition:
  CPU: 256 (0.25 vCPU)
  Memory: 512 MB
  Container Port: 8080
  Health Check: /health endpoint

Auto Scaling:
  Min Capacity: 0 tasks
  Max Capacity: 3 tasks
  Target CPU Utilization: 70%
  Target Memory Utilization: 80%
  
Scale Down Policy:
  - Scale to 0 when no active voice connections for 5 minutes
  - Scale to 1 when first voice connection established
  - Scale up based on CPU/memory pressure

Custom Metrics:
  - Active voice connections count
  - Audio stream processing load
  - Queue processing latency

Cost Optimization:
  - Aggressive scale-to-zero: Saves ~80% of costs during low usage
  - Spot instances: Additional 50% cost reduction where possible
  - Expected uptime: 4-8 hours/day for typical usage
  - Monthly cost: $5-15 (vs $50+ for always-on)
```

### AWS Secrets Manager Integration

#### OAuth Token Storage (AWS Best Practice)
```yaml
Secret Structure: /timmybot/users/{userId}/oauth
Format: JSON
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
  soundcloudOAuth:
    accessToken: String
    refreshToken: String
    expiresAt: Number
    scopes: List<String>

Rotation: Automatic every 24 hours
Encryption: AWS managed keys
Access: IAM role-based with least privilege
Cost: ~$0.40 per secret per month
Expected Secrets: ~10,000 active users = ~$4,000/month

Note: This is a significant cost increase from DynamoDB but follows AWS security best practices
```

### DynamoDB Schema Design

#### Table 1: `guild-state`
```yaml
PartitionKey: guildId (String)
Attributes:
  currentTrack: 
    id: String
    title: String
    artist: String
    platform: String
    requestedBy: String
    startedAt: Number
  queue: List<Map>
    - id: String
      title: String  
      artist: String
      duration: Number
      platform: String
      requestedBy: String
      addedAt: Number
  settings:
    prefix: String (default: "!")
    volume: Number (default: 50)
    autoSkip: Boolean (default: true)
  voiceChannelId: String
  textChannelId: String
  lastActive: Number
  ttl: Number (24 hours from lastActive)

Indexes:
  - GSI1: lastActive-index (for cleanup)
  
Estimated Size: ~1KB per guild
Expected Guilds: ~10,000
Total Storage: ~10MB
```

#### Table 2: `user-preferences` (Simplified)
```yaml
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

Estimated Size: ~1KB per user
Expected Active Users: ~50 (server allowlist control)
Total Storage: ~50KB

Note: OAuth tokens stored in Secrets Manager for approved users only
```

#### Table 3: `track-cache`
```yaml
PartitionKey: trackId (String)
SortKey: platform (String) 
Attributes:
  metadata:
    title: String
    artist: String
    duration: Number
    thumbnailUrl: String
    albumName: String
  streamUrl: String (if available)
  quality: String
  cachedAt: Number
  ttl: Number (7 days from cachedAt)

Expected Items: ~1M tracks
Estimated Size: ~500B per track
Total Storage: ~500MB
```

### S3 Bucket Structure

#### Bucket 1: `timmybot-cache`
```
/tracks/
  /{trackId}/
    metadata.json      # Track information cache
    thumbnail.jpg      # Album artwork cache
/playlists/
  /{userId}/
    {playlistId}.json  # User playlist cache
/temp/
  /{sessionId}/        # Temporary processing files
```

#### Bucket 2: `timmybot-user-data`
```
/preferences/
  /{userId}/
    settings.json      # User preferences
    history.json       # Recent listening history
/analytics/
  /daily/
    {date}.json        # Usage analytics
```

**Storage Estimates:**
- Track metadata: ~1GB
- User preferences: ~500MB
- Temporary files: ~500MB
- Total: ~2GB (within 5GB free tier)

---

## 🔐 User OAuth Authentication System

### Supported Platforms

#### YouTube Premium Integration
```kotlin
class YouTubePremiumService : MusicService {
    
    override suspend fun search(query: String, userToken: OAuthTokens): List<TrackInfo> {
        val ytMusic = YTMusic(
            auth = userToken.accessToken,
            oauth_credentials = OAuthCredentials(
                client_id = System.getenv("YOUTUBE_CLIENT_ID"),
                client_secret = System.getenv("YOUTUBE_CLIENT_SECRET")
            )
        )
        
        val results = ytMusic.search(query, filter = "songs", limit = 10)
        return results.map { result ->
            TrackInfo(
                id = result.videoId,
                title = result.title,
                artist = result.artists?.firstOrNull()?.name ?: "Unknown",
                duration = result.duration_seconds,
                thumbnailUrl = result.thumbnails?.lastOrNull()?.url,
                platform = "youtube",
                isPremium = true, // User's own premium account!
                quality = "high"  // Premium quality available
            )
        }
    }
    
    override suspend fun getUserPlaylists(userToken: OAuthTokens): List<PlaylistInfo> {
        val ytMusic = createYTMusicClient(userToken)
        val playlists = ytMusic.getLibraryPlaylists()
        
        return playlists.map { playlist ->
            PlaylistInfo(
                id = playlist.playlistId,
                name = playlist.title,
                trackCount = playlist.trackCount,
                platform = "youtube",
                isPersonal = true
            )
        }
    }
}
```

#### Spotify Premium Integration
```kotlin
class SpotifyPremiumService : MusicService {
    
    override suspend fun search(query: String, userToken: OAuthTokens): List<TrackInfo> {
        val spotifyApi = SpotifyApi.builder()
            .setAccessToken(userToken.accessToken)
            .build()
            
        val searchResult = spotifyApi.searchTracks(query)
            .limit(10)
            .build()
            .execute()
            
        return searchResult.items.map { track ->
            TrackInfo(
                id = track.id,
                title = track.name,
                artist = track.artists.firstOrNull()?.name ?: "Unknown",
                duration = track.durationMs / 1000,
                thumbnailUrl = track.album.images.firstOrNull()?.url,
                platform = "spotify",
                isPremium = true, // User's premium features!
                quality = if (isSpotifyHiFi(userToken)) "lossless" else "high"
            )
        }
    }
}
```

### Authentication Flow
```
1. User: /auth-youtube
2. Bot: Returns device code + verification URL
3. User: Goes to URL, enters code, authenticates
4. User: /check-auth
5. Bot: Polls OAuth provider, stores tokens
6. User: Can now use premium features!
```

### Benefits Per Platform
| Platform | Premium Benefits |
|----------|-----------------|
| **YouTube Premium** | • No ads • High quality audio • Background play • Personal playlists • Unlimited usage |
| **Spotify Premium** | • No ads • Lossless audio • No shuffle restrictions • Offline playlists • Full catalog |
| **SoundCloud Pro** | • High quality streams • Longer tracks • No ads • Pro features |
| **Apple Music** | • Lossless/Hi-Res audio • Spatial Audio • Exclusive content • Full catalog |

---

## 🎵 Enhanced Command System

### Core Commands

#### `/play [query]` - Smart Music Search
```kotlin
suspend fun handlePlayCommand(guildId: String, userId: String, query: String): DiscordResponse {
    // Check user authentication status
    val userTokens = getUserTokens(userId)
    
    if (userTokens.isEmpty()) {
        return DiscordResponse.ephemeral(buildAuthPrompt())
    }
    
    // Search across all authenticated platforms
    val searchResults = mutableListOf<TrackInfo>()
    
    // Parallel search across platforms
    val searchTasks = listOf(
        async { userTokens.youtubeToken?.let { youtubeService.search(query, it) } },
        async { userTokens.spotifyToken?.let { spotifyService.search(query, it) } },
        async { userTokens.soundcloudToken?.let { soundcloudService.search(query, it) } }
    )
    
    searchTasks.awaitAll().filterNotNull().forEach { results ->
        searchResults.addAll(results)
    }
    
    if (searchResults.isEmpty()) {
        return DiscordResponse.public("❌ No results found for: `$query`")
    }
    
    // Smart ranking algorithm
    val rankedResults = searchResults
        .sortedWith(
            compareByDescending<TrackInfo> { it.isPremium }
                .thenByDescending { it.platform == userTokens.preferredPlatform }
                .thenByDescending { it.quality }
                .thenByDescending { it.duration != null }
        )
    
    val selectedTrack = rankedResults.first()
    
    // Add to guild queue
    guildStateManager.addToQueue(guildId, selectedTrack, userId)
    val queuePosition = guildStateManager.getQueueSize(guildId)
    
    return DiscordResponse.public(buildTrackAddedMessage(selectedTrack, queuePosition))
}
```

#### `/my-playlists` - Personal Playlist Access
```kotlin
suspend fun handleMyPlaylistsCommand(userId: String): DiscordResponse {
    val userTokens = getUserTokens(userId)
    
    if (userTokens.isEmpty()) {
        return DiscordResponse.ephemeral("🔐 Please authenticate first!")
    }
    
    // Fetch playlists from all authenticated platforms
    val allPlaylists = mutableListOf<PlaylistInfo>()
    
    userTokens.youtubeToken?.let { token ->
        allPlaylists.addAll(youtubeService.getUserPlaylists(token))
    }
    
    userTokens.spotifyToken?.let { token ->
        allPlaylists.addAll(spotifyService.getUserPlaylists(token))
    }
    
    // Create interactive buttons for playlist selection
    val playlistButtons = allPlaylists.take(10).mapIndexed { index, playlist ->
        ActionRow.of(
            Button.primary(
                "play_playlist:${playlist.id}:${playlist.platform}", 
                "${playlist.name} (${playlist.trackCount} songs) [${playlist.platform.uppercase()}]"
            )
        )
    }
    
    return DiscordResponse.ephemeral(
        content = "🎵 **Your Personal Playlists**\nChoose a playlist to add to the queue:",
        components = playlistButtons
    )
}
```

#### `/play-history` - Recent Listening History
```kotlin
suspend fun handlePlayHistoryCommand(userId: String, guildId: String): DiscordResponse {
    val userTokens = getUserTokens(userId)
    
    val ytMusic = createYTMusicClient(userTokens.youtubeToken)
    val history = ytMusic.getHistory().take(10)
    
    val historyButtons = history.map { track ->
        Button.secondary(
            "play:${track.videoId}", 
            "${track.title} - ${track.artists.first().name}"
        )
    }
    
    return DiscordResponse.ephemeral(
        content = "🎵 **Your Recent YouTube Music History**\nClick to add to queue:",
        components = historyButtons.chunked(5).map { ActionRow.of(*it.toTypedArray()) }
    )
}
```

### Premium-Only Commands

#### `/liked-songs` - User's Liked Music
```kotlin
@SlashCommand("liked-songs")
suspend fun playLikedSongs(userId: String, guildId: String): DiscordResponse {
    val userTokens = getUserTokens(userId)
    
    when {
        userTokens.youtubeToken != null -> {
            val ytMusic = createYTMusicClient(userTokens.youtubeToken)
            val likedSongs = ytMusic.getLikedSongs().tracks.take(50)
            
            likedSongs.forEach { track ->
                guildStateManager.addToQueue(guildId, track.toTrackInfo(), userId)
            }
            
            return DiscordResponse.public(
                "❤️ **Added ${likedSongs.size} liked songs to queue!**\n" +
                "Playing your personal YouTube Music favorites! ⭐"
            )
        }
        
        userTokens.spotifyToken != null -> {
            val spotifyApi = createSpotifyClient(userTokens.spotifyToken)
            val likedTracks = spotifyApi.usersSavedTracks.build().execute()
            
            // Similar implementation for Spotify
        }
        
        else -> {
            return DiscordResponse.ephemeral("🔐 Please authenticate with YouTube or Spotify first!")
        }
    }
}
```

#### `/recommendations` - AI-Powered Suggestions
```kotlin
@SlashCommand("recommendations")
suspend fun getRecommendations(userId: String): DiscordResponse {
    val userTokens = getUserTokens(userId)
    val ytMusic = createYTMusicClient(userTokens.youtubeToken)
    
    // Get user's listening history for context
    val recentTracks = ytMusic.getHistory().take(5)
    val seedTrack = recentTracks.firstOrNull()
        ?: return DiscordResponse.ephemeral("❌ No listening history found!")
    
    // Get YouTube Music's AI recommendations based on user's actual data
    val recommendations = ytMusic.getWatchPlaylist(seedTrack.videoId)
        .take(10)
        .map { it.toTrackInfo() }
    
    val recommendationButtons = recommendations.map { track ->
        Button.success(
            "play:${track.id}",
            "${track.title} - ${track.artist}"
        )
    }
    
    return DiscordResponse.ephemeral(
        content = "🤖 **AI Recommendations Based on Your History**\n" +
                 "Powered by YouTube Music's recommendation engine:",
        components = recommendationButtons.chunked(5).map { ActionRow.of(*it.toTypedArray()) }
    )
}
```

---

## 🚀 Deployment Strategy

### AWS CloudFormation Template (Updated for Best Practices)
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: TimmyBot Hybrid Serverless Discord Music Bot

Parameters:
  DiscordBotToken:
    Type: String
    NoEcho: true
  YouTubeClientId:
    Type: String
    NoEcho: true
  YouTubeClientSecret:
    Type: String
    NoEcho: true
  SpotifyClientId:
    Type: String
    NoEcho: true
  SpotifyClientSecret:
    Type: String
    NoEcho: true

Globals:
  Function:
    Runtime: java17
    Timeout: 30
    MemorySize: 256  # Right-sized
    Environment:
      Variables:
        DISCORD_BOT_TOKEN: !Ref DiscordBotToken

Resources:
  # Lambda Functions (Right-sized)
  DiscordHandlerFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: build/libs/timmybot-1.0.jar
      Handler: timmybot.TimmyBotLambdaHandler::handleRequest
      Events:
        DiscordWebhook:
          Type: Api
          Properties:
            Path: /discord/webhook
            Method: post
      Environment:
        Variables:
          GUILD_STATE_TABLE: !Ref GuildStateTable
          USER_PREFERENCES_TABLE: !Ref UserPreferencesTable
          TRACK_CACHE_TABLE: !Ref TrackCacheTable
          SECRETS_MANAGER_PREFIX: /timmybot/users/

  OAuthManagerFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: build/libs/timmybot-1.0.jar
      Handler: timmybot.OAuthManagerLambda::handleRequest
      Events:
        OAuthApi:
          Type: Api
          Properties:
            Path: /oauth/{platform}/{action}
            Method: post
      Policies:
        - SecretsManagerWritePolicy:
            SecretArn: !Sub "${AWS::StackName}-user-oauth-*"

  # ECS Cluster for Music Streaming
  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: timmybot-cluster
      CapacityProviders:
        - FARGATE
        - FARGATE_SPOT  # Cost optimization

  MusicStreamingTaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: timmybot-music-streaming
      NetworkMode: awsvpc
      RequiresCompatibilities:
        - FARGATE
      Cpu: 256  # 0.25 vCPU
      Memory: 512  # 512 MB
      ExecutionRoleArn: !Ref ECSExecutionRole
      TaskRoleArn: !Ref ECSTaskRole
      ContainerDefinitions:
        - Name: music-streaming
          Image: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/timmybot-music:latest"
          PortMappings:
            - ContainerPort: 8080
          Environment:
            - Name: GUILD_STATE_TABLE
              Value: !Ref GuildStateTable
            - Name: SECRETS_MANAGER_PREFIX
              Value: /timmybot/users/
          HealthCheck:
            Command:
              - CMD-SHELL
              - "curl -f http://localhost:8080/health || exit 1"
            Interval: 30
            Timeout: 5
            Retries: 3
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref MusicStreamingLogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: ecs

  MusicStreamingService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref ECSCluster
      TaskDefinition: !Ref MusicStreamingTaskDefinition
      LaunchType: FARGATE
      DesiredCount: 0  # Start with 0 for cost optimization
      NetworkConfiguration:
        AwsvpcConfiguration:
          AssignPublicIp: ENABLED
          SecurityGroups:
            - !Ref MusicStreamingSecurityGroup
          Subnets:
            - !Ref PublicSubnet
      ServiceTags:
        - Key: Service
          Value: TimmyBot
        - Key: Component
          Value: MusicStreaming

  # Auto Scaling for ECS Service
  AutoScalingTarget:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      MaxCapacity: 3
      MinCapacity: 0  # Scale to zero for cost optimization
      ResourceId: !Sub "service/${ECSCluster}/${MusicStreamingService.Name}"
      RoleARN: !Sub "arn:aws:iam::${AWS::AccountId}:role/application-autoscaling-ecs-service"
      ScalableDimension: ecs:service:DesiredCount
      ServiceNamespace: ecs

  AutoScalingPolicy:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: TimmyBotMusicStreamingScalingPolicy
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref AutoScalingTarget
      TargetTrackingScalingPolicyConfiguration:
        PredefinedMetricSpecification:
          PredefinedMetricType: ECSServiceAverageCPUUtilization
        TargetValue: 70.0
        ScaleOutCooldown: 300
        ScaleInCooldown: 600  # Longer cooldown for scale-in to avoid thrashing

  # DynamoDB Tables
  GuildStateTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-guild-state
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: guildId
          AttributeType: S
        - AttributeName: lastActive
          AttributeType: N
      KeySchema:
        - AttributeName: guildId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: lastActive-index
          KeySchema:
            - AttributeName: lastActive
              KeyType: HASH
          Projection:
            ProjectionType: KEYS_ONLY
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  UserTokensTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-user-tokens
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  TrackCacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: timmybot-track-cache
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: trackId
          AttributeType: S
        - AttributeName: platform
          AttributeType: S
      KeySchema:
        - AttributeName: trackId
          KeyType: HASH
        - AttributeName: platform
          KeyType: RANGE
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  # S3 Buckets
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "timmybot-cache-${AWS::AccountId}"
      LifecycleConfiguration:
        Rules:
          - Status: Enabled
            ExpirationInDays: 7
            Id: DeleteOldCache

  UserDataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "timmybot-user-data-${AWS::AccountId}"
      LifecycleConfiguration:
        Rules:
          - Status: Enabled
            ExpirationInDays: 30
            Id: DeleteOldUserData

  # EventBridge Custom Bus
  TimmyBotEventBus:
    Type: AWS::Events::EventBus
    Properties:
      Name: timmybot-events

Outputs:
  DiscordWebhookUrl:
    Description: Discord webhook URL for bot registration
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/discord/webhook"
  
  OAuthCallbackUrl:
    Description: OAuth callback URL for music service registration
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/oauth"
```

### Deployment Commands
```bash
# 1. Build the Kotlin application
./gradlew build

# 2. Deploy using AWS SAM
sam build
sam deploy --guided --parameter-overrides \
  DiscordBotToken=$DISCORD_BOT_TOKEN \
  YouTubeClientId=$YOUTUBE_CLIENT_ID \
  YouTubeClientSecret=$YOUTUBE_CLIENT_SECRET \
  SpotifyClientId=$SPOTIFY_CLIENT_ID \
  SpotifyClientSecret=$SPOTIFY_CLIENT_SECRET

# 3. Update Discord bot webhook URL
aws apigateway get-rest-apis --query 'items[?name==`timmybot-serverless`].id' --output text
```

### CI/CD Pipeline (GitHub Actions)
```yaml
name: Deploy TimmyBot to AWS Lambda

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
      - run: ./gradlew test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup AWS SAM
        uses: aws-actions/setup-sam@v2
        
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
          
      - name: Build application
        run: ./gradlew build
        
      - name: Deploy to AWS
        run: |
          sam build
          sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
            --parameter-overrides \
            DiscordBotToken=${{ secrets.DISCORD_BOT_TOKEN }} \
            YouTubeClientId=${{ secrets.YOUTUBE_CLIENT_ID }} \
            YouTubeClientSecret=${{ secrets.YOUTUBE_CLIENT_SECRET }} \
            SpotifyClientId=${{ secrets.SPOTIFY_CLIENT_ID }} \
            SpotifyClientSecret=${{ secrets.SPOTIFY_CLIENT_SECRET }}
```

---

## 📊 Migration Roadmap

### Phase 1: Serverless Foundation (Week 1)
**Objective**: Convert existing monolithic bot to serverless Lambda architecture

**Tasks:**
1. **Refactor Main Class** to Lambda handler
   ```kotlin
   // Convert from:
   fun main(args: Array<String>) { /* 265 lines */ }
   
   // To:
   override fun handleRequest(input: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent
   ```

2. **Replace Global State** with DynamoDB
   ```kotlin
   // Convert from:
   val queue: Queue<String> = LinkedList()
   
   // To:
   class GuildStateManager(private val dynamoDbClient: DynamoDbClient)
   ```

3. **Add Health Monitoring**
   ```kotlin
   @GetMapping("/health")
   fun health(): Map<String, Any> = mapOf(
       "status" to "healthy",
       "timestamp" to System.currentTimeMillis(),
       "version" to "2.0.0"
   )
   ```

**Deliverables:**
- Working Lambda deployment
- DynamoDB integration
- Basic Discord slash commands
- Health monitoring endpoint

### Phase 2: OAuth Integration (Week 2)
**Objective**: Implement user authentication with music streaming services

**Tasks:**
1. **YouTube OAuth Flow**
   ```kotlin
   // Device code flow for TV/Limited Input devices
   class YouTubeOAuthService {
       suspend fun initiateAuth(userId: String): OAuthInitResponse
       suspend fun checkAuthStatus(userId: String): AuthStatusResponse
       suspend fun refreshTokens(userId: String): TokenRefreshResponse
   }
   ```

2. **Spotify OAuth Flow**
   ```kotlin
   class SpotifyOAuthService {
       suspend fun initiateAuth(userId: String): OAuthInitResponse
       suspend fun exchangeCodeForTokens(code: String, userId: String): TokenResponse
   }
   ```

3. **Multi-Platform Music Search**
   ```kotlin
   class UnifiedMusicService {
       suspend fun searchAcrossPlatforms(query: String, userTokens: UserTokens): List<TrackInfo>
   }
   ```

**Deliverables:**
- YouTube Premium authentication
- Spotify Premium authentication
- Multi-platform search functionality
- Token refresh mechanisms

### Phase 3: Premium Features (Week 3)
**Objective**: Implement premium music features using user authentication

**Tasks:**
1. **Personal Playlist Access**
   ```kotlin
   @SlashCommand("my-playlists")
   suspend fun handleMyPlaylists(userId: String): DiscordResponse
   ```

2. **Listening History Integration**
   ```kotlin
   @SlashCommand("play-history")
   suspend fun handlePlayHistory(userId: String): DiscordResponse
   ```

3. **AI Recommendations**
   ```kotlin
   @SlashCommand("recommendations")
   suspend fun handleRecommendations(userId: String): DiscordResponse
   ```

4. **High-Quality Audio Streaming**
   ```kotlin
   class PremiumAudioProcessor {
       suspend fun getHighQualityStream(trackId: String, userToken: OAuthTokens): AudioStream
   }
   ```

**Deliverables:**
- Personal playlist integration
- Listening history features
- AI-powered recommendations
- Premium audio quality streaming

### Phase 4: Production Optimization (Week 4)
**Objective**: Optimize for scale, monitoring, and user experience

**Tasks:**
1. **Performance Optimization**
   ```kotlin
   // Implement caching strategies
   class TrackCacheService {
       suspend fun getCachedTrack(trackId: String): TrackInfo?
       suspend fun cacheTrack(trackId: String, track: TrackInfo)
   }
   ```

2. **Monitoring & Analytics**
   ```kotlin
   class AnalyticsService {
       suspend fun recordCommand(command: String, userId: String, guildId: String)
       suspend fun recordPlayback(trackId: String, platform: String, userId: String)
   }
   ```

3. **Error Handling & Resilience**
   ```kotlin
   class CircuitBreakerService {
       suspend fun <T> executeWithCircuitBreaker(operation: suspend () -> T): T?
   }
   ```

4. **User Experience Enhancements**
   ```kotlin
   // Rich Discord embeds with interactive components
   class RichMessageBuilder {
       fun buildNowPlayingEmbed(track: TrackInfo): MessageEmbed
       fun buildQueueEmbed(queue: List<TrackInfo>): MessageEmbed
   }
   ```

**Deliverables:**
- Production monitoring dashboards
- Error handling and resilience patterns  
- Performance optimizations
- Enhanced user interface

---

## 🎯 Competitive Analysis

### Market Positioning

#### Current Discord Music Bots
| Bot | Pricing | Limitations | Quality |
|-----|---------|-------------|---------|
| **Rythm** | Discontinued | N/A | N/A |
| **Groovy** | Discontinued | N/A | N/A |
| **MEE6** | $11.95/month premium | Limited features on free tier | Standard |
| **Dyno** | $9.99/month premium | Basic music features | Standard |
| **Hydra** | Free with ads | Rate limited, ads | Standard |

#### TimmyBot Advantages
| Feature | TimmyBot | Competitors |
|---------|----------|-------------|
| **Hosting Cost** | $0/month | $50-100/month |
| **User Cost** | Free (use own premium) | $10-15/month subscriptions |
| **Audio Quality** | Premium/Lossless | Standard/Compressed |
| **Personal Content** | Full access to user's library | Limited/None |
| **Rate Limiting** | None (user's quotas) | Strict bot limits |
| **Ads** | None (premium accounts) | Yes on free tiers |
| **Legal Issues** | None (user authentication) | ToS violations common |

### Unique Value Propositions

1. **"Bring Your Own Premium"** - Revolutionary approach to music bot limitations
2. **Zero Infrastructure Costs** - 100% free tier operation
3. **Premium Features for Everyone** - No bot subscription required
4. **Legal Compliance** - User authentication eliminates ToS concerns
5. **Personalized Experience** - Access to user's actual music library

---

## 🔒 Security & Compliance

### Data Protection
- **OAuth Tokens**: Encrypted at rest in DynamoDB
- **User Data**: Minimal collection, 30-day TTL
- **API Keys**: Stored in AWS Parameter Store
- **Audit Logging**: CloudTrail for all AWS API calls

### Privacy Compliance
- **GDPR**: Right to deletion via TTL expiration
- **CCPA**: Minimal data collection
- **User Consent**: Explicit OAuth consent flow
- **Data Retention**: Automatic cleanup via DynamoDB TTL

### Security Best Practices
```kotlin
// Token encryption/decryption
class TokenSecurityService {
    
    suspend fun encryptTokens(tokens: OAuthTokens): EncryptedTokens {
        val kmsClient = KmsClient.create()
        
        return EncryptedTokens(
            accessToken = kmsClient.encrypt {
                keyId = System.getenv("KMS_KEY_ID")
                plaintext = SdkBytes.fromUtf8String(tokens.accessToken)
            }.ciphertextBlob().asByteArray(),
            refreshToken = kmsClient.encrypt {
                keyId = System.getenv("KMS_KEY_ID")
                plaintext = SdkBytes.fromUtf8String(tokens.refreshToken)
            }.ciphertextBlob().asByteArray()
        )
    }
    
    suspend fun decryptTokens(encryptedTokens: EncryptedTokens): OAuthTokens {
        val kmsClient = KmsClient.create()
        
        val accessToken = kmsClient.decrypt {
            ciphertextBlob = SdkBytes.fromByteArray(encryptedTokens.accessToken)
        }.plaintext().asUtf8String()
        
        val refreshToken = kmsClient.decrypt {
            ciphertextBlob = SdkBytes.fromByteArray(encryptedTokens.refreshToken)
        }.plaintext().asUtf8String()
        
        return OAuthTokens(accessToken, refreshToken)
    }
}
```

---

## 📈 Success Metrics & KPIs

### Technical Metrics
- **Uptime**: >99.9% availability
- **Response Time**: <500ms average
- **Error Rate**: <0.1% of requests
- **Cost**: $0/month hosting (Free Tier compliance)

### User Adoption Metrics
- **Authentication Rate**: % of users who complete OAuth
- **Premium Feature Usage**: Commands using authenticated services
- **User Retention**: 7-day and 30-day active users
- **Guild Growth**: Number of servers using TimmyBot

### Business Metrics
- **Market Differentiation**: Only bot with user OAuth authentication
- **User Satisfaction**: Premium features without subscriptions
- **Legal Compliance**: Zero ToS violation incidents
- **Scalability**: Support for 10,000+ concurrent users

---

## 🚀 Future Enhancements

### Phase 5: Advanced Features (Future)
- **Voice Commands**: "Hey Timmy, play my workout playlist"
- **AI DJ Mode**: Automatic playlist generation based on mood/activity
- **Social Features**: Shared listening sessions across Discord servers
- **Integration Ecosystem**: Last.fm, Discord Rich Presence, etc.

### Phase 6: Multi-Platform Expansion (Future)
- **Telegram Bot**: Same architecture, different chat platform
- **Web Dashboard**: User preferences and analytics
- **Mobile App**: Direct music streaming with Discord integration

---

## 📋 Conclusion

TimmyBot's **simplified server allowlist architecture** creates a production-ready Discord music bot with optimal cost control:

- **Server Allowlist Access Control** (manual approval prevents cost explosion)
- **AWS security compliance** (OAuth tokens in Secrets Manager for approved users)  
- **Simple single-service architecture** (one ECS service handles everything)
- **Proper guild isolation** (per-server queues in DynamoDB)
- **Self-deployment option** (users can run their own instance)
- **Cost-effective scaling** ($20-52/month vs $400+ uncontrolled)

## 🎯 Architecture Decisions Made

### ✅ **Zen Advisor Consensus (Unanimous 9/10 Confidence)**
- **"Drastically Better"** than complex trial systems
- **Industry standard pattern** for controlled rollouts
- **Trivially implementable** with minimal failure points
- **Zero external dependencies** needed
- **Easy to evolve** into more complex system later

### 🔒 **Access Control Strategy**
- **Server allowlist** instead of user-based trials
- **Manual approval** via GitHub/LinkedIn contact
- **Self-deployment alternative** for power users
- **Version-controlled configuration** for audit trail

### 💰 **Cost Control Benefits**
- **Controlled growth**: 25-50 servers vs unlimited
- **Predictable costs**: $20-52/month vs $400+/month
- **User choice**: Approved access or self-deploy
- **No complex billing**: No trials, payments, or subscriptions

### 💡 **Implementation Strategy**
- **Start with allowlist**: Simple, secure, cost-controlled
- **Document self-deployment**: Empower advanced users
- **Monitor demand**: Scale approval process if needed  
- **Maintain simplicity**: Resist over-engineering

## 🚀 **Ready for Implementation**

This design document provides a **simple, secure, and cost-effective** roadmap for TimmyBot that:
- **Follows AWS best practices** while controlling costs
- **Prevents abuse** through manual server approval  
- **Empowers users** with self-deployment option
- **Maintains simplicity** over premature optimization

**Unanimous advisor consensus**: This simplified approach is the clear winner!

---

**Document Version**: 1.0  
**Last Updated**: 1 August 2025  
**Author**: iddv
**Status**: Ready for Implementation 🚀