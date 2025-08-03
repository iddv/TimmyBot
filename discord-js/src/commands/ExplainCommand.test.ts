/**
 * Tests for ExplainCommand
 */

import { ExplainCommand } from './ExplainCommand';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

// Mock Discord.js
jest.mock('discord.js', () => ({
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    name: 'explain',
  })),
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setColor: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
  })),
}));

describe('ExplainCommand', () => {
  let explainCommand: ExplainCommand;
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    explainCommand = new ExplainCommand();
    
    mockInteraction = {
      reply: jest.fn(),
      client: {
        user: {
          displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
        },
      },
    };
  });

  describe('data', () => {
    it('should have correct command name and description', () => {
      expect(explainCommand.data.name).toBe('explain');
    });
  });

  describe('execute', () => {
    it('should reply with architecture embed', async () => {
      await explainCommand.execute(mockInteraction);

      expect(EmbedBuilder).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
        ephemeral: true,
      });
    });

    it('should create embed with correct architecture information', async () => {
      await explainCommand.execute(mockInteraction);

      // Verify EmbedBuilder was called and methods were chained
      expect(EmbedBuilder).toHaveBeenCalled();
      const mockEmbedInstance = (EmbedBuilder as unknown as jest.Mock).mock.results[0].value;
      
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(0x00FF00);
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('🏗️ TimmyBot Architecture');
      expect(mockEmbedInstance.setDescription).toHaveBeenCalledWith('Technical information about TimmyBot\'s implementation');
      expect(mockEmbedInstance.addFields).toHaveBeenCalledWith(
        expect.objectContaining({ name: '🔧 Framework', value: 'Discord.js v14 with TypeScript' }),
        expect.objectContaining({ name: '🎵 Audio Engine', value: 'Lavalink v4 with Shoukaku client' }),
        expect.objectContaining({ name: '☁️ Infrastructure', value: 'AWS ECS Fargate with sidecar containers' }),
        expect.objectContaining({ name: '💾 Database', value: 'Amazon DynamoDB for queue and guild data' }),
        expect.objectContaining({ name: '🔐 Secrets', value: 'AWS Secrets Manager for secure configuration' }),
        expect.objectContaining({ name: '📊 Monitoring', value: 'CloudWatch logs and metrics' }),
        expect.objectContaining({ name: '🐳 Deployment', value: 'Docker containers with health checks' }),
        expect.objectContaining({ 
          name: '🔄 Migration Status', 
          value: 'Migrated from Kotlin/KordEx to Discord.js for improved stability and maintainability' 
        })
      );
      expect(mockEmbedInstance.setFooter).toHaveBeenCalled();
      expect(mockEmbedInstance.setTimestamp).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockInteraction.reply.mockRejectedValue(new Error('Network error'));
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      // Mock the handleError method
      const handleErrorSpy = jest.spyOn(explainCommand as any, 'handleError').mockResolvedValue(undefined);

      await explainCommand.execute(mockInteraction);

      expect(handleErrorSpy).toHaveBeenCalledWith(mockInteraction, expect.any(Error));
    });

    it('should set ephemeral to true for explain message', async () => {
      await explainCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
        })
      );
    });

    it('should include migration information in the embed', async () => {
      await explainCommand.execute(mockInteraction);

      expect(EmbedBuilder).toHaveBeenCalled();
      const mockEmbedInstance = (EmbedBuilder as unknown as jest.Mock).mock.results[0].value;

      expect(mockEmbedInstance.addFields).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ 
          name: '🔄 Migration Status',
          value: expect.stringContaining('Kotlin/KordEx to Discord.js')
        })
      );
    });
  });
});