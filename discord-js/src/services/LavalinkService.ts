/**
 * Lavalink Service
 * Manages connection to Lavalink server using Shoukaku client
 * Provides audio track loading and playback functionality
 */

import { Client } from 'discord.js';
import { Shoukaku, Node, NodeOption, Player, Track, LoadType, Events, createDiscordJSOptions } from 'shoukaku';
import { EnvironmentConfig } from '../config/environment';
import { logger } from '../utils/logger';
import { LavalinkDebugger } from '../utils/LavalinkDebugger';
import { GuildQueueService } from './GuildQueueService';

export interface LavalinkConfig {
  host: string;
  port: number;
  secure: boolean;
  password: string;
}

export interface TrackLoadResult {
  loadType: LoadType;
  tracks: Track[];
  playlistInfo?: {
    name: string;
    selectedTrack: number;
  };
}

export class LavalinkService {
  private shoukaku!: Shoukaku;
  private config: LavalinkConfig;
  private client: Client;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 seconds
  private healthCheckInterval?: NodeJS.Timeout;
  private guildQueueService: GuildQueueService;

  constructor(client: Client, environmentConfig: EnvironmentConfig, guildQueueService: GuildQueueService) {
    // Enable Shoukaku debug logging as recommended by AWS expert
    if (process.env.NODE_ENV !== 'production') {
      process.env.DEBUG = 'shoukaku:*';
      logger.info('🐛 Shoukaku debug logging enabled');
    }
    
    this.client = client;
    this.guildQueueService = guildQueueService;
    this.config = {
      host: environmentConfig.LAVALINK_HOST,
      port: parseInt(environmentConfig.LAVALINK_PORT),
      secure: environmentConfig.LAVALINK_SECURE === 'true',
      password: environmentConfig.LAVALINK_PASSWORD,
    };

    // Log detailed configuration for debugging
    const debugInfo = {
      nodeUrl: `${this.config.host}:${this.config.port}`,
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      password: this.config.password,
      timestamp: new Date().toISOString(),
    };
    
    LavalinkDebugger.logConnectionAttempt(debugInfo);

    // AWS expert recommendation: Use 127.0.0.1 instead of localhost for better container compatibility
    const nodeHost = this.config.host === 'localhost' ? '127.0.0.1' : this.config.host;
    const nodes = [
      {
        name: 'main',
        url: `${nodeHost}:${this.config.port}`,
        auth: this.config.password,
      },
    ];
    
    logger.info('🌐 Node host resolution:', {
      originalHost: this.config.host,
      resolvedHost: nodeHost,
      finalUrl: `${nodeHost}:${this.config.port}`
    });

    // Basic logging in constructor (Discord client not ready yet)
    logger.info('🔌 LavalinkService constructor completed:', {
      nodeUrl: `${nodeHost}:${this.config.port}`,
      secure: this.config.secure,
      nodeCount: nodes.length
    });
    
    // Log the exact node configuration Shoukaku will receive
    logger.info('📋 Shoukaku nodes configuration:', {
      nodeCount: nodes.length,
      nodes: nodes.map(n => ({
        name: n.name,
        url: n.url,
        hasAuth: !!n.auth,
        authLength: n.auth?.length || 0
      }))
    });
    
    // Don't initialize Shoukaku in constructor - do it in initialize() method
    // This will be done in initialize() with proper delay
  }

