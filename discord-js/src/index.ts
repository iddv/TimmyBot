/**
 * TimmyBot Discord.js Implementation
 * Main entry point for the Discord music bot
 */

import { TimmyBot } from './bot/TimmyBot';
import { logger } from './utils/logger';
import healthCheckApp, { setBotInstance } from './health-check';

async function main(): Promise<void> {
  try {
    logger.info('🤖 Starting TimmyBot Discord.js implementation...');
    
    const bot = new TimmyBot();
    
    // Start health check server
    const healthPort = process.env.HEALTH_CHECK_PORT || 3000;
    healthCheckApp.listen(healthPort, () => {
      logger.info(`🌐 Health check server listening on port ${healthPort}`);
    });
    
    await bot.initialize();
    
    // Set bot instance for health checks
    setBotInstance(bot);
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      logger.info('📴 Received SIGINT, shutting down gracefully...');
      await bot.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('📴 Received SIGTERM, shutting down gracefully...');
      await bot.shutdown();
      process.exit(0);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
    
    process.on('uncaughtException', (error) => {
      logger.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start TimmyBot:', error);
    process.exit(1);
  }
}

// Start the bot
main();