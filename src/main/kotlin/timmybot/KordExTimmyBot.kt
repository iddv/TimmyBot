package timmybot

import com.kotlindiscord.kord.extensions.ExtensibleBot
import dev.schlaubi.lavakord.kord.lavakord
import dev.schlaubi.lavakord.LavaKord
import dev.schlaubi.lavakord.rest.TrackEndReason
import dev.kord.common.annotation.KordExperimental
import dev.kord.common.ratelimit.BucketRateLimiter.Companion.linear
import io.ktor.http.*
import mu.KotlinLogging
import java.net.URI
import kotlin.time.Duration.Companion.seconds

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

    // Initialize Lavakord for voice functionality with explicit node configuration
    logger.info { "Configuring Lavakord with Lavalink server..." }
    
    val lavalinkHost = System.getenv("LAVALINK_HOST") ?: "localhost"
    val lavalinkPort = System.getenv("LAVALINK_PORT")?.toIntOrNull() ?: 2333
    val lavalinkPassword = System.getenv("LAVALINK_PASSWORD") ?: "youshallnotpass"
    
    logger.info { "Lavalink connection: $lavalinkHost:$lavalinkPort" }
    
    globalLavakord = bot.kordRef.lavakord {
        link {
            autoReconnect = true
            retry = linear(2.seconds, 60.seconds, 10)
        }
    }
    
    // Add the Lavalink node explicitly
    globalLavakord.addNode(
        host = lavalinkHost,
        port = lavalinkPort,
        password = lavalinkPassword,
        name = "timmybot-lavalink"
    )
    
    logger.info { "Lavakord initialized and configured with node: $lavalinkHost:$lavalinkPort" }

    bot.start()
}