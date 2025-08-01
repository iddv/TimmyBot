package timmybot.commands

import discord4j.core.spec.legacy.LegacyVoiceChannelJoinSpec
import discord4j.voice.AudioProvider
import timmybot.Command
import timmybot.CommandContext
import timmybot.CommandResult
import mu.KotlinLogging
import reactor.core.publisher.Mono

/**
 * Join Command - Unified voice channel joining for slash and prefix commands
 * Joins the user's current voice channel to enable music playback
 */
class JoinCommand(
    private val audioProvider: AudioProvider
) : Command {
    
    private val logger = KotlinLogging.logger {}
    
    override suspend fun execute(context: CommandContext): CommandResult {
        val guildId = context.guildId
        if (guildId == null) {
            logger.warn { "No guild ID provided for join command" }
            return CommandResult.Failure("❌ This command can only be used in servers")
        }
        
        return try {
            when (context) {
                is CommandContext.SlashContext -> {
                    // For slash commands, we need to get the member from the interaction
                    val member = context.event.interaction.member.orElse(null)
                        ?: return CommandResult.Failure("❌ Could not find member information")
                    
                    // Join the voice channel
                    member.voiceState
                        .flatMap { it.channel } 
                        .flatMap { voiceChannel ->
                            logger.info { "Joining voice channel for guild $guildId via slash command" }
                            voiceChannel.join { spec: LegacyVoiceChannelJoinSpec ->
                                spec.setProvider(audioProvider)
                            }
                        }
                        .doOnSuccess {
                            logger.info { "Successfully joined voice channel for guild $guildId" }
                        }
                        .doOnError { error ->
                            logger.error("Failed to join voice channel for guild $guildId", error)
                        }
                        .subscribe()
                    
                    CommandResult.Success("🔊 Joined your voice channel!")
                }
                
                is CommandContext.PrefixContext -> {
                    // For prefix commands, get member from the message event
                    Mono.justOrEmpty(context.event.member)
                        .flatMap { it.voiceState }
                        .flatMap { it.channel }
                        .flatMap { voiceChannel ->
                            logger.info { "Joining voice channel for guild $guildId via prefix command" }
                            voiceChannel.join { spec: LegacyVoiceChannelJoinSpec ->
                                spec.setProvider(audioProvider)
                            }
                        }
                        .doOnSuccess {
                            logger.info { "Successfully joined voice channel for guild $guildId" }
                        }
                        .doOnError { error ->
                            logger.error("Failed to join voice channel for guild $guildId", error)
                        }
                        .subscribe()
                    
                    CommandResult.Success("🔊 Joined your voice channel!")
                }
            }
            
        } catch (e: Exception) {
            logger.error("Failed to execute join command for guild $guildId", e)
            CommandResult.Failure("❌ Failed to join voice channel. Make sure you're in a voice channel!")
        }
    }
    
    override fun describe(): String = "Join your current voice channel for music playback"
    
    override fun getCommandName(): String = "join"
    
    override fun getCooldownSeconds(): Long = 3L // Prevent spam joining
}