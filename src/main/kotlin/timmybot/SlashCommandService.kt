package timmybot

import discord4j.core.event.domain.interaction.ChatInputInteractionEvent
import discord4j.core.spec.InteractionApplicationCommandCallbackSpec
import mu.KotlinLogging
import reactor.core.publisher.Mono
import kotlinx.coroutines.reactor.mono
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Slash Command Service - Handles Discord slash command interactions
 * Part of the TimmyBot prefix-to-slash migration strategy
 */
class SlashCommandService(
    private val guildQueueService: GuildQueueService,
    private val awsSecretsService: AwsSecretsService
) {
    private val logger = KotlinLogging.logger {}
    private val commands = mutableMapOf<String, Command>()
    private val cooldowns = ConcurrentHashMap<String, ConcurrentHashMap<String, Instant>>()
    
    init {
        logger.info { "🔧 SlashCommandService initialized - Ready for Phase 1 migration" }
    }
    
    /**
     * Register a command with the service
     */
    fun registerCommand(command: Command) {
        commands[command.getCommandName()] = command
        logger.info { "Registered slash command: ${command.getCommandName()}" }
    }
    
    /**
     * Handle slash command interaction events
     * Main entry point for all slash commands
     */
    fun handleSlashCommand(event: ChatInputInteractionEvent): Mono<Void> {
        val guildId = event.interaction.guildId.map { it.asString() }.orElse(null)
        val userId = event.interaction.user.id.asString()
        val commandName = event.commandName
        
        logger.info { "Received slash command '$commandName' from user $userId in guild $guildId" }
        
        // Guild isolation check - CRITICAL requirement
        if (guildId != null && !guildQueueService.isGuildAllowed(guildId)) {
            logger.warn { "Guild $guildId not authorized for slash commands" }
            return handleCommandResult(event, CommandResult.Unauthorized(
                "❌ This server is not authorized to use TimmyBot. Please contact administrators."
            ))
        }
        
        // Find command
        val command = commands[commandName]
            ?: return handleCommandResult(event, CommandResult.Failure("❌ Command '$commandName' not found"))
        
        // Check cooldown
        val cooldownResult = checkCooldown(userId, commandName, command.getCooldownSeconds())
        if (cooldownResult != null) {
            logger.debug { "User $userId hit cooldown for command '$commandName'" }
            return handleCommandResult(event, cooldownResult)
        }
        
        // Create command context
        val context = CommandContext.SlashContext(event, guildId, userId)
        
        // Execute command with proper reactive integration
        return mono {
            try {
                logger.debug { "Executing slash command '$commandName' for user $userId" }
                val result = command.execute(context)
                
                // Update cooldown on successful execution
                if (result is CommandResult.Success && command.getCooldownSeconds() > 0) {
                    setCooldown(userId, commandName)
                }
                
                result
            } catch (e: Exception) {
                logger.error("Error executing slash command '$commandName'", e)
                CommandResult.Failure("❌ An error occurred while executing the command", e)
            }
        }.flatMap { result ->
            handleCommandResult(event, result)
        }
        .doOnError { error ->
                            logger.error("Unhandled error in slash command processing", error)
        }
        .onErrorResume { error ->
            // Fallback error handling
            event.reply("❌ An unexpected error occurred. Please try again later.")
                .withEphemeral(true)
        }
    }
    
    /**
     * Handle command execution results and send appropriate responses
     */
    private fun handleCommandResult(event: ChatInputInteractionEvent, result: CommandResult): Mono<Void> {
        return when (result) {
            is CommandResult.Success -> {
                val message = result.message ?: "✅ Command executed successfully"
                event.reply(message).withEphemeral(result.ephemeral)
            }
            
            is CommandResult.Failure -> {
                event.reply(result.message).withEphemeral(result.ephemeral)
            }
            
            is CommandResult.Cooldown -> {
                event.reply("⏱️ Command on cooldown. Try again in ${result.remainingSeconds} seconds.")
                    .withEphemeral(true)
            }
            
            is CommandResult.Unauthorized -> {
                event.reply(result.message).withEphemeral(true)
            }
        }
    }
    
    /**
     * Check if user is on cooldown for a command
     */
    internal fun checkCooldown(userId: String, commandName: String, cooldownSeconds: Long): CommandResult.Cooldown? {
        if (cooldownSeconds <= 0) return null
        
        val userCooldowns = cooldowns[userId] ?: return null
        val lastUsed = userCooldowns[commandName] ?: return null
        
        val now = Instant.now()
        val timeSinceLastUse = now.epochSecond - lastUsed.epochSecond
        
        return if (timeSinceLastUse < cooldownSeconds) {
            CommandResult.Cooldown(cooldownSeconds - timeSinceLastUse)
        } else {
            null
        }
    }
    
    /**
     * Set cooldown for user and command
     */
    internal fun setCooldown(userId: String, commandName: String) {
        cooldowns.computeIfAbsent(userId) { ConcurrentHashMap() }[commandName] = Instant.now()
    }
    
    /**
     * Get registered commands (for metrics and monitoring)
     */
    fun getRegisteredCommands(): Map<String, Command> = commands.toMap()
    
    /**
     * Clear expired cooldowns (should be called periodically)
     */
    fun cleanupExpiredCooldowns() {
        val now = Instant.now()
        val expiredThreshold = now.minusSeconds(3600) // 1 hour
        
        cooldowns.entries.removeIf { (_, userCooldowns) ->
            userCooldowns.entries.removeIf { (_, lastUsed) ->
                lastUsed.isBefore(expiredThreshold)
            }
            userCooldowns.isEmpty()
        }
        
        logger.debug { "Cleaned up expired cooldowns" }
    }
}

// Reactive integration - replaces runBlocking for proper non-blocking execution