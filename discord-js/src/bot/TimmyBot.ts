/**
 * Main TimmyBot class - Discord.js implementation
 * Handles Discord client initialization and bot lifecycle
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger';
import { loadEnvironmentConfig, EnvironmentConfig } from '../config/environment';
import { AwsSecretsService } from '../services/AwsSecretsService';
import { GuildQueueService } from '../services/GuildQueueService';
import { LavalinkService } from '../services/LavalinkService';
import { CommandManager } from '../commands/CommandManager';

export class TimmyBot {
  private client: Client;
  private config: EnvironmentConfig;
  private awsSecretsService: AwsSecretsService;
  private guildQueueService?: GuildQueueService;
  private lavalinkService?: LavalinkService;
  private commandManager?: CommandManager;
  private isInitialized = false;
  private isShuttingDown = false;

  constructor() {
    this.config = loadEnvironmentConfig();

    // Initialize Discord client with required intents
    // Note: Only using basic intents - no privileged intents needed for slash commands + music
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,           // Required for slash commands and guild info
        GatewayIntentBits.GuildVoiceStates, // Required for voice channel operations
      ],
    });

    // Initialize AWS Secrets service
    this.awsSecretsService = new AwsSecretsService();
    // GuildQueueService will be initialized in initialize() method after getting database config
  }

  /**
   * Initialize the bot and connect to Discord
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('⚠️ TimmyBot is already initialized');
      return;
    }

    if (this.isShuttingDown) {
      throw new Error('Cannot initialize TimmyBot while shutdown is in progress');
    }

    try {
      logger.info('🚀 Initializing TimmyBot...');

      // Set up event handlers first
      this.setupEventHandlers();

      // Set up graceful shutdown handlers
      this.setupShutdownHandlers();

      // Get configuration from AWS Secrets Manager
      logger.info('🔐 Retrieving configuration from AWS Secrets Manager...');
      const [discordToken, databaseConfig] = await Promise.all([
        this.awsSecretsService.getDiscordBotToken(),
        this.awsSecretsService.getDatabaseConfig(),
      ]);

      // Initialize GuildQueueService with database config
      this.guildQueueService = new GuildQueueService({
        guildQueuesTable: databaseConfig.guildQueuesTable,
        serverAllowlistTable: databaseConfig.serverAllowlistTable,
        region: databaseConfig.region,
      });

      // Initialize CommandManager
      this.commandManager = new CommandManager(this.client, discordToken);
      
      // Connect to Discord FIRST to get the bot's user ID
      logger.info('🔗 Connecting to Discord...');
      await this.client.login(discordToken);

      // Wait for the client to be ready
      await this.waitForReady();

      logger.info('🤖 Discord client ready! Logged in as', this.client.user?.tag);

      // NOW initialize LavalinkService with proper Discord user ID
      logger.info('🎵 Initializing Lavalink service with Discord user ID:', this.client.user?.id);
      this.lavalinkService = new LavalinkService(this.client, this.config, this.guildQueueService);
      await this.lavalinkService.initialize();

      // NOW load commands after Discord is ready and LavalinkService is initialized
      logger.info('📝 Discord ready, now loading slash commands...');
      await this.loadCommands();

      this.isInitialized = true;
      logger.info('✅ TimmyBot initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize TimmyBot:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Set up Discord client event handlers
   */
  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      logger.info(`🤖 TimmyBot is ready! Logged in as ${this.client.user?.tag}`);
      logger.info(`📊 Connected to ${this.client.guilds.cache.size} guilds`);
    });

    this.client.on('error', error => {
      logger.error('❌ Discord client error:', error);
      // Don't exit process on Discord errors - let the client handle reconnection
    });

    this.client.on('warn', warning => {
      logger.warn('⚠️ Discord client warning:', warning);
    });

    this.client.on('disconnect', () => {
      logger.warn('🔌 Discord client disconnected');
    });

    this.client.on('reconnecting', () => {
      logger.info('🔄 Discord client reconnecting...');
    });

    this.client.on('resumed', () => {
      logger.info('🔄 Discord client resumed connection');
    });

    // Handle guild events for monitoring
    this.client.on('guildCreate', guild => {
      logger.info(`➕ Joined new guild: ${guild.name} (${guild.id})`);
    });

    this.client.on('guildDelete', guild => {
      logger.info(`➖ Left guild: ${guild.name} (${guild.id})`);
    });

    // Handle slash command interactions
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      if (this.commandManager) {
        await this.commandManager.handleInteraction(interaction);
      } else {
        logger.error('❌ CommandManager not initialized');
        await interaction.reply({
          content: 'Bot is not properly initialized!',
          ephemeral: true,
        });
      }
    });
  }

  /**
   * Gracefully shutdown the bot
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('⚠️ Shutdown already in progress');
      return;
    }

    if (!this.isInitialized) {
      logger.warn('⚠️ TimmyBot is not initialized, nothing to shutdown');
      return;
    }

    this.isShuttingDown = true;

    try {
      logger.info('🛑 Shutting down TimmyBot...');

      // TODO: Stop processing new commands (will be implemented in task 3.2)
      // TODO: Cleanup Lavalink connections (will be implemented in task 4)

      // Disconnect from Discord
      if (this.client.isReady()) {
        logger.info('🔌 Disconnecting from Discord...');
        this.client.destroy();
      }

      // Give some time for cleanup
      await this.sleep(1000);

      this.isInitialized = false;
      logger.info('✅ TimmyBot shutdown complete');
    } catch (error) {
      logger.error('❌ Error during TimmyBot shutdown:', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Get the Discord client instance
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Check if the bot is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.client.isReady();
  }

  /**
   * Wait for the Discord client to be ready
   */
  private async waitForReady(timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client.isReady()) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Discord client to be ready'));
      }, timeoutMs);

      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Wait for Discord client to be FULLY ready for Shoukaku
   * This ensures the client is not just "ready" but also stable for WebSocket libraries
   */
  private async waitForDiscordFullyReady(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('⏳ Waiting for Discord client to be fully stable for Shoukaku...');
      
      // Wait for the next tick after ready to ensure all internal Discord.js setup is complete
      process.nextTick(() => {
        // Additional small delay to ensure Discord.js internal state is fully settled
        setTimeout(() => {
          logger.info('✅ Discord client is now fully ready for Shoukaku initialization');
          resolve();
        }, 1000); // Minimal 1-second delay for stability
      });
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      logger.info(`📡 Received ${signal}, initiating graceful shutdown...`);
      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGUSR2', () => shutdownHandler('SIGUSR2')); // Nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error);
      shutdownHandler('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled promise rejection:', { reason, promise });
      shutdownHandler('unhandledRejection');
    });
  }

  /**
   * Get guild queue service instance
   */
  getGuildQueueService(): GuildQueueService | undefined {
    return this.guildQueueService;
  }

  /**
   * Get the command manager instance
   */
  getCommandManager(): CommandManager | undefined {
    return this.commandManager;
  }

  /**
   * Load and register all slash commands
   */
  private async loadCommands(): Promise<void> {
    logger.info('🔍 Checking prerequisites for command loading...');
    
    if (!this.commandManager) {
      logger.error('❌ CommandManager not initialized');
      throw new Error('CommandManager not initialized');
    }
    logger.info('✅ CommandManager is ready');

    if (!this.lavalinkService) {
      logger.error('❌ LavalinkService not initialized - this should not happen after reordering!');
      throw new Error('LavalinkService not initialized');
    }
    logger.info('✅ LavalinkService is ready');

    if (!this.guildQueueService) {
      logger.error('❌ GuildQueueService not initialized');
      throw new Error('GuildQueueService not initialized');
    }
    logger.info('✅ GuildQueueService is ready');

    try {
      logger.info('📝 Loading slash commands...');

      // Import all command classes
      const { 
        PingCommand, 
        HelpCommand, 
        ExplainCommand,
        JoinCommand,
        PlayCommand,
        SkipCommand,
        ClearCommand
      } = await import('../commands');

      // Create command instances
      const commands = [
        new PingCommand(),
        new HelpCommand(),
        new ExplainCommand(),
        new JoinCommand(this.lavalinkService, this.guildQueueService),
        new PlayCommand(this.lavalinkService, this.guildQueueService),
        new SkipCommand(this.lavalinkService, this.guildQueueService),
        new ClearCommand(this.lavalinkService, this.guildQueueService),
      ];

      // Register commands with the command manager
      this.commandManager.registerCommands(commands);

      // Deploy commands to Discord API
      // For development, deploy to specific guild if DISCORD_GUILD_ID is set
      const guildId = process.env.DISCORD_GUILD_ID;
      await this.commandManager.deployCommands(this.client.user!.id, guildId);

      logger.info(`✅ Successfully loaded and deployed ${commands.length} slash commands`);
    } catch (error) {
      logger.error('❌ Failed to load commands:', error);
      throw error;
    }
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
