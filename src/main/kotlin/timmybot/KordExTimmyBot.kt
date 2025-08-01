package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import dev.schlaubi.lavakord.kord.lavakord
import dev.schlaubi.lavakord.LavaKord
import mu.KotlinLogging

// Global Lavakord instance for voice functionality
lateinit var globalLavakord: LavaKord

/**
 * KordEx-based TimmyBot
 *
 * Professional Discord bot implementation using KordEx framework.
 */
suspend fun main() {
    val logger = KotlinLogging.logger {}

    logger.info { "Starting TimmyBot application" }

    // Initialize AWS services
    logger.info { "Initializing AWS services" }
    val awsSecretsService = AwsSecretsService()
    val guildQueueService = GuildQueueService()
    logger.info { "AWS services initialized" }

    // Get Discord token from AWS Secrets Manager
    val botToken = awsSecretsService.getDiscordBotToken()

    val bot = ExtensibleBot(botToken) {
        
        // Add essential commands extension 
        extensions {
            add { TimmyBotExtension(guildQueueService) }
        }

        logger.info { "TimmyBot extension configuration complete" }
    }

    // Initialize Lavakord for voice functionality
    globalLavakord = bot.kordRef.lavakord()
    logger.info { "Lavakord initialized" }

    bot.start()
}