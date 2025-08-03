/**
 * Comprehensive Error Handler
 * Provides categorized error handling with retry logic and user-friendly messages
 */

import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { logger } from './logger';

export enum ErrorCategory {
  DISCORD_API = 'DISCORD_API',
  LAVALINK = 'LAVALINK',
  AWS_SERVICE = 'AWS_SERVICE',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  INTERNAL = 'INTERNAL',
  PERMISSION = 'PERMISSION',
  RATE_LIMIT = 'RATE_LIMIT',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ErrorContext {
  guildId?: string;
  userId?: string;
  commandName?: string;
  correlationId?: string;
  additionalData?: Record<string, any>;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export interface ErrorHandlingResult {
  shouldRetry: boolean;
  userMessage: string;
  logMessage: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryAfterMs?: number;
}

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterMs: 1000,
  };

  /**
   * Handle Discord API errors with appropriate retry logic and user messages
   */
  static handleDiscordError(error: DiscordAPIError, context: ErrorContext = {}): ErrorHandlingResult {
    const { code, message, status } = error;
    
    logger.error('Discord API Error', {
      code,
      message,
      status,
      context,
      correlationId: context.correlationId,
    });

    switch (code) {
      case RESTJSONErrorCodes.MissingPermissions:
        return {
          shouldRetry: false,
          userMessage: "I don't have the required permissions to perform this action. Please check my role permissions.",
          logMessage: `Missing permissions for command: ${context.commandName}`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.PERMISSION,
        };

      case RESTJSONErrorCodes.BotsCannotUseThisEndpoint:
        return {
          shouldRetry: false,
          userMessage: "This action is not allowed for bots.",
          logMessage: `Bot disallowed endpoint accessed: ${context.commandName}`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.PERMISSION,
        };

      case RESTJSONErrorCodes.MissingAccess:
        return {
          shouldRetry: false,
          userMessage: "I don't have access to this channel or resource.",
          logMessage: `Missing access for guild ${context.guildId}`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.PERMISSION,
        };

      case RESTJSONErrorCodes.UnknownChannel:
        return {
          shouldRetry: false,
          userMessage: "The channel could not be found. It may have been deleted.",
          logMessage: `Unknown channel accessed in guild ${context.guildId}`,
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.VALIDATION,
        };

      case RESTJSONErrorCodes.UnknownGuild:
        return {
          shouldRetry: false,
          userMessage: "The server could not be found. I may have been removed from it.",
          logMessage: `Unknown guild accessed: ${context.guildId}`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.VALIDATION,
        };

      case RESTJSONErrorCodes.UnknownUser:
        return {
          shouldRetry: false,
          userMessage: "The user could not be found.",
          logMessage: `Unknown user accessed: ${context.userId}`,
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.VALIDATION,
        };

      case RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited:
      case RESTJSONErrorCodes.ChannelSendRateLimit:
      case RESTJSONErrorCodes.ServerSendRateLimit:
        const retryAfter = this.extractRetryAfter(error);
        return {
          shouldRetry: true,
          userMessage: "I'm being rate limited. Please try again in a moment.",
          logMessage: `Rate limited for ${retryAfter}ms`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.RATE_LIMIT,
          retryAfterMs: retryAfter,
        };

      default:
        // Handle HTTP status codes
        if (status >= 500) {
          return {
            shouldRetry: true,
            userMessage: "Discord is experiencing issues. Please try again later.",
            logMessage: `Discord server error: ${status} - ${message}`,
            severity: ErrorSeverity.HIGH,
            category: ErrorCategory.DISCORD_API,
          };
        } else if (status >= 400) {
          return {
            shouldRetry: false,
            userMessage: "There was an issue with the request. Please try again.",
            logMessage: `Discord client error: ${status} - ${message}`,
            severity: ErrorSeverity.MEDIUM,
            category: ErrorCategory.DISCORD_API,
          };
        } else {
          return {
            shouldRetry: true,
            userMessage: "An unexpected Discord error occurred. Please try again.",
            logMessage: `Unexpected Discord error: ${code} - ${message}`,
            severity: ErrorSeverity.HIGH,
            category: ErrorCategory.DISCORD_API,
          };
        }
    }
  }

