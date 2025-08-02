package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import mu.KotlinLogging

private val logger = KotlinLogging.logger {}

/**
 * KordEx TimmyBot - Discord Music Bot with Guild Isolation
 * 
 * Features:
 * - Guild-isolated music queues using DynamoDB
 * - AWS Secrets Manager integration for secure token storage
 * - Lavakord integration for high-quality audio streaming
 * - Server allowlist for access control
 */
class KordExTimmyBot {
    
    suspend fun start() {
        logger.info { "Initializing TimmyBot with KordEx framework..." }
        
        // Initialize AWS services
        val awsSecretsService = AwsSecretsService()
        val botToken = awsSecretsService.getDiscordBotToken()
        
        logger.info { "Retrieved Discord bot configuration from AWS Secrets Manager" }
        
        // Initialize guild queue service
        val guildQueueService = GuildQueueService()
        
        logger.info { "Initialized GuildQueueService with DynamoDB backend" }
        
        // Create the extensible bot
        val bot = ExtensibleBot(botToken) {
            extensions {
                // Add TimmyBot extension with all commands
                add { TimmyBotExtension(guildQueueService) }
            }
            
            // Enable application commands (slash commands)
            applicationCommands {
                enabled = true
                defaultGuild = null  // Register globally
                register = true
            }
            
            // Configure chat commands (disabled for slash-only bot)
            chatCommands {
                enabled = false
            }
        }
        
        logger.info { "TimmyBot extension configuration complete" }
        
        // Start the bot
        bot.start()
    }
}

/**
 * Main entry point for TimmyBot
 */
suspend fun main() {
    try {
        logger.info { "🤖 Starting TimmyBot..." }
        val timmyBot = KordExTimmyBot()
        timmyBot.start()
    } catch (exception: Exception) {
        logger.error(exception) { "❌ Failed to start TimmyBot" }
        throw exception
    }
}