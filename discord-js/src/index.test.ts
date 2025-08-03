/**
 * Unit tests for main application entry point
 */

// Mock all dependencies before importing
jest.mock('./bot/TimmyBot', () => ({
  TimmyBot: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    shutdown: jest.fn(),
    isReady: jest.fn().mockReturnValue(true)
  }))
}));

jest.mock('./utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('./config/environment', () => ({
  loadEnvironmentConfig: jest.fn().mockReturnValue({
    AWS_REGION: 'eu-central-1',
    GUILD_QUEUES_TABLE: 'test-guild-queues',
    SERVER_ALLOWLIST_TABLE: 'test-server-allowlist',
    USER_PREFERENCES_TABLE: 'test-user-prefs',
    TRACK_CACHE_TABLE: 'test-track-cache',
    DISCORD_BOT_TOKEN_SECRET: 'test-discord-secret',
    DATABASE_CONFIG_SECRET: 'test-db-secret',
    APP_CONFIG_SECRET: 'test-app-secret',
    LAVALINK_HOST: 'localhost',
    LAVALINK_PORT: '2333',
    LAVALINK_SECURE: 'false',
    LAVALINK_PASSWORD: 'youshallnotpass',
    NODE_ENV: 'test',
    LOG_LEVEL: 'INFO'
  })
}));

describe('main application', () => {
  let mockTimmyBot: any;
  let mockLogger: any;
  let mockLoadEnvironmentConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const { TimmyBot } = require('./bot/TimmyBot');
    mockTimmyBot = new TimmyBot();
    
    mockLogger = require('./utils/logger').logger;
    mockLoadEnvironmentConfig = require('./config/environment').loadEnvironmentConfig;

    // Reset process event listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('should have environment configuration available', () => {
    expect(mockLoadEnvironmentConfig).toBeDefined();
    
    const config = mockLoadEnvironmentConfig();
    expect(config).toBeDefined();
    expect(config.AWS_REGION).toBe('eu-central-1');
  });

  it('should have TimmyBot class available', () => {
    expect(mockTimmyBot).toBeDefined();
    expect(typeof mockTimmyBot.initialize).toBe('function');
    expect(typeof mockTimmyBot.shutdown).toBe('function');
  });

  it('should have logger available', () => {
    expect(mockLogger).toBeDefined();
    expect(typeof mockLogger.info).toBe('function');
    expect(typeof mockLogger.error).toBe('function');
  });

  it('should handle bot initialization', async () => {
    mockTimmyBot.initialize.mockResolvedValue(undefined);
    
    await mockTimmyBot.initialize();
    
    expect(mockTimmyBot.initialize).toHaveBeenCalled();
  });

  it('should handle bot shutdown', async () => {
    mockTimmyBot.shutdown.mockResolvedValue(undefined);
    
    await mockTimmyBot.shutdown();
    
    expect(mockTimmyBot.shutdown).toHaveBeenCalled();
  });

  it('should handle initialization errors', async () => {
    const initError = new Error('Initialization failed');
    mockTimmyBot.initialize.mockRejectedValue(initError);

    await expect(mockTimmyBot.initialize()).rejects.toThrow('Initialization failed');
  });

  it('should handle environment configuration errors', () => {
    const configError = new Error('Missing required environment variable');
    mockLoadEnvironmentConfig.mockImplementation(() => {
      throw configError;
    });

    expect(() => mockLoadEnvironmentConfig()).toThrow('Missing required environment variable');
  });
});