  /**
   * Initialize the Lavalink service (lazy connection - only connect when needed)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🎵 Initializing Lavalink service (lazy connection mode)...', {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        nodeUrl: `${this.config.host}:${this.config.port}`,
        passwordSet: !!this.config.password,
        passwordLength: this.config.password.length,
      });

      // Ensure we have a valid Discord user ID before creating Shoukaku
      if (!this.client.user?.id) {
        throw new Error('Discord client must be logged in before initializing Lavalink. Bot user ID is required.');
      }

      // AWS expert recommendation: Use 127.0.0.1 instead of localhost for better container compatibility
      const nodeHost = this.config.host === 'localhost' ? '127.0.0.1' : this.config.host;
      const nodes = [
        {
          name: 'main',
          url: `${nodeHost}:${this.config.port}`,
          auth: this.config.password,
        },
      ];
      
      logger.info('🌐 Node host resolution:', {
        originalHost: this.config.host,
        resolvedHost: nodeHost,
        finalUrl: `${nodeHost}:${this.config.port}`
      });

      // Shoukaku v5 API: new Shoukaku(requiredOptions, optionalOptions)
      const requiredOptions = {
        userId: this.client.user.id,
        nodes: nodes,
        connectorOptions: createDiscordJSOptions(this.client)
      };
      
      const optionalOptions = {
        moveOnDisconnect: false,
        resume: false,
        resumeTimeout: 30,
        reconnectTries: 2,
        restTimeout: 10000
      };
      
      logger.info('🔧 Creating Shoukaku with v5 API (lazy mode):', {
        userId: requiredOptions.userId,
        nodeCount: nodes.length,
        options: optionalOptions
      });
      
      this.shoukaku = new Shoukaku(requiredOptions, optionalOptions);
      this.setupEventHandlers();
      
      logger.info('✅ Shoukaku instance created (not connected yet - will connect on first use)');
      logger.info('✅ Lavalink service initialized successfully (lazy mode)');
    } catch (error) {
      logger.error('❌ Failed to initialize Lavalink service:', error);
      throw error;
    }
  }

  /**
   * Load track from URL or search query
   */
  async loadTrack(query: string): Promise<TrackLoadResult> {
    // Ensure connection before using
    await this.ensureConnection();
    
    const node = this.getNode();
    if (!node) {
      throw new Error('No Lavalink node available');
    }

    try {
      logger.debug('🔍 Loading track', { query });

      // Add search prefix if query doesn't look like a URL
      const searchQuery = this.isUrl(query) ? query : `ytsearch:${query}`;
      
      const result = await node.rest.resolve(searchQuery);
      
      if (!result) {
        throw new Error('No result from Lavalink');
      }

      logger.debug('✅ Track loaded successfully', {
        loadType: result.loadType,
        trackCount: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
      });

      // Handle different result types
      let tracks: Track[] = [];
      let playlistInfo: any = undefined;
      
      if (result.loadType === 'track' && result.data && !Array.isArray(result.data)) {
        tracks = [result.data as Track];
      } else if (result.loadType === 'search' && Array.isArray(result.data)) {
        tracks = result.data as Track[];
      } else if (result.loadType === 'playlist' && result.data && !Array.isArray(result.data)) {
        const playlist = result.data as any;
        tracks = playlist.tracks || [];
        playlistInfo = playlist.info;
      }

      return {
        loadType: result.loadType,
        tracks,
        playlistInfo,
      };
    } catch (error) {
      logger.error('❌ Failed to load track', { query, error });
      throw error;
    }
  }

  /**
   * Get or create connection for guild
   */
  async getConnection(guildId: string, voiceChannelId: string, textChannelId: string): Promise<any> {
    try {
      // Ensure connection before using
      await this.ensureConnection();
      
      // Check if connection already exists
      let connection = this.shoukaku.connections.find(c => (c as any).guildId === guildId);
      
      if (!connection) {
        logger.debug('🎮 Creating new connection', { guildId, voiceChannelId });
        
        const node = this.getNode();
        if (!node) {
          throw new Error('No Lavalink node available');
        }

        const connectionRef = await this.shoukaku.joinVoiceChannel({
          guildId,
          channelId: voiceChannelId,
          shardId: 0,
          node
        });

        connection = connectionRef.deref();
        if (!connection) {
          throw new Error('Failed to get connection from WeakRef');
        }

        // Set text channel for connection
        (connection as any).textChannelId = textChannelId;
        
        logger.info('✅ Connection created successfully', { guildId, voiceChannelId });
      }

      if (!connection) {
        throw new Error('Failed to create connection');
      }

      return connection;
    } catch (error) {
      logger.error('❌ Failed to get/create connection', { guildId, voiceChannelId, error });
      throw error;
    }
  }

