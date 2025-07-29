import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import logger from '../utils/logger';
import DataFileGeneratorFactory from '../generators/DataFileGenerator';
import { socketConfig } from '../config/socket';

interface SocketMessage {
  id: string;
  type: 'download' | 'list' | 'status' | 'test' | 'subscribe';
  fileName?: string;
  symbol?: string;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  error?: string;
  data?: any;
  files?: string[];
  success?: boolean;
}

interface ClientConnection {
  ws: WebSocket;
  authenticated: boolean;
  subscriptions: Set<string>;
  lastActivity: Date;
}

/**
 * SocketService - Primary and ONLY communication channel with frontend dashboard
 * Serves JSON data directly over WebSocket without file system intermediary
 * Supports real-time data streaming and on-demand data generation
 */
class SocketService {
  private readonly wss: WebSocketServer;
  private readonly httpServer: Server;
  private readonly clients: Map<WebSocket, ClientConnection> = new Map();
  private readonly dataGenerator: any;
  private readonly messageTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly customPort?: number;

  constructor(customPort?: number) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: socketConfig.path // Use path from configuration instead of hardcoded root
    });
    this.dataGenerator = DataFileGeneratorFactory.create();
    this.setupWebSocketHandlers();
    
    // Store custom port for later use
    this.customPort = customPort;
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Socket client connected', { 
        remoteAddress: ws.url,
        readyState: ws.readyState 
      });
      
      // Initialize client connection
      this.clients.set(ws, {
        ws,
        authenticated: false,
        subscriptions: new Set(),
        lastActivity: new Date()
      });

      ws.on('message', async (data) => {
        try {
          const message: SocketMessage = JSON.parse(data.toString());
          logger.info('Socket message received', { 
            type: message.type, 
            id: message.id,
            symbol: message.symbol 
          });
          
          // Update last activity
          const client = this.clients.get(ws);
          if (client) {
            client.lastActivity = new Date();
          }
          
          await this.handleSocketMessage(ws, message);
        } catch (error) {
          logger.error('Socket message handling error', { error, data: data.toString() });
          this.sendError(ws, 'unknown', 'Invalid message format');
        }
      });

      ws.on('close', (code, reason) => {
        logger.info('Socket client disconnected', { 
          code, 
          reason: reason.toString(),
          clientCount: this.clients.size - 1
        });
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('Socket client error', { error });
        this.clients.delete(ws);
      });

      // Send initial status after connection
      this.sendStatusUpdate(ws);
    });

    // Handle WebSocket server errors
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });
  }

  private async handleSocketMessage(ws: WebSocket, message: SocketMessage) {
    try {
      // Set up timeout for this message
      const timeoutId = setTimeout(() => {
        logger.error('Socket message timeout', { 
          type: message.type, 
          id: message.id 
        });
        this.sendError(ws, message.id, 'Request timeout');
      }, 25000); // 25 second timeout

      this.messageTimeouts.set(message.id, timeoutId);

      switch (message.type) {
        case 'download':
          await this.handleDownload(ws, message);
          break;
        case 'list':
          await this.handleList(ws, message);
          break;
        case 'status':
          await this.handleStatus(ws, message);
          break;
        case 'subscribe':
          await this.handleSubscribe(ws, message);
          break;
        case 'test':
          await this.handleTest(ws, message);
          break;
        default:
          logger.warn('Unknown message type', { type: message.type, id: message.id });
          this.sendError(ws, message.id, `Unknown message type: ${message.type}`);
      }

      // Clear timeout after successful handling
      clearTimeout(timeoutId);
      this.messageTimeouts.delete(message.id);

    } catch (error) {
      logger.error('Socket message handling failed', { 
        error, 
        type: message.type, 
        id: message.id 
      });
      this.sendError(ws, message.id, 'Internal server error');
    }
  }

  private async handleDownload(ws: WebSocket, message: SocketMessage) {
    try {
      let jsonData: any;

      logger.info('Processing download request', { 
        fileName: message.fileName,
        symbol: message.symbol,
        timeframe: message.timeframe,
        startDate: message.startDate,
        endDate: message.endDate
      });

      if (message.fileName) {
        // Direct file request
        jsonData = await this.generateFileData(message.fileName);
      } else if (message.symbol && message.timeframe && message.startDate && message.endDate) {
        // Parameterized request
        jsonData = await this.dataGenerator.generateTradesData({
          symbol: message.symbol.toUpperCase(),
          timeframe: message.timeframe as '1min' | '5min' | '1hour' | '1day',
          startDate: new Date(message.startDate).toISOString(),
          endDate: new Date(message.endDate).toISOString()
        });
      } else {
        logger.warn('Invalid download request parameters', { message });
        this.sendError(ws, message.id, 'Either fileName or (symbol, timeframe, startDate, endDate) required');
        return;
      }

      this.sendResponse(ws, {
        id: message.id,
        type: 'download',
        data: jsonData
      });

      logger.info('Socket data served successfully', { 
        fileName: message.fileName, 
        symbol: message.symbol,
        dataSize: JSON.stringify(jsonData).length,
        recordCount: jsonData?.data?.length || 0
      });

    } catch (error) {
      logger.error('Socket download error', { 
        fileName: message.fileName, 
        symbol: message.symbol, 
        error 
      });
      this.sendError(ws, message.id, 'Failed to generate data');
    }
  }

  private async handleList(ws: WebSocket, message: SocketMessage) {
    try {
      logger.info('Processing list request');
      
      // Return available data types and symbols instead of file names
      const availableData = {
        timeframes: ['1min', '5min', '1hour', '1day'],
        symbols: await this.getAvailableSymbols(),
        dataTypes: ['trades', 'quotes', 'aggregates', 'tickers', 'status']
      };

      this.sendResponse(ws, {
        id: message.id,
        type: 'list',
        data: availableData
      });

      logger.info('Socket data types listed successfully', { 
        symbolCount: availableData.symbols.length,
        timeframeCount: availableData.timeframes.length
      });

    } catch (error) {
      logger.error('Socket list error', { error });
      this.sendError(ws, message.id, 'Failed to list available data');
    }
  }

  private async handleStatus(ws: WebSocket, message: SocketMessage) {
    try {
      logger.info('Processing status request');
      
      const statusData = await this.dataGenerator.generateStatusData();
      
      this.sendResponse(ws, {
        id: message.id,
        type: 'status',
        data: statusData
      });

      logger.info('Socket status served successfully');

    } catch (error) {
      logger.error('Socket status error', { error });
      this.sendError(ws, message.id, 'Failed to get status');
    }
  }

  private async handleSubscribe(ws: WebSocket, message: SocketMessage) {
    try {
      const client = this.clients.get(ws);
      if (!client) {
        logger.error('Client not found for subscription', { messageId: message.id });
        this.sendError(ws, message.id, 'Client not found');
        return;
      }

      if (message.symbol) {
        client.subscriptions.add(message.symbol);
        logger.info('Client subscribed to symbol', { 
          symbol: message.symbol,
          totalSubscriptions: client.subscriptions.size
        });
      }

      this.sendResponse(ws, {
        id: message.id,
        type: 'subscribe',
        success: true,
        data: { symbol: message.symbol }
      });

    } catch (error) {
      logger.error('Socket subscription error', { error, symbol: message.symbol });
      this.sendError(ws, message.id, 'Failed to subscribe');
    }
  }

  private async handleTest(ws: WebSocket, message: SocketMessage) {
    try {
      logger.info('Processing test connection request');
      
      this.sendResponse(ws, {
        id: message.id,
        type: 'test',
        success: true,
        data: { 
          timestamp: new Date().toISOString(),
          message: 'Connection test successful'
        }
      });

      logger.info('Socket test connection successful');

    } catch (error) {
      logger.error('Socket test error', { error });
      this.sendError(ws, message.id, 'Connection test failed');
    }
  }

  private async generateFileData(fileName: string): Promise<any> {
    try {
      logger.info('Generating file data', { fileName });
      
      // Handle special files that don't follow the SYMBOL-TIMEFRAME-STARTDATE-ENDDATE pattern
      if (fileName === 'tickers.json') {
        logger.info('Generating tickers data');
        return await this.dataGenerator.generateTickersData();
      }
      
      if (fileName === 'status.json') {
        logger.info('Generating status data');
        return await this.dataGenerator.generateStatusData();
      }
      
      // Parse filename to extract parameters for trade data files
      const parts = fileName.replace('.json', '').split('-');
      
      if (parts.length !== 4) {
        throw new Error(`Invalid filename format: ${fileName}. Expected: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json`);
      }

      const [symbol, timeframe, startDate, endDate] = parts;

      // Validate timeframe
      const validTimeframes = ['1min', '5min', '1hour', '1day'];
      if (!validTimeframes.includes(timeframe)) {
        throw new Error(`Invalid timeframe: ${timeframe}. Valid options: ${validTimeframes.join(', ')}`);
      }

      // Parse and validate dates
      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        throw new Error(`Invalid date format in filename: ${fileName}`);
      }

      const params = {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe as '1min' | '5min' | '1hour' | '1day',
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString()
      };

      logger.info('Generating data from filename parameters', { fileName, params });

      // Generate the trades data
      return await this.dataGenerator.generateTradesData(params);

    } catch (error) {
      logger.error('Failed to generate file data', { fileName, error });
      throw error;
    }
  }

  // private async getAvailableSymbols(): Promise<string[]> {
  //   try {
  //     // For now, return a basic set of symbols
  //     // In production, this would query the database
  //     return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'SVIX', 'WULF'];
  //   } catch (error: unknown) {
  //     console.error('Failed to get available symbols', {
  //       error: error instanceof Error ? error.message : String(error)
  //     });
  //     return [];
  //   }
  // }

  private async getAvailableSymbols(): Promise<string[]> {
    try {
      // For now, return a basic set of symbols
      // In production, this would query the database
      return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'SVIX', 'WULF'];
    } catch (error: any) {
      console.error('Failed to get available symbols', {error});
      return [];
    }
  }

  private sendResponse(ws: WebSocket, message: Partial<SocketMessage>) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const response = JSON.stringify(message);
        ws.send(response);
        logger.debug('Socket response sent', { 
          type: message.type, 
          id: message.id,
          responseSize: response.length 
        });
      } else {
        logger.warn('Attempted to send response to closed connection', { 
          readyState: ws.readyState 
        });
      }
    } catch (error) {
      logger.error('Failed to send socket response', { error, message });
    }
  }

  private sendError(ws: WebSocket, id: string, error: string) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const errorResponse = JSON.stringify({
          id,
          type: 'error',
          error,
          timestamp: new Date().toISOString()
        });
        ws.send(errorResponse);
        logger.warn('Socket error sent', { id, error });
      }
    } catch (sendError) {
      logger.error('Failed to send socket error', { sendError, originalError: error });
    }
  }

  private async sendStatusUpdate(ws: WebSocket) {
    try {
      const statusData = await this.dataGenerator.generateStatusData();
      
      this.sendResponse(ws, {
        id: 'status_update',
        type: 'status',
        data: statusData
      });

      logger.info('Initial status update sent to client');

    } catch (error) {
      logger.error('Failed to send initial status update', { error });
    }
  }

  public broadcastRealTimeData(symbol: string, data: any) {
    const message = JSON.stringify({
      id: 'realtime_update',
      type: 'realtime',
      symbol,
      data,
      timestamp: new Date().toISOString()
    });

    let broadcastCount = 0;
    for (const [ws, client] of this.clients) {
      if (client.subscriptions.has(symbol) && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          broadcastCount++;
        } catch (error) {
          logger.error('Failed to broadcast real-time data', { error, symbol });
        }
      }
    }

    if (broadcastCount > 0) {
      logger.debug('Real-time data broadcasted', { symbol, broadcastCount });
    }
  }

  public start(): void {
    const port = this.customPort || socketConfig.port;
    this.httpServer.listen(port, () => {
      logger.info(`Socket server started on port ${port}`, {
        port,
        path: socketConfig.path,
        maxConnections: socketConfig.maxConnections,
        customPort: this.customPort
      });
    });

    this.httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`, { error, port });
        process.exit(1);
      } else {
        logger.error('HTTP server error', { error, port });
      }
    });
  }

  public stop(): void {
    logger.info('Stopping socket server');
    
    // Clear all timeouts
    for (const timeoutId of this.messageTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.messageTimeouts.clear();
    
    // Close all client connections
    for (const [ws] of this.clients) {
      ws.close();
    }
    this.clients.clear();
    
    // Close the server
    this.wss.close();
    this.httpServer.close();
    
    logger.info('Socket server stopped');
  }
}

export default SocketService; 