/**
 * Tests for ErrorHandler
 */

import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { ErrorHandler, ErrorCategory, ErrorSeverity, ErrorContext } from './ErrorHandler';

// Mock logger
jest.mock('./logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ErrorHandler', () => {
  const mockContext: ErrorContext = {
    guildId: 'test-guild-123',
    userId: 'test-user-456',
    commandName: 'test-command',
    correlationId: 'test-correlation-789',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleDiscordError', () => {
    it('should handle missing permissions error', () => {
      const error = new DiscordAPIError(
        { message: 'Missing Permissions', code: RESTJSONErrorCodes.MissingPermissions },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.handleDiscordError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.PERMISSION);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('permissions');
    });

    it('should handle rate limit error with retry', () => {
      const error = new DiscordAPIError(
        { message: 'Rate Limited', code: RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited },
        RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited,
        429,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.handleDiscordError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('rate limited');
      expect(result.retryAfterMs).toBeDefined();
    });

    it('should handle server errors with retry', () => {
      const error = new DiscordAPIError(
        { message: 'Internal Server Error', code: 0 },
        0,
        500,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.handleDiscordError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.DISCORD_API);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.userMessage).toContain('Discord is experiencing issues');
    });

    it('should handle client errors without retry', () => {
      const error = new DiscordAPIError(
        { message: 'Bad Request', code: 0 },
        0,
        400,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.handleDiscordError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.DISCORD_API);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should handle unknown channel error', () => {
      const error = new DiscordAPIError(
        { message: 'Unknown Channel', code: RESTJSONErrorCodes.UnknownChannel },
        RESTJSONErrorCodes.UnknownChannel,
        404,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.handleDiscordError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.userMessage).toContain('channel could not be found');
    });
  });

  describe('handleLavalinkError', () => {
    it('should handle no tracks found error', () => {
      const error = new Error('No tracks found for query');

      const result = ErrorHandler.handleLavalinkError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.userMessage).toContain('No tracks found');
    });

    it('should handle connection error with retry', () => {
      const error = new Error('Lavalink connection timeout');

      const result = ErrorHandler.handleLavalinkError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.LAVALINK);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.userMessage).toContain('temporarily unavailable');
    });

    it('should handle no player error', () => {
      const error = new Error('No player found for guild');

      const result = ErrorHandler.handleLavalinkError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.userMessage).toContain('not currently playing music');
    });

    it('should handle voice channel error', () => {
      const error = new Error('Not connected to voice channel');

      const result = ErrorHandler.handleLavalinkError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.userMessage).toContain('connected to a voice channel');
    });

    it('should handle track loading failure with retry', () => {
      const error = new Error('Track load failed');

      const result = ErrorHandler.handleLavalinkError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.LAVALINK);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('Failed to load the track');
    });
  });

  describe('handleAWSError', () => {
    it('should handle DynamoDB throttling error with retry', () => {
      const error = new Error('DynamoDB throttling exception');
      error.name = 'DynamoDBThrottlingException';

      const result = ErrorHandler.handleAWSError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.AWS_SERVICE);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('Database is busy');
    });

    it('should handle DynamoDB access denied error', () => {
      const error = new Error('Access denied to DynamoDB table');
      error.name = 'DynamoDBAccessDeniedException';

      const result = ErrorHandler.handleAWSError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.AWS_SERVICE);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
      expect(result.userMessage).toContain('Database access error');
    });

    it('should handle Secrets Manager secret not found error', () => {
      const error = new Error('Secret not found in SecretsManager');
      error.name = 'SecretsManagerResourceNotFoundException';

      const result = ErrorHandler.handleAWSError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.AWS_SERVICE);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
      expect(result.userMessage).toContain('Configuration error');
    });

    it('should handle network timeout error with retry', () => {
      const error = new Error('Network timeout occurred');

      const result = ErrorHandler.handleAWSError(error, mockContext);

      expect(result.shouldRetry).toBe(true);
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('Network error');
    });
  });

  describe('handleValidationError', () => {
    it('should handle validation error without retry', () => {
      const error = new Error('Invalid input provided');
      error.name = 'ValidationError';

      const result = ErrorHandler.handleValidationError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.userMessage).toBe('Invalid input provided');
    });
  });

  describe('handleGenericError', () => {
    it('should handle generic error', () => {
      const error = new Error('Some unexpected error');

      const result = ErrorHandler.handleGenericError(error, mockContext);

      expect(result.shouldRetry).toBe(false);
      expect(result.category).toBe(ErrorCategory.INTERNAL);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toContain('unexpected error occurred');
    });
  });

  describe('categorizeAndHandleError', () => {
    it('should categorize Discord API error', () => {
      const error = new DiscordAPIError(
        { message: 'Test Error', code: 0 },
        0,
        400,
        'POST',
        'test-url',
        {}
      );

      const result = ErrorHandler.categorizeAndHandleError(error, mockContext);

      expect(result.category).toBe(ErrorCategory.DISCORD_API);
    });

    it('should categorize AWS error by name', () => {
      const error = new Error('Test error');
      error.name = 'DynamoDBException';

      const result = ErrorHandler.categorizeAndHandleError(error, mockContext);

      expect(result.category).toBe(ErrorCategory.AWS_SERVICE);
    });

    it('should categorize Lavalink error by message', () => {
      const error = new Error('Lavalink connection failed');

      const result = ErrorHandler.categorizeAndHandleError(error, mockContext);

      expect(result.category).toBe(ErrorCategory.LAVALINK);
    });

    it('should categorize validation error', () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';

      const result = ErrorHandler.categorizeAndHandleError(error, mockContext);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
    });

    it('should fallback to generic error handling', () => {
      const error = new Error('Unknown error');

      const result = ErrorHandler.categorizeAndHandleError(error, mockContext);

      expect(result.category).toBe(ErrorCategory.INTERNAL);
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await ErrorHandler.executeWithRetry(operation, mockContext);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');

      const result = await ErrorHandler.executeWithRetry(operation, mockContext, {
        maxAttempts: 3,
        baseDelayMs: 10, // Short delay for testing
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const error = new DiscordAPIError(
        { message: 'Missing Permissions', code: RESTJSONErrorCodes.MissingPermissions },
        RESTJSONErrorCodes.MissingPermissions,
        403,
        'POST',
        'test-url',
        {}
      );
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.executeWithRetry(operation, mockContext)
      ).rejects.toThrow(error);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fail after max attempts', async () => {
      const error = new Error('Network timeout');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.executeWithRetry(operation, mockContext, {
          maxAttempts: 2,
          baseDelayMs: 10,
        })
      ).rejects.toThrow(error);

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect custom retry delay from error handler', async () => {
      const error = new DiscordAPIError(
        { message: 'Rate Limited', code: RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited },
        RESTJSONErrorCodes.ServiceResourceIsBeingRateLimited,
        429,
        'POST',
        'test-url',
        {}
      );
      
      const operation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await ErrorHandler.executeWithRetry(operation, mockContext, {
        maxAttempts: 2,
        baseDelayMs: 10,
      });
      const endTime = Date.now();

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      // Should have waited for the rate limit delay (5000ms default)
      expect(endTime - startTime).toBeGreaterThan(4000);
    });
  });

  describe('logError', () => {
    it('should log error with appropriate severity', () => {
      const { logger } = require('./logger');
      const error = new Error('Test error');

      ErrorHandler.logError(error, mockContext);

      expect(logger.warn).toHaveBeenCalledWith(
        'MEDIUM SEVERITY ERROR',
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
          }),
          category: ErrorCategory.INTERNAL,
          severity: ErrorSeverity.MEDIUM,
          context: mockContext,
        })
      );
    });

    it('should log critical error', () => {
      const { logger } = require('./logger');
      const error = new Error('Access denied to DynamoDB');
      error.name = 'DynamoDBAccessDeniedException';

      ErrorHandler.logError(error, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL ERROR',
        expect.objectContaining({
          severity: ErrorSeverity.CRITICAL,
        })
      );
    });
  });
});