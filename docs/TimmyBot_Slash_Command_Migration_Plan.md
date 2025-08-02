# TimmyBot Slash Command Migration Implementation Plan

## COMPLETE MIGRATION: PREFIX TO SLASH COMMANDS

**OBJECTIVE**: Migrate all 11 TimmyBot commands from prefix (`?`) to modern Discord slash commands (`/`) and completely deprecate the old system.

**TIMELINE**: 10 weeks total with phased rollout and graceful deprecation

---

## 📋 COMMAND INVENTORY

### Current Prefix Commands (TO MIGRATE):
```
?play     -> /play      | Music playback with guild queues
?skip     -> /skip      | Skip current song  
?current  -> /current   | Show currently playing track
?next     -> /next      | Show next track in queue
?clear    -> /clear     | Clear server's music queue
?join     -> /join      | Join user's voice channel
?stfu     -> /stfu      | Emergency stop: clear queue and leave
?leave    -> /leave     | Leave voice channel
?ping     -> /ping      | Basic connectivity test
?help     -> /help      | Show all available commands
?explain  -> /explain   | Explain specific command usage
```

**TOTAL**: 11 commands to migrate with complete prefix system deprecation

---

## 🏗️ MIGRATION STRATEGY

### **Approach**: Phased Command-by-Command Migration
- **Lower Risk**: Core commands first, expand gradually
- **Controlled Testing**: Each command thoroughly validated
- **User Adaptation**: Users learn new system incrementally
- **Rollback Safety**: Issues affect only specific commands
- **AWS Cost Control**: Changes deployed in manageable chunks

---

## 📅 IMPLEMENTATION PHASES

### **PHASE 1: Foundation & Core Commands (Weeks 1-2)**
**Objective**: Establish slash command infrastructure and migrate essential music commands

#### Core Commands:
- `/play [track]` - Music playback with autocomplete
- `/skip` - Skip current song
- `/ping` - Basic connectivity test

#### Technical Foundation:
```kotlin
@Component
class SlashCommandService(
    private val guildQueueService: GuildQueueService,
    private val playerManager: AudioPlayerManager,
    private val awsSecretsService: AwsSecretsService
) {
    fun handleSlashCommand(event: ChatInputInteractionEvent): Mono<Void> {
        val guildId = event.interaction.guildId.orElse(null)?.asString()
        
        // Preserve guild isolation - critical requirement
        if (guildId == null || !guildQueueService.isGuildAllowed(guildId)) {
            return handleUnauthorizedGuild(event)
        }
        
        return when (event.commandName) {
            "play" -> handlePlayCommand(event, guildId)
            "skip" -> handleSkipCommand(event, guildId)
            "ping" -> handlePingCommand(event)
            // ... other commands
        }
    }
}
```

#### Discord Bot Permissions:
- Update OAuth URL: `https://discord.com/api/oauth2/authorize?client_id=YOUR_ID&permissions=3145728&scope=bot+applications.commands`
- Add `applications.commands` scope to bot invite

#### Phase 1 Deliverables:
- ✅ Working SlashCommandService with ChatInputInteractionEvent handling
- ✅ Guild isolation preserved for slash commands
- ✅ `/play`, `/skip`, `/ping` working alongside existing prefix commands
- ✅ Command registration system established

---

### **PHASE 2: Queue Management Commands (Week 3)**
**Objective**: Complete the music control system with queue and voice channel management

#### Commands to Migrate:
- `/current` - Show currently playing track
- `/next` - Show next track in queue
- `/clear` - Clear server's music queue
- `/join` - Join user's voice channel
- `/leave` - Leave voice channel
- `/stfu` - Emergency stop: clear queue and leave channel

#### Critical Dependencies:
- `/join` and `/leave` are foundational for `/play` to work properly
- `/stfu` combines `/clear` + `/leave` functionality
- Queue commands depend on guild isolation system working in Phase 1

#### Technical Considerations:
- Voice channel integration with existing LavaPlayer system
- Guild-specific queue management via GuildQueueService
- Error handling for voice connection issues
- Command parameter validation and autocomplete

---

### **PHASE 3: Help & Meta Commands (Week 4)**
**Objective**: Complete user experience with help and discovery systems

#### Commands to Migrate:
- `/help` - Show all available slash commands with descriptions
- `/explain [command]` - Get detailed explanation of a specific command

#### Key Enhancements for Slash Commands:
- `/help` can use Discord's interactive embeds and buttons
- `/explain` gets autocomplete dropdown of all available commands
- Both commands automatically reflect current slash command set

#### Technical Implementation:
- Dynamic command discovery system
- Interactive help with command examples
- Autocomplete integration for `/explain` parameter
- Updated messaging to reference `/` instead of `?` syntax

---

### **PHASE 4: Prefix Deprecation & User Migration (Weeks 5-8)**
**Objective**: Gracefully deprecate prefix commands while maintaining user experience

#### Week 5-6: Dual System Operation
- **Both systems working**: Users can use either `/play` or `?play`
- **Deprecation warnings**: Prefix commands show migration notices
- **User education**: Help messages redirect to slash equivalents

#### Week 7-8: Final Migration
- **Prefix command shutdown**: Old commands return helpful error messages
- **User support**: Clear guidance on slash command usage
- **Documentation updates**: All references updated to slash commands

#### Migration Messages:
```
⚠️ DEPRECATION WARNING:
`?play` is being deprecated! Use `/play` instead for a better experience 
with autocomplete and dropdowns.

❌ COMMAND DISCONTINUED:
`?play` is no longer supported. Please use `/play` instead!
```

