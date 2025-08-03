import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

/**
 * Guild-isolated queue service using DynamoDB
 * Maintains exact same interface as existing Kotlin implementation for compatibility
 * FIXES THE SHARED QUEUE BUG - each Discord server gets its own queue!
 */
export class GuildQueueService {
  private dynamoDb: DynamoDBDocumentClient;
  private guildQueuesTable: string;
  private serverAllowlistTable: string;
  
  // Local cache for performance (cleared periodically)
  private queueCache = new Map<string, string[]>();
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;

  constructor(databaseConfig: { guildQueuesTable: string; serverAllowlistTable: string; region: string }) {
    const region = databaseConfig.region || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'eu-central-1';
    
    const client = new DynamoDBClient({
      region,
      maxAttempts: this.maxRetries,
    });
    
    this.dynamoDb = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
    
    this.guildQueuesTable = databaseConfig.guildQueuesTable || process.env.GUILD_QUEUES_TABLE || 'timmybot-dev-guild-queues';
    this.serverAllowlistTable = databaseConfig.serverAllowlistTable || process.env.SERVER_ALLOWLIST_TABLE || 'timmybot-dev-server-allowlist';
    
    logger.info(`GuildQueueService initialized with table: ${this.guildQueuesTable}`);
  }

  /**
   * Check if guild is allowed to use the bot (cost control)
   */
  async isGuildAllowed(guildId: string): Promise<boolean> {
    try {
      const command = new GetCommand({
        TableName: this.serverAllowlistTable,
        Key: {
          guild_id: guildId,
        },
      });

      const response = await this.dynamoDb.send(command);
      const allowed = !!response.Item;

      if (!allowed) {
        logger.warn(`Guild ${guildId} not in allowlist - access denied`);
      }

      return allowed;
    } catch (error) {
      logger.error(`Failed to check guild allowlist for ${guildId}`, error);
      return false; // Fail closed for security
    }
  }

  /**
   * Add track to guild-specific queue
   */
  async addTrack(guildId: string, trackUrl: string): Promise<number> {
    try {
      // Get next position
      const nextPosition = (await this.getQueueSize(guildId)) + 1;

      const command = new PutCommand({
        TableName: this.guildQueuesTable,
        Item: {
          guild_id: guildId,
          queue_position: nextPosition,
          track_url: trackUrl,
          added_at: Date.now(),
        },
      });

      await this.dynamoDb.send(command);

      // Update cache
      if (!this.queueCache.has(guildId)) {
        this.queueCache.set(guildId, []);
      }
      this.queueCache.get(guildId)!.push(trackUrl);

      logger.info(`Added track to guild ${guildId} queue at position ${nextPosition}`);
      return nextPosition;

    } catch (error) {
      logger.error(`Failed to add track to guild ${guildId} queue`, error);
      throw error;
    }
  }

  /**
   * Get next track from guild-specific queue (and remove it)
   */
  async pollTrack(guildId: string): Promise<string | null> {
    try {
      // Get first item
      const queryCommand = new QueryCommand({
        TableName: this.guildQueuesTable,
        KeyConditionExpression: 'guild_id = :guildId',
        ExpressionAttributeValues: {
          ':guildId': guildId,
        },
        Limit: 1,
        ScanIndexForward: true, // Sort by sort key ascending (queue_position)
      });

      const queryResponse = await this.dynamoDb.send(queryCommand);

      if (!queryResponse.Items || queryResponse.Items.length === 0) {
        return null;
      }

      const item = queryResponse.Items[0];
      const trackUrl = item.track_url as string;
      const position = item.queue_position as number;

      if (trackUrl && position !== undefined) {
        // Delete the item
        const deleteCommand = new DeleteCommand({
          TableName: this.guildQueuesTable,
          Key: {
            guild_id: guildId,
            queue_position: position,
          },
        });

        await this.dynamoDb.send(deleteCommand);

        // Update cache
        const cachedQueue = this.queueCache.get(guildId);
        if (cachedQueue) {
          const index = cachedQueue.indexOf(trackUrl);
          if (index > -1) {
            cachedQueue.splice(index, 1);
          }
        }

        logger.info(`Polled track from guild ${guildId} queue: ${trackUrl}`);
        return trackUrl;
      }

      return null;

    } catch (error) {
      logger.error(`Failed to poll track from guild ${guildId} queue`, error);
      return null;
    }
  }

