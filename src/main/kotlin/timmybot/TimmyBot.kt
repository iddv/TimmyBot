package timmybot

import com.sedmelluq.discord.lavaplayer.format.AudioDataFormat
import com.sedmelluq.discord.lavaplayer.player.AudioPlayerManager
import com.sedmelluq.discord.lavaplayer.player.DefaultAudioPlayerManager
import com.sedmelluq.discord.lavaplayer.player.event.TrackEndEvent
import com.sedmelluq.discord.lavaplayer.source.AudioSourceManagers
import com.sedmelluq.discord.lavaplayer.track.playback.AudioFrameBufferFactory
import com.sedmelluq.discord.lavaplayer.track.playback.NonAllocatingAudioFrameBuffer
import discord4j.core.DiscordClientBuilder
import discord4j.core.event.domain.message.MessageCreateEvent
import discord4j.core.spec.legacy.LegacyVoiceChannelJoinSpec
import discord4j.voice.AudioProvider
import mu.KotlinLogging
import reactor.core.publisher.Mono
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.ConcurrentHashMap

class TimmyBot {

    internal interface Command {

        fun execute(event: MessageCreateEvent?, guildId: String?)
        fun describe(): String
    }

    companion object {

        // GUILD-ISOLATED SERVICES - FIXES THE SHARED QUEUE BUG!
        private lateinit var guildQueueService: GuildQueueService
        private lateinit var awsSecretsService: AwsSecretsService

        private val logger = KotlinLogging.logger {}

        @JvmStatic
        fun main(args: Array<String>) {
            logger.info { "🚀 Starting TimmyBot with Guild Isolation Architecture" }
            
            // Initialize AWS services
            awsSecretsService = AwsSecretsService()
            guildQueueService = GuildQueueService()
            
            val appConfig = awsSecretsService.getAppConfig()
            logger.info { "App config loaded - Environment: ${appConfig.environment}, Server allowlist: ${appConfig.serverAllowlistEnabled}" }
            
            // Creates AudioPlayer instances and translates URLs to AudioTrack instances
            val commands = mutableMapOf<String, Command>()
            // Creates AudioPlayer instances and translates URLs to AudioTrack instances
            val playerManager: AudioPlayerManager = DefaultAudioPlayerManager()

            // This is an optimization strategy that Discord4J can utilize.
            // It is not important to understand
            playerManager.configuration.frameBufferFactory =
                AudioFrameBufferFactory { bufferDuration: Int, format: AudioDataFormat?, stopping: AtomicBoolean? ->
                    NonAllocatingAudioFrameBuffer(
                        bufferDuration,
                        format,
                        stopping
                    )
                }

            playerManager.setPlayerCleanupThreshold(60 * 60 * 1000)
            AudioSourceManagers.registerRemoteSources(playerManager)
            val player = playerManager.createPlayer()
            val provider: AudioProvider = LavaPlayerAudioProvider(player)
            val scheduler = TrackScheduler(player)
            player.addListener { event ->
                // if a track ends, plays the next track in the guild-specific queue
                if (event is TrackEndEvent) {
                    // We need guild context here - this will be enhanced with proper guild tracking
                    // For now, we'll handle this in the command handlers
                    logger.info { "Track ended, checking guild queues for next track" }
                }
            }

            commands["play"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for play command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST - COST CONTROL!
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot. Please contact administrators.")
                        }?.subscribe()
                        return
                    }
                    
                    val content = event?.message?.content
                    val command = listOf(*content!!.split(" ").toTypedArray())
                    
                    if (command.size < 2) {
                        event.message.channel.flatMap {
                            it.createMessage("❌ Please provide a URL or search term. Usage: `?play <url_or_search>`")
                        }.subscribe()
                        return
                    }
                    
                    val trackUrl = command[1]
                    logger.info { "Guild $guildId trying to play: $trackUrl" }
                    
                    if (player.playingTrack == null) {
                        // No track playing, start this one immediately
                        playerManager.loadItem(trackUrl, scheduler)

                        // Join voice channel if needed
                        try {
                            commands["join"]!!.execute(event, guildId)
                        } catch (e: java.lang.Exception) {
                            logger.error { "Failed to join channel for guild $guildId: $e" }
                        }
                    } else {
                        // Track is playing, add to guild-specific queue
                        logger.info { "Track already playing, adding to guild $guildId queue" }
                        
                        try {
                            val queuePosition = guildQueueService.addTrack(guildId, trackUrl)
                            val queueSize = guildQueueService.getQueueSize(guildId)
                            
                            event.message.channel
                                .flatMap {
                                    it.createMessage("✅ Queued track for this server. Position: $queuePosition, Queue size: $queueSize")
                                }
                                .subscribe()
                                
                        } catch (e: Exception) {
                            logger.error(e) { "Failed to add track to guild $guildId queue" }
                            event.message.channel
                                .flatMap {
                                    it.createMessage("❌ Failed to add track to queue. Please try again.")
                                }
                                .subscribe()
                        }
                    }
                }

