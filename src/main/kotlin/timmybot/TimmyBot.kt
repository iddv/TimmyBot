package timmybot

import com.sedmelluq.discord.lavaplayer.format.AudioDataFormat
import com.sedmelluq.discord.lavaplayer.player.AudioPlayerManager
import com.sedmelluq.discord.lavaplayer.player.DefaultAudioPlayerManager
import com.sedmelluq.discord.lavaplayer.source.AudioSourceManagers
import com.sedmelluq.discord.lavaplayer.track.playback.AudioFrameBufferFactory
import com.sedmelluq.discord.lavaplayer.track.playback.NonAllocatingAudioFrameBuffer
import discord4j.core.DiscordClientBuilder
import discord4j.core.event.domain.message.MessageCreateEvent
import discord4j.core.spec.legacy.LegacyVoiceChannelJoinSpec
import discord4j.voice.AudioProvider
import reactor.core.publisher.Mono
import java.util.concurrent.atomic.AtomicBoolean

class TimmyBot {

    internal interface Command {

        fun execute(event: MessageCreateEvent?)
        fun describe(): String
    }

    companion object {
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
            AudioSourceManagers.registerRemoteSources(playerManager)
            val player = playerManager.createPlayer()
            val provider: AudioProvider = LavaPlayerAudioProvider(player)

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

            val scheduler = TrackScheduler(player)
            commands["play"] = object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        val content = event?.message?.content
                        val command =
                            listOf(*content!!.split(" ").toTypedArray())
                        playerManager.loadItem(command[1], scheduler)
                    }

                override fun describe() = "Plays a song, just provide a link and wait for the magic to happen"
            }

            commands["stop"] = object : Command {
                override fun execute(event: MessageCreateEvent?) {
                    player.stopTrack()
                }

                override fun describe() = "Stops the current song"
            }

            commands["ping"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("Pong!")
                            }
                            .subscribe()
                    }

                    override fun describe() = "Pong!"

                }

            commands["help"] =
                object : Command {
                    override fun execute(event: MessageCreateEvent?) {
                        event?.message?.channel!!
                            .flatMap {
                                it.createMessage("Hello, I'm TimmyBot, try some of the following commands: " + commands.entries.map { (key, value) -> "?$key - ${value.describe()}" } )
                            }
                            .subscribe()
                    }

                    override fun describe() = "Elp! Eeeelp!"

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
                        for ((key, value) in commands.entries) {
                            // We will be using ! as our "prefix" to any command in the system.
                            if (content.startsWith("?$key")) {
                                println(content)
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