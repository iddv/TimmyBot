/**
 * Integration tests for SkipCommand
 */

import { ChatInputCommandInteraction, GuildMember, VoiceChannel } from 'discord.js';
import { SkipCommand } from './SkipCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';

// Mock the services
jest.mock('../services/LavalinkService');
jest.mock('../services/GuildQueueService');

describe('SkipCommand', () => {
  let skipCommand: SkipCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockGuildQueueService: jest.Mocked<GuildQueueService>;
  let mockInteraction: any;
  let mockMember: jest.Mocked<GuildMember>;
  let mockVoiceChannel: jest.Mocked<VoiceChannel>;

  beforeEach(() => {
    // Create mocked services
    mockLavalinkService = {
      getQueueSize: jest.fn(),
      skipCurrentTrack: jest.fn(),
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

    skipCommand = new SkipCommand(mockLavalinkService, mockGuildQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully skip track when queue has remaining tracks', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize
        .mockResolvedValueOnce(3) // Initial queue size check
        .mockResolvedValueOnce(2); // Remaining tracks after skip
      mockLavalinkService.skipCurrentTrack.mockResolvedValue({
        skipped: true,
      });

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockGuildQueueService.isGuildAllowed).toHaveBeenCalledWith('guild-123');
      expect(mockLavalinkService.getQueueSize).toHaveBeenCalledWith('guild-123');
      expect(mockLavalinkService.skipCurrentTrack).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '⏭️ **Track skipped!**\n📊 **Tracks remaining in queue:** 2',
      });
    });

    it('should successfully skip track when queue becomes empty', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize
        .mockResolvedValueOnce(1) // Initial queue size check
        .mockResolvedValueOnce(0); // No tracks remaining after skip
      mockLavalinkService.skipCurrentTrack.mockResolvedValue({
        skipped: true,
      });

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '⏭️ **Track skipped!** Queue is now empty.',
      });
    });

    it('should reject when guild is not allowed', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(false);

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ This server is not authorized to use TimmyBot. Please contact an administrator.',
        ephemeral: true,
      });
      expect(mockLavalinkService.skipCurrentTrack).not.toHaveBeenCalled();
    });

    it('should reject when user is not in voice channel', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      (mockMember.voice as any).channel = null;

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You need to be in a voice channel to skip tracks!',
        ephemeral: true,
      });
      expect(mockLavalinkService.skipCurrentTrack).not.toHaveBeenCalled();
    });

    it('should reject when queue is empty', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(0);

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ There are no tracks in the queue to skip!',
        ephemeral: true,
      });
      expect(mockLavalinkService.skipCurrentTrack).not.toHaveBeenCalled();
    });

    it('should handle skip failure', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(1);
      mockLavalinkService.skipCurrentTrack.mockResolvedValue({
        skipped: false,
      });

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to skip track. Please try again.',
      });
    });

    it('should handle no player found error', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(1);
      mockLavalinkService.skipCurrentTrack.mockRejectedValue(new Error('No player found for guild guild-123'));

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ No music is currently playing!',
      });
    });

    it('should handle other skip errors', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockLavalinkService.getQueueSize.mockResolvedValue(1);
      mockLavalinkService.skipCurrentTrack.mockRejectedValue(new Error('Connection failed'));

      // Act
      await skipCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Failed to skip track: Connection failed',
      });
    });
  });

  describe('hasPermission', () => {
    it('should return true when user is in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';

      // Act
      const result = await (skipCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user is not in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';
      (mockMember.voice as any).channel = null;

      // Act
      const result = await (skipCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when not in guild', async () => {
      // Arrange
      mockInteraction.guildId = null;

      // Act
      const result = await (skipCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('command data', () => {
    it('should have correct command name and description', () => {
      expect(skipCommand.data.name).toBe('skip');
      expect(skipCommand.data.description).toBe('Skip the current track');
    });
  });
});