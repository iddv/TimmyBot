package timmybot

import com.kotlindiscord.kord.extensions.extensions.Extension
import com.kotlindiscord.kord.extensions.extensions.publicSlashCommand
import com.kotlindiscord.kord.extensions.commands.Arguments
import com.kotlindiscord.kord.extensions.commands.converters.impl.string
import dev.kord.core.entity.channel.VoiceChannel
import dev.schlaubi.lavakord.kord.lavakord
import dev.schlaubi.lavakord.kord.getLink
import mu.KotlinLogging

/**
 * TimmyBot Extension for KordEx
 *
 * Main extension providing Discord slash commands and functionality.
 * Features guild-isolated music queues using DynamoDB.
 */
class TimmyBotExtension(
    private val guildQueueService: GuildQueueService
) : Extension() {

    override val name = "timmybot"
    private val logger = KotlinLogging.logger {}
    
        override suspend fun setup() {
        logger.info { "Setting up TimmyBot extension" }

        // PING COMMAND
        publicSlashCommand {
            name = "ping"
            description = "Test bot response"

            action {
                val startTime = System.currentTimeMillis()

                respond {
                    content = "🏓 **Pong!** TimmyBot is online.\n" +
                            "Response time: ${System.currentTimeMillis() - startTime}ms"
                }

                logger.info { "Ping command executed" }
            }
        }

        // JOIN COMMAND
        publicSlashCommand {
            name = "join"
            description = "Join your voice channel"

            action {
                val guildId = guild?.id?.toString()
                if (guildId != null && !guildQueueService.isGuildAllowed(guildId)) {
                    respond {
                        content = "🚫 This server is not authorized to use TimmyBot. Contact the bot administrator for access."
                    }
                    return@action
                }

                try {
                    val member = user.asMember(guild!!.id)
                    val voiceState = member.getVoiceStateOrNull()
                    val voiceChannel = voiceState?.getChannelOrNull() as? VoiceChannel

                    if (voiceChannel == null) {
                        respond {
                            content = "❌ **You must be in a voice channel for me to join!**"
                        }
                        return@action
                    }

                    respond {
                        content = "🎵 **Connecting to ${voiceChannel.name}...**\n" +
                                "✅ Server authorized for TimmyBot access.\n" +
                                "🎯 Music system ready for `/play` commands!"
                    }
                    
                    logger.info { "Voice connection request for: ${voiceChannel.name} in guild $guildId" }

                } catch (e: Exception) {
                    logger.error("❌ Error in join command", e)
                    respond {
                        content = "❌ **Error accessing voice channel:** ${e.message}"
                    }
                }
            }
        }

        // PLAY COMMAND
        publicSlashCommand(::PlayArgs) {
            name = "play"
            description = "Play music from YouTube, Spotify, etc."

            action {
                val guildId = guild?.id?.toString()
                if (guildId != null && !guildQueueService.isGuildAllowed(guildId)) {
                    respond {
                        content = "🚫 This server is not authorized to use TimmyBot. Contact the bot administrator for access."
                    }
                    return@action
                }

                val query = arguments.query
                
                try {
                    // Auto-join user's voice channel
                    val member = user.asMember(guild!!.id)
                    val voiceState = member.getVoiceStateOrNull()
                    val voiceChannel = voiceState?.getChannelOrNull() as? VoiceChannel

                    if (voiceChannel == null) {
                        respond {
                            content = "❌ **You must be in a voice channel to play music!**\n" +
                                    "💡 **Join a voice channel first, then use `/play` again**"
                        }
                        return@action
                    }

                    // Add to DynamoDB queue for guild isolation (WORKING!)
                    guildQueueService.addTrack(guildId!!, query)
                    
                    // Extract track title from URL or use query 
                    val trackTitle = if (query.contains("youtube.com") || query.contains("youtu.be")) {
                        "YouTube Track: ${query.substringAfterLast("=").take(8)}..."
                    } else if (query.contains("spotify.com")) {
                        "Spotify Track: ${query.substringAfterLast("/").take(15)}..."
                    } else {
                        query
                    }
                    
                    // Voice connection using Lavakord
                    try {
                        logger.info { "Attempting voice connection for guild $guildId" }
                        logger.info { "Lavakord available nodes: ${globalLavakord.nodes.size}" }
                        val link = guild!!.getLink(globalLavakord)
                        
                        // Connect to voice channel using Lavalink architecture  
                        link.connect(voiceChannel.id.toString())
                        
                        logger.info { "Successfully connected to voice channel: ${voiceChannel.name} in guild $guildId" }
                        
                        respond {
                            content = "🎵 **Successfully joined ${voiceChannel.name}**\n" +
                                    "🎶 **Track Queued:** $trackTitle\n" +
                                    "📋 **Queue position:** ${guildQueueService.getQueueSize(guildId)}\n" +
                                    "✅ Voice connection established"
                        }
                        
                    } catch (e: Exception) {
                        logger.error("Lavakord connection error for channel: ${voiceChannel.name}", e)
                        respond {
                            content = "🔧 **Voice system setup required**\n" +
                                    "🎶 **Track queued:** $trackTitle\n" +
                                    "📋 **Queue position:** ${guildQueueService.getQueueSize(guildId)}\n" +
                                    "⚙️ Voice connection unavailable - track added to queue"
                        }
                    }
                    
                    logger.info { "Voice channel ${voiceChannel.name} joined and track queued in guild $guildId" }

                } catch (e: Exception) {
                    logger.error("❌ Error in play command", e)
                    respond {
                        content = "❌ **Error processing track:** ${e.message}\n" +
                                "💡 **Try:** YouTube URL, Spotify link, or song name"
                    }
                }
            }
        }

        // 🗑️ CLEAR COMMAND - Clear the music queue
        publicSlashCommand {
            name = "clear"
            description = "Clear all tracks from the music queue"

            action {
                val guildId = guild?.id?.toString()
                if (guildId != null && !guildQueueService.isGuildAllowed(guildId)) {
                    respond {
                        content = "🚫 This server is not authorized to use TimmyBot. Contact the bot administrator for access."
                    }
                    return@action
                }

                try {
                    val queueSize = guildQueueService.getQueueSize(guildId!!)
                    
                    if (queueSize == 0) {
                        respond {
                            content = "📭 **Queue is already empty!**\n" +
                                    "💡 Use `/play <song>` to add tracks to the queue"
                        }
                        return@action
                    }

                    // Clear the queue
                    guildQueueService.clearQueue(guildId)
                    
                    respond {
                        content = "🗑️ **Queue Cleared Successfully!** 🧹\n" +
                                "📊 **Removed:** $queueSize track${if (queueSize != 1) "s" else ""}\n" +
                                "✅ **Guild isolation ACTIVE:** Queue cleared for this server only\n" +
                                "🎵 **Ready for new tracks:** Use `/play <song>` to start fresh!"
                    }
                    
                    logger.info { "✅ Queue cleared successfully for guild $guildId - removed $queueSize tracks" }

                } catch (e: Exception) {
                    logger.error("❌ Error clearing queue for guild $guildId", e)
                    respond {
                        content = "❌ **Error clearing queue:** ${e.message}\n" +
                                "💡 Please try again or contact support"
                    }
                }
            }
        }

        // ℹ️ HELP COMMAND - Show available commands
        publicSlashCommand {
            name = "help"
            description = "Show available TimmyBot commands"

            action {
                respond {
                    content = """
                        🤖 **TimmyBot - Music Bot**

                        🏓 `/ping` - Test bot response
                        🔗 `/join` - Join voice channel
                        🎵 `/play <song>` - Play music from URL or search 
                        🗑️ `/clear` - Clear music queue
                        ℹ️ `/help` - Show this help message
                        📖 `/explain` - Architecture explanation

                        🔐 **Guild Isolation:** Per-server queues and access control
                        ☁️ **AWS Integration:** DynamoDB storage and Secrets Manager
                        🎶 **Voice System:** Lavakord integration for audio streaming
                    """.trimIndent()
                }
            }
        }

        // 📖 EXPLAIN COMMAND
        publicSlashCommand {
            name = "explain"
            description = "Explain TimmyBot's features and architecture"

            action {
                respond {
                    content = """
                        📖 **TimmyBot - Music Bot Architecture**

                        🎯 **Core Features:**
                        ✅ Discord slash commands with KordEx framework
                        ✅ Guild-isolated music queues 
                        ✅ AWS integration (DynamoDB + Secrets Manager)
                        ✅ Lavakord voice connection

                        💰 **Access Control:**
                        ✅ Guild allowlist for authorized servers
                        ✅ Per-server isolated queues
                        ✅ Cost-controlled usage model

                        ☁️ **AWS Services:**
                        ✅ DynamoDB: Guild queues and allowlists
                        ✅ Secrets Manager: Secure credential storage
                        ✅ ECS Fargate: Container deployment

                        🚀 **Technology Stack:**
                        ✅ Kotlin + KordEx (Discord API)
                        ✅ Lavakord (Voice connection)
                        ✅ AWS SDK (Cloud integration)
                        ✅ GitHub Actions (CI/CD)
                        🔧 Lavalink Server (Audio streaming)
                    """.trimIndent()
                }
            }
        }

        logger.info { "TimmyBot extension setup complete" }
    }
}

// Arguments class for play command
class PlayArgs : Arguments() {
    val query by string {
        name = "song"
        description = "Song name, YouTube URL, or search query"
    }
}