/**
 * Integration tests for TimmyBot class
 * Tests Discord client initialization and bot lifecycle
 */

import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
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
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { TimmyBot } from './TimmyBot';

// Mock the AWS services to avoid real AWS calls
jest.mock('../services/AwsSecretsService', () => ({
  AwsSecretsService: jest.fn().mockImplementation(() => ({
    getDiscordBotToken: jest.fn().mockResolvedValue('mock-discord-token'),
    getDatabaseConfig: jest.fn().mockResolvedValue({
      region: 'eu-central-1',
      guildQueuesTable: 'timmybot-dev-guild-queues',
      userPreferencesTable: 'timmybot-dev-user-prefs',
      trackCacheTable: 'timmybot-dev-track-cache',
      serverAllowlistTable: 'timmybot-dev-server-allowlist',
    }),
    getAppConfig: jest.fn().mockResolvedValue({
      environment: 'test',
      logLevel: 'INFO',
      serverAllowlistEnabled: true,
      oauthRequired: false,
      premiumFeatures: true,
    }),
  })),
}));

// Mock LavalinkService
jest.mock('../services/LavalinkService', () => ({
  LavalinkService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockReturnValue(true),
  })),
}));

jest.mock('../services/GuildQueueService', () => ({
  GuildQueueService: jest.fn().mockImplementation(() => ({
    addTrack: jest.fn(),
    getQueueSize: jest.fn(),
    clearQueue: jest.fn(),
    isGuildAllowed: jest.fn(),
  })),
}));

jest.mock('../commands/CommandManager', () => ({
  CommandManager: jest.fn().mockImplementation(() => ({
    registerCommand: jest.fn(),
    registerCommands: jest.fn(),
    deployCommands: jest.fn(),
    handleInteraction: jest.fn(),
    getCommands: jest.fn(),
    getCommand: jest.fn(),
    getStats: jest.fn().mockReturnValue({ total: 1, names: ['ping'] }),
    hasCommand: jest.fn().mockReturnValue(true),
  })),
}));

