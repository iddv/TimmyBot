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
import java.util.LinkedList
import java.util.Queue
import java.util.concurrent.atomic.AtomicBoolean

class TimmyBot {

    internal interface Command {

        fun execute(event: MessageCreateEvent?)
        fun describe(): String
    }

    companion object {

        // queue of songs
        val queue: Queue<String> = LinkedList()

        private val logger = KotlinLogging.logger {}

        @JvmStatic
        fun main(args: Array<String>) {
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
            player.addListener {
                // if a track ends, plays the next track in the queue
                // TODO: should be using playerManager.loadItemOrdered() but it doesn't seem to work as expected
                if (it is TrackEndEvent && queue.isNotEmpty()) {
                    playerManager.loadItem(queue.poll(), scheduler)
                }
            }

            commands["play"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    val content = event?.message?.content
                    val command =
                        listOf(*content!!.split(" ").toTypedArray())
                    logger.info { "Trying to play $command" }
                    if (player.playingTrack == null) {
                        playerManager.loadItem(command[1], scheduler)

                        // TODO: we only have to join if the user is already in the channel
                        try {
                            commands["join"]!!.execute(event)
                        } catch (e: java.lang.Exception) {
                            logger.error {
                                "Failed to join channel: $e"
                            }
                        }
                    } else {
                        logger.info {
                            "Track already playing, queueing track"
                        }
                        queue.add(command[1])

                        event.message.channel
                            .flatMap {
                                it.createMessage("Queued track. There are currently ${queue.size} item(s) in the queue")
                            }
                            .subscribe()
                    }
                }

                override fun describe() = "Plays a song"

            }

            commands["skip"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    player.stopTrack()
                }

                override fun describe() = "Skips the current song"
            }

            commands["current"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    event?.message?.channel!!
                        .flatMap {
                            it.createMessage("Current track: ${player.playingTrack.info.title}")
                        }
                        .subscribe()
                }

                override fun describe() = "Current playing track"
            }

            commands["next"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    if (queue.peek() != null) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("Next track: ${queue.peek()}")
                            }
                            .subscribe()
                    }
                }

                override fun describe() = "Next track track that will be played"
            }

            commands["clear"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    queue.clear()
                }

                override fun describe() = "Clears the queue"
            }

            commands["join"] = object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        Mono.justOrEmpty(event?.member)
                            .flatMap { it.voiceState }
                            .flatMap { it.channel }
                            .flatMap {
                                it.join { spec: LegacyVoiceChannelJoinSpec ->
                                    spec.setProvider(
                                        provider
                                    )
                                }
                            }
                            .subscribe()
                    }

                override fun describe() = "Joins your voice channel"
            }

            commands["stfu"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    commands["clear"]!!.execute(event)
                    commands["skip"]!!.execute(event)
                    commands["leave"]!!.execute(event)
                }

                override fun describe() = "Stops the currently playing song, clears the queue and leaves the channel"
            }

            commands["leave"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    Mono.justOrEmpty(event?.member)
                        .flatMap { it.voiceState }
                        .flatMap { it.channel }
                        .flatMap {
                            it.sendDisconnectVoiceState()
                        }
                        .subscribe()
                    commands["stfu"]!!.execute(event)
                }

                override fun describe() = "Leaves the voice channel"
            }

            commands["ping"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("Hi, I'm Timmy! See what I can do by typing ?help")
                            }
                            .subscribe()
                    }

                    override fun describe() = "Ping me to check if I'm still here"
                }

            commands["help"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        event?.message?.channel!!
                            .flatMap {
                                val sb = StringBuilder()
                                commands.entries.forEach { sb.append("\t?${it.key} - ${it.value.describe()}\n") }
                                it.createMessage("Hello, I'm TimmyBot, try some of the following commands:\n$sb" )
                            }
                            .subscribe()
                    }

                    override fun describe() = "Help! Eeeelp! (shows this message)"
                }

            // TODO: explain should explain more than just give the description
            commands["explain"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        val content = event?.message?.content
                        val command =
                            listOf(*content!!.split(" ").toTypedArray())

                        if (commands.containsKey(command[1])) {
                            commands[command[1]]?.describe()
                            event.message.channel
                                .flatMap {
                                    it.createMessage("${command[1]} - ${commands[command[1]]?.describe()}" )
                                }
                                .subscribe()
                        }
                    }

                    override fun describe() = "Explains the provided command"
                }

            //Creates the gateway client and connects to the gateway
            val client = DiscordClientBuilder.create(System.getenv("BOT_TOKEN")).build()
                .login()
                .block()

            client?.eventDispatcher?.on(MessageCreateEvent::class.java) // subscribe is like block, in that it will *request* for action
                // to be done, but instead of blocking the thread, waiting for it
                // to finish, it will just execute the results asynchronously.
                ?.subscribe { event: MessageCreateEvent ->
                    val content = event.message.content
                    if (content.startsWith('?')) {
                        logger.info {
                            "User ${event.message.author.get().username} trying command '$content'"
                        }
                        for ((key, value) in commands.entries) {
                            // We will be using ! as our "prefix" to any command in the system.
                            if (content.startsWith("?$key")) {
                                logger.info {
                                    "Executing command $content"
                                }
                                value.execute(event)
                                break
                            }
                        }
                    }
                }

            client?.onDisconnect()?.block()
        }
    }
}