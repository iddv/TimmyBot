/**
 * Tests for PingCommand
 */

import { PingCommand } from './PingCommand';
import { CommandInteraction } from 'discord.js';

// Mock Discord.js
jest.mock('discord.js', () => ({
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    name: 'ping',
  })),
}));

describe('PingCommand', () => {
  let pingCommand: PingCommand;
  let mockInteraction: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    pingCommand = new PingCommand();
    
    mockInteraction = {
      reply: jest.fn(),
      editReply: jest.fn(),
      createdTimestamp: 1000,
      client: {
        ws: { ping: 50 },
      },
    };
  });

  describe('data', () => {
    it('should have correct command name and description', () => {
      expect(pingCommand.data.name).toBe('ping');
    });
  });

  describe('execute', () => {
    it('should reply with pong and latency information', async () => {
      const mockSentMessage = {
        createdTimestamp: 1100, // 100ms latency
      };
      
      mockInteraction.reply.mockResolvedValue(mockSentMessage);

      await pingCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Pinging...',
        fetchReply: true,
      });

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '🏓 Pong!\n📡 Latency: 100ms\n💓 API Latency: 50ms',
      });
    });

    it('should handle errors gracefully', async () => {
      mockInteraction.reply.mockRejectedValue(new Error('Network error'));
      mockInteraction.replied = false;
      mockInteraction.deferred = false;

      // Mock the handleError method
      const handleErrorSpy = jest.spyOn(pingCommand as any, 'handleError').mockResolvedValue(undefined);

      await pingCommand.execute(mockInteraction);

      expect(handleErrorSpy).toHaveBeenCalledWith(mockInteraction, expect.any(Error));
    });
  });
});