  /**
   * Play track on connection
   */
  async playTrack(guildId: string, track: Track): Promise<void> {
    const connection = this.shoukaku.connections.find(c => (c as any).guildId === guildId);
    if (!connection) {
      throw new Error(`No connection found for guild ${guildId}`);
    }

    try {
      logger.debug('▶️ Playing track', { guildId, track: track.info.title });
      
      // In v5, we need to create a player from the connection
      const player = (connection as any).player;
      if (!player) {
        throw new Error('No player available on connection');
      }
      
      await player.playTrack({ 
        track: { encoded: track.encoded }
      });
      
      logger.info('✅ Track started playing', {
        guildId,
        title: track.info.title,
        duration: track.info.length,
      });
    } catch (error) {
      logger.error('❌ Failed to play track', { guildId, track: track.info.title, error });
      throw error;
    }
  }

  /**
   * Skip current track
   */
  async skipTrack(guildId: string): Promise<void> {
    const connection = this.shoukaku.connections.find(c => (c as any).guildId === guildId);
    if (!connection) {
      throw new Error(`No connection found for guild ${guildId}`);
    }

    try {
      logger.debug('⏭️ Skipping track', { guildId });
      
      const player = (connection as any).player;
      if (!player) {
        throw new Error('No player available on connection');
      }
      
      await player.stopTrack();
      
      logger.info('✅ Track skipped', { guildId });
    } catch (error) {
      logger.error('❌ Failed to skip track', { guildId, error });
      throw error;
    }
  }

  /**
   * Stop playback and disconnect connection
   */
  async stopPlayback(guildId: string): Promise<void> {
    try {
      logger.debug('⏹️ Stopping playback', { guildId });
      
      this.shoukaku.leaveVoiceChannel(guildId);
      
      logger.info('✅ Playback stopped', { guildId });
    } catch (error) {
      logger.error('❌ Failed to stop playback', { guildId, error });
      throw error;
    }
  }

  /**
   * Add track to guild queue and play if queue is empty
   */
  async addTrackToQueue(guildId: string, query: string, voiceChannelId: string, textChannelId: string): Promise<{ position: number; track?: Track }> {
    try {
      logger.debug('🎵 Adding track to queue', { guildId, query });

      // Load the track first
      const loadResult = await this.loadTrack(query);
      
      if (!loadResult.tracks || loadResult.tracks.length === 0) {
        throw new Error('No tracks found for the given query');
      }

      const track = loadResult.tracks[0]; // Use first track from results
      
      // Add to DynamoDB queue
      const position = await this.guildQueueService.addTrack(guildId, query);
      
      // If this is the first track in queue, start playing immediately
      if (position === 1) {
        const connection = await this.getConnection(guildId, voiceChannelId, textChannelId);
        
        // Play track directly on the connection's player instance
        const player = (connection as any).player;
        if (!player) {
          throw new Error('No player available on connection');
        }
        
        await player.playTrack({ 
          track: { encoded: track.encoded }
        });
        
        logger.info('🎵 Started playing track immediately', {
          guildId,
          title: track.info.title,
          position,
        });
      } else {
        logger.info('🎵 Track added to queue', {
          guildId,
          title: track.info.title,
          position,
        });
      }

      return { position, track };
    } catch (error) {
      logger.error('❌ Failed to add track to queue', { guildId, query, error });
      throw error;
    }
  }

