import { AwsSecretsService, DatabaseConfig, AppConfig } from './AwsSecretsService';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('../utils/logger');

const mockSecretsManagerClient = SecretsManagerClient as jest.MockedClass<typeof SecretsManagerClient>;
const mockSend = jest.fn();

describe('AwsSecretsService', () => {
  let awsSecretsService: AwsSecretsService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock the SecretsManagerClient
    mockSecretsManagerClient.mockImplementation(() => ({
      send: mockSend,
    } as any));

    awsSecretsService = new AwsSecretsService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with default region when no environment variables are set', () => {
      delete process.env.AWS_DEFAULT_REGION;
      delete process.env.AWS_REGION;

      new AwsSecretsService();

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({
        region: 'eu-central-1',
        maxAttempts: 3,
      });
    });

    it('should use AWS_DEFAULT_REGION when set', () => {
      process.env.AWS_DEFAULT_REGION = 'us-west-2';

      new AwsSecretsService();

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-west-2',
        maxAttempts: 3,
      });
    });

    it('should use AWS_REGION when AWS_DEFAULT_REGION is not set', () => {
      delete process.env.AWS_DEFAULT_REGION;
      process.env.AWS_REGION = 'us-east-1';

      new AwsSecretsService();

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        maxAttempts: 3,
      });
    });
  });

  describe('getDiscordBotToken', () => {
    it('should retrieve Discord bot token successfully', async () => {
      const mockSecretValue = JSON.stringify({ token: 'test-discord-token' });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getDiscordBotToken();

      expect(result).toBe('test-discord-token');
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
    });

    it('should use custom secret name from environment variable', async () => {
      process.env.DISCORD_BOT_TOKEN_SECRET = 'custom/discord-token';
      const mockSecretValue = JSON.stringify({ token: 'test-token' });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await awsSecretsService.getDiscordBotToken();

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
    });

    it('should throw error when secret JSON is invalid', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'invalid-json' });

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Invalid secret JSON format in Secrets Manager'
      );
    });

    it('should throw error when secret is not an object', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: '"string-value"' });

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Invalid secret format in Secrets Manager: expected JSON object'
      );
    });

    it('should throw error when token is missing', async () => {
      const mockSecretValue = JSON.stringify({ other: 'value' });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Discord bot token is empty in secret'
      );
    });

    it('should throw error when token is empty string', async () => {
      const mockSecretValue = JSON.stringify({ token: '' });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Discord bot token is empty in secret'
      );
    });

    it('should throw error when token is whitespace only', async () => {
      const mockSecretValue = JSON.stringify({ token: '   ' });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Discord bot token is empty in secret'
      );
    });

    it('should retry on AWS service errors', async () => {
      const error = new Error('ServiceUnavailable');
      mockSend
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ SecretString: JSON.stringify({ token: 'test-token' }) });

      const result = await awsSecretsService.getDiscordBotToken();

      expect(result).toBe('test-token');
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const error = new Error('ServiceUnavailable');
      mockSend.mockRejectedValue(error);

      await expect(awsSecretsService.getDiscordBotToken()).rejects.toThrow(
        'Could not retrieve Discord bot token from Secrets Manager. Check AWS credentials and permissions.'
      );
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('getDatabaseConfig', () => {
    it('should retrieve database config successfully with all values', async () => {
      const mockSecretValue = JSON.stringify({
        dynamodb_region: 'us-west-2',
        guild_queues_table: 'custom-guild-queues',
        user_preferences_table: 'custom-user-prefs',
        track_cache_table: 'custom-track-cache',
        server_allowlist_table: 'custom-server-allowlist'
      });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getDatabaseConfig();

      const expected: DatabaseConfig = {
        region: 'us-west-2',
        guildQueuesTable: 'custom-guild-queues',
        userPreferencesTable: 'custom-user-prefs',
        trackCacheTable: 'custom-track-cache',
        serverAllowlistTable: 'custom-server-allowlist'
      };

      expect(result).toEqual(expected);
    });

    it('should use default values when secret values are missing', async () => {
      const mockSecretValue = JSON.stringify({});
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getDatabaseConfig();

      const expected: DatabaseConfig = {
        region: 'eu-central-1',
        guildQueuesTable: 'timmybot-dev-guild-queues',
        userPreferencesTable: 'timmybot-dev-user-prefs',
        trackCacheTable: 'timmybot-dev-track-cache',
        serverAllowlistTable: 'timmybot-dev-server-allowlist'
      };

      expect(result).toEqual(expected);
    });

    it('should use custom secret name from environment variable', async () => {
      process.env.DATABASE_CONFIG_SECRET = 'custom/database-config';
      const mockSecretValue = JSON.stringify({});
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await awsSecretsService.getDatabaseConfig();

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
    });

    it('should throw error when secret JSON is invalid', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'invalid-json' });

      await expect(awsSecretsService.getDatabaseConfig()).rejects.toThrow(
        'Invalid secret JSON format in Secrets Manager'
      );
    });

    it('should handle AWS service errors', async () => {
      const error = new Error('AccessDenied');
      mockSend.mockRejectedValue(error);

      await expect(awsSecretsService.getDatabaseConfig()).rejects.toThrow(
        'Could not retrieve database configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.'
      );
    });
  });

  describe('getAppConfig', () => {
    it('should retrieve app config successfully with all values', async () => {
      const mockSecretValue = JSON.stringify({
        environment: 'production',
        log_level: 'DEBUG',
        server_allowlist_enabled: 'false',
        oauth_required: 'true',
        premium_features: 'false'
      });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getAppConfig();

      const expected: AppConfig = {
        environment: 'production',
        logLevel: 'DEBUG',
        serverAllowlistEnabled: false,
        oauthRequired: true,
        premiumFeatures: false
      };

      expect(result).toEqual(expected);
    });

    it('should use default values when secret values are missing', async () => {
      const mockSecretValue = JSON.stringify({});
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getAppConfig();

      const expected: AppConfig = {
        environment: 'dev',
        logLevel: 'INFO',
        serverAllowlistEnabled: true,
        oauthRequired: false,
        premiumFeatures: true
      };

      expect(result).toEqual(expected);
    });

    it('should handle boolean values as actual booleans', async () => {
      const mockSecretValue = JSON.stringify({
        server_allowlist_enabled: false,
        oauth_required: true,
        premium_features: false
      });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getAppConfig();

      expect(result.serverAllowlistEnabled).toBe(false);
      expect(result.oauthRequired).toBe(true);
      expect(result.premiumFeatures).toBe(false);
    });

    it('should handle various boolean string formats', async () => {
      const mockSecretValue = JSON.stringify({
        server_allowlist_enabled: 'TRUE',
        oauth_required: 'False',
        premium_features: 'invalid'
      });
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      const result = await awsSecretsService.getAppConfig();

      expect(result.serverAllowlistEnabled).toBe(true);
      expect(result.oauthRequired).toBe(false);
      expect(result.premiumFeatures).toBe(true); // default value for invalid
    });

    it('should use custom secret name from environment variable', async () => {
      process.env.APP_CONFIG_SECRET = 'custom/app-config';
      const mockSecretValue = JSON.stringify({});
      mockSend.mockResolvedValueOnce({ SecretString: mockSecretValue });

      await awsSecretsService.getAppConfig();

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
    });

    it('should handle AWS service errors', async () => {
      const error = new Error('ResourceNotFound');
      mockSend.mockRejectedValue(error);

      await expect(awsSecretsService.getAppConfig()).rejects.toThrow(
        'Could not retrieve application configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.'
      );
    });
  });

  describe('retry logic', () => {
    it('should implement exponential backoff', async () => {
      const error = new Error('ThrottlingException');
      mockSend
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ SecretString: JSON.stringify({ token: 'test-token' }) });

      const startTime = Date.now();
      await awsSecretsService.getDiscordBotToken();
      const endTime = Date.now();

      // Should have some delay due to retries (at least 1 second base delay)
      expect(endTime - startTime).toBeGreaterThan(1000);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });
});