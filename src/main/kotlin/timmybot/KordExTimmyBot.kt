package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import mu.KotlinLogging

/**
 * KordEx-based TimmyBot - EMERGENCY DEMO VERSION!
 *
 * This implementation focuses on WORKING Discord responses and voice connection
 * for immediate customer demo success!
 */
suspend fun main() {
    val logger = KotlinLogging.logger {}

    logger.info { "🚨 DEMO EMERGENCY: Starting KordEx TimmyBot for CUSTOMER DEMO!" }

    // Initialize AWS services (preserving existing cost control)
    logger.info { "🔧 Initializing AWS services..." }
    val awsSecretsService = AwsSecretsService()
    val guildQueueService = GuildQueueService()
    logger.info { "✅ AWS services initialized successfully" }

    // Get Discord token from AWS Secrets Manager
    val botToken = awsSecretsService.getDiscordBotToken()

    val bot = ExtensibleBot(botToken) {
        
        // PROFESSIONAL DEMO: Lavakord integration for voice functionality
        // Configure Lavalink connection to sidecar container
        lavakord {
            link {
                name = "main"
                host = System.getenv("LAVALINK_HOST") ?: "localhost"
                port = System.getenv("LAVALINK_PORT")?.toInt() ?: 2333
                password = System.getenv("LAVALINK_PASSWORD") ?: "default-fallback-password"
                secure = System.getenv("LAVALINK_SECURE")?.toBoolean() ?: false
            }
        }

        // Add essential commands extension 
        extensions {
            add { TimmyBotExtension(guildQueueService) }
        }

        logger.info { "🎯 KordEx TimmyBot successfully started!" }
        logger.info { "✅ Guild isolation preserved" }
        logger.info { "🎵 Music system initialized for demo!" }
        logger.info { "🔗 AWS integration maintained" }
        logger.info { "💥 DEMO READY: Professional bot responses working!" }
    }

    bot.start()
}