  /**
   * Skip current track and play next in queue
   */
  async skipCurrentTrack(guildId: string): Promise<{ skipped: boolean; nextTrack?: Track }> {
    try {
      logger.debug('⏭️ Skipping current track', { guildId });

      // Skip current track
      await this.skipTrack(guildId);

      // Get queue size to check if there are more tracks
      const queueSize = await this.guildQueueService.getQueueSize(guildId);
      
      if (queueSize > 1) {
        // Remove current track from queue (position 1)
        // Note: This is a simplified implementation. In a real scenario,
        // you'd want to implement proper queue position management
        logger.info('⏭️ Track skipped, queue has more tracks', { guildId, remainingTracks: queueSize - 1 });
        return { skipped: true };
      } else {
        // Clear the queue since it was the last track
        await this.guildQueueService.clearQueue(guildId);
        logger.info('⏭️ Track skipped, queue is now empty', { guildId });
        return { skipped: true };
      }
    } catch (error) {
      logger.error('❌ Failed to skip track', { guildId, error });
      throw error;
    }
  }

  /**
   * Clear guild queue and stop playback
   */
  async clearGuildQueue(guildId: string): Promise<void> {
    try {
      logger.debug('🗑️ Clearing guild queue', { guildId });

      // Stop current playback
      await this.stopPlayback(guildId);

      // Clear DynamoDB queue
      await this.guildQueueService.clearQueue(guildId);

      logger.info('✅ Guild queue cleared', { guildId });
    } catch (error) {
      logger.error('❌ Failed to clear guild queue', { guildId, error });
      throw error;
    }
  }

  /**
   * Get current queue size for guild
   */
  async getQueueSize(guildId: string): Promise<number> {
    try {
      return await this.guildQueueService.getQueueSize(guildId);
    } catch (error) {
      logger.error('❌ Failed to get queue size', { guildId, error });
      throw error;
    }
  }

  /**
   * Get connection status
   */
  isHealthy(): boolean {
    const node = this.getNode();
    const nodeState = node ? (node as any).state : null;
    // Handle both string and numeric states: CONNECTED = 'CONNECTED' or 2
    const isNodeConnected = nodeState === 'CONNECTED' || nodeState === 2;
    return !!(node && isNodeConnected && this.isConnected);
  }

