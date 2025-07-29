import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import logger from './utils/logger';
import LoadBalancerService from './services/LoadBalancerService';
import { getLoadBalancerConfig } from './config/loadbalancer';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

/**
 * Load Balancer Server for WebSocket Connections
 * Distributes client connections across multiple backend socket servers
 * Provides health monitoring and load balancing algorithms
 */
const startLoadBalancer = async () => {
  try {
    logger.info('Starting WebSocket Load Balancer...');

    // Get load balancer configuration
    const config = getLoadBalancerConfig();
    logger.info('Load balancer configuration loaded', {
      port: config.port,
      algorithm: config.algorithm,
      backendCount: config.backends.length,
      healthCheckInterval: config.healthCheckInterval
    });

    // Create and start load balancer service
    const loadBalancer = new LoadBalancerService(config);
    loadBalancer.start();
    logger.info('Load balancer service started successfully');

    // Create minimal Express app for monitoring
    logger.info('🔧 Creating monitoring Express application...');
    const app = express();
    
    logger.info('🔧 Adding monitoring middleware...');
    app.use(cors());
    app.use(express.json());
    logger.info('✅ Monitoring middleware added successfully');

    // Health check endpoint for load balancer
    app.get('/health', (req, res) => {
      const status = loadBalancer.getStatus();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        loadBalancer: {
          algorithm: status.algorithm,
          totalConnections: status.totalConnections,
          backendCount: status.backends.length,
          healthyBackends: status.backends.filter(b => b.health).length
        },
        backends: status.backends.map(backend => ({
          id: backend.id,
          host: backend.host,
          port: backend.port,
          health: backend.health,
          activeConnections: backend.activeConnections,
          weight: backend.weight,
          lastHealthCheck: backend.lastHealthCheck
        })),
        message: 'WebSocket load balancer running. Connect to this server for distributed WebSocket access.'
      });
    });
    logger.info('DEBUG: Load balancer health check endpoint configured.');

    // Load balancer status endpoint
    app.get('/status', (req, res) => {
      const status = loadBalancer.getStatus();
      res.json({
        loadBalancer: status,
        timestamp: new Date().toISOString()
      });
    });
    logger.info('DEBUG: Load balancer status endpoint configured.');

    // Catch-all route to inform about load balancer
    app.use((req, res) => {
      res.status(404).json({
        error: 'Load Balancer Endpoint',
        message: 'This is a WebSocket load balancer. Connect via WebSocket protocol for distributed access.',
        loadBalancerConfig: {
          host: 'localhost',
          port: config.port,
          path: '/',
          note: 'Use WebSocket client to connect to load balancer'
        },
        availableEndpoints: {
          health: '/health',
          status: '/status'
        }
      });
    });
    logger.info('DEBUG: Load balancer catch-all route configured.');

    app.use(errorHandler);
    logger.info('DEBUG: Error handler configured.');

    // Create HTTP server for monitoring
    const monitoringPort = Number(process.env.LOAD_BALANCER_MONITORING_PORT) || 3004;
    const server = createServer(app);
    server.listen(monitoringPort, () => {
      logger.info(`✅ Load balancer monitoring server running on port ${monitoringPort}`);
    });

    // Handle HTTP server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${monitoringPort} is already in use`, { error, port: monitoringPort });
        process.exit(1);
      } else {
        logger.error('Load balancer monitoring server error', { error, port: monitoringPort });
      }
    });

    logger.info('🚀 WebSocket Load Balancer is running successfully!');
    logger.info('📊 Load Balancing: Client Connections → Load Balancer → Backend Servers');
    logger.info('🔌 Primary: WebSocket Load Balancer (Connection Distribution)');
    logger.info('🌐 Secondary: Health monitoring endpoint only');
    logger.info(`⚖️ Algorithm: ${config.algorithm}`);
    logger.info(`🔗 Backend Servers: ${config.backends.length} configured`);

    // Log backend server details
    config.backends.forEach(backend => {
      logger.info(`🔗 Backend Server: ${backend.id} - ${backend.host}:${backend.port} (Weight: ${backend.weight})`);
    });

  } catch (error: any) {
    logger.error('Failed to start load balancer', {
      errorObject: error,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorConstructor: error?.constructor?.name,
    });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down load balancer gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down load balancer gracefully...');
  process.exit(0);
});

startLoadBalancer(); 