  /**
   * Handle Lavalink-related errors
   */
  static handleLavalinkError(error: Error, context: ErrorContext = {}): ErrorHandlingResult {
    const message = error.message.toLowerCase();
    
    logger.error('Lavalink Error', {
      error: error.message,
      stack: error.stack,
      context,
      correlationId: context.correlationId,
    });

    if (message.includes('no tracks found') || message.includes('track not found')) {
      return {
        shouldRetry: false,
        userMessage: "No tracks found for your search. Please try a different search term.",
        logMessage: `No tracks found for query in guild ${context.guildId}`,
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.VALIDATION,
      };
    }

    if (message.includes('connection') || message.includes('timeout')) {
      return {
        shouldRetry: true,
        userMessage: "Music service is temporarily unavailable. Please try again in a moment.",
        logMessage: `Lavalink connection error: ${error.message}`,
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.LAVALINK,
      };
    }

    if (message.includes('no player') || message.includes('player not found')) {
      return {
        shouldRetry: false,
        userMessage: "I'm not currently playing music in this server. Use `/join` first.",
        logMessage: `No player found for guild ${context.guildId}`,
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.VALIDATION,
      };
    }

    if (message.includes('voice channel') || message.includes('not connected')) {
      return {
        shouldRetry: false,
        userMessage: "I need to be connected to a voice channel first. Use `/join` to connect me.",
        logMessage: `Voice channel connection issue in guild ${context.guildId}`,
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.VALIDATION,
      };
    }

    if (message.includes('load failed') || message.includes('track failed')) {
      return {
        shouldRetry: true,
        userMessage: "Failed to load the track. Please try again or use a different source.",
        logMessage: `Track loading failed: ${error.message}`,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.LAVALINK,
      };
    }

    return {
      shouldRetry: true,
      userMessage: "Music service encountered an error. Please try again.",
      logMessage: `Unexpected Lavalink error: ${error.message}`,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.LAVALINK,
    };
  }

  /**
   * Handle AWS service errors
   */
  static handleAWSError(error: Error, context: ErrorContext = {}): ErrorHandlingResult {
    const message = error.message.toLowerCase();
    const errorName = error.name || '';
    
    logger.error('AWS Service Error', {
      name: errorName,
      message: error.message,
      stack: error.stack,
      context,
      correlationId: context.correlationId,
    });

    // DynamoDB errors
    if (errorName.includes('DynamoDB') || message.includes('dynamodb')) {
      if (message.includes('throttling') || message.includes('provisioned throughput')) {
        return {
          shouldRetry: true,
          userMessage: "Database is busy. Please try again in a moment.",
          logMessage: `DynamoDB throttling error: ${error.message}`,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.AWS_SERVICE,
        };
      }

      if (message.includes('item not found') || message.includes('resource not found')) {
        return {
          shouldRetry: false,
          userMessage: "The requested data could not be found.",
          logMessage: `DynamoDB item not found: ${error.message}`,
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.VALIDATION,
        };
      }

      if (message.includes('access denied') || message.includes('unauthorized')) {
        return {
          shouldRetry: false,
          userMessage: "Database access error. Please contact support.",
          logMessage: `DynamoDB access denied: ${error.message}`,
          severity: ErrorSeverity.CRITICAL,
          category: ErrorCategory.AWS_SERVICE,
        };
      }
    }

    // Secrets Manager errors
    if (errorName.includes('SecretsManager') || message.includes('secrets')) {
      if (message.includes('secret not found') || message.includes('resource not found')) {
        return {
          shouldRetry: false,
          userMessage: "Configuration error. Please contact support.",
          logMessage: `Secrets Manager secret not found: ${error.message}`,
          severity: ErrorSeverity.CRITICAL,
          category: ErrorCategory.AWS_SERVICE,
        };
      }

      if (message.includes('access denied') || message.includes('unauthorized')) {
        return {
          shouldRetry: false,
          userMessage: "Configuration access error. Please contact support.",
          logMessage: `Secrets Manager access denied: ${error.message}`,
          severity: ErrorSeverity.CRITICAL,
          category: ErrorCategory.AWS_SERVICE,
        };
      }
    }

    // Network/timeout errors
    if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
      return {
        shouldRetry: true,
        userMessage: "Network error occurred. Please try again.",
        logMessage: `AWS network error: ${error.message}`,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.NETWORK,
      };
    }

    return {
      shouldRetry: true,
      userMessage: "A service error occurred. Please try again.",
      logMessage: `Unexpected AWS error: ${error.message}`,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.AWS_SERVICE,
    };
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(error: Error, context: ErrorContext = {}): ErrorHandlingResult {
    logger.warn('Validation Error', {
      message: error.message,
      context,
      correlationId: context.correlationId,
    });

    return {
      shouldRetry: false,
      userMessage: error.message || "Invalid input provided. Please check your command and try again.",
      logMessage: `Validation error: ${error.message}`,
      severity: ErrorSeverity.LOW,
      category: ErrorCategory.VALIDATION,
    };
  }