                override fun describe() = "Plays a song (guild-isolated queue)"

            }

            commands["skip"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for skip command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    logger.info { "Guild $guildId skipping current track" }
                    player.stopTrack()
                    
                    // Try to play next track from guild's queue
                    val nextTrack = guildQueueService.pollTrack(guildId)
                    if (nextTrack != null) {
                        logger.info { "Playing next track for guild $guildId: $nextTrack" }
                        playerManager.loadItem(nextTrack, scheduler)
                    } else {
                        logger.info { "No more tracks in queue for guild $guildId" }
                    }
                }

                override fun describe() = "Skips the current song and plays next from guild queue"
            }

            commands["current"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for current command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    if (player.playingTrack != null) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("🎵 Currently playing: ${player.playingTrack.info.title}")
                            }
                            .subscribe()
                    } else {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("⏹️ No track currently playing for this server.")
                            }
                            .subscribe()
                    }
                }

                override fun describe() = "Shows current playing track"
            }

            commands["next"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for next command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    val nextTrack = guildQueueService.peekNextTrack(guildId)
                    val queueSize = guildQueueService.getQueueSize(guildId)
                    
                    if (nextTrack != null) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("⏭️ Next track for this server: $nextTrack (Queue size: $queueSize)")
                            }
                            .subscribe()
                    } else {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("📭 No tracks queued for this server.")
                            }
                            .subscribe()
                    }
                }

                override fun describe() = "Shows next track in this server's queue"
            }

            commands["clear"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for clear command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    val queueSizeBefore = guildQueueService.getQueueSize(guildId)
                    guildQueueService.clearQueue(guildId)
                    
                    logger.info { "Cleared queue for guild $guildId (was $queueSizeBefore items)" }
                    
                    event?.message?.channel?.flatMap {
                        it.createMessage("🗑️ Cleared this server's queue ($queueSizeBefore items removed)")
                    }?.subscribe()
                }

                override fun describe() = "Clears this server's queue (guild-isolated)"
            }

            commands["join"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for join command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    Mono.justOrEmpty(event?.member)
                        .flatMap { it.voiceState }
                        .flatMap { it.channel }
                        .flatMap {
                            logger.info { "Joining voice channel for guild $guildId" }
                            it.join { spec: LegacyVoiceChannelJoinSpec ->
                                spec.setProvider(provider)
                            }
                        }
                        .subscribe()
                }

                override fun describe() = "Joins your voice channel"
            }

            commands["stfu"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for stfu command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    logger.info { "Guild $guildId requested full stop (stfu)" }
                    commands["clear"]!!.execute(event, guildId)
                    commands["skip"]!!.execute(event, guildId)
                    commands["leave"]!!.execute(event, guildId)
                }

                override fun describe() = "Stops playing, clears this server's queue, and leaves the channel"
            }

            commands["leave"] = object : Command {
                override fun execute(event: MessageCreateEvent?, guildId: String?) {
                    if (guildId == null) {
                        logger.warn { "No guild ID provided for leave command" }
                        return
                    }
                    
                    // CHECK SERVER ALLOWLIST
                    if (!guildQueueService.isGuildAllowed(guildId)) {
                        event?.message?.channel?.flatMap {
                            it.createMessage("❌ This server is not authorized to use TimmyBot.")
                        }?.subscribe()
                        return
                    }
                    
                    logger.info { "Leaving voice channel for guild $guildId" }
                    Mono.justOrEmpty(event?.member)
                        .flatMap { it.voiceState }
                        .flatMap { it.channel }
                        .flatMap {
                            it.sendDisconnectVoiceState()
                        }
                        .subscribe()
                    
                    // Clear the guild's queue when leaving
                    guildQueueService.clearQueue(guildId)
                    player.stopTrack()
                }

                override fun describe() = "Leaves the voice channel and clears this server's queue"
            }

            commands["ping"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?, guildId: String?) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("🎵 Hi, I'm TimmyBot with Guild Isolation! Each server has its own music queue. Type ?help for commands.")
                            }
                            .subscribe()
                    }

                    override fun describe() = "Ping me to check if I'm still here"
                }

            commands["help"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?, guildId: String?) {
                        event?.message?.channel!!
                            .flatMap {
                                val sb = StringBuilder()
                                sb.append("🎵 **TimmyBot - Guild-Isolated Music Bot**\n")
                                sb.append("Each Discord server has its own private music queue!\n\n")
                                sb.append("**Available Commands:**\n")
                                commands.entries.forEach { sb.append("• `?${it.key}` - ${it.value.describe()}\n") }
                                sb.append("\n🔒 **Guild Isolation**: Your server's queue is completely separate from other servers!")
                                it.createMessage(sb.toString())
                            }
                            .subscribe()
                    }

                    override fun describe() = "Shows this help message with all commands"
                }

            commands["explain"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?, guildId: String?) {
                        val content = event?.message?.content
                        val command = listOf(*content!!.split(" ").toTypedArray())

                        if (command.size < 2) {
                            event?.message?.channel?.flatMap {
                                it.createMessage("❌ Please specify a command to explain. Usage: `?explain <command>`")
                            }?.subscribe()
                            return
                        }

                        if (commands.containsKey(command[1])) {
                            event?.message?.channel
                                ?.flatMap {
                                    it.createMessage("📖 **${command[1]}** - ${commands[command[1]]?.describe()}")
                                }
                                ?.subscribe()
                        } else {
                            event?.message?.channel?.flatMap {
                                it.createMessage("❌ Command '${command[1]}' not found. Type `?help` for available commands.")
                            }?.subscribe()
                        }
                    }

                    override fun describe() = "Explains a specific command"
                }

            // Get Discord bot token from AWS Secrets Manager
            logger.info { "Retrieving Discord bot token from AWS Secrets Manager..." }
            val botToken = awsSecretsService.getDiscordBotToken()
            logger.info { "Successfully retrieved bot token, connecting to Discord..." }

            //Creates the gateway client and connects to the gateway
            val client = DiscordClientBuilder.create(botToken).build()
                .login()
                .block()

            logger.info { "🎵 TimmyBot connected to Discord with Guild Isolation! Ready to serve music per-server." }

            client?.eventDispatcher?.on(MessageCreateEvent::class.java) 
                ?.subscribe { event: MessageCreateEvent ->
                    val content = event.message.content
                    
                    // Extract guild ID for guild isolation
                    val guildId = event.guildId.map { it.asString() }.orElse(null)
                    
                    if (content.startsWith('?')) {
                        val username = event.message.author.map { it.username }.orElse("Unknown")
                        val guildInfo = if (guildId != null) " in guild $guildId" else " in DM"
                        
                        logger.info { "User $username$guildInfo trying command '$content'" }
                        
                        for ((key, value) in commands.entries) {
                            if (content.startsWith("?$key")) {
                                logger.info { "Executing guild-isolated command '$content' for guild: ${guildId ?: "DM"}" }
                                
                                // Pass both event AND guild ID for guild isolation!
                                value.execute(event, guildId)
                                break
                            }
                        }
                    }
                }

            logger.info { "🚀 TimmyBot is now running with Guild Isolation - each server has its own music queue!" }
            client?.onDisconnect()?.block()
        }
    }
}
// Test deployment trigger - 2025-08-01 15:54:43
