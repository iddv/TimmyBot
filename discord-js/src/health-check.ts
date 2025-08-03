/**
 * Health check endpoint for ECS health monitoring
 * Returns 200 OK if the bot is healthy, 503 Service Unavailable otherwise
 */

import express from 'express';
import { logger, EnhancedLogger } from './utils/logger';

const app = express();
const port = process.env.HEALTH_CHECK_PORT || 3000;

// Global health status
let botInstance: any = null;
let startTime = Date.now();

// Set bot instance for health checks
export function setBotInstance(bot: any): void {
  botInstance = bot;
}

// Health check endpoint
app.get('/health', (req, res) => {
  const correlationId = EnhancedLogger.generateCorrelationId();
  
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - startTime;
    
    // More lenient health check logic
    // During startup (first 5 minutes), just check if process is running
    const isStartupPeriod = uptime < 5 * 60 * 1000; // 5 minutes
    
    // Check Discord connection
    const discordConnected = botInstance?.isReady() || false;
    
    // Check Lavalink connection (if available)
    let lavalinkConnected = false;
    let activePlayers = 0;
    if (botInstance?.getCommandManager) {
      const commandManager = botInstance.getCommandManager();
      // This would need to be implemented in the actual bot
      lavalinkConnected = true; // Placeholder
      activePlayers = 0; // Placeholder
    }
    
    // Get active guilds count
    const activeGuilds = botInstance?.getClient()?.guilds?.cache?.size || 0;
    
    // More lenient health check: healthy if Discord is connected OR we're in startup period
    const isHealthy = discordConnected || isStartupPeriod;
    const status = isHealthy ? 'healthy' : 'unhealthy';
    const httpStatus = isHealthy ? 200 : 503;
    
    const healthData = {
      status,
      timestamp: new Date().toISOString(),
      service: 'timmybot-discordjs',
      uptime,
      isStartupPeriod,
      memory: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
      connections: {
        discord: discordConnected,
        lavalink: lavalinkConnected,
      },
      metrics: {
        activeGuilds,
        activePlayers,
      },
      correlationId,
    };
    
    // Log health check results for debugging
    logger.info('Health check performed', {
      status,
      discordConnected,
      isStartupPeriod,
      uptime: Math.floor(uptime / 1000),
      correlationId,
    });
    
    // Log health metrics
    EnhancedLogger.logHealthMetrics({
      memoryUsage,
      uptime,
      discordConnected,
      lavalinkConnected,
      activeGuilds,
      activePlayers,
    });
    
    res.status(httpStatus).json(healthData);
    
  } catch (error) {
    logger.error('Health check failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId,
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'timmybot-discordjs',
      error: 'Health check failed',
      correlationId,
    });
  }
});

// Metrics endpoint for monitoring
app.get('/metrics', (req, res) => {
  const correlationId = EnhancedLogger.generateCorrelationId();
  
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = Date.now() - startTime;
    const activeGuilds = botInstance?.getClient()?.guilds?.cache?.size || 0;
    
    // Prometheus-style metrics format
    const metrics = [
      `# HELP timmybot_uptime_seconds Total uptime in seconds`,
      `# TYPE timmybot_uptime_seconds counter`,
      `timmybot_uptime_seconds ${Math.floor(uptime / 1000)}`,
      '',
      `# HELP timmybot_memory_usage_bytes Memory usage in bytes`,
      `# TYPE timmybot_memory_usage_bytes gauge`,
      `timmybot_memory_usage_bytes{type="rss"} ${memoryUsage.rss}`,
      `timmybot_memory_usage_bytes{type="heap_used"} ${memoryUsage.heapUsed}`,
      `timmybot_memory_usage_bytes{type="heap_total"} ${memoryUsage.heapTotal}`,
      `timmybot_memory_usage_bytes{type="external"} ${memoryUsage.external}`,
      '',
      `# HELP timmybot_active_guilds Number of active Discord guilds`,
      `# TYPE timmybot_active_guilds gauge`,
      `timmybot_active_guilds ${activeGuilds}`,
      '',
      `# HELP timmybot_discord_connected Discord connection status`,
      `# TYPE timmybot_discord_connected gauge`,
      `timmybot_discord_connected ${botInstance?.isReady() ? 1 : 0}`,
    ].join('\n');
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
    
  } catch (error) {
    logger.error('Metrics endpoint failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId,
    });
    
    res.status(500).send('# Metrics unavailable\n');
  }
});

// Readiness probe endpoint
app.get('/ready', (req, res) => {
  const correlationId = EnhancedLogger.generateCorrelationId();
  
  const isReady = botInstance?.isReady() || false;
  
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'timmybot-discordjs',
      correlationId,
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'timmybot-discordjs',
      correlationId,
    });
  }
});

// Start health check server
if (require.main === module) {
  app.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });
}

export default app;