  /**
   * Handle generic errors with fallback logic
   */
  static handleGenericError(error: Error, context: ErrorContext = {}): ErrorHandlingResult {
    logger.error('Generic Error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      correlationId: context.correlationId,
    });

    return {
      shouldRetry: false,
      userMessage: "An unexpected error occurred. Please try again or contact support if the issue persists.",
      logMessage: `Generic error: ${error.message}`,
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.INTERNAL,
    };
  }

  /**
   * Execute function with retry logic and exponential backoff
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<T> {
    const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      attempt++;
      
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            attempt,
            context,
            correlationId: context.correlationId,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        const errorResult = this.categorizeAndHandleError(lastError, context);
        
        // Don't retry if error is not retryable
        if (!errorResult.shouldRetry) {
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt >= config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        const jitter = Math.random() * config.jitterMs;
        const delay = baseDelay + jitter;

        logger.warn('Operation failed, retrying', {
          attempt,
          maxAttempts: config.maxAttempts,
          delayMs: Math.round(delay),
          error: lastError.message,
          context,
          correlationId: context.correlationId,
        });

        // Use custom retry delay if provided by error handler
        const actualDelay = errorResult.retryAfterMs || delay;
        await this.sleep(actualDelay);
      }
    }

    if (!lastError) {
      throw new Error('Operation failed without error details');
    }

    logger.error('Operation failed after all retry attempts', {
      attempts: config.maxAttempts,
      finalError: lastError.message,
      context,
      correlationId: context.correlationId,
    });

    throw lastError;
  }

  /**
   * Categorize error and return appropriate handling result
   */
  static categorizeAndHandleError(error: Error, context: ErrorContext = {}): ErrorHandlingResult {
    // Discord API errors
    if (error instanceof DiscordAPIError) {
      return this.handleDiscordError(error, context);
    }

    // AWS errors (check by error name or message)
    if (error.name.includes('AWS') || 
        error.name.includes('DynamoDB') || 
        error.name.includes('SecretsManager') ||
        error.message.toLowerCase().includes('aws') ||
        error.message.toLowerCase().includes('dynamodb') ||
        error.message.toLowerCase().includes('secretsmanager')) {
      return this.handleAWSError(error, context);
    }

    // Lavalink errors (check by message content)
    if (error.message.toLowerCase().includes('lavalink') ||
        error.message.toLowerCase().includes('shoukaku') ||
        error.message.toLowerCase().includes('track') ||
        error.message.toLowerCase().includes('player') ||
        error.message.toLowerCase().includes('voice channel')) {
      return this.handleLavalinkError(error, context);
    }

    // Network timeout errors should be retryable
    if (error.message.toLowerCase().includes('network timeout') ||
        error.message.toLowerCase().includes('timeout') ||
        error.message.toLowerCase().includes('connection')) {
      return {
        shouldRetry: true,
        userMessage: "Network error occurred. Please try again.",
        logMessage: `Network error: ${error.message}`,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.NETWORK,
      };
    }

    // Validation errors
    if (error.name === 'ValidationError' || 
        error.message.includes('validation') ||
        error.message.includes('invalid')) {
      return this.handleValidationError(error, context);
    }

    // Generic fallback
    return this.handleGenericError(error, context);
  }

  /**
   * Log error with appropriate severity and context
   */
  static logError(error: Error, context: ErrorContext = {}): void {
    const result = this.categorizeAndHandleError(error, context);
    
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      category: result.category,
      severity: result.severity,
      shouldRetry: result.shouldRetry,
      context,
      correlationId: context.correlationId,
    };

    switch (result.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('CRITICAL ERROR', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('HIGH SEVERITY ERROR', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('MEDIUM SEVERITY ERROR', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('LOW SEVERITY ERROR', logData);
        break;
    }
  }

  /**
   * Extract retry-after value from Discord rate limit error
   */
  private static extractRetryAfter(error: DiscordAPIError): number {
    // Try to extract retry-after from error response
    const retryAfter = (error as any).retryAfter;
    if (typeof retryAfter === 'number') {
      return retryAfter * 1000; // Convert to milliseconds
    }
    
    // Fallback to default delay
    return 5000;
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}