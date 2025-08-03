import { GuildQueueService } from './GuildQueueService';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('../utils/logger');

const mockDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
const mockSend = jest.fn();

describe('GuildQueueService', () => {
  let guildQueueService: GuildQueueService;
  let originalEnv: NodeJS.ProcessEnv;

  const mockDatabaseConfig = {
    guildQueuesTable: 'test-guild-queues',
    serverAllowlistTable: 'test-server-allowlist',
    region: 'us-east-1',
  };

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock the DynamoDB clients
    mockDynamoDBClient.mockImplementation(() => ({} as any));
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });

    guildQueueService = new GuildQueueService(mockDatabaseConfig);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with provided database config', () => {
      expect(mockDynamoDBClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        maxAttempts: 3,
      });
    });

    it('should use environment variables as fallback', () => {
      process.env.AWS_DEFAULT_REGION = 'eu-west-1';
      process.env.GUILD_QUEUES_TABLE = 'env-guild-queues';
      process.env.SERVER_ALLOWLIST_TABLE = 'env-server-allowlist';

      const configWithoutTables = {
        guildQueuesTable: '',
        serverAllowlistTable: '',
        region: '',
      };

      new GuildQueueService(configWithoutTables);

      expect(mockDynamoDBClient).toHaveBeenCalledWith({
        region: 'eu-west-1',
        maxAttempts: 3,
      });
    });
  });

  describe('isGuildAllowed', () => {
    it('should return true when guild is in allowlist', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { guild_id: 'test-guild-123', allowed: true },
      });

      const result = await guildQueueService.isGuildAllowed('test-guild-123');

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetCommand)
      );
    });

    it('should return false when guild is not in allowlist', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await guildQueueService.isGuildAllowed('test-guild-456');

      expect(result).toBe(false);
    });

    it('should return false and log error on DynamoDB error', async () => {
      const error = new Error('DynamoDB error');
      mockSend.mockRejectedValueOnce(error);

      const result = await guildQueueService.isGuildAllowed('test-guild-789');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to check guild allowlist for test-guild-789',
        error
      );
    });
  });

  describe('addTrack', () => {
    it('should add track to empty queue at position 1', async () => {
      // Mock getQueueSize to return 0
      mockSend
        .mockResolvedValueOnce({ Count: 0 }) // getQueueSize
        .mockResolvedValueOnce({}); // putItem

      const result = await guildQueueService.addTrack('test-guild-123', 'https://youtube.com/watch?v=test');

      expect(result).toBe(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(2, 
        expect.any(PutCommand)
      );
    });

    it('should add track to existing queue at next position', async () => {
      // Mock getQueueSize to return 3
      mockSend
        .mockResolvedValueOnce({ Count: 3 }) // getQueueSize
        .mockResolvedValueOnce({}); // putItem

      const result = await guildQueueService.addTrack('test-guild-123', 'https://youtube.com/watch?v=test2');

      expect(result).toBe(4);
    });

    it('should throw error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB put failed');
      mockSend
        .mockResolvedValueOnce({ Count: 0 }) // getQueueSize
        .mockRejectedValueOnce(error); // putItem

      await expect(guildQueueService.addTrack('test-guild-123', 'test-url')).rejects.toThrow(error);
    });
  });

  describe('pollTrack', () => {
    it('should return and remove first track from queue', async () => {
      const mockItem = {
        guild_id: 'test-guild-123',
        queue_position: 1,
        track_url: 'https://youtube.com/watch?v=test',
        added_at: 1234567890,
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockItem] }) // query
        .mockResolvedValueOnce({}); // delete

      const result = await guildQueueService.pollTrack('test-guild-123');

      expect(result).toBe('https://youtube.com/watch?v=test');
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(2,
        expect.any(DeleteCommand)
      );
    });

    it('should return null when queue is empty', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await guildQueueService.pollTrack('test-guild-123');

      expect(result).toBeNull();
      expect(mockSend).toHaveBeenCalledTimes(1); // Only query, no delete
    });

    it('should return null and log error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB query failed');
      mockSend.mockRejectedValueOnce(error);

      const result = await guildQueueService.pollTrack('test-guild-123');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to poll track from guild test-guild-123 queue',
        error
      );
    });
  });

  describe('getQueueSize', () => {
    it('should return correct queue size', async () => {
      mockSend.mockResolvedValueOnce({ Count: 5 });

      const result = await guildQueueService.getQueueSize('test-guild-123');

      expect(result).toBe(5);
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(QueryCommand)
      );
    });

    it('should return 0 when Count is undefined', async () => {
      mockSend.mockResolvedValueOnce({ Count: undefined });

      const result = await guildQueueService.getQueueSize('test-guild-123');

      expect(result).toBe(0);
    });

    it('should return 0 and log error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB query failed');
      mockSend.mockRejectedValueOnce(error);

      const result = await guildQueueService.getQueueSize('test-guild-123');

      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get queue size for guild test-guild-123',
        error
      );
    });
  });

  describe('peekNextTrack', () => {
    it('should return next track without removing it', async () => {
      const mockItem = {
        guild_id: 'test-guild-123',
        queue_position: 1,
        track_url: 'https://youtube.com/watch?v=test',
        added_at: 1234567890,
      };

      mockSend.mockResolvedValueOnce({ Items: [mockItem] });

      const result = await guildQueueService.peekNextTrack('test-guild-123');

      expect(result).toBe('https://youtube.com/watch?v=test');
      expect(mockSend).toHaveBeenCalledTimes(1); // Only query, no delete
    });

    it('should return null when queue is empty', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await guildQueueService.peekNextTrack('test-guild-123');

      expect(result).toBeNull();
    });

    it('should return null and log error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB query failed');
      mockSend.mockRejectedValueOnce(error);

      const result = await guildQueueService.peekNextTrack('test-guild-123');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to peek next track for guild test-guild-123',
        error
      );
    });
  });

  describe('clearQueue', () => {
    it('should clear all tracks from queue', async () => {
      const mockItems = [
        { guild_id: 'test-guild-123', queue_position: 1, track_url: 'track1' },
        { guild_id: 'test-guild-123', queue_position: 2, track_url: 'track2' },
      ];

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // query
        .mockResolvedValueOnce({}); // batch delete

      await guildQueueService.clearQueue('test-guild-123');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(2,
        expect.any(BatchWriteCommand)
      );
    });

    it('should handle empty queue gracefully', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await guildQueueService.clearQueue('test-guild-123');

      expect(mockSend).toHaveBeenCalledTimes(1); // Only query, no batch delete
    });

    it('should handle large queues with batch processing', async () => {
      // Create 30 items to test batch processing (DynamoDB limit is 25)
      const mockItems = Array.from({ length: 30 }, (_, i) => ({
        guild_id: 'test-guild-123',
        queue_position: i + 1,
        track_url: `track${i + 1}`,
      }));

      mockSend
        .mockResolvedValueOnce({ Items: mockItems }) // query
        .mockResolvedValueOnce({}) // first batch delete (25 items)
        .mockResolvedValueOnce({}); // second batch delete (5 items)

      await guildQueueService.clearQueue('test-guild-123');

      expect(mockSend).toHaveBeenCalledTimes(3); // 1 query + 2 batch deletes
    });

    it('should throw error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB query failed');
      mockSend.mockRejectedValueOnce(error);

      await expect(guildQueueService.clearQueue('test-guild-123')).rejects.toThrow(error);
    });
  });

  describe('isEmpty', () => {
    it('should return true when queue is empty', async () => {
      mockSend.mockResolvedValueOnce({ Count: 0 });

      const result = await guildQueueService.isEmpty('test-guild-123');

      expect(result).toBe(true);
    });

    it('should return false when queue has items', async () => {
      mockSend.mockResolvedValueOnce({ Count: 3 });

      const result = await guildQueueService.isEmpty('test-guild-123');

      expect(result).toBe(false);
    });
  });

  describe('getAllTracks', () => {
    it('should return all tracks in order', async () => {
      const mockItems = [
        { guild_id: 'test-guild-123', queue_position: 1, track_url: 'track1', added_at: 1000 },
        { guild_id: 'test-guild-123', queue_position: 2, track_url: 'track2', added_at: 2000 },
      ];

      mockSend.mockResolvedValueOnce({ Items: mockItems });

      const result = await guildQueueService.getAllTracks('test-guild-123');

      expect(result).toEqual([
        { position: 1, trackUrl: 'track1', addedAt: 1000 },
        { position: 2, trackUrl: 'track2', addedAt: 2000 },
      ]);
    });

    it('should return empty array when no tracks', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await guildQueueService.getAllTracks('test-guild-123');

      expect(result).toEqual([]);
    });

    it('should return empty array and log error on DynamoDB failure', async () => {
      const error = new Error('DynamoDB query failed');
      mockSend.mockRejectedValueOnce(error);

      const result = await guildQueueService.getAllTracks('test-guild-123');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get all tracks for guild test-guild-123',
        error
      );
    });
  });

  describe('cache management', () => {
    it('should clear cache for specific guild', () => {
      guildQueueService.clearCache('test-guild-123');
      // No direct way to test cache clearing, but it should not throw
    });

    it('should clear all cache', () => {
      guildQueueService.clearCache();
      // No direct way to test cache clearing, but it should not throw
    });

    it('should return cache statistics', () => {
      const stats = guildQueueService.getCacheStats();
      
      expect(stats).toEqual({
        totalGuilds: expect.any(Number),
        totalCachedTracks: expect.any(Number),
      });
    });
  });
});