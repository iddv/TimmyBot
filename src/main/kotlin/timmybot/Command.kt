package timmybot

import discord4j.core.event.domain.interaction.ChatInputInteractionEvent
import discord4j.core.event.domain.message.MessageCreateEvent
import reactor.core.publisher.Mono

/**
 * Unified Command interface for both prefix and slash commands
 * Supports the migration from prefix commands to slash commands
 */
interface Command {
    suspend fun execute(context: CommandContext): CommandResult
    fun describe(): String
    fun getCommandName(): String
    
    // Optional cooldown configuration (in seconds)
    fun getCooldownSeconds(): Long = 0L
    
    // Optional permissions required
    fun getRequiredPermissions(): List<String> = emptyList()
}

/**
 * Sealed class representing command execution context
 * Abstracts away the differences between slash and prefix commands
 */
sealed class CommandContext {
    abstract val guildId: String? // Allow for null in case of DMs
    abstract val userId: String
    abstract val event: Any // Generic event type
    
    data class SlashContext(
        override val event: ChatInputInteractionEvent,
        override val guildId: String?,
        override val userId: String
    ) : CommandContext() {
        fun getStringOption(name: String): String? {
            return event.getOption(name)
                .flatMap { it.value }
                .map { it.asString() }
                .orElse(null)
        }
        
        fun getIntOption(name: String): Int? {
            return event.getOption(name)
                .flatMap { it.value }
                .map { it.asLong().toInt() }
                .orElse(null)
        }
        
        suspend fun reply(content: String, ephemeral: Boolean = false): Mono<Void> {
            return event.reply(content).withEphemeral(ephemeral)
        }
        
        suspend fun deferReply(ephemeral: Boolean = false): Mono<Void> {
            return event.deferReply().withEphemeral(ephemeral)
        }
        
        suspend fun editReply(content: String): Mono<Void> {
            return event.editReply(content).then()
        }
    }
    
    data class PrefixContext(
        override val event: MessageCreateEvent,
        override val guildId: String?,
        override val userId: String,
        val args: List<String>
    ) : CommandContext() {
        fun getArg(index: Int): String? {
            return args.getOrNull(index)
        }
        
        suspend fun reply(content: String): Mono<Void> {
            return event.message.channel.flatMap { 
                it.createMessage(content)
            }.then()
        }
    }
}

/**
 * Standardized command execution results
 */
sealed class CommandResult {
    data class Success(val message: String? = null, val ephemeral: Boolean = false) : CommandResult()
    data class Failure(val message: String, val exception: Throwable? = null, val ephemeral: Boolean = true) : CommandResult()
    data class Cooldown(val remainingSeconds: Long) : CommandResult()
    data class Unauthorized(val message: String) : CommandResult()
}