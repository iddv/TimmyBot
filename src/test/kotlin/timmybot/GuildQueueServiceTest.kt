package timmybot

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.mockito.kotlin.*
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.*
import org.assertj.core.api.Assertions.assertThat
import kotlinx.coroutines.runBlocking

class GuildQueueServiceTest {

    private lateinit var mockDynamoDb: DynamoDbClient
    private lateinit var guildQueueService: GuildQueueService
    
    private val testGuildId = "123456789"
    private val testTrackUrl = "https://youtube.com/watch?v=test123"
    private val guildQueuesTable = "test-guild-queues"
    private val serverAllowlistTable = "test-server-allowlist"

    @BeforeEach
    fun setup() {
        mockDynamoDb = mock()
        guildQueueService = GuildQueueService()
        
        // Use reflection to inject mock DynamoDB client
        val dynamoDbField = GuildQueueService::class.java.getDeclaredField("dynamoDb")
        dynamoDbField.isAccessible = true
        dynamoDbField.set(guildQueueService, mockDynamoDb)
        
        val guildQueuesTableField = GuildQueueService::class.java.getDeclaredField("guildQueuesTable")
        guildQueuesTableField.isAccessible = true
        guildQueuesTableField.set(guildQueueService, guildQueuesTable)
        
        val serverAllowlistTableField = GuildQueueService::class.java.getDeclaredField("serverAllowlistTable")
        serverAllowlistTableField.isAccessible = true
        serverAllowlistTableField.set(guildQueueService, serverAllowlistTable)
    }

    @Test
    fun `should check guild allowlist - allowed guild returns true`() {
        // Given: Guild is in allowlist
        val allowedItem = mapOf("guild_id" to AttributeValue.builder().s(testGuildId).build())
        val response = GetItemResponse.builder().item(allowedItem).build()
        whenever(mockDynamoDb.getItem(any<GetItemRequest>())).thenReturn(response)

        // When: Checking if guild is allowed
        val result = guildQueueService.isGuildAllowed(testGuildId)

        // Then: Should return true
        assertThat(result).isTrue()
        
        // Verify correct DynamoDB call
        verify(mockDynamoDb).getItem(argThat<GetItemRequest> { request ->
            request.tableName() == serverAllowlistTable &&
            request.key()["guild_id"]?.s() == testGuildId
        })
    }

    @Test
    fun `should check guild allowlist - non-allowed guild returns false`() {
        // Given: Guild is NOT in allowlist (empty response)
        val response = GetItemResponse.builder().item(emptyMap()).build()
        whenever(mockDynamoDb.getItem(any<GetItemRequest>())).thenReturn(response)

        // When: Checking if guild is allowed
        val result = guildQueueService.isGuildAllowed(testGuildId)

        // Then: Should return false
        assertThat(result).isFalse()
    }

    @Test
    fun `should add track to guild queue successfully`() {
        // Given: Empty queue (size 0)
        val countResponse = QueryResponse.builder().count(0).items(emptyList()).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(countResponse)
        
        val putResponse = PutItemResponse.builder().build()
        whenever(mockDynamoDb.putItem(any<PutItemRequest>())).thenReturn(putResponse)

        // When: Adding track to queue
        val position = runBlocking { guildQueueService.addTrack(testGuildId, testTrackUrl) }

        // Then: Should return position 1
        assertThat(position).isEqualTo(1)
        
        // Verify DynamoDB put call
        verify(mockDynamoDb).putItem(argThat<PutItemRequest> { request ->
            request.tableName() == guildQueuesTable &&
            request.item()["guild_id"]?.s() == testGuildId &&
            request.item()["track_url"]?.s() == testTrackUrl &&
            request.item()["queue_position"]?.n() == "1"
        })
    }

    @Test
    fun `should poll track from guild queue successfully`() {
        // Given: Queue has one item
        val queueItem = mapOf(
            "guild_id" to AttributeValue.builder().s(testGuildId).build(),
            "queue_position" to AttributeValue.builder().n("1").build(),
            "track_url" to AttributeValue.builder().s(testTrackUrl).build()
        )
        val queryResponse = QueryResponse.builder().items(queueItem).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(queryResponse)
        
        val deleteResponse = DeleteItemResponse.builder().build()
        whenever(mockDynamoDb.deleteItem(any<DeleteItemRequest>())).thenReturn(deleteResponse)

        // When: Polling track from queue
        val result = runBlocking { guildQueueService.pollTrack(testGuildId) }

        // Then: Should return the track URL
        assertThat(result).isEqualTo(testTrackUrl)
        
        // Verify delete call
        verify(mockDynamoDb).deleteItem(argThat<DeleteItemRequest> { request ->
            request.tableName() == guildQueuesTable &&
            request.key()["guild_id"]?.s() == testGuildId &&
            request.key()["queue_position"]?.n() == "1"
        })
    }

