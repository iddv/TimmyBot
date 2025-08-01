package timmybot

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.mockito.kotlin.*
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.*
import org.assertj.core.api.Assertions.assertThat

class AwsSecretsServiceTest {

    private lateinit var mockSecretsClient: SecretsManagerClient
    private lateinit var awsSecretsService: AwsSecretsService

    @BeforeEach
    fun setup() {
        mockSecretsClient = mock()
        awsSecretsService = AwsSecretsService()
        
        // Use reflection to inject mock Secrets Manager client
        val secretsClientField = AwsSecretsService::class.java.getDeclaredField("secretsClient")
        secretsClientField.isAccessible = true
        secretsClientField.set(awsSecretsService, mockSecretsClient)
    }

    @Test
    fun `should retrieve Discord bot token successfully`() {
        // Given: Valid bot token secret
        val secretJson = """{"token": "NDg2MjY4NjE3ODk4NTA2MjUx.XMXoCA.fake_token_here"}"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When: Getting Discord bot token
        val token = awsSecretsService.getDiscordBotToken()

        // Then: Should return the token
        assertThat(token).isEqualTo("NDg2MjY4NjE3ODk4NTA2MjUx.XMXoCA.fake_token_here")
        
        // Verify correct secret name was requested
        verify(mockSecretsClient).getSecretValue(argThat<GetSecretValueRequest> { request ->
            request.secretId().contains("discord-bot-token")
        })
    }

    @Test
    fun `should retrieve database config successfully`() {
        // Given: Valid database config secret
        val secretJson = """{
            "dynamodb_region": "eu-central-1",
            "guild_queues_table": "timmybot-prod-guild-queues",
            "user_preferences_table": "timmybot-prod-user-prefs",
            "track_cache_table": "timmybot-prod-track-cache",
            "server_allowlist_table": "timmybot-prod-server-allowlist"
        }"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When: Getting database config
        val config = awsSecretsService.getDatabaseConfig()

        // Then: Should return correct config
        assertThat(config.region).isEqualTo("eu-central-1")
        assertThat(config.guildQueuesTable).isEqualTo("timmybot-prod-guild-queues")
        assertThat(config.userPreferencesTable).isEqualTo("timmybot-prod-user-prefs")
        assertThat(config.trackCacheTable).isEqualTo("timmybot-prod-track-cache")
        assertThat(config.serverAllowlistTable).isEqualTo("timmybot-prod-server-allowlist")
    }

    @Test
    fun `should retrieve app config successfully`() {
        // Given: Valid app config secret
        val secretJson = """{
            "environment": "production",
            "log_level": "INFO",
            "server_allowlist_enabled": "true",
            "oauth_required": "false",
            "premium_features": "true"
        }"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)    
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When: Getting app config
        val config = awsSecretsService.getAppConfig()

        // Then: Should return correct config
        assertThat(config.environment).isEqualTo("production")
        assertThat(config.logLevel).isEqualTo("INFO")
        assertThat(config.serverAllowlistEnabled).isTrue()
        assertThat(config.oauthRequired).isFalse()
        assertThat(config.premiumFeatures).isTrue()
    }

    @Test
    fun `should handle empty bot token gracefully`() {
        // Given: Secret with empty token
        val secretJson = """{"token": ""}"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When/Then: Should throw exception for empty token
        assertThrows(IllegalStateException::class.java) {
            awsSecretsService.getDiscordBotToken()
        }
    }

    @Test
    fun `should handle missing bot token field gracefully`() {
        // Given: Secret without token field
        val secretJson = """{"other_field": "value"}"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When/Then: Should throw exception for missing token
        assertThrows(IllegalStateException::class.java) {
            awsSecretsService.getDiscordBotToken()
        }
    }

    @Test
    fun `should throw exception when secrets fail - no fallback in production`() {
        // Given: Secrets Manager throws exception
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>()))
            .thenThrow(SecretsManagerException.builder().message("Access denied").build())

        // When/Then: Should throw exception (no fallback in production)
        assertThrows(IllegalStateException::class.java) {
            awsSecretsService.getDatabaseConfig()
        }
    }

    @Test
    fun `should handle malformed JSON gracefully`() {
        // Given: Invalid JSON in secret
        val malformedJson = """{"token": "valid_token", "incomplete":"""
        val response = GetSecretValueResponse.builder()
            .secretString(malformedJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When/Then: Should throw exception for malformed JSON
        assertThrows(IllegalStateException::class.java) {
            awsSecretsService.getDatabaseConfig()
        }
    }

    @Test
    fun `should parse boolean values correctly from strings`() {
        // Given: Config with string boolean values
        val secretJson = """{
            "environment": "test",
            "log_level": "DEBUG", 
            "server_allowlist_enabled": "false",
            "oauth_required": "true",
            "premium_features": "false"
        }"""
        val response = GetSecretValueResponse.builder()
            .secretString(secretJson)
            .build()
        whenever(mockSecretsClient.getSecretValue(any<GetSecretValueRequest>())).thenReturn(response)

        // When: Getting app config
        val config = awsSecretsService.getAppConfig()

        // Then: Should parse string booleans correctly
        assertThat(config.serverAllowlistEnabled).isFalse()
        assertThat(config.oauthRequired).isTrue()
        assertThat(config.premiumFeatures).isFalse()
    }
}