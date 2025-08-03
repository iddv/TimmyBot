import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger';

/**
 * Configuration interfaces matching the Kotlin implementation
 */
export interface DatabaseConfig {
  region: string;
  guildQueuesTable: string;
  userPreferencesTable: string;
  trackCacheTable: string;
  serverAllowlistTable: string;
}

export interface AppConfig {
  environment: string;
  logLevel: string;
  serverAllowlistEnabled: boolean;
  oauthRequired: boolean;
  premiumFeatures: boolean;
}

/**
 * Service for retrieving secrets from AWS Secrets Manager
 * Maintains exact same interface as existing Kotlin implementation for compatibility
 */
export class AwsSecretsService {
  private secretsClient: SecretsManagerClient;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;

  constructor() {
    const region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'eu-central-1';
    
    this.secretsClient = new SecretsManagerClient({
      region,
      maxAttempts: this.maxRetries,
    });

    logger.info(`AwsSecretsService initialized for region: ${region}`);
  }

  /**
   * Get Discord bot token from AWS Secrets Manager
   */
  async getDiscordBotToken(): Promise<string> {
    const secretName = process.env.DISCORD_BOT_TOKEN_SECRET || 'timmybot/dev/discord-bot-token';

    try {
      const secretString = await this.getSecretWithRetry(secretName);
      
      // Parse the JSON secret with proper error handling
      let secretMap: Record<string, any>;
      try {
        secretMap = JSON.parse(secretString);
      } catch (error) {
        logger.error(`Failed to parse secret JSON: ${secretName}`, error);
        throw new Error('Invalid secret JSON format in Secrets Manager');
      }

      if (typeof secretMap !== 'object' || secretMap === null) {
        logger.error(`Failed to cast secret to object format: ${secretName}`);
        throw new Error('Invalid secret format in Secrets Manager: expected JSON object');
      }

      const token = secretMap.token;

      if (!token || typeof token !== 'string' || token.trim() === '') {
        throw new Error('Discord bot token is empty in secret');
      }

      logger.info('Successfully retrieved Discord bot configuration from Secrets Manager');
      return token;

    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Discord bot token is empty') ||
        error.message.includes('Invalid secret JSON format') ||
        error.message.includes('Invalid secret format')
      )) {
        throw error;
      }
      logger.error(`Failed to retrieve Discord bot token from secret: ${secretName}`, error);
      throw new Error('Could not retrieve Discord bot token from Secrets Manager. Check AWS credentials and permissions.');
    }
  }

  /**
   * Get database configuration from AWS Secrets Manager
   */
  async getDatabaseConfig(): Promise<DatabaseConfig> {
    const secretName = process.env.DATABASE_CONFIG_SECRET || 'timmybot/dev/database-config';

    try {
      const secretString = await this.getSecretWithRetry(secretName);
      
      // Parse the JSON secret with proper error handling
      let secretMap: Record<string, any>;
      try {
        secretMap = JSON.parse(secretString);
      } catch (error) {
        logger.error(`Failed to parse secret JSON: ${secretName}`, error);
        throw new Error('Invalid secret JSON format in Secrets Manager');
      }

      if (typeof secretMap !== 'object' || secretMap === null) {
        logger.error(`Failed to cast secret to object format: ${secretName}`);
        throw new Error('Invalid secret format in Secrets Manager: expected JSON object');
      }

      return {
        region: secretMap.dynamodb_region || 'eu-central-1',
        guildQueuesTable: secretMap.guild_queues_table || 'timmybot-dev-guild-queues',
        userPreferencesTable: secretMap.user_preferences_table || 'timmybot-dev-user-prefs',
        trackCacheTable: secretMap.track_cache_table || 'timmybot-dev-track-cache',
        serverAllowlistTable: secretMap.server_allowlist_table || 'timmybot-dev-server-allowlist',
      };

    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid secret')) {
        throw error;
      }
      logger.error(`Failed to retrieve database config from secret: ${secretName}`, error);
      throw new Error('Could not retrieve database configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.');
    }
  }

  /**
   * Get application configuration from AWS Secrets Manager
   */
  async getAppConfig(): Promise<AppConfig> {
    const secretName = process.env.APP_CONFIG_SECRET || 'timmybot/dev/app-config';

    try {
      const secretString = await this.getSecretWithRetry(secretName);
      
      // Parse the JSON secret with proper error handling
      let secretMap: Record<string, any>;
      try {
        secretMap = JSON.parse(secretString);
      } catch (error) {
        logger.error(`Failed to parse secret JSON: ${secretName}`, error);
        throw new Error('Invalid secret JSON format in Secrets Manager');
      }

      if (typeof secretMap !== 'object' || secretMap === null) {
        logger.error(`Failed to cast secret to object format: ${secretName}`);
        throw new Error('Invalid secret format in Secrets Manager: expected JSON object');
      }

      return {
        environment: secretMap.environment || 'dev',
        logLevel: secretMap.log_level || 'INFO',
        serverAllowlistEnabled: this.parseBoolean(secretMap.server_allowlist_enabled, true),
        oauthRequired: this.parseBoolean(secretMap.oauth_required, false),
        premiumFeatures: this.parseBoolean(secretMap.premium_features, true),
      };

    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid secret')) {
        throw error;
      }
      logger.error(`Failed to retrieve app config from secret: ${secretName}`, error);
      throw new Error('Could not retrieve application configuration from Secrets Manager. This is a production deployment - Secrets Manager is required.');
    }
  }

  /**
   * Get secret value with exponential backoff retry logic
   */
  private async getSecretWithRetry(secretName: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const command = new GetSecretValueCommand({
          SecretId: secretName,
        });

        const response = await this.secretsClient.send(command);
        
        if (!response.SecretString) {
          throw new Error('Secret value is empty');
        }

        return response.SecretString;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.maxRetries) {
          break;
        }

        // Calculate exponential backoff delay with jitter
        const delay = this.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        logger.warn(`Attempt ${attempt} failed for secret ${secretName}, retrying in ${Math.round(delay)}ms`, error);
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`Failed to retrieve secret after ${this.maxRetries} attempts`);
  }

  /**
   * Parse boolean values from string or boolean
   */
  private parseBoolean(value: any, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true') return true;
      if (lowerValue === 'false') return false;
      // For invalid string values, return default
      return defaultValue;
    }
    return defaultValue;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}