// Mock all command classes
jest.mock('../commands/PingCommand', () => ({
  PingCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'ping',
      description: 'Test ping command',
      toJSON: jest.fn().mockReturnValue({ name: 'ping', description: 'Test ping command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/HelpCommand', () => ({
  HelpCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'help',
      description: 'Test help command',
      toJSON: jest.fn().mockReturnValue({ name: 'help', description: 'Test help command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/ExplainCommand', () => ({
  ExplainCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'explain',
      description: 'Test explain command',
      toJSON: jest.fn().mockReturnValue({ name: 'explain', description: 'Test explain command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/JoinCommand', () => ({
  JoinCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'join',
      description: 'Test join command',
      toJSON: jest.fn().mockReturnValue({ name: 'join', description: 'Test join command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/PlayCommand', () => ({
  PlayCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'play',
      description: 'Test play command',
      toJSON: jest.fn().mockReturnValue({ name: 'play', description: 'Test play command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/SkipCommand', () => ({
  SkipCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'skip',
      description: 'Test skip command',
      toJSON: jest.fn().mockReturnValue({ name: 'skip', description: 'Test skip command' }),
    },
    execute: jest.fn(),
  })),
}));

jest.mock('../commands/ClearCommand', () => ({
  ClearCommand: jest.fn().mockImplementation(() => ({
    data: {
      name: 'clear',
      description: 'Test clear command',
      toJSON: jest.fn().mockReturnValue({ name: 'clear', description: 'Test clear command' }),
    },
    execute: jest.fn(),
  })),
}));

// Mock Discord.js Client
const mockClient = {
  login: jest.fn(),
  destroy: jest.fn(),
  isReady: jest.fn(),
  once: jest.fn(),
  on: jest.fn(),
  user: { tag: 'TimmyBot#1234' },
  guilds: { cache: { size: 5 } },
};

jest.mock('discord.js', () => ({
  Client: jest.fn(() => mockClient),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    GuildVoiceStates: 4,
    MessageContent: 8,
  },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
    toJSON: jest.fn().mockReturnValue({ name: 'test', description: 'test' })
  })),
  REST: jest.fn(),
  Routes: {
    applicationCommands: jest.fn(),
    applicationGuildCommands: jest.fn()
  }
}));

describe('TimmyBot', () => {
  let bot: TimmyBot;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = new TimmyBot();
  });

  afterEach(async () => {
    // Only try to shutdown if bot exists and might be initialized
    if (bot && typeof bot.shutdown === 'function') {
      try {
        await bot.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
  });

  describe('constructor', () => {
    it('should create a TimmyBot instance', () => {
      expect(bot).toBeInstanceOf(TimmyBot);
    });

    it('should not be ready initially', () => {
      expect(bot.isReady()).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return a Discord client instance', () => {
      const client = bot.getClient();
      expect(client).toBeDefined();
      expect(typeof client.login).toBe('function');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Mock successful login and ready state
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      
      // Mock the ready event to be triggered immediately
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();

      expect(mockClient.login).toHaveBeenCalledWith('mock-discord-token');
      expect(bot.isReady()).toBe(true);
    });

    it('should not initialize twice', async () => {
      // Mock successful initialization
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
      await bot.initialize(); // Second call should be ignored

      expect(mockClient.login).toHaveBeenCalledTimes(1);
    });

    it('should setup event handlers', async () => {
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();

      // Verify event handlers were set up
      expect(mockClient.once).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('warn', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('resumed', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('guildCreate', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('guildDelete', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown when not initialized', async () => {
      await expect(bot.shutdown()).resolves.not.toThrow();
      expect(mockClient.destroy).not.toHaveBeenCalled();
    });

    it('should shutdown gracefully when initialized', async () => {
      // Initialize first
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
      
      // Now shutdown
      await bot.shutdown();

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(bot.isReady()).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return false when not initialized', () => {
      expect(bot.isReady()).toBe(false);
    });

    it('should return true when initialized and client is ready', async () => {
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
      expect(bot.isReady()).toBe(true);
    });

    it('should return false when initialized but client is not ready', async () => {
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(false);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
      expect(bot.isReady()).toBe(false);
    });
  });

  describe('command management', () => {
    beforeEach(async () => {
      // Initialize bot for command tests
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });
      mockClient.user = { id: 'test-bot-id', tag: 'TimmyBot#1234' } as any;

      await bot.initialize();
    });

    it('should load commands automatically during initialization', async () => {
      const commandManager = bot.getCommandManager();
      expect(commandManager).toBeDefined();
      expect(commandManager?.getStats().total).toBeGreaterThan(0);
    });

    it('should have command manager available after initialization', async () => {
      const commandManager = bot.getCommandManager();
      expect(commandManager).toBeDefined();
      expect(commandManager?.hasCommand('ping')).toBe(true);
    });
  });

  describe('service management', () => {
    beforeEach(async () => {
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
    });

    it('should have services initialized after bot initialization', () => {
      // We can't directly access private services, but we can verify they were created
      // by checking that the bot is ready and functioning
      expect(bot.isReady()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Discord login errors', async () => {
      const loginError = new Error('Discord login failed');
      mockClient.login.mockRejectedValue(loginError);

      await expect(bot.initialize()).rejects.toThrow('Discord login failed');
      expect(bot.isReady()).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      // Test that the bot handles various initialization errors
      const initError = new Error('Initialization failed');
      mockClient.login.mockRejectedValue(initError);

      await expect(bot.initialize()).rejects.toThrow('Initialization failed');
      expect(bot.isReady()).toBe(false);
    });

    it('should handle service initialization errors', async () => {
      // Test general service initialization error handling
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      // This test verifies that the bot can handle service initialization
      await expect(bot.initialize()).resolves.not.toThrow();
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      mockClient.login.mockResolvedValue('mock-token');
      mockClient.isReady.mockReturnValue(true);
      mockClient.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      });

      await bot.initialize();
    });

    it('should handle Discord error events', () => {
      // Get the error event handler
      const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      // Simulate an error
      const testError = new Error('Discord error');
      errorHandler(testError);

      // Verify error was logged (we can't easily test logger calls due to mocking)
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle Discord warning events', () => {
      // Get the warn event handler
      const warnHandler = mockClient.on.mock.calls.find(call => call[0] === 'warn')?.[1];
      expect(warnHandler).toBeDefined();

      // Simulate a warning
      warnHandler('Discord warning');

      expect(mockClient.on).toHaveBeenCalledWith('warn', expect.any(Function));
    });

    it('should handle guild create events', () => {
      // Get the guildCreate event handler
      const guildCreateHandler = mockClient.on.mock.calls.find(call => call[0] === 'guildCreate')?.[1];
      expect(guildCreateHandler).toBeDefined();

      // Simulate guild create
      const mockGuild = { id: 'guild-123', name: 'Test Guild' };
      guildCreateHandler(mockGuild);

      expect(mockClient.on).toHaveBeenCalledWith('guildCreate', expect.any(Function));
    });

    it('should handle guild delete events', () => {
      // Get the guildDelete event handler
      const guildDeleteHandler = mockClient.on.mock.calls.find(call => call[0] === 'guildDelete')?.[1];
      expect(guildDeleteHandler).toBeDefined();

      // Simulate guild delete
      const mockGuild = { id: 'guild-123', name: 'Test Guild' };
      guildDeleteHandler(mockGuild);

      expect(mockClient.on).toHaveBeenCalledWith('guildDelete', expect.any(Function));
    });

    it('should handle interaction create events', () => {
      // Get the interactionCreate event handler
      const interactionHandler = mockClient.on.mock.calls.find(call => call[0] === 'interactionCreate')?.[1];
      expect(interactionHandler).toBeDefined();

      // Simulate interaction
      const mockInteraction = { 
        isChatInputCommand: jest.fn().mockReturnValue(true),
        commandName: 'ping',
        guildId: 'guild-123'
      };
      interactionHandler(mockInteraction);

      expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    });
  });
});