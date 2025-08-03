/**
 * Tests for HelpCommand
 */

import { HelpCommand } from './HelpCommand';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

// Mock Discord.js
jest.mock('discord.js', () => ({
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    name: 'help',
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

describe('HelpCommand', () => {
  let helpCommand: HelpCommand;
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    helpCommand = new HelpCommand();
    
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
      expect(helpCommand.data.name).toBe('help');
    });
  });

  describe('execute', () => {
    it('should reply with help embed containing all commands', async () => {
      await helpCommand.execute(mockInteraction);

      expect(EmbedBuilder).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
        ephemeral: true,
      });
    });

    it('should create embed with correct structure', async () => {
      await helpCommand.execute(mockInteraction);

      // Verify EmbedBuilder was called and methods were chained
      expect(EmbedBuilder).toHaveBeenCalled();
      const mockEmbedInstance = (EmbedBuilder as unknown as jest.Mock).mock.results[0].value;
      
      expect(mockEmbedInstance.setColor).toHaveBeenCalledWith(0x0099FF);
      expect(mockEmbedInstance.setTitle).toHaveBeenCalledWith('🤖 TimmyBot Commands');
      expect(mockEmbedInstance.setDescription).toHaveBeenCalledWith('Here are all the available commands:');
      expect(mockEmbedInstance.addFields).toHaveBeenCalledWith(
        expect.objectContaining({ name: '🏓 /ping' }),
        expect.objectContaining({ name: '❓ /help' }),
        expect.objectContaining({ name: '📋 /explain' }),
        expect.objectContaining({ name: '🎵 /join' }),
        expect.objectContaining({ name: '▶️ /play' }),
        expect.objectContaining({ name: '⏭️ /skip' }),
        expect.objectContaining({ name: '🗑️ /clear' })
      );
      expect(mockEmbedInstance.setFooter).toHaveBeenCalled();
      expect(mockEmbedInstance.setTimestamp).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockInteraction.reply.mockRejectedValue(new Error('Network error'));
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      // Mock the handleError method
      const handleErrorSpy = jest.spyOn(helpCommand as any, 'handleError').mockResolvedValue(undefined);

      await helpCommand.execute(mockInteraction);

      expect(handleErrorSpy).toHaveBeenCalledWith(mockInteraction, expect.any(Error));
    });

    it('should set ephemeral to true for help message', async () => {
      await helpCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
        })
      );
    });
  });
});