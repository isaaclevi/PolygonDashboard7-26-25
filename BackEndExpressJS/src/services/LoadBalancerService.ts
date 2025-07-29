import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import logger from '../utils/logger';
import { socketConfig } from '../config/socket';

interface BackendServer {
  id: string;
  host: string;
  port: number;
  weight: number;
  health: boolean;
  activeConnections: number;
  lastHealthCheck: Date;
}

interface LoadBalancerConfig {
  port: number;
  backends: BackendServer[];
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxRetries: number;
}

interface ClientConnection {
  ws: WebSocket;
  backendId: string;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * LoadBalancerService - Distributes WebSocket connections across multiple backend servers
 * Supports multiple load balancing algorithms and health checking
 */
class LoadBalancerService {
  private wss: WebSocketServer;
  private httpServer: Server;
  private config: LoadBalancerConfig;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private currentBackendIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: LoadBalancerConfig) {
    this.config = config;
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/'
    });
    this.setupWebSocketHandlers();
    this.startHealthChecks();
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Load balancer received connection', { 
        remoteAddress: ws.url,
        readyState: ws.readyState 
      });

      // Select backend server based on load balancing algorithm
      const selectedBackend = this.selectBackend(ws);
      
      if (!selectedBackend) {
        logger.error('No healthy backend servers available');
        ws.close(1013, 'No healthy backend servers available');
        return;
      }

      // Create proxy connection to backend
      this.createProxyConnection(ws, selectedBackend);
    });

    this.wss.on('error', (error) => {
      logger.error('Load balancer WebSocket server error', { error });
    });
  }

  private selectBackend(ws: WebSocket): BackendServer | null {
    const healthyBackends = this.config.backends.filter(backend => backend.health);
    
    if (healthyBackends.length === 0) {
      return null;
    }

    switch (this.config.algorithm) {
      case 'round-robin':
        return this.roundRobinSelection(healthyBackends);
      case 'least-connections':
        return this.leastConnectionsSelection(healthyBackends);
      case 'weighted':
        return this.weightedSelection(healthyBackends);
      case 'ip-hash':
        return this.ipHashSelection(healthyBackends, ws);
      default:
        return this.roundRobinSelection(healthyBackends);
    }
  }

  private roundRobinSelection(backends: BackendServer[]): BackendServer {
    const backend = backends[this.currentBackendIndex % backends.length];
    this.currentBackendIndex = (this.currentBackendIndex + 1) % backends.length;
    return backend;
  }

  private leastConnectionsSelection(backends: BackendServer[]): BackendServer {
    return backends.reduce((min, current) => 
      current.activeConnections < min.activeConnections ? current : min
    );
  }

  private weightedSelection(backends: BackendServer[]): BackendServer {
    const totalWeight = backends.reduce((sum, backend) => sum + backend.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const backend of backends) {
      random -= backend.weight;
      if (random <= 0) {
        return backend;
      }
    }
    
    return backends[0]; // Fallback
  }

  private ipHashSelection(backends: BackendServer[], ws: WebSocket): BackendServer {
    // Extract IP address from WebSocket connection
    const ip = this.getClientIP(ws);
    const hash = this.hashCode(ip);
    return backends[hash % backends.length];
  }

  private getClientIP(ws: WebSocket): string {
    // Extract IP from WebSocket connection
    const remoteAddress = (ws as any)._socket?.remoteAddress || 'unknown';
    return remoteAddress;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private createProxyConnection(clientWs: WebSocket, backend: BackendServer) {
    try {
      // Create WebSocket connection to backend
      const backendWs = new WebSocket(`ws://${backend.host}:${backend.port}/`);
      
      // Track the connection
      this.clients.set(clientWs, {
        ws: clientWs,
        backendId: backend.id,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      // Update backend connection count
      backend.activeConnections++;

      // Set up bidirectional proxy
      this.setupProxy(clientWs, backendWs, backend);

      logger.info('Proxy connection established', {
        backendId: backend.id,
        backendHost: backend.host,
        backendPort: backend.port,
        activeConnections: backend.activeConnections
      });

    } catch (error) {
      logger.error('Failed to create proxy connection', { 
        error, 
        backendId: backend.id,
        backendHost: backend.host,
        backendPort: backend.port
      });
      
      clientWs.close(1013, 'Failed to connect to backend server');
    }
  }

  private setupProxy(clientWs: WebSocket, backendWs: WebSocket, backend: BackendServer) {
    // Client to Backend
    clientWs.on('message', (data) => {
      try {
        if (backendWs.readyState === WebSocket.OPEN) {
          backendWs.send(data);
          this.updateClientActivity(clientWs);
        }
      } catch (error) {
        logger.error('Error forwarding message from client to backend', { error });
      }
    });

    // Backend to Client
    backendWs.on('message', (data) => {
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
          this.updateClientActivity(clientWs);
        }
      } catch (error) {
        logger.error('Error forwarding message from backend to client', { error });
      }
    });

    // Handle client disconnection
    clientWs.on('close', (code, reason) => {
      logger.info('Client disconnected from load balancer', { 
        code, 
        reason: reason.toString(),
        backendId: backend.id
      });
      
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      this.clients.delete(clientWs);
      backendWs.close();
    });

    // Handle backend disconnection
    backendWs.on('close', (code, reason) => {
      logger.info('Backend connection closed', { 
        code, 
        reason: reason.toString(),
        backendId: backend.id
      });
      
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      this.clients.delete(clientWs);
      clientWs.close();
    });

    // Handle errors
    clientWs.on('error', (error) => {
      logger.error('Client WebSocket error', { error, backendId: backend.id });
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      this.clients.delete(clientWs);
      backendWs.close();
    });

    backendWs.on('error', (error) => {
      logger.error('Backend WebSocket error', { error, backendId: backend.id });
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);
      this.clients.delete(clientWs);
      clientWs.close();
    });
  }

  private updateClientActivity(clientWs: WebSocket) {
    const client = this.clients.get(clientWs);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  private startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks() {
    for (const backend of this.config.backends) {
      try {
        const isHealthy = await this.checkBackendHealth(backend);
        backend.health = isHealthy;
        backend.lastHealthCheck = new Date();
        
        logger.debug('Backend health check completed', {
          backendId: backend.id,
          host: backend.host,
          port: backend.port,
          health: isHealthy,
          activeConnections: backend.activeConnections
        });
      } catch (error) {
        logger.error('Backend health check failed', {
          backendId: backend.id,
          host: backend.host,
          port: backend.port,
          error
        });
        backend.health = false;
        backend.lastHealthCheck = new Date();
      }
    }
  }

  private async checkBackendHealth(backend: BackendServer): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.config.healthCheckTimeout);

      try {
        const healthCheckWs = new WebSocket(`ws://${backend.host}:${backend.port}/health`);
        
        healthCheckWs.on('open', () => {
          clearTimeout(timeout);
          healthCheckWs.close();
          resolve(true);
        });

        healthCheckWs.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        healthCheckWs.on('close', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  public getStatus() {
    return {
      algorithm: this.config.algorithm,
      totalConnections: this.clients.size,
      backends: this.config.backends.map(backend => ({
        id: backend.id,
        host: backend.host,
        port: backend.port,
        health: backend.health,
        activeConnections: backend.activeConnections,
        weight: backend.weight,
        lastHealthCheck: backend.lastHealthCheck
      }))
    };
  }

  public start(): void {
    const port = this.config.port;
    this.httpServer.listen(port, () => {
      logger.info(`Load balancer started on port ${port}`, {
        port,
        algorithm: this.config.algorithm,
        backendCount: this.config.backends.length,
        healthCheckInterval: this.config.healthCheckInterval
      });
    });

    this.httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`, { error, port });
        process.exit(1);
      } else {
        logger.error('Load balancer HTTP server error', { error, port });
      }
    });
  }

  public stop(): void {
    logger.info('Stopping load balancer');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Close all client connections
    for (const [ws] of this.clients) {
      ws.close();
    }
    this.clients.clear();
    
    // Close the server
    this.wss.close();
    this.httpServer.close();
    
    logger.info('Load balancer stopped');
  }
}

export default LoadBalancerService; 