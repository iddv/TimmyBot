/**
 * Lavalink Connection Debugger
 * Provides comprehensive debugging utilities for Shoukaku WebSocket connections
 */

import { logger } from './logger';

export interface LavalinkDebugInfo {
  nodeUrl: string;
  host: string;
  port: number;
  secure: boolean;
  password: string;
  timestamp: string;
}

export class LavalinkDebugger {
  /**
   * Log detailed connection attempt information
   */
  static logConnectionAttempt(config: LavalinkDebugInfo): void {
    logger.info('🔌 Lavalink connection attempt details:', {
      nodeUrl: config.nodeUrl,
      host: config.host,
      port: config.port,
      secure: config.secure,
      passwordLength: config.password.length,
      passwordHash: this.hashPassword(config.password),
      timestamp: config.timestamp,
      expectedWebSocketUrl: `ws${config.secure ? 's' : ''}://${config.host}:${config.port}/v4/websocket`,
      expectedHeaders: {
        'Authorization': `[${config.password.length} chars]`,
        'User-Id': '[Discord Bot User ID]',
        'Client-Name': '[Bot Client Name]',
      },
    });
  }

  /**
   * Log WebSocket handshake details
   */
  static logWebSocketHandshake(
    nodeUrl: string,
    headers: Record<string, string>,
    success: boolean,
    error?: Error
  ): void {
    if (success) {
      logger.info('✅ WebSocket handshake successful', {
        nodeUrl,
        headers: this.sanitizeHeaders(headers),
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error('❌ WebSocket handshake failed', {
        nodeUrl,
        headers: this.sanitizeHeaders(headers),
        error: {
          message: error?.message,
          name: error?.name,
          stack: error?.stack,
          code: (error as any)?.code,
          errno: (error as any)?.errno,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Analyze and log Shoukaku node state
   */
  static analyzeNodeState(node: any): void {
    if (!node) {
      logger.warn('⚠️ No Lavalink node found', {
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const state = node.state || 'UNKNOWN';
    const stats = node.stats || {};
    const sessionId = node.sessionId || 'none';

    logger.info('📊 Lavalink node state analysis:', {
      nodeName: node.name,
      state,
      sessionId,
      url: node.url,
      secure: node.secure,
      stats: {
        players: stats.players || 0,
        playingPlayers: stats.playingPlayers || 0,
        uptime: stats.uptime || 0,
        memory: stats.memory ? {
          used: stats.memory.used,
          free: stats.memory.free,
          allocated: stats.memory.allocated,
        } : null,
        cpu: stats.cpu ? {
          cores: stats.cpu.cores,
          systemLoad: stats.cpu.systemLoad,
          lavalinkLoad: stats.cpu.lavalinkLoad,
        } : null,
      },
      timestamp: new Date().toISOString(),
    });

    // Provide state-specific guidance (handle both string and numeric states)
    switch (state) {
      case 'CONNECTING':
      case 1:
        logger.info('🔄 Node is attempting to connect...');
        break;
      case 'CONNECTED':
      case 2:
        logger.info('✅ Node is connected and ready');
        break;
      case 'DISCONNECTED':
      case 0:
        logger.warn('⚠️ Node is disconnected - check network connectivity');
        break;
      case 'RECONNECTING':
      case 3:
        logger.info('🔄 Node is attempting to reconnect...');
        break;
      default:
        logger.warn(`⚠️ Unknown node state: ${state} (type: ${typeof state})`);
    }
  }

  /**
   * Generate diagnostic report for connection issues
   */
  static generateDiagnosticReport(config: LavalinkDebugInfo, node?: any, error?: Error): string {
    const report = [
      '🔍 LAVALINK CONNECTION DIAGNOSTIC REPORT',
      '=' .repeat(50),
      '',
      '📋 Configuration:',
      `   Host: ${config.host}`,
      `   Port: ${config.port}`,
      `   Secure: ${config.secure}`,
      `   Node URL: ${config.nodeUrl}`,
      `   Password Length: ${config.password.length}`,
      `   Password Hash: ${this.hashPassword(config.password)}`,
      '',
      '🔌 Expected WebSocket Connection:',
      `   URL: ws${config.secure ? 's' : ''}://${config.host}:${config.port}/v4/websocket`,
      `   Headers:`,
      `     - Authorization: ${config.password}`,
      `     - User-Id: [Discord Bot User ID]`,
      `     - Client-Name: [Bot Client Name]`,
      '',
      '📊 Node State:',
    ];

    if (node) {
      report.push(
        `   Name: ${node.name || 'unknown'}`,
        `   State: ${node.state || 'unknown'}`,
        `   Session ID: ${node.sessionId || 'none'}`,
        `   URL: ${node.url || 'unknown'}`,
      );
    } else {
      report.push('   ❌ No node available');
    }

    if (error) {
      report.push(
        '',
        '❌ Error Details:',
        `   Message: ${error.message}`,
        `   Name: ${error.name}`,
        `   Code: ${(error as any).code || 'none'}`,
        `   Errno: ${(error as any).errno || 'none'}`,
      );
    }

    report.push(
      '',
      '🛠️ Troubleshooting Steps:',
      '   1. Verify Lavalink container is running and healthy',
      '   2. Check network connectivity between containers',
      '   3. Verify Lavalink configuration and password',
      '   4. Check Lavalink logs for startup errors',
      '   5. Ensure WebSocket endpoint is accessible',
      '',
      `⏰ Generated: ${config.timestamp}`,
      '=' .repeat(50),
    );

    return report.join('\n');
  }

  /**
   * Test WebSocket connectivity using native WebSocket
   */
  static async testWebSocketConnectivity(config: LavalinkDebugInfo): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const WebSocket = require('ws');
        const wsUrl = `ws${config.secure ? 's' : ''}://${config.host}:${config.port}/v4/websocket`;
        
        logger.info('🧪 Testing WebSocket connectivity...', {
          url: wsUrl,
          timestamp: new Date().toISOString(),
        });

        const ws = new WebSocket(wsUrl, {
          headers: {
            'Authorization': config.password,
            'User-Id': '123456789',
            'Client-Name': 'TimmyBot-Debug-Test',
          },
        });

        const timeout = setTimeout(() => {
          logger.error('❌ WebSocket test timeout');
          ws.close();
          resolve(false);
        }, 10000);

        ws.on('open', () => {
          logger.info('✅ WebSocket test connection successful');
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });

        ws.on('error', (error: Error) => {
          logger.error('❌ WebSocket test connection failed', {
            error: {
              message: error.message,
              name: error.name,
              code: (error as any).code,
            },
          });
          clearTimeout(timeout);
          resolve(false);
        });

        ws.on('close', (code: number, reason: string) => {
          logger.info('🔌 WebSocket test connection closed', {
            code,
            reason: reason.toString(),
          });
        });

      } catch (error) {
        logger.error('❌ WebSocket test setup failed', {
          error: {
            message: (error as Error).message,
            name: (error as Error).name,
          },
        });
        resolve(false);
      }
    });
  }

  /**
   * Hash password for logging (security)
   */
  private static hashPassword(password: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex').substring(0, 8);
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private static sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    
    if (sanitized.Authorization) {
      sanitized.Authorization = `[${sanitized.Authorization.length} chars]`;
    }
    
    return sanitized;
  }
}