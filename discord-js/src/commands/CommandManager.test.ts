/**
 * Tests for CommandManager
 */

import { CommandManager } from './CommandManager';
import { PingCommand } from './PingCommand';
import { Client, CommandInteraction } from 'discord.js';

// Mock Discord.js
jest.mock('discord.js', () => ({
  Client: jest.fn(),
  Collection: jest.fn().mockImplementation(() => {
    const map = new Map();
    return {
      set: map.set.bind(map),
      get: map.get.bind(map),
      has: map.has.bind(map),
      delete: map.delete.bind(map),
      clear: map.clear.bind(map),
      keys: map.keys.bind(map),
      get size() { return map.size; },
      map: function(callback: any) {
        const result = [];
        for (const [key, value] of map) {
          result.push(callback(value, key, map));
        }
        return result;
      },
    };
  }),
  REST: jest.fn().mockImplementation(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn(),
  })),
  Routes: {
    applicationCommands: jest.fn(),
    applicationGuildCommands: jest.fn(),
  },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    toJSON: jest.fn().mockReturnValue({}),
    name: 'test',
    description: 'test description',
  })),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CommandManager', () => {
  let commandManager: CommandManager;
  let mockClient: any;

  const createMockCommand = (name: string, description: string = 'Test command') => ({
    data: {
      name,
      description,
      toJSON: jest.fn().mockReturnValue({ name, description }),
    } as any,
    execute: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      user: { id: 'test-bot-id' },
      ws: { ping: 50 },
    };

    commandManager = new CommandManager(mockClient, 'test-token');
  });

  describe('registerCommand', () => {
    it('should register a command successfully', () => {
      const validCommand = createMockCommand('test');

      commandManager.registerCommand(validCommand);
      
      expect(commandManager.getCommand('test')).toBe(validCommand);
    });

    it('should overwrite existing command with warning', () => {
      const validCommand = createMockCommand('test');
      
      commandManager.registerCommand(validCommand);
      commandManager.registerCommand(validCommand);
      
      expect(commandManager.getCommand('test')).toBe(validCommand);
    });

    it('should throw error for invalid command', () => {
      const invalidCommand = createMockCommand('');

      expect(() => commandManager.registerCommand(invalidCommand)).toThrow();
    });

    it('should throw error for command without execute function', () => {
      const invalidCommand = {
        data: createMockCommand('test').data,
      };

      expect(() => commandManager.registerCommand(invalidCommand as any)).toThrow();
    });

    it('should throw error for command with invalid name format', () => {
      const invalidCommand = createMockCommand('Test Command');

      expect(() => commandManager.registerCommand(invalidCommand)).toThrow();
    });
  });

  describe('registerCommands', () => {
    it('should register multiple valid commands', () => {
      const validCommand1 = createMockCommand('test1', 'Test command 1');
      const validCommand2 = createMockCommand('test2', 'Test command 2');
      const commands = [validCommand1, validCommand2];
      
      commandManager.registerCommands(commands);
      
      expect(commandManager.getCommands().size).toBe(2);
      expect(commandManager.hasCommand('test1')).toBe(true);
      expect(commandManager.hasCommand('test2')).toBe(true);
    });

    it('should throw error if not an array', () => {
      expect(() => commandManager.registerCommands('not an array' as any)).toThrow('Commands must be an array');
    });

    it('should throw error if any command is invalid', () => {
      const validCommand = createMockCommand('valid', 'Valid command');
      const invalidCommand = createMockCommand('', 'Invalid command');
      const commands = [validCommand, invalidCommand];
      
      expect(() => commandManager.registerCommands(commands)).toThrow();
    });
  });

  describe('handleInteraction', () => {
    it('should execute command when found', async () => {
      const mockInteraction = {
        commandName: 'test',
        user: { tag: 'TestUser#1234' },
        guild: { name: 'TestGuild' },
        guildId: 'test-guild-id',
        reply: jest.fn(),
      } as any;

      const testCommand = createMockCommand('test');
      commandManager.registerCommand(testCommand);
      
      await commandManager.handleInteraction(mockInteraction);
      
      expect(testCommand.execute).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle unknown command', async () => {
      const mockInteraction = {
        commandName: 'unknown',
        user: { tag: 'TestUser#1234' },
        guild: { name: 'TestGuild' },
        guildId: 'test-guild-id',
        reply: jest.fn(),
      } as any;

      await commandManager.handleInteraction(mockInteraction);
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Unknown command!',
        ephemeral: true,
      });
    });

    it('should handle command execution errors', async () => {
      const mockInteraction = {
        commandName: 'test',
        user: { tag: 'TestUser#1234' },
        guild: { name: 'TestGuild' },
        guildId: 'test-guild-id',
        reply: jest.fn(),
        replied: false,
        deferred: false,
      } as any;

      const errorCommand = createMockCommand('test');
      errorCommand.execute = jest.fn().mockRejectedValue(new Error('Test error'));

      commandManager.registerCommand(errorCommand);
      
      await commandManager.handleInteraction(mockInteraction);
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    });
  });

  describe('getCommand', () => {
    it('should return command if exists', () => {
      const testCommand = createMockCommand('test');
      commandManager.registerCommand(testCommand);
      
      expect(commandManager.getCommand('test')).toBe(testCommand);
    });

    it('should return undefined if command does not exist', () => {
      expect(commandManager.getCommand('nonexistent')).toBeUndefined();
    });
  });

  describe('removeCommand', () => {
    it('should remove existing command', () => {
      const testCommand = createMockCommand('test');
      commandManager.registerCommand(testCommand);
      
      const removed = commandManager.removeCommand('test');
      
      expect(removed).toBe(true);
      expect(commandManager.getCommand('test')).toBeUndefined();
    });

    it('should return false for non-existent command', () => {
      const removed = commandManager.removeCommand('nonexistent');
      
      expect(removed).toBe(false);
    });
  });

  describe('clearCommands', () => {
    it('should clear all commands', () => {
      const testCommand = createMockCommand('test');
      commandManager.registerCommand(testCommand);
      
      commandManager.clearCommands();
      
      expect(commandManager.getCommands().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const validCommand1 = createMockCommand('test1', 'Test command 1');
      const validCommand2 = createMockCommand('test2', 'Test command 2');

      commandManager.registerCommand(validCommand1);
      commandManager.registerCommand(validCommand2);

      const stats = commandManager.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.names).toContain('test1');
      expect(stats.names).toContain('test2');
    });
  });

  describe('hasCommand', () => {
    it('should return true for existing command', () => {
      const testCommand = createMockCommand('test');
      commandManager.registerCommand(testCommand);
      
      expect(commandManager.hasCommand('test')).toBe(true);
    });

    it('should return false for non-existing command', () => {
      expect(commandManager.hasCommand('nonexistent')).toBe(false);
    });
  });
});