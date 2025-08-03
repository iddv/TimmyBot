/**
 * Jest test setup configuration
 * Sets up test environment and global mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.AWS_REGION = 'us-east-1';
process.env.GUILD_QUEUES_TABLE = 'test-guild-queues';
process.env.SERVER_ALLOWLIST_TABLE = 'test-server-allowlist';
process.env.USER_PREFERENCES_TABLE = 'test-user-prefs';
process.env.TRACK_CACHE_TABLE = 'test-track-cache';
process.env.DISCORD_BOT_TOKEN_SECRET = 'test/discord-bot-token';
process.env.DATABASE_CONFIG_SECRET = 'test/database-config';
process.env.APP_CONFIG_SECRET = 'test/app-config';
process.env.LAVALINK_HOST = 'localhost';
process.env.LAVALINK_PORT = '2333';
process.env.LAVALINK_SECURE = 'false';
process.env.LAVALINK_PASSWORD = 'testpassword';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
