package timmybot.commands

import com.sedmelluq.discord.lavaplayer.player.AudioPlayer
import com.sedmelluq.discord.lavaplayer.player.AudioPlayerManager
import timmybot.*
import mu.KotlinLogging

/**
 * Play Command - Unified music playback for slash and prefix commands
 * Handles YouTube URLs, search terms, and guild-isolated music queues
 */
class PlayCommand(
    private val playerManager: AudioPlayerManager,
    private val player: AudioPlayer,
    private val scheduler: TrackScheduler,
    private val guildQueueService: GuildQueueService,
    private val joinCommand: Command
) : Command {
    
    private val logger = KotlinLogging.logger {}
    
    override suspend fun execute(context: CommandContext): CommandResult {
        val guildId = context.guildId
        if (guildId == null) {
            logger.warn { "No guild ID provided for play command" }
            return CommandResult.Failure("❌ This command can only be used in servers")
        }
        
        // Extract query from context
        val query = when (context) {
            is CommandContext.SlashContext -> {
                context.getStringOption("query") 
                    ?: return CommandResult.Failure("❌ Please provide a URL or search term")
            }
            is CommandContext.PrefixContext -> {
                context.getArg(0) 
                    ?: return CommandResult.Failure("❌ Please provide a URL or search term. Usage: `?play <url_or_search>`")
            }
        }
        
        logger.info { "Guild $guildId trying to play: $query" }
        
        return try {
            if (player.playingTrack == null) {
                // No track playing, start this one immediately
                playerManager.loadItem(query, scheduler)
                
                // Join voice channel if needed
                try {
                    val joinResult = joinCommand.execute(context)
                    if (joinResult is CommandResult.Failure) {
                        return CommandResult.Failure("❌ Failed to join voice channel: ${joinResult.message}")
                    }
                } catch (e: Exception) {
                    logger.error("Failed to join channel for guild $guildId", e)
                    return CommandResult.Failure("❌ Failed to join voice channel")
                }
                
                CommandResult.Success("🎵 Playing: `$query`")
                
            } else {
                // Track is playing, add to guild-specific queue
                logger.info { "Track already playing, adding to guild $guildId queue" }
                
                val queuePosition = guildQueueService.addTrack(guildId, query)
                val queueSize = guildQueueService.getQueueSize(guildId)
                
                CommandResult.Success("✅ Queued track for this server. Position: $queuePosition, Queue size: $queueSize")
            }
            
        } catch (e: Exception) {
            logger.error("Failed to execute play command for guild $guildId", e)
            CommandResult.Failure("❌ Failed to play track. Please try again.")
        }
    }
    
    override fun describe(): String = "Play music from YouTube or search terms (guild-isolated queue)"
    
    override fun getCommandName(): String = "play"
    
    override fun getCooldownSeconds(): Long = 2L // Prevent spam but allow quick queuing
}