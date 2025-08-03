/**
 * Integration tests for ClearCommand
 */

import { ChatInputCommandInteraction, GuildMember, VoiceChannel } from 'discord.js';
import { ClearCommand } from './ClearCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

// Mock the services
jest.mock('../services/LavalinkService');
jest.mock('../services/GuildQueueService');

describe('ClearCommand', () => {
  let clearCommand: ClearCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockGuildQueueService: jest.Mocked<GuildQueueService>;
  let mockInteraction: any;
  let mockMember: jest.Mocked<GuildMember>;
  let mockVoiceChannel: jest.Mocked<VoiceChannel>;

  beforeEach(() => {
    // Create mocked services
    mockLavalinkService = {
      getQueueSize: jest.fn(),
      clearGuildQueue: jest.fn(),
    } as any;

    mockGuildQueueService = {
      isGuildAllowed: jest.fn(),
    } as any;

    // Create mocked voice channel
    mockVoiceChannel = {
      id: 'voice-channel-123',
      name: 'General Voice',
    } as any;

    // Create mocked member
    mockMember = {
      voice: {
        channel: mockVoiceChannel,
      },
    } as any;

    // Create mocked interaction
    mockInteraction = {
      guildId: 'guild-123',
      channelId: 'text-channel-123',
      member: mockMember,
      reply: jest.fn(),
      deferReply: jest.fn(),
      editReply: jest.fn(),
      deferred: false,
      replied: false,
    } as any;

    clearCommand = new ClearCommand(mockLavalinkService, mockGuildQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully clear queue with single track', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(1);
      mockLavalinkService.clearGuildQueue.mockResolvedValue();

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockGuildQueueService.isGuildAllowed).toHaveBeenCalledWith('guild-123');
      expect(mockLavalinkService.getQueueSize).toHaveBeenCalledWith('guild-123');
      expect(mockLavalinkService.clearGuildQueue).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '🗑️ **Queue cleared!**\n📊 **Removed 1 track** from the queue and stopped playback.',
      });
    });

    it('should successfully clear queue with multiple tracks', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(5);
      mockLavalinkService.clearGuildQueue.mockResolvedValue();

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '🗑️ **Queue cleared!**\n📊 **Removed 5 tracks** from the queue and stopped playback.',
      });
    });

    it('should reject when guild is not allowed', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(false);

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ This server is not authorized to use TimmyBot. Please contact an administrator.',
        ephemeral: true,
      });
      expect(mockLavalinkService.clearGuildQueue).not.toHaveBeenCalled();
    });

    it('should reject when user is not in voice channel', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      (mockMember.voice as any).channel = null;

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You need to be in a voice channel to clear the queue!',
        ephemeral: true,
      });
      expect(mockLavalinkService.clearGuildQueue).not.toHaveBeenCalled();
    });

    it('should reject when queue is already empty', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(0);

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ The queue is already empty!',
        ephemeral: true,
      });
      expect(mockLavalinkService.clearGuildQueue).not.toHaveBeenCalled();
    });

    it('should handle clear queue failure', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(3);
      mockLavalinkService.clearGuildQueue.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await clearCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to clear queue: Database connection failed',
      });
    });
  });

  describe('hasPermission', () => {
    it('should return true when user is in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';

      // Act
      const result = await (clearCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user is not in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';
      (mockMember.voice as any).channel = null;

      // Act
      const result = await (clearCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when not in guild', async () => {
      // Arrange
      mockInteraction.guildId = null;

      // Act
      const result = await (clearCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('command data', () => {
    it('should have correct command name and description', () => {
      expect(clearCommand.data.name).toBe('clear');
      expect(clearCommand.data.description).toBe('Clear the music queue and stop playback');
    });
  });
});