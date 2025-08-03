/**
 * Integration tests for JoinCommand
 */

import { ChatInputCommandInteraction, GuildMember, VoiceChannel, PermissionsBitField } from 'discord.js';
import { JoinCommand } from './JoinCommand';
import { LavalinkService } from '../services/LavalinkService';
import { GuildQueueService } from '../services/GuildQueueService';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock the services
jest.mock('../services/LavalinkService');
jest.mock('../services/GuildQueueService');

describe('JoinCommand', () => {
  let joinCommand: JoinCommand;
  let mockLavalinkService: jest.Mocked<LavalinkService>;
  let mockGuildQueueService: jest.Mocked<GuildQueueService>;
  let mockInteraction: any;
  let mockMember: jest.Mocked<GuildMember>;
  let mockVoiceChannel: jest.Mocked<VoiceChannel>;

  beforeEach(() => {
    // Create mocked services
    mockLavalinkService = {
      getPlayer: jest.fn(),
    } as any;

    mockGuildQueueService = {
      isGuildAllowed: jest.fn(),
    } as any;

    // Create mocked voice channel
    mockVoiceChannel = {
      id: 'voice-channel-123',
      name: 'General Voice',
      permissionsFor: jest.fn(),
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
      client: {
        user: { id: 'bot-123' },
      },
      reply: jest.fn(),
      deferReply: jest.fn(),
      editReply: jest.fn(),
      deferred: false,
      replied: false,
    } as any;

    joinCommand = new JoinCommand(mockLavalinkService, mockGuildQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully join voice channel when conditions are met', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockVoiceChannel.permissionsFor.mockReturnValue({
        has: jest.fn().mockReturnValue(true),
      } as any);
      mockLavalinkService.getConnection.mockResolvedValue({} as any);

      // Act
      await joinCommand.execute(mockInteraction);

      // Assert
      expect(mockGuildQueueService.isGuildAllowed).toHaveBeenCalledWith('guild-123');
      expect(mockLavalinkService.getConnection).toHaveBeenCalledWith(
        'guild-123',
        'voice-channel-123',
        'text-channel-123'
      );
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '✅ Joined **General Voice**! Ready to play music.',
      });
    });

    it('should reject when guild is not allowed', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(false);

      // Act
      await joinCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ This server is not authorized to use TimmyBot. Please contact an administrator.',
        ephemeral: true,
      });
      expect(mockLavalinkService.getConnection).not.toHaveBeenCalled();
    });

    it('should reject when user is not in voice channel', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      (mockMember.voice as any).channel = null;

      // Act
      await joinCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ You need to be in a voice channel to use this command!',
        ephemeral: true,
      });
      expect(mockLavalinkService.getConnection).not.toHaveBeenCalled();
    });

    it('should reject when bot lacks voice permissions', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockVoiceChannel.permissionsFor.mockReturnValue({
        has: jest.fn().mockReturnValue(false),
      } as any);

      // Act
      await joinCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ I need permission to connect and speak in your voice channel!',
        ephemeral: true,
      });
      expect(mockLavalinkService.getConnection).not.toHaveBeenCalled();
    });

    it('should handle connection creation failure', async () => {
      // Arrange
      mockGuildQueueService.isGuildAllowed.mockResolvedValue(true);
      mockVoiceChannel.permissionsFor.mockReturnValue({
        has: jest.fn().mockReturnValue(true),
      } as any);
      mockLavalinkService.getConnection.mockRejectedValue(new Error('Failed to create connection'));

      // Act
      await joinCommand.execute(mockInteraction);

      // Assert
      expect(mockInteraction.deferReply).toHaveBeenCalled();
      // Should call handleError method from BaseSlashCommand
    });
  });

  describe('hasPermission', () => {
    it('should return true when user is in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';

      // Act
      const result = await (joinCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user is not in voice channel', async () => {
      // Arrange
      mockInteraction.guildId = 'guild-123';
      (mockMember.voice as any).channel = null;

      // Act
      const result = await (joinCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when not in guild', async () => {
      // Arrange
      mockInteraction.guildId = null;

      // Act
      const result = await (joinCommand as any).hasPermission(mockInteraction);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('command data', () => {
    it('should have correct command name and description', () => {
      expect(joinCommand.data.name).toBe('join');
      expect(joinCommand.data.description).toBe('Join your voice channel');
    });
  });
});