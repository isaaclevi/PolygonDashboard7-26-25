import { promises as fs } from 'fs';
import * as path from 'path';
import FtpSrv, { FileSystem } from 'ftp-srv';
import { ftpConfig } from '../config/ftp';
import logger from '../utils/logger';
import DataFileGeneratorFactory from '../generators/DataFileGenerator';
import { Readable } from 'stream';

/**
 * FTP Connection Handler - extends FtpSrv FileSystem for custom file handling
 */
class CustomFtpConnection extends FileSystem {
  private dataGenerator: any;

  constructor(connection: any) {
    super(connection);
    this.dataGenerator = DataFileGeneratorFactory.create();
  }

  async list(ftpPath = '.') {
    try {
      logger.info('FTP LIST request', { path: ftpPath });
      
      const ftpDataDir = './ftp_data';
      
      // Ensure directory exists
      try {
        await fs.mkdir(ftpDataDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      // Read actual files from FTP data directory
      const files = await fs.readdir(ftpDataDir);
      
      const fileList = await Promise.all(
        files.map(async (fileName) => {
          try {
            const filePath = path.join(ftpDataDir, fileName);
            const stats = await fs.stat(filePath);
            
            return {
              name: fileName,
              size: stats.size,
              mtime: stats.mtime,
              isFile: () => true,
              isDirectory: () => false,
              mode: 644,
              owner: 'ftp',
              group: 'ftp'
            };
          } catch (error) {
            logger.error('Error reading file stats', { fileName, error });
            return null;
          }
        })
      );

      // Filter out null entries and add status file if not present
      const validFiles = fileList.filter(file => file !== null);
      
      // Ensure status.json is always available
      const hasStatusFile = validFiles.some(file => file && file.name === 'status.json');
      if (!hasStatusFile) {
        await this.dataGenerator.generateStatusFile();
        validFiles.push({
          name: 'status.json',
          size: 1024,
          mtime: new Date(),
          isFile: () => true,
          isDirectory: () => false,
          mode: 644,
          owner: 'ftp',
          group: 'ftp'
        });
      }

      logger.info('FTP LIST response', { fileCount: validFiles.length });
      return validFiles;

    } catch (error) {
      logger.error('Error listing FTP directory', { error });
      return [];
    }
  }

  async read(fileName: string, { start = 0 } = {}) {
    try {
      logger.info(`FTP RETR request`, { fileName });
      
      const ftpDataDir = './ftp_data';
      const filePath = path.join(ftpDataDir, fileName);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        // File doesn't exist, try to generate it if it's a data file
        if (fileName.includes('-') && fileName.endsWith('.json') && fileName !== 'status.json') {
          await this.generateDataFile(fileName);
        } else if (fileName === 'status.json') {
          await this.dataGenerator.generateStatusFile();
        } else {
          const stream = new Readable();
          stream.push(`Error: File ${fileName} not found. Expected format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json or status.json`);
          stream.push(null);
          return stream;
        }
      }

      // Read and stream the file
      const fileContent = await fs.readFile(filePath, 'utf8');
      const stream = new Readable();
      stream.push(fileContent);
      stream.push(null);
      
      logger.info('FTP RETR successful', { fileName, size: fileContent.length });
      return stream;

    } catch (error) {
      logger.error('Error reading FTP file', { fileName, error });
      const stream = new Readable();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stream.push(`Error: Unable to read file ${fileName}. ${errorMessage}`);
      stream.push(null);
      return stream;
    }
  }

  private async generateDataFile(fileName: string): Promise<void> {
    try {
      // Parse filename: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
      const nameParts = fileName.replace('.json', '').split('-');
      
      if (nameParts.length !== 4) {
        throw new Error('Invalid filename format. Expected: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json');
      }

      const [symbol, timeframe, startDate, endDate] = nameParts;
      
      // Validate timeframe
      if (!['1min', '5min', '1hour', '1day'].includes(timeframe)) {
        throw new Error('Invalid timeframe. Expected: 1min, 5min, 1hour, 1day');
      }

      // Generate the file using DataFileGenerator
      await this.dataGenerator.generateTradesFile({
        symbol: symbol.toUpperCase(),
        timeframe: timeframe as '1min' | '5min' | '1hour' | '1day',
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString()
      });

      logger.info('Data file generated on demand', { fileName });

    } catch (error) {
      logger.error('Failed to generate data file', { fileName, error });
      throw error;
    }
  }
}

/**
 * FTPService - Primary and ONLY communication channel with frontend dashboard
 * Serves JSON data files generated by DataFileGenerator
 * Supports real-time file generation on demand
 */
class FTPService {
  private ftpServer: FtpSrv;

  constructor() {
    this.ftpServer = new FtpSrv({
      url: `ftp://0.0.0.0:${ftpConfig.port}`,
      anonymous: false,
    });
  }

  public start(): void {
    // Configure FTP server login handler
    this.ftpServer.on('login', async ({ connection, username, password }, resolve, reject) => {
      if (username === ftpConfig.user && password === ftpConfig.pass) {
        logger.info('FTP client authenticated - preparing ticker data transmission', { username });
        
        try {
          // Auto-generate/ensure ticker data is available on connection
          const dataGenerator = DataFileGeneratorFactory.create();
          
          // Check if tickers.json exists and is recent (less than 1 hour old)
          const tickersPath = './ftp_data/tickers.json';
          let shouldGenerateTickers = true;
          
          try {
            const stats = await fs.stat(tickersPath);
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            if (stats.mtime.getTime() > oneHourAgo) {
              shouldGenerateTickers = false;
              logger.info('Using existing recent ticker data');
            }
          } catch {
            // File doesn't exist, generate it
          }
          
          if (shouldGenerateTickers) {
            // Generate fresh ticker data in background (non-blocking)
            if (process.env.POLYGON_API_KEY) {
              logger.info('Starting background ticker data generation for FTP');
              // Run in background without blocking FTP server startup
              dataGenerator.generateTickersFile('stocks', true)
                .then(() => dataGenerator.generateTickerIndex())
                .then(() => {
                  logger.info('Background ticker data generation completed');
                })
                .catch(error => {
                  logger.error('Background ticker generation failed', { error });
                });
            } else {
              logger.warn('No Polygon API key - using existing ticker data if available');
            }
          }
          
          // Ensure status file is current
          await dataGenerator.generateStatusFile();
          
          resolve({ 
            fs: new CustomFtpConnection(connection),
            root: './ftp_data',
            cwd: '/'
          });
        } catch (error) {
          logger.error('Failed to prepare ticker data for FTP transmission', { error });
          // Still allow connection but log the issue
          resolve({ 
            fs: new CustomFtpConnection(connection),
            root: './ftp_data',
            cwd: '/'
          });
        }
      } else {
        logger.warn('FTP authentication failed', { username });
        reject(new Error('Invalid credentials'));
      }
    });

    // Handle client disconnections
    this.ftpServer.on('disconnect', ({ connection }) => {
      logger.info('FTP client disconnected');
    });

    // Handle client errors
    this.ftpServer.on('client-error', ({ connection, context, error }) => {
      logger.error('FTP client error', { context, error: error.message });
    });

    // Start listening
    this.ftpServer.listen()
      .then(() => {
        logger.info(`FTP Server started on port ${ftpConfig.port}`);
        logger.info('Frontend can access data files via FTP protocol');
      })
      .catch((error: Error) => {
        logger.error('Failed to start FTP server', { error: error.message });
        throw error;
      });
  }

  public stop(): void {
    if (this.ftpServer) {
      this.ftpServer.close();
      logger.info('FTP Server stopped');
    }
  }
}

export default new FTPService();
