/**
 * Enhanced structured logging with CloudWatch integration and correlation IDs
 * Provides comprehensive logging for monitoring and debugging
 */

import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const logLevel = process.env.LOG_LEVEL || 'info';
const environment = process.env.NODE_ENV || 'development';
const serviceName = 'timmybot-discordjs';

// AsyncLocalStorage for correlation ID context
const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

// Performance metrics interface
export interface PerformanceMetrics {
  operation: string;
  duration: number;
  success: boolean;
  guildId?: string;
  userId?: string;
  commandName?: string;
  errorType?: string | undefined;
}

// Structured log entry interface
export interface LogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  service?: string;
  environment?: string;
  correlationId?: string;
  guildId?: string;
  userId?: string;
  commandName?: string;
  operation?: string;
  duration?: number;
  success?: boolean;
  errorType?: string;
  stack?: string;
  [key: string]: any;
}

// Custom format for structured logging with correlation ID
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info: any) => {
    const context = correlationStorage.getStore();
    const correlationId = context?.correlationId || info.correlationId;
    
    const { timestamp, level, message, ...meta } = info;
    
    const logEntry = {
      timestamp,
      level,
      message,
      service: serviceName,
      environment,
      correlationId,
      ...meta,
    };

    return JSON.stringify(logEntry);
  })
);

// Development format for better readability
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf((info: any) => {
    const context = correlationStorage.getStore();
    const correlationId = context?.correlationId || info.correlationId;
    const correlationStr = correlationId && typeof correlationId === 'string' ? ` [${correlationId.slice(0, 8)}]` : '';
    
    let metaStr = '';
    const { timestamp, level, message, service, environment, stack, ...meta } = info;
    
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      metaStr += `\n${stack}`;
    }
    
    return `${timestamp}${correlationStr} ${level}: ${message}${metaStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: environment === 'development' ? developmentFormat : structuredFormat,
  defaultMeta: {
    service: serviceName,
    environment,
  },
  transports: [
    // Console transport - primary transport for container environments
    new winston.transports.Console(),
  ],
});

// Add file transports for local development
if (environment === 'development') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: structuredFormat,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: structuredFormat,
    })
  );
}

// Enhanced logger with correlation ID and performance tracking
export class EnhancedLogger {
  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Run operation with correlation ID context
   */
  static async withCorrelationId<T>(
    correlationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return correlationStorage.run({ correlationId }, operation);
  }

  /**
   * Get current correlation ID from context
   */
  static getCorrelationId(): string | undefined {
    return correlationStorage.getStore()?.correlationId;
  }

  /**
   * Log with correlation ID and additional context
   */
  static logWithContext(
    level: string,
    message: string,
    context: {
      correlationId?: string;
      guildId?: string;
      userId?: string;
      commandName?: string;
      operation?: string;
      [key: string]: any;
    } = {}
  ): void {
    const currentCorrelationId = this.getCorrelationId();
    const finalCorrelationId = context.correlationId || currentCorrelationId;

    logger.log(level, message, {
      ...context,
      correlationId: finalCorrelationId,
    });
  }

  /**
   * Log performance metrics
   */
  static logPerformance(metrics: PerformanceMetrics): void {
    const correlationId = this.getCorrelationId();
    
    logger.info('Performance Metric', {
      correlationId,
      operation: metrics.operation,
      duration: metrics.duration,
      success: metrics.success,
      guildId: metrics.guildId,
      userId: metrics.userId,
      commandName: metrics.commandName,
      errorType: metrics.errorType,
      metricType: 'performance',
    });
  }

  /**
   * Time an operation and log performance metrics
   */
  static async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context: {
      guildId?: string;
      userId?: string;
      commandName?: string;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let errorType: string | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      
      this.logPerformance({
        operation,
        duration,
        success,
        errorType,
        ...context,
      });
    }
  }

  /**
   * Log command execution start
   */
  static logCommandStart(
    commandName: string,
    context: {
      correlationId?: string;
      guildId?: string;
      userId?: string;
      parameters?: Record<string, any>;
    }
  ): void {
    this.logWithContext('info', `Command execution started: ${commandName}`, {
      ...context,
      commandName,
      operation: 'command_start',
      eventType: 'command_lifecycle',
    });
  }

  /**
   * Log command execution completion
   */
  static logCommandComplete(
    commandName: string,
    duration: number,
    context: {
      correlationId?: string;
      guildId?: string;
      userId?: string;
      success?: boolean;
      errorType?: string;
    }
  ): void {
    this.logWithContext('info', `Command execution completed: ${commandName}`, {
      ...context,
      commandName,
      duration,
      operation: 'command_complete',
      eventType: 'command_lifecycle',
    });
  }

  /**
   * Log command execution error
   */
  static logCommandError(
    commandName: string,
    error: Error,
    context: {
      correlationId?: string;
      guildId?: string;
      userId?: string;
    }
  ): void {
    this.logWithContext('error', `Command execution failed: ${commandName}`, {
      ...context,
      commandName,
      error: error.message,
      errorType: error.constructor.name,
      stack: error.stack,
      operation: 'command_error',
      eventType: 'command_lifecycle',
    });
  }

  /**
   * Log AWS service interaction
   */
  static logAWSOperation(
    service: string,
    operation: string,
    duration: number,
    success: boolean,
    context: {
      correlationId?: string;
      guildId?: string;
      errorType?: string;
      requestId?: string;
    } = {}
  ): void {
    this.logWithContext('info', `AWS ${service} operation: ${operation}`, {
      ...context,
      awsService: service,
      operation,
      duration,
      success,
      eventType: 'aws_operation',
    });
  }

  /**
   * Log Discord API interaction
   */
  static logDiscordOperation(
    operation: string,
    duration: number,
    success: boolean,
    context: {
      correlationId?: string;
      guildId?: string;
      userId?: string;
      errorType?: string;
      rateLimited?: boolean;
    } = {}
  ): void {
    this.logWithContext('info', `Discord API operation: ${operation}`, {
      ...context,
      operation,
      duration,
      success,
      eventType: 'discord_operation',
    });
  }

  /**
   * Log Lavalink operation
   */
  static logLavalinkOperation(
    operation: string,
    duration: number,
    success: boolean,
    context: {
      correlationId?: string;
      guildId?: string;
      trackTitle?: string;
      errorType?: string;
    } = {}
  ): void {
    this.logWithContext('info', `Lavalink operation: ${operation}`, {
      ...context,
      operation,
      duration,
      success,
      eventType: 'lavalink_operation',
    });
  }

  /**
   * Log system health metrics
   */
  static logHealthMetrics(metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    discordConnected: boolean;
    lavalinkConnected: boolean;
    activeGuilds: number;
    activePlayers: number;
  }): void {
    this.logWithContext('info', 'System health metrics', {
      ...metrics,
      eventType: 'health_metrics',
      metricType: 'system_health',
    });
  }
}

// Export both the original logger and enhanced logger
export { logger as default };
export { correlationStorage };