  /**
   * Get current queue size for a guild
   */
  async getQueueSize(guildId: string): Promise<number> {
    try {
      const command = new QueryCommand({
        TableName: this.guildQueuesTable,
        KeyConditionExpression: 'guild_id = :guildId',
        ExpressionAttributeValues: {
          ':guildId': guildId,
        },
        Select: 'COUNT',
      });

      const response = await this.dynamoDb.send(command);
      return response.Count || 0;

    } catch (error) {
      logger.error(`Failed to get queue size for guild ${guildId}`, error);
      return 0;
    }
  }

  /**
   * Peek at next track without removing it
   */
  async peekNextTrack(guildId: string): Promise<string | null> {
    try {
      const command = new QueryCommand({
        TableName: this.guildQueuesTable,
        KeyConditionExpression: 'guild_id = :guildId',
        ExpressionAttributeValues: {
          ':guildId': guildId,
        },
        Limit: 1,
        ScanIndexForward: true, // Sort by sort key ascending (queue_position)
      });

      const response = await this.dynamoDb.send(command);

      if (response.Items && response.Items.length > 0) {
        return response.Items[0].track_url as string || null;
      }

      return null;

    } catch (error) {
      logger.error(`Failed to peek next track for guild ${guildId}`, error);
      return null;
    }
  }

  /**
   * Clear entire queue for guild
   */
  async clearQueue(guildId: string): Promise<void> {
    try {
      // Get all items for this guild
      const queryCommand = new QueryCommand({
        TableName: this.guildQueuesTable,
        KeyConditionExpression: 'guild_id = :guildId',
        ExpressionAttributeValues: {
          ':guildId': guildId,
        },
      });

      const queryResponse = await this.dynamoDb.send(queryCommand);

      if (!queryResponse.Items || queryResponse.Items.length === 0) {
        logger.info(`No items to clear for guild ${guildId}`);
        return;
      }

      // Use batch delete for better performance
      const deleteRequests = queryResponse.Items.map(item => ({
        DeleteRequest: {
          Key: {
            guild_id: item.guild_id,
            queue_position: item.queue_position,
          },
        },
      }));

      // DynamoDB batch write can handle up to 25 items at a time
      const batchSize = 25;
      for (let i = 0; i < deleteRequests.length; i += batchSize) {
        const batch = deleteRequests.slice(i, i + batchSize);
        
        const batchCommand = new BatchWriteCommand({
          RequestItems: {
            [this.guildQueuesTable]: batch,
          },
        });

        await this.dynamoDb.send(batchCommand);
      }

      // Clear cache
      this.queueCache.delete(guildId);

      logger.info(`Cleared queue for guild ${guildId}`);

    } catch (error) {
      logger.error(`Failed to clear queue for guild ${guildId}`, error);
      throw error;
    }
  }

  /**
   * Check if queue is empty
   */
  async isEmpty(guildId: string): Promise<boolean> {
    return (await this.getQueueSize(guildId)) === 0;
  }

  /**
   * Get all tracks in queue (for debugging/admin purposes)
   */
  async getAllTracks(guildId: string): Promise<Array<{ position: number; trackUrl: string; addedAt: number }>> {
    try {
      const command = new QueryCommand({
        TableName: this.guildQueuesTable,
        KeyConditionExpression: 'guild_id = :guildId',
        ExpressionAttributeValues: {
          ':guildId': guildId,
        },
        ScanIndexForward: true, // Sort by queue_position ascending
      });

      const response = await this.dynamoDb.send(command);

      if (!response.Items) {
        return [];
      }

      return response.Items.map(item => ({
        position: item.queue_position as number,
        trackUrl: item.track_url as string,
        addedAt: item.added_at as number,
      }));

    } catch (error) {
      logger.error(`Failed to get all tracks for guild ${guildId}`, error);
      return [];
    }
  }

  /**
   * Clear cache for a specific guild (for memory management)
   */
  clearCache(guildId?: string): void {
    if (guildId) {
      this.queueCache.delete(guildId);
      logger.debug(`Cleared cache for guild ${guildId}`);
    } else {
      this.queueCache.clear();
      logger.debug('Cleared all queue cache');
    }
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats(): { totalGuilds: number; totalCachedTracks: number } {
    let totalTracks = 0;
    for (const tracks of this.queueCache.values()) {
      totalTracks += tracks.length;
    }

    return {
      totalGuilds: this.queueCache.size,
      totalCachedTracks: totalTracks,
    };
  }
}