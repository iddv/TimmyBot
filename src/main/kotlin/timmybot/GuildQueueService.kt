package timmybot

import mu.KotlinLogging
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.*
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Guild-isolated queue service using DynamoDB
 * FIXES THE SHARED QUEUE BUG - each Discord server gets its own queue!
 */
class GuildQueueService {
    
    private val logger = KotlinLogging.logger {}
    private val dynamoDb: DynamoDbClient
    private val guildQueuesTable: String
    private val serverAllowlistTable: String
    
    // Local cache for performance (cleared periodically)
    private val queueCache = ConcurrentHashMap<String, MutableList<String>>()
    
    init {
        val region = System.getenv("AWS_DEFAULT_REGION") ?: System.getenv("AWS_REGION") ?: "eu-central-1"
        dynamoDb = DynamoDbClient.builder()
            .region(Region.of(region))
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build()
            
        guildQueuesTable = System.getenv("GUILD_QUEUES_TABLE") ?: "timmybot-dev-guild-queues"
        serverAllowlistTable = System.getenv("SERVER_ALLOWLIST_TABLE") ?: "timmybot-dev-server-allowlist"
        
        logger.info { "GuildQueueService initialized with table: $guildQueuesTable" }
    }
    
    /**
     * Check if guild is allowed to use the bot (cost control)
     */
    fun isGuildAllowed(guildId: String): Boolean {
        try {
            val request = GetItemRequest.builder()
                .tableName(serverAllowlistTable)
                .key(mapOf("guild_id" to AttributeValue.builder().s(guildId).build()))
                .build()
                
            val response = dynamoDb.getItem(request)
            val allowed = response.item().isNotEmpty()
            
            if (!allowed) {
                logger.warn { "Guild $guildId not in allowlist - access denied" }
            }
            
            return allowed
        } catch (e: Exception) {
            logger.error(e) { "Failed to check guild allowlist for $guildId" }
            return false // Fail closed for security
        }
    }
    
    /**
     * Add track to guild-specific queue (async)
     */
    suspend fun addTrack(guildId: String, trackUrl: String): Int = withContext(Dispatchers.IO) {
        try {
            // Get next position
            val nextPosition = getQueueSize(guildId) + 1
            
            val request = PutItemRequest.builder()
                .tableName(guildQueuesTable)
                .item(mapOf(
                    "guild_id" to AttributeValue.builder().s(guildId).build(),
                    "queue_position" to AttributeValue.builder().n(nextPosition.toString()).build(),
                    "track_url" to AttributeValue.builder().s(trackUrl).build(),
                    "added_at" to AttributeValue.builder().n(System.currentTimeMillis().toString()).build()
                ))
                .build()
                
            dynamoDb.putItem(request)
            
            // Update cache
            queueCache.computeIfAbsent(guildId) { mutableListOf() }.add(trackUrl)
            
            logger.info { "Added track to guild $guildId queue at position $nextPosition" }
            nextPosition
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to add track to guild $guildId queue" }
            throw e
        }
    }
    
    /**
     * Get next track from guild-specific queue (and remove it) (async)
     */
    suspend fun pollTrack(guildId: String): String? = withContext(Dispatchers.IO) {
        try {
            // Get first item
            val queryRequest = QueryRequest.builder()
                .tableName(guildQueuesTable)
                .keyConditionExpression("guild_id = :guildId")
                .expressionAttributeValues(mapOf(
                    ":guildId" to AttributeValue.builder().s(guildId).build()
                ))
                .limit(1)
                .build()
                
            val queryResponse = dynamoDb.query(queryRequest)
            
            if (queryResponse.items().isEmpty()) {
                return@withContext null
            }
            
            val item = queryResponse.items()[0]
            val trackUrl = item["track_url"]?.s()
            val position = item["queue_position"]?.n()?.toInt()
            
            if (trackUrl != null && position != null) {
                // Delete the item
                val deleteRequest = DeleteItemRequest.builder()
                    .tableName(guildQueuesTable)
                    .key(mapOf(
                        "guild_id" to AttributeValue.builder().s(guildId).build(),
                        "queue_position" to AttributeValue.builder().n(position.toString()).build()
                    ))
                    .build()
                    
                dynamoDb.deleteItem(deleteRequest)
                
                // Update cache
                queueCache[guildId]?.remove(trackUrl)
                
                logger.info { "Polled track from guild $guildId queue: $trackUrl" }
                return@withContext trackUrl
            }
            
            return@withContext null
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to poll track from guild $guildId queue" }
            return@withContext null
        }
    }
    
    /**
     * Get current queue size for a guild
     */
    suspend fun getQueueSize(guildId: String): Int = withContext(Dispatchers.IO) {
        try {
            val queryRequest = QueryRequest.builder()
                .tableName(guildQueuesTable)
                .keyConditionExpression("guild_id = :guildId")
                .expressionAttributeValues(mapOf(
                    ":guildId" to AttributeValue.builder().s(guildId).build()
                ))
                .select("COUNT")
                .build()
                
            val queryResponse = dynamoDb.query(queryRequest)
            return@withContext queryResponse.count()
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to get queue size for guild $guildId" }
            return@withContext 0
        }
    }
    
    /**
     * Peek at next track without removing it
     */
    fun peekNextTrack(guildId: String): String? {
        try {
            val queryRequest = QueryRequest.builder()
                .tableName(guildQueuesTable)
                .keyConditionExpression("guild_id = :guildId")
                .expressionAttributeValues(mapOf(
                    ":guildId" to AttributeValue.builder().s(guildId).build()
                ))
                .limit(1)
                .build()
                
            val queryResponse = dynamoDb.query(queryRequest)
            
            return if (queryResponse.items().isNotEmpty()) {
                queryResponse.items()[0]["track_url"]?.s()
            } else {
                null  
            }
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to peek next track for guild $guildId" }
            return null
        }
    }
    

    
    /**
     * Clear entire queue for guild
     */
    fun clearQueue(guildId: String) {
        try {
            // Get all items for this guild
            val queryRequest = QueryRequest.builder()
                .tableName(guildQueuesTable)
                .keyConditionExpression("guild_id = :guildId")
                .expressionAttributeValues(mapOf(
                    ":guildId" to AttributeValue.builder().s(guildId).build()
                ))
                .build()
                
            val queryResponse = dynamoDb.query(queryRequest)
            
            // Delete each item
            for (item in queryResponse.items()) {
                val position = item["queue_position"]?.n()
                if (position != null) {
                    val deleteRequest = DeleteItemRequest.builder()
                        .tableName(guildQueuesTable)
                        .key(mapOf(
                            "guild_id" to AttributeValue.builder().s(guildId).build(),
                            "queue_position" to AttributeValue.builder().n(position).build()
                        ))
                        .build()
                        
                    dynamoDb.deleteItem(deleteRequest)
                }
            }
            
            // Clear cache
            queueCache.remove(guildId)
            
            logger.info { "Cleared queue for guild $guildId" }
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to clear queue for guild $guildId" }
        }
    }
    
    /**
     * Check if queue is empty
     */
    suspend fun isEmpty(guildId: String): Boolean {
        return getQueueSize(guildId) == 0
    }
}