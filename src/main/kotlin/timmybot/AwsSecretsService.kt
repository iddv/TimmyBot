package timmybot

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.KotlinModule
import mu.KotlinLogging
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest

/**
 * Service for retrieving secrets from AWS Secrets Manager
 */
class AwsSecretsService {
    
    private val logger = KotlinLogging.logger {}
    private val secretsClient: SecretsManagerClient
    private val objectMapper = ObjectMapper().registerModule(KotlinModule.Builder().build())
    
    init {
        val region = System.getenv("AWS_DEFAULT_REGION") ?: System.getenv("AWS_REGION") ?: "eu-central-1"
        secretsClient = SecretsManagerClient.builder()
            .region(Region.of(region))
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build()
            
        logger.info { "AwsSecretsService initialized for region: $region" }
    }
    
    /**
     * Get Discord bot token from AWS Secrets Manager
     */
    fun getDiscordBotToken(): String {
        val secretName = System.getenv("DISCORD_BOT_TOKEN_SECRET") ?: "timmybot/dev/discord-bot-token"
        
        try {
            val request = GetSecretValueRequest.builder()
                .secretId(secretName)
                .build()
                
            val response = secretsClient.getSecretValue(request)
            val secretString = response.secretString()
            
            // Parse the JSON secret with proper error handling
            val secretMap = try {
                objectMapper.readValue(secretString, Map::class.java) as Map<String, Any>
            } catch (e: ClassCastException) {
                logger.error(e) { "Failed to cast secret to Map format: $secretName" }
                throw IllegalStateException("Invalid secret format in Secrets Manager: expected JSON object", e)
            } catch (e: com.fasterxml.jackson.core.JsonProcessingException) {
                logger.error(e) { "Failed to parse secret JSON: $secretName" }
                throw IllegalStateException("Invalid secret JSON format in Secrets Manager", e)
            }
            
            val token = secretMap["token"] as? String
            
            if (token.isNullOrBlank()) {
                throw IllegalStateException("Discord bot token is empty in secret")
            }
            
            logger.info { "Successfully retrieved Discord bot configuration from Secrets Manager" }
            return token
            
        } catch (e: IllegalStateException) {
            // Re-throw our custom exceptions
            throw e
        } catch (e: Exception) {
            logger.error(e) { "Failed to retrieve Discord bot token from secret: $secretName" }
            throw IllegalStateException("Could not retrieve Discord bot token from Secrets Manager. Check AWS credentials and permissions.", e)
        }
    }
    
    /**
     * Get database configuration from AWS Secrets Manager
     */
    fun getDatabaseConfig(): DatabaseConfig {
        val secretName = System.getenv("DATABASE_CONFIG_SECRET") ?: "timmybot/dev/database-config"
        
        try {
            val request = GetSecretValueRequest.builder()
                .secretId(secretName)
                .build()
                
            val response = secretsClient.getSecretValue(request)
            val secretString = response.secretString()
            
            // Parse the JSON secret with proper error handling
            val secretMap = try {
                objectMapper.readValue(secretString, Map::class.java) as Map<String, Any>
            } catch (e: ClassCastException) {
                logger.error(e) { "Failed to cast secret to Map format: $secretName" }
                throw IllegalStateException("Invalid secret format in Secrets Manager: expected JSON object", e)
            } catch (e: com.fasterxml.jackson.core.JsonProcessingException) {
                logger.error(e) { "Failed to parse secret JSON: $secretName" }
                throw IllegalStateException("Invalid secret JSON format in Secrets Manager", e)
            }
            
            return DatabaseConfig(
                region = secretMap["dynamodb_region"] as? String ?: "eu-central-1",
                guildQueuesTable = secretMap["guild_queues_table"] as? String ?: "timmybot-dev-guild-queues",
                userPreferencesTable = secretMap["user_preferences_table"] as? String ?: "timmybot-dev-user-prefs",
                trackCacheTable = secretMap["track_cache_table"] as? String ?: "timmybot-dev-track-cache",
                serverAllowlistTable = secretMap["server_allowlist_table"] as? String ?: "timmybot-dev-server-allowlist"
            )
            
        } catch (e: IllegalStateException) {
            // Re-throw our custom exceptions
            throw e
        } catch (e: Exception) {
            logger.error(e) { "Failed to retrieve database config from secret: $secretName" }
            throw IllegalStateException("Could not retrieve database configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.", e)
        }
    }
    
    /**
     * Get application configuration from AWS Secrets Manager
     */
    fun getAppConfig(): AppConfig {
        val secretName = System.getenv("APP_CONFIG_SECRET") ?: "timmybot/dev/app-config"
        
        try {
            val request = GetSecretValueRequest.builder()
                .secretId(secretName)
                .build()
                
            val response = secretsClient.getSecretValue(request)
            val secretString = response.secretString()
            
            // Parse the JSON secret with proper error handling
            val secretMap = try {
                objectMapper.readValue(secretString, Map::class.java) as Map<String, Any>
            } catch (e: ClassCastException) {
                logger.error(e) { "Failed to cast secret to Map format: $secretName" }
                throw IllegalStateException("Invalid secret format in Secrets Manager: expected JSON object", e)
            } catch (e: com.fasterxml.jackson.core.JsonProcessingException) {
                logger.error(e) { "Failed to parse secret JSON: $secretName" }
                throw IllegalStateException("Invalid secret JSON format in Secrets Manager", e)
            }
            
            return AppConfig(
                environment = secretMap["environment"] as? String ?: "dev",
                logLevel = secretMap["log_level"] as? String ?: "INFO",
                serverAllowlistEnabled = (secretMap["server_allowlist_enabled"] as? String)?.toBoolean() ?: true,
                oauthRequired = (secretMap["oauth_required"] as? String)?.toBoolean() ?: false,
                premiumFeatures = (secretMap["premium_features"] as? String)?.toBoolean() ?: true
            )
            
        } catch (e: IllegalStateException) {
            // Re-throw our custom exceptions
            throw e
        } catch (e: Exception) {
            logger.error(e) { "Failed to retrieve app config from secret: $secretName" }
            throw IllegalStateException("Could not retrieve application configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.", e)
        }
    }
    
    data class DatabaseConfig(
        val region: String,
        val guildQueuesTable: String,
        val userPreferencesTable: String,
        val trackCacheTable: String,
        val serverAllowlistTable: String
    )
    
    data class AppConfig(
        val environment: String,
        val logLevel: String,
        val serverAllowlistEnabled: Boolean,
        val oauthRequired: Boolean,
        val premiumFeatures: Boolean
    )
}