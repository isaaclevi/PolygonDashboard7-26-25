import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import logger from './utils/logger';
import DatabaseService from './services/DatabaseService';
import SocketService from './services/SocketService';
import PolygonService from './services/PolygonService';
import { errorHandler } from './middleware/errorHandler';
import DataFileGeneratorFactory from './generators/DataFileGenerator';

dotenv.config();

/**
 * Initialize ticker data from Polygon.io on server startup
 * Runs in background to avoid blocking server start
 */
async function initializeTickerData(): Promise<void> {
  try {
    // Check if Polygon API key is available
    if (!process.env.POLYGON_API_KEY) {
      logger.warn('POLYGON_API_KEY not set. Skipping ticker data initialization. Using fallback data.');
      return;
    }

    logger.info('Initializing ticker data from Polygon.io...');
    
    const generator = DataFileGeneratorFactory.create();
    
    // Generate comprehensive ticker data for stocks market
    await generator.generateTickersFile('stocks', true);
    
    // Generate search index for fast filtering
    await generator.generateTickerIndex();
    
    logger.info('Ticker data initialization completed successfully');
  } catch (error) {
    logger.error('Failed to initialize ticker data', { error });
    // Don't throw error to prevent server from crashing
    // Frontend will handle the case where ticker data is unavailable
  }
}

/**
 * Socket-Based Stock Data Backend Server
 * Primary: WebSocket server for real-time JSON data communication with frontend
 * Secondary: Minimal health check endpoint for monitoring
 */
const startServer = async () => {
  try {
    logger.info('Starting Socket-Based Stock Data Backend...');

    // Initialize database connection
    await DatabaseService.connect();
    logger.info('Database connected successfully');

    // Start Socket service for frontend communication
    SocketService.start();
    logger.info('Socket service started for frontend communication');

    // Initialize data file generator
    const dataGenerator = DataFileGeneratorFactory.create();
    
    // Generate initial status data
    await dataGenerator.generateStatusFile();
    logger.info('Initial status data generated');

    logger.info('🔧 Creating minimal Express application for health monitoring...');
    let app;
    try {
      // Create minimal HTTP app for health monitoring only
      app = express();
      logger.info('✅ Express app created successfully');
      
      logger.info('🔧 Adding minimal middleware...');
      app.use(cors());
      app.use(express.json());
      logger.info('✅ Middleware added successfully');
    } catch (error) {
      logger.error('❌ Failed to create Express app or add middleware', { error });
      throw error;
    }

    logger.info('DEBUG: Setting up minimal Express routes...');

    // Health check endpoint for Docker and monitoring
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          socket: 'running',
          database: 'connected',
          polygon: 'subscribed'
        },
        message: 'Socket-based backend server running. Frontend communication via WebSocket protocol only.',
        socketEndpoint: '/data-stream'
      });
    });
    logger.info('DEBUG: Health check endpoint configured.');

    // Catch-all route to inform about socket-only communication
    app.get('/{*splat}', (req, res) => {
      res.status(404).json({
        error: 'Socket-Only Communication Required',
        message: 'This backend uses WebSocket protocol for frontend communication. HTTP endpoints are not available for data access.',
        socketConfig: {
          host: 'localhost',
          port: process.env.SOCKET_PORT || 3001,
          path: '/data-stream',
          note: 'Use WebSocket client to access data streams'
        }
      });
    });
    logger.info('DEBUG: Catch-all route configured for socket-only communication.');

    app.use(errorHandler);
    logger.info('DEBUG: Error handler configured.');

    // Create HTTP server for health monitoring only
    const httpPort = process.env.HTTP_PROXY_PORT || 3002; // Different port to avoid conflicts
    const server = createServer(app);
    server.listen(httpPort, () => {
      logger.info(`✅ Health monitoring server running on port ${httpPort}`);
    });

    // Handle HTTP server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${httpPort} is already in use`, { error, port: httpPort });
        process.exit(1);
      } else {
        logger.error('HTTP server error', { error, port: httpPort });
      }
    });

    // Start periodic cleanup (every 6 hours) - though less relevant now since we don't store files
    setInterval(async () => {
      try {
        await dataGenerator.cleanupOldFiles(24); // Keep files for 24 hours if any are still generated
        logger.info('Periodic cleanup completed');
      } catch (error) {
        logger.error('Periodic cleanup failed', { error });
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Subscribe to real-time data from Polygon.io
    const defaultSymbols = ['AAPL', 'GOOGL', 'SVIX'];
    
    // TODO: Set up real-time data broadcasting to socket clients
    // This will require modifying PolygonService to emit events or implementing a different pattern
    
    PolygonService.subscribeToAllData(defaultSymbols);
    logger.info('Subscribed to real-time data (broadcasting to be implemented)', { symbols: defaultSymbols });

    // Initialize ticker data in background
    await initializeTickerData();

    logger.info('🚀 Socket-Based Stock Data Backend is running successfully!');
    logger.info('📊 Real-time data: Polygon.io WebSocket → Database → Socket Broadcast');
    logger.info('🔌 Primary: WebSocket Server (JSON data streams)');
    logger.info('🌐 Secondary: Health monitoring endpoint only');
    logger.info('💾 Database: PostgreSQL with consolidated trades table');

  } catch (error: any) {
    logger.error('Failed to start server', {
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
  logger.info('Received SIGINT, shutting down gracefully...');
  SocketService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  SocketService.stop();
  process.exit(0);
});

startServer();
