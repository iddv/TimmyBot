/**
 * LavalinkService Tests
 * Tests for Lavalink connection management and audio functionality
 */

import { Client } from 'discord.js';
import { LavalinkService } from './LavalinkService';
import { EnvironmentConfig } from '../config/environment';
import { logger } from '../utils/logger';
import { GuildQueueService } from './GuildQueueService';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock dependencies
jest.mock('shoukaku', () => ({
  Shoukaku: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    nodes: new Map(),
    players: new Map(),
    connect: jest.fn().mockResolvedValue(undefined),
  })),
  Events: {
    Ready: 'ready',
    Error: 'error',
    Close: 'close',
    Disconnect: 'disconnect',
    Debug: 'debug',
  },
  createDiscordJSOptions: jest.fn().mockReturnValue({}),
}));
jest.mock('../utils/logger');
jest.mock('./GuildQueueService');

describe('LavalinkService', () => {
  let lavalinkService: LavalinkService;
  let mockClient: jest.Mocked<Client>;
  let mockShoukaku: any;
  let mockNode: any;
  let mockPlayer: any;
  let mockGuildQueueService: jest.Mocked<GuildQueueService>;
  let environmentConfig: EnvironmentConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock Discord client
    mockClient = {
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    // Mock Node
    mockNode = {
      state: 'CONNECTED',
      rest: {
        resolve: jest.fn(),
      },
      joinChannel: jest.fn(),
      stats: {
        players: 0,
        playingPlayers: 0,
        uptime: 1000,
        memory: { used: 100, free: 900, allocated: 1000 },
        cpu: { cores: 4, systemLoad: 0.1, lavalinkLoad: 0.05 },
      },
    };

    // Mock Player
    mockPlayer = {
      guildId: 'test-guild',
      playTrack: jest.fn(),
      stopTrack: jest.fn(),
      destroy: jest.fn(),
    };

    // Mock Shoukaku
    mockShoukaku = {
      on: jest.fn(),
      once: jest.fn(),
      nodes: [mockNode],
      connections: [],
      joinVoiceChannel: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      leaveVoiceChannel: jest.fn(),
      userId: 'test-user-id',
    };

    // Mock Shoukaku constructor
    const { Shoukaku } = require('shoukaku');
    Shoukaku.mockImplementation(() => mockShoukaku);

    // Mock GuildQueueService
    mockGuildQueueService = {
      addTrack: jest.fn(),
      getQueueSize: jest.fn(),
      clearQueue: jest.fn(),
      isGuildAllowed: jest.fn(),
    } as any;

    // Environment configuration
    environmentConfig = {
      AWS_REGION: 'eu-central-1',
      GUILD_QUEUES_TABLE: 'test-guild-queues',
      SERVER_ALLOWLIST_TABLE: 'test-server-allowlist',
      USER_PREFERENCES_TABLE: 'test-user-prefs',
      TRACK_CACHE_TABLE: 'test-track-cache',
      DISCORD_BOT_TOKEN_SECRET: 'test-token-secret',
      DATABASE_CONFIG_SECRET: 'test-db-secret',
      APP_CONFIG_SECRET: 'test-app-secret',
      LAVALINK_HOST: 'localhost',
      LAVALINK_PORT: '2333',
      LAVALINK_SECURE: 'false',
      LAVALINK_PASSWORD: 'testpass',
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
    };

    lavalinkService = new LavalinkService(mockClient, environmentConfig, mockGuildQueueService);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      // Constructor doesn't create Shoukaku instance anymore - that's done in initialize()
      expect(lavalinkService).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully when node is connected', async () => {
      // Mock successful connection
      mockNode.state = 'CONNECTED';
      
      // Mock the ready event to be emitted immediately
      mockShoukaku.once.mockImplementation((event: any, callback: any) => {
        if (event === 'ready') {
          setTimeout(() => callback(mockNode, false), 10);
        }
      });

      await lavalinkService.initialize();

      expect(mockShoukaku.connect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('✅ Lavalink service initialized successfully');
    });

    it('should throw error when connection fails', async () => {
      // Mock connection failure
      mockNode.state = 'DISCONNECTED';
      
      // Mock timeout on ready event
      mockShoukaku.once.mockImplementation((event: any, callback: any) => {
        // Don't call callback to simulate timeout
      });

      await expect(lavalinkService.initialize()).rejects.toThrow('Shoukaku ready timeout');
    }, 15000);
  });

  describe('loadTrack', () => {
    beforeEach(() => {
      // Set up connected state
      mockNode.state = 'CONNECTED';
    });

    it('should load track from URL successfully', async () => {
      const mockTrack = {
        encoded: 'encoded-track-data',
        info: {
          identifier: 'test-id',
          title: 'Test Song',
          author: 'Test Artist',
          length: 180000,
          isSeekable: true,
          isStream: false,
          uri: 'https://youtube.com/watch?v=test',
          sourceName: 'youtube',
          position: 0,
        },
        pluginInfo: {},
        userData: {},
      };

      mockNode.rest.resolve.mockResolvedValue({
        loadType: 'track' as any,
        data: mockTrack,
      });

      const result = await lavalinkService.loadTrack('https://youtube.com/watch?v=test');

      expect(mockNode.rest.resolve).toHaveBeenCalledWith('https://youtube.com/watch?v=test');
      expect(result).toEqual({
        loadType: 'track',
        tracks: [mockTrack],
        playlistInfo: undefined,
      });
    });

    it('should load track from search query successfully', async () => {
      const mockTracks = [
        {
          encoded: 'encoded-track-1',
          info: {
            identifier: 'test-id-1',
            title: 'Test Song 1',
            author: 'Test Artist',
            length: 180000,
            isSeekable: true,
            isStream: false,
            uri: 'https://youtube.com/watch?v=test1',
            sourceName: 'youtube',
            position: 0,
          },
          pluginInfo: {},
          userData: {},
        },
      ];

      mockNode.rest.resolve.mockResolvedValue({
        loadType: 'search' as any,
        data: mockTracks,
      });

      const result = await lavalinkService.loadTrack('test song');

      expect(mockNode.rest.resolve).toHaveBeenCalledWith('ytsearch:test song');
      expect(result).toEqual({
        loadType: 'search',
        tracks: mockTracks,
        playlistInfo: undefined,
      });
    });

    it('should handle load errors', async () => {
      mockNode.rest.resolve.mockRejectedValue(new Error('Load failed'));

      await expect(lavalinkService.loadTrack('test query')).rejects.toThrow('Load failed');
      expect(logger.error).toHaveBeenCalledWith('❌ Failed to load track', {
        query: 'test query',
        error: expect.any(Error),
      });
    });

    it('should throw error when no node is available', async () => {
      // Remove node
      mockShoukaku.nodes.clear();

      await expect(lavalinkService.loadTrack('test')).rejects.toThrow('No Lavalink node available');
    });
  });

  describe('getConnection', () => {
    beforeEach(() => {
      mockNode.state = 'CONNECTED';
    });

    it('should create new connection when none exists', async () => {
      const mockConnection = { guildId: 'test-guild', player: mockPlayer };
      const mockWeakRef = { deref: () => mockConnection };
      mockShoukaku.joinVoiceChannel = jest.fn().mockResolvedValue(mockWeakRef);

      const connection = await lavalinkService.getConnection('test-guild', 'voice-channel', 'text-channel');

      expect(mockShoukaku.joinVoiceChannel).toHaveBeenCalledWith({
        guildId: 'test-guild',
        channelId: 'voice-channel',
        shardId: 0,
        node: mockNode,
      });
      expect(connection).toBe(mockConnection);
      expect((connection as any).textChannelId).toBe('text-channel');
    });

    it('should return existing connection', async () => {
      // Add existing connection
      const mockConnection = { guildId: 'test-guild', player: mockPlayer };
      mockShoukaku.connections = [mockConnection];

      const connection = await lavalinkService.getConnection('test-guild', 'voice-channel', 'text-channel');

      expect(mockShoukaku.joinVoiceChannel).not.toHaveBeenCalled();
      expect(connection).toBe(mockConnection);
    });

    it('should handle connection creation errors', async () => {
      mockShoukaku.joinVoiceChannel = jest.fn().mockRejectedValue(new Error('Join failed'));

      await expect(
        lavalinkService.getConnection('test-guild', 'voice-channel', 'text-channel')
      ).rejects.toThrow('Join failed');
    });
  });

  describe('playTrack', () => {
    const mockTrack = {
      encoded: 'encoded-track-data',
      info: {
        identifier: 'test-id',
        title: 'Test Song',
        author: 'Test Artist',
        length: 180000,
        isSeekable: true,
        isStream: false,
        uri: 'https://youtube.com/watch?v=test',
        sourceName: 'youtube',
        position: 0,
      },
      pluginInfo: {},
      userData: {},
    };

    it('should play track successfully', async () => {
      const mockConnection = { guildId: 'test-guild', player: mockPlayer };
      mockShoukaku.connections = [mockConnection];
      mockPlayer.playTrack.mockResolvedValue(undefined);

      await lavalinkService.playTrack('test-guild', mockTrack);

      expect(mockPlayer.playTrack).toHaveBeenCalledWith({ 
        track: { 
          encoded: 'encoded-track-data' 
        } 
      });
      expect(logger.info).toHaveBeenCalledWith('✅ Track started playing', {
        guildId: 'test-guild',
        title: 'Test Song',
        duration: 180000,
      });
    });

    it('should throw error when no connection exists', async () => {
      mockShoukaku.connections = [];
      await expect(lavalinkService.playTrack('test-guild', mockTrack)).rejects.toThrow(
        'No connection found for guild test-guild'
      );
    });

    it('should handle playback errors', async () => {
      const mockConnection = { guildId: 'test-guild', player: mockPlayer };
      mockShoukaku.connections = [mockConnection];
      mockPlayer.playTrack.mockRejectedValue(new Error('Playback failed'));

      await expect(lavalinkService.playTrack('test-guild', mockTrack)).rejects.toThrow(
        'Playback failed'
      );
    });
  });

  describe('skipTrack', () => {
    it('should skip track successfully', async () => {
      const mockConnection = { guildId: 'test-guild', player: mockPlayer };
      mockShoukaku.connections = [mockConnection];
      mockPlayer.stopTrack.mockResolvedValue(undefined);

      await lavalinkService.skipTrack('test-guild');

      expect(mockPlayer.stopTrack).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('✅ Track skipped', { guildId: 'test-guild' });
    });

    it('should throw error when no connection exists', async () => {
      mockShoukaku.connections = [];
      await expect(lavalinkService.skipTrack('test-guild')).rejects.toThrow(
        'No connection found for guild test-guild'
      );
    });
  });

  describe('stopPlayback', () => {
    it('should stop playback successfully', async () => {
      mockShoukaku.leaveVoiceChannel.mockResolvedValue(undefined);

      await lavalinkService.stopPlayback('test-guild');

      expect(mockShoukaku.leaveVoiceChannel).toHaveBeenCalledWith('test-guild');
      expect(logger.info).toHaveBeenCalledWith('✅ Playback stopped', { guildId: 'test-guild' });
    });

    it('should handle case when no connection exists', async () => {
      await lavalinkService.stopPlayback('test-guild');
      // Should not throw error
    });
  });

  describe('isHealthy', () => {
    it('should return true when connected', () => {
      mockNode.state = 'CONNECTED';
      (lavalinkService as any).isConnected = true;

      expect(lavalinkService.isHealthy()).toBe(true);
    });

    it('should return false when disconnected', () => {
      mockNode.state = 'DISCONNECTED';
      (lavalinkService as any).isConnected = false;

      expect(lavalinkService.isHealthy()).toBe(false);
    });

    it('should return false when no node exists', () => {
      mockShoukaku.nodes.clear();

      expect(lavalinkService.isHealthy()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return connection statistics', () => {
      mockNode.state = 'CONNECTED';
      (lavalinkService as any).isConnected = true;
      mockShoukaku.connections = [{ guildId: 'guild1' }];

      const stats = lavalinkService.getStats();

      expect(stats).toEqual({
        connected: true,
        nodeState: 'CONNECTED',
        connections: 1,
        stats: mockNode.stats,
      });
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      mockShoukaku.connections = [{ guildId: 'guild1' }];
      mockShoukaku.leaveVoiceChannel.mockResolvedValue(undefined);

      await lavalinkService.destroy();

      expect(mockShoukaku.leaveVoiceChannel).toHaveBeenCalledWith('guild1');
      expect(logger.info).toHaveBeenCalledWith('✅ Lavalink service destroyed');
    });
  });

  describe('event handlers', () => {
    it('should handle ready event', () => {
      const readyHandler = mockShoukaku.on.mock.calls.find((call: any) => call[0] === 'ready')?.[1];
      expect(readyHandler).toBeDefined();

      readyHandler?.('main', false);

      expect(logger.info).toHaveBeenCalledWith('🎵 Lavalink node ready', {
        name: 'main',
        resumed: false,
      });
    });

    it('should handle error event', () => {
      const errorHandler = mockShoukaku.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      const testError = new Error('Test error');
      errorHandler?.('main', testError);

      expect(logger.error).toHaveBeenCalledWith('❌ Lavalink node error', {
        name: 'main',
        error: testError,
      });
    });

    it('should handle close event', () => {
      const closeHandler = mockShoukaku.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
      expect(closeHandler).toBeDefined();

      closeHandler?.('main', 1000, 'Normal closure');

      expect(logger.warn).toHaveBeenCalledWith('⚠️ Lavalink node closed', {
        name: 'main',
        code: 1000,
        reason: 'Normal closure',
      });
    });

    it('should handle disconnect event', () => {
      const disconnectHandler = mockShoukaku.on.mock.calls.find((call: any) => call[0] === 'disconnect')?.[1];
      expect(disconnectHandler).toBeDefined();

      disconnectHandler?.('main', 2);

      expect(logger.warn).toHaveBeenCalledWith('⚠️ Lavalink node disconnected', {
        name: 'main',
        count: 2,
      });
    });
  });

  describe('queue management', () => {
    const mockTrack = {
      encoded: 'encoded-track-data',
      info: {
        identifier: 'test-id',
        title: 'Test Song',
        author: 'Test Artist',
        length: 180000,
        isSeekable: true,
        isStream: false,
        uri: 'https://youtube.com/watch?v=test',
        sourceName: 'youtube',
        position: 0,
      },
      pluginInfo: {},
      userData: {},
    };

    beforeEach(() => {
      mockNode.state = 'CONNECTED';
      mockNode.rest.resolve.mockResolvedValue({
        loadType: 'track' as any,
        data: mockTrack,
      });
    });

    describe('addTrackToQueue', () => {
      it('should add track to queue and play immediately if queue is empty', async () => {
        mockGuildQueueService.addTrack.mockResolvedValue(1);
        const mockConnection = { guildId: 'test-guild', player: mockPlayer };
        const mockWeakRef = { deref: () => mockConnection };
        mockShoukaku.joinVoiceChannel = jest.fn().mockResolvedValue(mockWeakRef);
        mockPlayer.playTrack.mockResolvedValue(undefined);

        const result = await lavalinkService.addTrackToQueue(
          'test-guild',
          'test song',
          'voice-channel',
          'text-channel'
        );

        expect(mockGuildQueueService.addTrack).toHaveBeenCalledWith('test-guild', 'test song');
        expect(mockShoukaku.joinVoiceChannel).toHaveBeenCalledWith({
          guildId: 'test-guild',
          channelId: 'voice-channel',
          shardId: 0,
          node: mockNode,
        });
        expect(mockPlayer.playTrack).toHaveBeenCalledWith({
          track: { encoded: 'encoded-track-data' },
        });
        expect(result).toEqual({
          position: 1,
          track: mockTrack,
        });
      });

      it('should add track to queue without playing if queue is not empty', async () => {
        mockGuildQueueService.addTrack.mockResolvedValue(3);

        const result = await lavalinkService.addTrackToQueue(
          'test-guild',
          'test song',
          'voice-channel',
          'text-channel'
        );

        expect(mockGuildQueueService.addTrack).toHaveBeenCalledWith('test-guild', 'test song');
        expect(mockShoukaku.joinVoiceChannel).not.toHaveBeenCalled();
        expect(result).toEqual({
          position: 3,
          track: mockTrack,
        });
      });

      it('should throw error when no tracks found', async () => {
        mockNode.rest.resolve.mockResolvedValue({
          loadType: 'search' as any,
          data: [],
        });

        await expect(
          lavalinkService.addTrackToQueue('test-guild', 'test song', 'voice-channel', 'text-channel')
        ).rejects.toThrow('No tracks found for the given query');
      });
    });

    describe('skipCurrentTrack', () => {
      it('should skip track and continue with queue when more tracks exist', async () => {
        const mockConnection = { guildId: 'test-guild', player: mockPlayer };
        mockShoukaku.connections = [mockConnection];
        mockPlayer.stopTrack.mockResolvedValue(undefined);
        mockGuildQueueService.getQueueSize.mockResolvedValue(3);

        const result = await lavalinkService.skipCurrentTrack('test-guild');

        expect(mockPlayer.stopTrack).toHaveBeenCalled();
        expect(mockGuildQueueService.getQueueSize).toHaveBeenCalledWith('test-guild');
        expect(result).toEqual({ skipped: true });
      });

      it('should skip track and clear queue when it was the last track', async () => {
        const mockConnection = { guildId: 'test-guild', player: mockPlayer };
        mockShoukaku.connections = [mockConnection];
        mockPlayer.stopTrack.mockResolvedValue(undefined);
        mockGuildQueueService.getQueueSize.mockResolvedValue(1);
        mockGuildQueueService.clearQueue.mockResolvedValue(undefined);

        const result = await lavalinkService.skipCurrentTrack('test-guild');

        expect(mockPlayer.stopTrack).toHaveBeenCalled();
        expect(mockGuildQueueService.clearQueue).toHaveBeenCalledWith('test-guild');
        expect(result).toEqual({ skipped: true });
      });
    });

    describe('clearGuildQueue', () => {
      it('should stop playback and clear queue', async () => {
        mockShoukaku.leaveVoiceChannel.mockResolvedValue(undefined);
        mockGuildQueueService.clearQueue.mockResolvedValue(undefined);

        await lavalinkService.clearGuildQueue('test-guild');

        expect(mockShoukaku.leaveVoiceChannel).toHaveBeenCalledWith('test-guild');
        expect(mockGuildQueueService.clearQueue).toHaveBeenCalledWith('test-guild');
      });
    });

    describe('getQueueSize', () => {
      it('should return queue size from guild queue service', async () => {
        mockGuildQueueService.getQueueSize.mockResolvedValue(5);

        const size = await lavalinkService.getQueueSize('test-guild');

        expect(mockGuildQueueService.getQueueSize).toHaveBeenCalledWith('test-guild');
        expect(size).toBe(5);
      });

      it('should handle errors from guild queue service', async () => {
        mockGuildQueueService.getQueueSize.mockRejectedValue(new Error('DynamoDB error'));

        await expect(lavalinkService.getQueueSize('test-guild')).rejects.toThrow('DynamoDB error');
      });
    });
  });
});