    @Test
    fun `should return null when polling from empty queue`() {
        // Given: Empty queue
        val queryResponse = QueryResponse.builder().items(emptyList()).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(queryResponse)

        // When: Polling track from empty queue
        val result = runBlocking { guildQueueService.pollTrack(testGuildId) }

        // Then: Should return null
        assertThat(result).isNull()
    }

    @Test
    fun `should peek next track without removing it`() {
        // Given: Queue has one item
        val queueItem = mapOf(
            "guild_id" to AttributeValue.builder().s(testGuildId).build(),
            "queue_position" to AttributeValue.builder().n("1").build(),
            "track_url" to AttributeValue.builder().s(testTrackUrl).build()
        )
        val queryResponse = QueryResponse.builder().items(queueItem).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(queryResponse)

        // When: Peeking next track
        val result = guildQueueService.peekNextTrack(testGuildId)

        // Then: Should return the track URL
        assertThat(result).isEqualTo(testTrackUrl)
        
        // Verify NO delete call was made
        verify(mockDynamoDb, never()).deleteItem(any<DeleteItemRequest>())
    }

    @Test
    fun `should get correct queue size`() {
        // Given: Queue has 3 items
        val queryResponse = QueryResponse.builder().count(3).items(emptyList()).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(queryResponse)

        // When: Getting queue size
        val size = guildQueueService.getQueueSize(testGuildId)

        // Then: Should return 3
        assertThat(size).isEqualTo(3)
    }

    @Test
    fun `should clear entire guild queue`() {
        // Given: Queue has 2 items
        val item1 = mapOf(
            "guild_id" to AttributeValue.builder().s(testGuildId).build(),
            "queue_position" to AttributeValue.builder().n("1").build()
        )
        val item2 = mapOf(
            "guild_id" to AttributeValue.builder().s(testGuildId).build(),
            "queue_position" to AttributeValue.builder().n("2").build()
        )
        val queryResponse = QueryResponse.builder().items(item1, item2).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(queryResponse)
        
        val deleteResponse = DeleteItemResponse.builder().build()
        whenever(mockDynamoDb.deleteItem(any<DeleteItemRequest>())).thenReturn(deleteResponse)

        // When: Clearing queue
        guildQueueService.clearQueue(testGuildId)

        // Then: Should delete both items
        verify(mockDynamoDb, times(2)).deleteItem(any<DeleteItemRequest>())
    }

    @Test
    fun `should handle DynamoDB errors gracefully in isGuildAllowed`() {
        // Given: DynamoDB throws exception
        whenever(mockDynamoDb.getItem(any<GetItemRequest>()))
            .thenThrow(DynamoDbException.builder().message("DynamoDB error").build())

        // When: Checking guild allowlist
        val result = guildQueueService.isGuildAllowed(testGuildId)

        // Then: Should fail closed (return false)
        assertThat(result).isFalse()
    }

    @Test
    fun `should isolate guilds - different guilds have separate queues`() {
        // Given: Two different guilds
        val guild1 = "guild123"
        val guild2 = "guild456"
        val track1 = "track1.mp3"
        val track2 = "track2.mp3"
        
        // Mock responses for adding tracks
        val countResponse = QueryResponse.builder().count(0).items(emptyList()).build()
        whenever(mockDynamoDb.query(any<QueryRequest>())).thenReturn(countResponse)
        val putResponse = PutItemResponse.builder().build()
        whenever(mockDynamoDb.putItem(any<PutItemRequest>())).thenReturn(putResponse)

        // When: Adding tracks to different guilds
        runBlocking {
            guildQueueService.addTrack(guild1, track1)
            guildQueueService.addTrack(guild2, track2)
        }

        // Then: Should make separate DynamoDB calls for each guild
        verify(mockDynamoDb, times(2)).putItem(any<PutItemRequest>())
        
        // Verify guild isolation - each track goes to its own guild
        verify(mockDynamoDb).putItem(argThat<PutItemRequest> { request ->
            request.item()["guild_id"]?.s() == guild1 && 
            request.item()["track_url"]?.s() == track1
        })
        verify(mockDynamoDb).putItem(argThat<PutItemRequest> { request ->
            request.item()["guild_id"]?.s() == guild2 && 
            request.item()["track_url"]?.s() == track2  
        })
    }
}