import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import logger from './utils/logger';
import DatabaseService from './services/DatabaseService';
import FTPService from './services/FTPService';
import PolygonService from './services/PolygonService';
import { errorHandler } from './middleware/errorHandler';
import { promises as fs } from 'fs';
import path from 'path';
import DataFileGeneratorFactory from './generators/DataFileGenerator';

dotenv.config();

/**
 * FTP-First Stock Data Backend Server
 * Primary: FTP server for file-based communication
 * Secondary: Minimal HTTP proxy for browser FTP access
 */

/**
 * Initialize ticker data generation
 * Fetches all available tickers from Polygon.io and generates JSON files for FTP access
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
 * FTP-First Stock Data Backend Server
 * Primary: FTP server for file-based communication
 * Secondary: Minimal HTTP proxy for browser FTP access
 */
const startServer = async () => {
  try {
    logger.info('Starting FTP-First Stock Data Backend...');

    // Initialize database connection
    await DatabaseService.connect();
    logger.info('Database connected successfully');

    // Start FTP server for frontend communication
    FTPService.start();
    logger.info('FTP server started for frontend communication');

    // Initialize data file generator
    const dataGenerator = DataFileGeneratorFactory.create();
    
    // Generate initial status file
    await dataGenerator.generateStatusFile();
    logger.info('Initial status file generated');

    logger.info('🔧 Creating Express application...');
    let app;
    try {
      // Create minimal HTTP proxy for browser FTP access
      app = express();
      logger.info('✅ Express app created successfully');
      
      logger.info('🔧 Adding middleware...');
      app.use(cors());
      app.use(express.json());
      logger.info('✅ Middleware added successfully');
    } catch (error) {
      logger.error('❌ Failed to create Express app or add middleware', { error });
      throw error;
    }

    logger.info('DEBUG: Setting up Express routes...');
    // 🌐 Serve Angular static files from public directory
    app.use(express.static(path.join(__dirname, '../public')));
    logger.info('DEBUG: 1. Static directory configured.');

    // Health check endpoint for Docker
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          http: 'running',
          ftp: 'running',
          database: 'connected',
          polygon: 'subscribed'
        }
      });
    });
    logger.info('DEBUG: 2. Health check endpoint configured.');

    // HTTP proxy endpoint to serve FTP files for browser compatibility
    app.get('/ftp-proxy/:filename', async (req, res) => {
      try {
        const fileName = req.params.filename;
        const ftpDataDir = './ftp_data';
        const filePath = path.join(ftpDataDir, fileName);

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch (error) {
          // File doesn't exist, try to generate it if it's a data file
          if (fileName.includes('-') && fileName.endsWith('.json') && fileName !== 'status.json') {
            await dataGenerator.generateDataFile(fileName);
          } else if (fileName === 'status.json') {
            await dataGenerator.generateStatusFile();
          } else {
            return res.status(404).json({
              error: 'File not found',
              message: `File ${fileName} not found. Expected format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json or status.json`
            });
          }
        }

        // Read and serve the file
        const fileContent = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(fileContent);
        
        logger.info('HTTP FTP proxy served file', { fileName, size: fileContent.length });
        res.json(jsonData);

      } catch (error) {
        logger.error('Error serving FTP file via HTTP proxy', { error, fileName: req.params.filename });
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to serve file from FTP storage'
        });
      }
    });
    logger.info('DEBUG: 3. FTP proxy endpoint configured.');

    // List available FTP files endpoint
    app.get('/ftp-proxy', async (req, res) => {
      try {
        const ftpDataDir = './ftp_data';
        const files = await fs.readdir(ftpDataDir);
        const fileList = files.filter(file => file.endsWith('.json'));
        
        logger.info('HTTP FTP proxy listed files', { fileCount: fileList.length });
        res.json({ files: fileList });

      } catch (error) {
        logger.error('Error listing FTP files via HTTP proxy', { error });
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to list FTP files'
        });
      }
    });
    logger.info('DEBUG: 4. FTP list files endpoint configured.');

    // Serve Angular index.html for root path
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
    logger.info('DEBUG: 5. Root route configured.');

    app.use(errorHandler);
    logger.info('DEBUG: 6. Error handler configured.');

    logger.info('🔧 Starting HTTP server...');
    const httpPort = process.env.HTTP_PROXY_PORT || 3000;
    logger.info(`🚀 Attempting to bind to port ${httpPort}...`);
    
    const server = app.listen(httpPort, () => {
      logger.info(`✅ HTTP FTP proxy server running on port ${httpPort}`);
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

    // Start periodic file cleanup (every 6 hours)
    setInterval(async () => {
      try {
        await dataGenerator.cleanupOldFiles(24); // Keep files for 24 hours
        await dataGenerator.generateStatusFile(); // Update status
      } catch (error) {
        logger.error('Periodic cleanup failed', { error });
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Subscribe to real-time data from Polygon.io (reduced connections to prevent limit)
    const defaultSymbols = ['AAPL', 'GOOGL'];
    PolygonService.subscribeToAllData(defaultSymbols);
    logger.info('Subscribed to real-time data', { symbols: defaultSymbols });

    logger.info('🚀 FTP-First Stock Data Backend is running successfully!');
    logger.info('📊 Real-time data: Polygon.io WebSocket → Database');
    logger.info('📁 Primary: FTP Server (JSON files only)');
    logger.info('🌐 Secondary: HTTP proxy for browser FTP access');
    logger.info('💾 Database: PostgreSQL with consolidated trades table');

    // Ticker data initialization is now handled by FTP service on first connection
    logger.info('📊 Ticker data will be initialized on first FTP connection (background)');

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
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

startServer();
