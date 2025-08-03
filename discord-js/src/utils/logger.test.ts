/**
 * Tests for Enhanced Logger
 */

import { EnhancedLogger } from './logger';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-correlation-id-123'),
}));

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    add: jest.fn(),
  })),
  format: {
    combine: jest.fn(() => 'combined-format'),
    timestamp: jest.fn(() => 'timestamp-format'),
    errors: jest.fn(() => 'errors-format'),
    printf: jest.fn(() => 'printf-format'),
    colorize: jest.fn(() => 'colorize-format'),
    simple: jest.fn(() => 'simple-format'),
    json: jest.fn(() => 'json-format'),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

describe('EnhancedLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCorrelationId', () => {
    it('should generate a correlation ID', () => {
      const correlationId = EnhancedLogger.generateCorrelationId();
      expect(correlationId).toBe('test-correlation-id-123');
    });
  });

  describe('withCorrelationId', () => {
    it('should run operation with correlation ID context', async () => {
      const testCorrelationId = 'test-correlation-123';
      let capturedCorrelationId: string | undefined;

      const operation = async () => {
        capturedCorrelationId = EnhancedLogger.getCorrelationId();
        return 'success';
      };

      const result = await EnhancedLogger.withCorrelationId(testCorrelationId, operation);

      expect(result).toBe('success');
      expect(capturedCorrelationId).toBe(testCorrelationId);
    });

    it('should handle errors in operation', async () => {
      const testCorrelationId = 'test-correlation-123';
      const testError = new Error('Test error');

      const operation = async () => {
        throw testError;
      };

      await expect(
        EnhancedLogger.withCorrelationId(testCorrelationId, operation)
      ).rejects.toThrow(testError);
    });
  });

  describe('getCorrelationId', () => {
    it('should return undefined when no correlation ID is set', () => {
      const correlationId = EnhancedLogger.getCorrelationId();
      expect(correlationId).toBeUndefined();
    });

    it('should return correlation ID from context', async () => {
      const testCorrelationId = 'test-correlation-123';

      await EnhancedLogger.withCorrelationId(testCorrelationId, async () => {
        const correlationId = EnhancedLogger.getCorrelationId();
        expect(correlationId).toBe(testCorrelationId);
      });
    });
  });

  describe('timeOperation', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(1000) // Start time
        .mockReturnValueOnce(1500); // End time
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should time successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context = {
        guildId: 'guild-123',
        userId: 'user-456',
        commandName: 'test-command',
      };

      const result = await EnhancedLogger.timeOperation('test-operation', operation, context);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should time failed operation', async () => {
      const testError = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(testError);

      await expect(
        EnhancedLogger.timeOperation('test-operation', operation)
      ).rejects.toThrow(testError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle custom error types', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const testError = new CustomError('Custom error');
      const operation = jest.fn().mockRejectedValue(testError);

      await expect(
        EnhancedLogger.timeOperation('test-operation', operation)
      ).rejects.toThrow(testError);
    });
  });

  describe('correlation ID context', () => {
    it('should maintain correlation ID across async operations', async () => {
      const testCorrelationId = 'test-correlation-123';
      const results: (string | undefined)[] = [];

      await EnhancedLogger.withCorrelationId(testCorrelationId, async () => {
        results.push(EnhancedLogger.getCorrelationId());
        
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(EnhancedLogger.getCorrelationId());
        
        await Promise.resolve();
        results.push(EnhancedLogger.getCorrelationId());
      });

      expect(results).toEqual([testCorrelationId, testCorrelationId, testCorrelationId]);
    });

    it('should isolate correlation IDs between concurrent operations', async () => {
      const correlationId1 = 'correlation-1';
      const correlationId2 = 'correlation-2';
      const results: (string | undefined)[] = [];

      const operation1 = EnhancedLogger.withCorrelationId(correlationId1, async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push(EnhancedLogger.getCorrelationId());
      });

      const operation2 = EnhancedLogger.withCorrelationId(correlationId2, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(EnhancedLogger.getCorrelationId());
      });

      await Promise.all([operation1, operation2]);

      expect(results).toContain(correlationId1);
      expect(results).toContain(correlationId2);
      expect(results).toHaveLength(2);
    });
  });

  describe('performance metrics', () => {
    it('should track operation duration', async () => {
      const startTime = 1000;
      const endTime = 1500;
      
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      const operation = jest.fn().mockResolvedValue('success');
      
      await EnhancedLogger.timeOperation('test-operation', operation);

      expect(Date.now).toHaveBeenCalledTimes(2);
      
      jest.restoreAllMocks();
    });

    it('should track both success and failure metrics', async () => {
      const startTime = 1000;
      const endTime = 1200;
      
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(endTime);

      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        EnhancedLogger.timeOperation('test-operation', operation)
      ).rejects.toThrow('Test error');

      expect(Date.now).toHaveBeenCalledTimes(2);
      
      jest.restoreAllMocks();
    });
  });

  describe('error handling', () => {
    it('should handle operations that throw non-Error objects', async () => {
      const operation = jest.fn().mockRejectedValue('string error');
      
      await expect(
        EnhancedLogger.timeOperation('test-operation', operation)
      ).rejects.toBe('string error');
    });

    it('should handle operations that throw null', async () => {
      const operation = jest.fn().mockRejectedValue(null);
      
      await expect(
        EnhancedLogger.timeOperation('test-operation', operation)
      ).rejects.toBeNull();
    });
  });

  describe('context isolation', () => {
    it('should not leak correlation ID between operations', async () => {
      const correlationId1 = 'correlation-1';
      
      await EnhancedLogger.withCorrelationId(correlationId1, async () => {
        expect(EnhancedLogger.getCorrelationId()).toBe(correlationId1);
      });

      // Outside the context, correlation ID should be undefined
      expect(EnhancedLogger.getCorrelationId()).toBeUndefined();
    });

    it('should handle nested correlation ID contexts', async () => {
      const outerCorrelationId = 'outer-correlation';
      const innerCorrelationId = 'inner-correlation';
      const results: (string | undefined)[] = [];

      await EnhancedLogger.withCorrelationId(outerCorrelationId, async () => {
        results.push(EnhancedLogger.getCorrelationId());
        
        await EnhancedLogger.withCorrelationId(innerCorrelationId, async () => {
          results.push(EnhancedLogger.getCorrelationId());
        });
        
        results.push(EnhancedLogger.getCorrelationId());
      });

      expect(results).toEqual([outerCorrelationId, innerCorrelationId, outerCorrelationId]);
    });
  });
});