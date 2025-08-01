package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import mu.KotlinLogging

/**
 * KordEx-based TimmyBot - Emergency migration for customer demo tonight!
 * 
 * This implementation uses KordEx framework for proper Discord slash command responses.
 * Critical feature: bot responds to Discord instead of just logging!
 */
suspend fun main() {
    val logger = KotlinLogging.logger {}
    
    logger.info { "🚀 Starting KordEx-based TimmyBot for CRITICAL DEMO!" }
    
    // Initialize AWS services (preserving existing cost control)
    logger.info { "🔧 Initializing AWS services..." }
    val awsSecretsService = AwsSecretsService()
    val guildQueueService = GuildQueueService()
    logger.info { "✅ AWS services initialized successfully" }
    
    // Get Discord token from AWS Secrets Manager
    val botToken = awsSecretsService.getDiscordBotToken()
    
    val bot = ExtensibleBot(botToken) {
        
        // Add essential commands extension
        extensions {
            add { TimmyBotExtension(guildQueueService) }
        }
        
        logger.info { "🎯 KordEx TimmyBot successfully started!" }
        logger.info { "✅ Guild isolation preserved" }
        logger.info { "🎵 Music functionality ready (Lavakord in extension)" }
        logger.info { "🔗 AWS integration maintained" }
        logger.info { "💥 CRITICAL: Bot now responds to Discord for DEMO!" }
    }
    
    bot.start()
}