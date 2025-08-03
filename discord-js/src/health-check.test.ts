/**
 * Unit tests for health check functionality
 */

import app, { setBotInstance } from './health-check';
import request from 'supertest';

// Mock dependencies
jest.mock('./utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  EnhancedLogger: {
    generateCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
    logHealthMetrics: jest.fn()
  }
}));

describe('health check endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status when bot is ready', async () => {
      const mockBot = {
        isReady: jest.fn().mockReturnValue(true),
        getClient: jest.fn().mockReturnValue({
          guilds: { cache: { size: 5 } }
        }),
        getCommandManager: jest.fn().mockReturnValue({})
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.connections.discord).toBe(true);
      expect(response.body.metrics.activeGuilds).toBe(5);
    });

    it('should return unhealthy status when bot is not ready', async () => {
      const mockBot = {
        isReady: jest.fn().mockReturnValue(false),
        getClient: jest.fn().mockReturnValue({
          guilds: { cache: { size: 0 } }
        })
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.connections.discord).toBe(false);
    });

    it('should handle missing bot instance', async () => {
      setBotInstance(null);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.connections.discord).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const mockBot = {
        isReady: jest.fn().mockImplementation(() => {
          throw new Error('Test error');
        })
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Health check failed');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus-style metrics', async () => {
      const mockBot = {
        isReady: jest.fn().mockReturnValue(true),
        getClient: jest.fn().mockReturnValue({
          guilds: { cache: { size: 3 } }
        })
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('timmybot_uptime_seconds');
      expect(response.text).toContain('timmybot_active_guilds 3');
      expect(response.text).toContain('timmybot_discord_connected 1');
    });

    it('should handle errors in metrics endpoint', async () => {
      const mockBot = {
        isReady: jest.fn().mockImplementation(() => {
          throw new Error('Metrics error');
        })
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(500);
      expect(response.text).toBe('# Metrics unavailable\n');
    });
  });

  describe('GET /ready', () => {
    it('should return ready status when bot is ready', async () => {
      const mockBot = {
        isReady: jest.fn().mockReturnValue(true)
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });

    it('should return not ready status when bot is not ready', async () => {
      const mockBot = {
        isReady: jest.fn().mockReturnValue(false)
      };

      setBotInstance(mockBot);

      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
    });
  });
});