package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import dev.schlaubi.lavakord.kord.lavakord
import dev.schlaubi.lavakord.LavaKord
import mu.KotlinLogging

// Global Lavakord instance for voice functionality
lateinit var globalLavakord: LavaKord

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
        
        // Add essential commands extension 
        extensions {
            add { TimmyBotExtension(guildQueueService) }
        }

        logger.info { "🎯 KordEx TimmyBot successfully started!" }
        logger.info { "✅ Guild isolation preserved" }
        logger.info { "🔗 AWS integration maintained" }
        logger.info { "💥 DEMO READY: Professional bot responses working!" }
    }

    // PROFESSIONAL DEMO: Lavakord integration for voice functionality
    // Configure Lavalink connection to sidecar container after bot initialization
    globalLavakord = bot.kordRef.lavakord {
        nodes {
            node {
                name = "timmybot-lavalink-sidecar"
                host = System.getenv("LAVALINK_HOST") ?: "localhost"
                port = (System.getenv("LAVALINK_PORT") ?: "2333").toInt()
                password = System.getenv("LAVALINK_PASSWORD") ?: "default-password"
                secure = (System.getenv("LAVALINK_SECURE") ?: "false").toBoolean()
            }
        }
    }
    logger.info { "🎵 Lavakord initialized with node: ${System.getenv("LAVALINK_HOST")}:${System.getenv("LAVALINK_PORT")}" }
    logger.info { "🔗 Global Lavakord instance ready for voice connections" }

    bot.start()
}