---

### **PHASE 5: Final Cleanup & Optimization (Weeks 9-10)**
**Objective**: Remove legacy prefix infrastructure and optimize performance

#### Cleanup Tasks:
- Remove MessageCreateEvent listener and prefix command handlers
- Clean up command map and legacy Command interface
- Update build configurations and dependencies
- Optimize SlashCommandService performance
- Final documentation and README updates

---

## 🧪 TESTING & VALIDATION STRATEGY

### Pre-Deployment Testing:
1. **Local Development**: Test all commands in development environment
2. **Multi-Guild Testing**: Validate guild isolation across different servers
3. **Permission Testing**: Verify applications.commands scope works correctly
4. **Load Testing**: Ensure AWS cost controls remain effective

### Production Validation:
1. **Phased Rollout**: Deploy phase by phase with monitoring
2. **Guild Isolation Verification**: Test with multiple authorized servers
3. **Performance Monitoring**: AWS CloudWatch metrics for cost control
4. **User Experience Testing**: Verify slash command UX meets expectations

---

## 🚀 IMMEDIATE NEXT ACTIONS

### Week 1 Sprint - Foundation Setup:

#### Day 1-2: Discord Bot Permissions
1. Update Discord Developer Portal:
   - Add `applications.commands` scope to bot OAuth URL
   - Update bot invite link with new permissions
   - Test bot permissions in development server

#### Day 3-5: SlashCommandService Implementation
1. Create `SlashCommandService.kt` class in `src/main/kotlin/timmybot/`
2. Add `ChatInputInteractionEvent` listener to main TimmyBot.kt
3. Implement `/ping` command as proof of concept
4. Test guild isolation with slash commands

### Critical Success Checkpoints:
- ✅ Bot can receive slash command interactions
- ✅ Guild isolation works with ChatInputInteractionEvent
- ✅ AWS deployment pipeline handles bot updates
- ✅ `/ping` responds correctly in authorized guilds

---

## 📊 SUCCESS METRICS & KPIs

### Technical Success:
- ✅ All 11 commands migrated successfully
- ✅ Guild isolation system 100% preserved
- ✅ AWS costs remain within current budget
- ✅ Zero downtime during migration phases

### User Experience Success:
- ✅ Users prefer slash commands over prefix commands
- ✅ Reduced support requests about command usage
- ✅ Improved discoverability through native Discord UI
- ✅ Positive user feedback on modern interface

### Performance Success:
- ✅ Response times maintained or improved
- ✅ Guild isolation continues working flawlessly
- ✅ No regression in music playback quality
- ✅ Reliable command execution across all guilds

---

## ⚠️ RISK MITIGATION

### High Priority Risks:
1. **Guild Isolation Breakage**: Thorough testing of guildId handling in ChatInputInteractionEvent
2. **AWS Cost Increase**: Monitor CloudWatch metrics during each phase deployment
3. **User Confusion**: Clear communication and gradual migration with warnings
4. **Command Registration Failure**: Backup plan with manual Discord API calls

### Rollback Strategy:
- Each phase can be independently rolled back
- Prefix commands remain functional during Phases 1-3
- Emergency rollback restores MessageCreateEvent handling
- Guild isolation system preserved throughout migration

---

## 📚 TECHNICAL ARCHITECTURE

### Command Registration System:
```kotlin
fun registerSlashCommands(client: DiscordClient): List<ApplicationCommandRequest> {
    return listOf(
        ApplicationCommandRequest.builder()
            .name("play")
            .description("Play music in your voice channel")
            .addOption(ApplicationCommandOptionData.builder()
                .name("track")
                .description("YouTube URL, search query, or Spotify link")
                .type(ApplicationCommandOption.Type.STRING)
                .required(true)
                .build())
            .build(),
        
        ApplicationCommandRequest.builder()
            .name("skip")
            .description("Skip the currently playing track")
            .build(),
            
        // ... other commands
    )
}
```

### Guild Isolation Integration:
```kotlin
private fun handlePlayCommand(event: ChatInputInteractionEvent, guildId: String): Mono<Void> {
    // Preserve existing guild isolation logic
    if (!guildQueueService.isGuildAllowed(guildId)) {
        return event.reply("❌ This server is not authorized to use TimmyBot.")
    }
    
    val trackQuery = event.getOption("track")
        .flatMap { it.value }
        .map { it.asString() }
        .orElse("")
    
    // Use existing queue service with guild isolation
    guildQueueService.playTrack(guildId, trackQuery)
    
    return event.reply("🎵 Added to queue: $trackQuery")
}
```

---

## 📝 COMMUNICATION STRATEGY

### Phase 1 Announcement (Week 1):
- Update bot status message to mention new slash commands
- GitHub README updates highlighting `/play` command availability
- Bot response messages include hints about slash commands

### Migration Notifications (Weeks 5-6):
- Prefix commands show deprecation warnings
- Help messages redirect to slash command equivalents
- Grace period with both systems working

### Final Migration (Weeks 7-8):
- Prefix commands return helpful error messages
- Updated documentation reflects slash-only system
- User support for migration questions

---

**PLAN COMPLETION DATE**: Target 10 weeks from start date
**PRIMARY CONTACT**: Development team
**APPROVAL REQUIRED**: Discord bot permissions update, AWS deployment pipeline changes

---

*This plan ensures a smooth, user-friendly migration to modern Discord slash commands while preserving all existing functionality and guild isolation systems.*