  /**
   * Get node statistics
   */
  getStats(): { connected: boolean; nodeState: string; connections: number; stats: any } {
    const node = this.getNode();
    return {
      connected: this.isConnected,
      nodeState: (node?.state as unknown as string) || 'UNKNOWN',
      connections: this.shoukaku.connections.length,
      stats: node?.stats || null,
    };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      logger.info('🧹 Destroying Lavalink service...');
      
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Destroy all connections
      for (const connection of this.shoukaku.connections) {
        this.shoukaku.leaveVoiceChannel((connection as any).guildId);
      }

      logger.info('✅ Lavalink service destroyed');
    } catch (error) {
      logger.error('❌ Error destroying Lavalink service', { error });
    }
  }

  /**
   * Setup event handlers for Shoukaku with enhanced debugging
   */
  private setupEventHandlers(): void {
    logger.info('🎧 Setting up Shoukaku event handlers...');
    
    this.shoukaku.on(Events.Ready, (node: Node, resumed: boolean) => {
      logger.info(`✅ Shoukaku node ready: ${node.name}`, { 
        resumed, 
        timestamp: new Date().toISOString(),
        nodeCount: this.shoukaku.nodes.length,
        availableNodes: this.shoukaku.nodes.map(n => n.name)
      });
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.shoukaku.on(Events.Error, (node: Node | NodeOption, error: Error) => {
      const nodeName = typeof node === 'object' && 'name' in node ? node.name : 'unknown';
      logger.error(`❌ Shoukaku node error: ${nodeName}`, { 
        error: error.message, 
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    this.shoukaku.on(Events.Close, (node: Node, code: number, reason: string) => {
      logger.info(`🔌 Shoukaku node closed: ${node.name} (normal in lazy mode)`, { 
        code, 
        reason,
        timestamp: new Date().toISOString()
      });
      this.isConnected = false;
      // Don't trigger reconnection - let it happen on-demand
    });

    this.shoukaku.on(Events.Disconnect, (node: Node) => {
      logger.info(`🔌 Shoukaku node disconnected: ${node.name} (normal in lazy mode)`, { 
        timestamp: new Date().toISOString()
      });
      this.isConnected = false;
      // Don't trigger reconnection - let it happen on-demand
    });

    this.shoukaku.on(Events.Reconnecting, (node: Node, reconnectsLeft: number, reconnectInterval: number) => {
      logger.info(`🔄 Shoukaku node reconnecting: ${node.name}`, { 
        reconnectsLeft, 
        reconnectInterval,
        timestamp: new Date().toISOString()
      });
    });
    
    // Additional debugging events
    this.shoukaku.on(Events.Debug, (info: string) => {
      logger.debug(`🐛 Shoukaku debug:`, info);
    });
    
    logger.info('✅ Shoukaku event handlers configured');
  }

  /**
   * Wait for Shoukaku ready event instead of polling node state
   */
  private async waitForShoukakuReady(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('⏳ Waiting for Shoukaku ready event...', { timeout: `${timeout}ms` });
      
      const timeoutHandle = setTimeout(() => {
        logger.error('❌ Shoukaku ready timeout');
        reject(new Error(`Shoukaku ready timeout after ${timeout}ms`));
      }, timeout);
      
      // Listen for the ready event
      this.shoukaku.once(Events.Ready, (node: Node, resumed: boolean) => {
        clearTimeout(timeoutHandle);
        logger.info('✅ Shoukaku ready event received', { name: node.name, resumed });
        this.isConnected = true;
        resolve();
      });
      
      // Also listen for errors
      this.shoukaku.once(Events.Error, (node: Node | NodeOption, error: Error) => {
        clearTimeout(timeoutHandle);
        const nodeName = typeof node === 'object' && 'name' in node ? node.name : 'unknown';
        logger.error('❌ Shoukaku error during initialization', { name: nodeName, error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Wait for Lavalink connection to be established with detailed progress logging (BACKUP METHOD)
   */
  private async waitForConnection(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastLogTime = 0;
      let checkCount = 0;
      
      logger.info('⏳ Waiting for Lavalink connection...', {
        timeout: `${timeout}ms`,
        nodeUrl: `${this.config.host}:${this.config.port}`,
      });
      
      const checkConnection = () => {
        checkCount++;
        const node = this.getNode();
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        
        // Log progress every 5 seconds
        if (currentTime - lastLogTime > 5000) {
          logger.info('⏳ Still waiting for Lavalink connection...', {
            elapsed: `${elapsed}ms`,
            timeout: `${timeout}ms`,
            nodeState: node ? (node as any).state : 'NO_NODE',
            checkCount,
            nodeUrl: `${this.config.host}:${this.config.port}`,
          });
          lastLogTime = currentTime;
        }
        
        // Check if node exists and is connected (handle both string and numeric states)
        if (node) {
          const nodeState = (node as any).state;
          const isConnected = nodeState === 'CONNECTED' || nodeState === 2; // State.CONNECTED = 2
          
          logger.debug('🔍 Node state check:', {
            nodeState,
            stateType: typeof nodeState,
            isConnected,
            nodeStats: (node as any).stats || 'no stats',
          });
          
          if (isConnected) {
            logger.info('✅ Lavalink connection established', {
              elapsed: `${elapsed}ms`,
              checkCount,
              nodeState,
            });
            this.isConnected = true;
            resolve();
            return;
          }
        }

        if (elapsed > timeout) {
          const finalState = node ? (node as any).state : 'NO_NODE';
          logger.error('❌ Lavalink connection timeout', {
            elapsed: `${elapsed}ms`,
            timeout: `${timeout}ms`,
            finalNodeState: finalState,
            checkCount,
            nodeUrl: `${this.config.host}:${this.config.port}`,
          });
          reject(new Error(`Lavalink connection timeout after ${elapsed}ms. Final node state: ${finalState}`));
          return;
        }

        setTimeout(checkConnection, 100);
      };

      checkConnection();
    });
  }

  /**
   * Handle reconnection logic (simplified for lazy connections)
   */
  private async handleReconnection(): Promise<void> {
    logger.info('🔄 Connection lost - will reconnect on next use (lazy mode)');
    this.isConnected = false;
    this.reconnectAttempts = 0; // Reset for next connection attempt
  }

  /**
   * Connect to Lavalink on-demand (lazy connection)
   */
  private async ensureConnection(): Promise<void> {
    const node = this.getNode();
    const nodeState = node ? (node as any).state : null;
    const isConnected = nodeState === 'CONNECTED' || nodeState === 2;
    
    if (isConnected) {
      logger.debug('🔗 Lavalink already connected');
      return;
    }
    
    logger.info('🔌 Connecting to Lavalink on-demand...');
    
    try {
      // Test basic connectivity first
      await this.testLavalinkConnectivity();
      
      // Connect to Shoukaku
      await this.shoukaku.connect();
      
      // Wait for ready event
      await this.waitForShoukakuReady(10000);
      
      logger.info('✅ On-demand Lavalink connection established');
    } catch (error) {
      logger.error('❌ Failed to establish on-demand Lavalink connection:', error);
      throw error;
    }
  }

  /**
   * Start minimal health monitoring (much less aggressive)
   */
  private startHealthMonitoring(): void {
    // Skip health monitoring in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    
    // Much less frequent health checks - only log status, don't force reconnections
    this.healthCheckInterval = setInterval(() => {
      const node = this.getNode();
      if (node) {
        LavalinkDebugger.analyzeNodeState(node);
      }
    }, 60000); // Check every 60 seconds (less aggressive)
  }

  /**
   * Get the main Lavalink node
   */
  private getNode(): Node | undefined {
    return this.shoukaku.nodes.find(n => n.name === 'main');
  }

  /**
   * Check if string is a URL
   */
  private isUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return str.startsWith('http://') || str.startsWith('https://');
    }
  }

  /**
   * Get human-readable description for WebSocket close codes
   */
  private getWebSocketCloseCodeDescription(code: number): string {
    const closeCodes: { [key: number]: string } = {
      1000: 'Normal Closure',
      1001: 'Going Away',
      1002: 'Protocol Error',
      1003: 'Unsupported Data',
      1005: 'No Status Received',
      1006: 'Abnormal Closure',
      1007: 'Invalid frame payload data',
      1008: 'Policy Violation',
      1009: 'Message Too Big',
      1010: 'Mandatory Extension',
      1011: 'Internal Server Error',
      1012: 'Service Restart',
      1013: 'Try Again Later',
      1014: 'Bad Gateway',
      1015: 'TLS Handshake',
      4000: 'Unknown error',
      4001: 'Unknown opcode',
      4002: 'Decode error',
      4003: 'Not authenticated',
      4004: 'Authentication failed',
      4005: 'Already authenticated',
      4006: 'Session no longer valid',
    };

    return closeCodes[code] || `Unknown code: ${code}`;
  }

  /**
   * Test WebSocket connection with the same headers Shoukaku would use
   */
  private async testShoukakuWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const WebSocket = require('ws');
        const wsUrl = `ws://${this.config.host}:${this.config.port}/v4/websocket`;
        
        logger.info('🔌 Testing WebSocket with Shoukaku headers:', {
          url: wsUrl,
          userId: this.client.user?.id || 'test-user-id',
          clientName: 'TimmyBot-Test'
        });
        
        const ws = new WebSocket(wsUrl, {
          headers: {
            'Authorization': this.config.password,
            'User-Id': this.client.user?.id || 'test-user-id',
            'Client-Name': 'TimmyBot-Test'
          }
        });
        
        const timeout = setTimeout(() => {
          logger.warn('⚠️ WebSocket test timeout');
          ws.close();
          resolve(false);
        }, 5000);
        
        ws.on('open', () => {
          logger.info('✅ WebSocket test connection opened successfully');
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });
        
        ws.on('error', (error: any) => {
          logger.error('❌ WebSocket test error:', error.message);
          clearTimeout(timeout);
          resolve(false);
        });
        
        ws.on('close', (code: number, reason: string) => {
          logger.info('🔌 WebSocket test closed:', { code, reason: reason.toString() });
        });
        
      } catch (error) {
        logger.error('❌ WebSocket test failed:', error);
        resolve(false);
      }
    });
  }

  /**
   * Wait for WebSocket endpoint to be ready
   */
  private async waitForWebSocketReady(host: string, port: number, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const wsUrl = `ws://${host}:${port}/v4/websocket`;
    
    logger.info('🔌 Testing WebSocket readiness:', { wsUrl, timeout: `${timeout}ms` });
    
    while (Date.now() - startTime < timeout) {
      try {
        const WebSocket = require('ws');
        
        const wsTest = await new Promise<boolean>((resolve) => {
          const ws = new WebSocket(wsUrl, {
            headers: {
              'Authorization': this.config.password,
              'User-Id': this.client.user?.id || 'test-user-id',
              'Client-Name': 'TimmyBot-WebSocket-Test'
            }
          });
          
          const testTimeout = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 3000);
          
          ws.on('open', () => {
            clearTimeout(testTimeout);
            ws.close();
            resolve(true);
          });
          
          ws.on('error', () => {
            clearTimeout(testTimeout);
            resolve(false);
          });
        });
        
        if (wsTest) {
          logger.info('✅ WebSocket endpoint is ready');
          return true;
        }
        
      } catch (error) {
        logger.debug('WebSocket test failed, retrying...', { error: (error as Error).message });
      }
      
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.error('❌ WebSocket endpoint not ready after timeout');
    return false;
  }

  /**
   * Test basic connectivity to Lavalink server before attempting WebSocket connection
   */
  private async testLavalinkConnectivity(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 2000; // 2 seconds between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`🔍 Testing Lavalink connectivity (attempt ${attempt}/${maxRetries})...`, {
          host: this.config.host,
          port: this.config.port,
          testUrl: `http://${this.config.host}:${this.config.port}/version`,
        });

        // Test basic HTTP connectivity to Lavalink REST API
        const response = await fetch(`http://${this.config.host}:${this.config.port}/version`, {
          method: 'GET',
          headers: {
            'Authorization': this.config.password,
            'User-Agent': 'TimmyBot-Discord.js/1.0.0',
          },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
          const version = await response.text();
          logger.info('✅ Lavalink REST API is accessible', {
            status: response.status,
            version: version.trim(),
            attempt,
            headers: Object.fromEntries(response.headers.entries()),
          });
          return; // Success, exit the retry loop
        } else {
          logger.warn(`⚠️ Lavalink REST API returned non-200 status (attempt ${attempt}/${maxRetries})`, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
          });
        }

      } catch (error) {
        logger.warn(`❌ Lavalink connectivity test failed (attempt ${attempt}/${maxRetries})`, {
          error: {
            message: (error as Error).message,
            name: (error as Error).name,
            code: (error as any).code,
            errno: (error as any).errno,
            syscall: (error as any).syscall,
          },
          config: {
            host: this.config.host,
            port: this.config.port,
            testUrl: `http://${this.config.host}:${this.config.port}/version`,
          }
        });
      }

      // Wait before next retry (except on last attempt)
      if (attempt < maxRetries) {
        logger.info(`⏳ Waiting ${retryDelay}ms before next connectivity test...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    logger.warn('⚠️ All Lavalink connectivity tests failed, but proceeding with WebSocket connection attempt');
  }
}