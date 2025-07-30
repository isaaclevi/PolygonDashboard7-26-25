import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import logger from '../utils/logger';
import DataFileGeneratorFactory from '../generators/DataFileGenerator';
import DatabaseService from './DatabaseService';
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

// Command Pattern for Socket Message Handling
abstract class SocketMessageHandler {
  abstract handle(ws: WebSocket, message: SocketMessage): Promise<void>;
  
  public sendResponse(ws: WebSocket, response: Partial<SocketMessage>): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const responseString = JSON.stringify(response);
        ws.send(responseString);
        logger.debug('Socket response sent', { 
          type: response.type, 
          id: response.id,
          responseSize: responseString.length 
        });
      } else {
        logger.warn('Attempted to send response to closed connection', { 
          readyState: ws.readyState 
        });
      }
    } catch (error) {
      logger.error('Failed to send socket response', { error, response });
    }
  }
  
  protected sendError(ws: WebSocket, id: string, error: string): void {
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
}

class DownloadHandler extends SocketMessageHandler {
  private dataGenerator: any;
  
  constructor(dataGenerator: any) {
    super();
    this.dataGenerator = dataGenerator;
  }
  
  async handle(ws: WebSocket, message: SocketMessage): Promise<void> {
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
        jsonData = await this.generateFileData(message.fileName);
      } else if (message.symbol && message.timeframe && message.startDate && message.endDate) {
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
  
  private async generateFileData(fileName: string): Promise<any> {
    try {
      logger.info('Generating file data', { fileName });
      
      if (fileName === 'tickers.json') {
        logger.info('Generating tickers data');
        return await this.dataGenerator.generateTickersData();
      }
      
      if (fileName === 'status.json') {
        logger.info('Generating status data');
        return await this.dataGenerator.generateStatusData();
      }
      
      const parts = fileName.replace('.json', '').split('-');
      
      if (parts.length !== 4) {
        throw new Error(`Invalid filename format: ${fileName}. Expected: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json`);
      }

      const [symbol, timeframe, startDate, endDate] = parts;

      const validTimeframes = ['1min', '5min', '1hour', '1day'];
      if (!validTimeframes.includes(timeframe)) {
        throw new Error(`Invalid timeframe: ${timeframe}. Valid options: ${validTimeframes.join(', ')}`);
      }

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

      return await this.dataGenerator.generateTradesData(params);

    } catch (error) {
      logger.error('Failed to generate file data', { fileName, error });
      throw error;
    }
  }
}

class ListHandler extends SocketMessageHandler {
  async handle(ws: WebSocket, message: SocketMessage): Promise<void> {
    try {
      logger.info('Processing list request');
      
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
  
  private async getAvailableSymbols(): Promise<string[]> {
    try {
      return await DatabaseService.getAvailableSymbols();
    } catch (error: any) {
      logger.error('Failed to get available symbols', {error});
      return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'SVIX', 'WULF'];
    }
  }
}

class StatusHandler extends SocketMessageHandler {
  private dataGenerator: any;
  private customPort?: number;
  private clients: Map<WebSocket, ClientConnection>;
  
  constructor(dataGenerator: any, customPort: number | undefined, clients: Map<WebSocket, ClientConnection>) {
    super();
    this.dataGenerator = dataGenerator;
    this.customPort = customPort;
    this.clients = clients;
  }
  
  async handle(ws: WebSocket, message: SocketMessage): Promise<void> {
    try {
      logger.info('Processing status request');
      
      const statusData = await this.dataGenerator.generateStatusData();
      
      const enhancedStatus = {
        ...statusData,
        system: {
          ...statusData.system,
          database: {
            connected: DatabaseService.isDatabaseConnected(),
            mockMode: !DatabaseService.isDatabaseConnected(),
            status: DatabaseService.isDatabaseConnected() ? 'connected' : 'using_mock_data'
          },
          socket: {
            activeConnections: this.clients.size,
            serverStatus: 'running',
            port: this.customPort || socketConfig.port,
            path: socketConfig.path
          },
          timestamp: new Date().toISOString()
        }
      };
      
      this.sendResponse(ws, {
        id: message.id,
        type: 'status',
        data: enhancedStatus
      });

      logger.info('Socket status served successfully', {
        databaseConnected: DatabaseService.isDatabaseConnected()
      });

    } catch (error) {
      logger.error('Socket status error', { error });
      this.sendError(ws, message.id, 'Failed to get status');
    }
  }
  
  setClientCount(count: number): void {
    // This would be called by the service to update the client count
  }
}

class SubscribeHandler extends SocketMessageHandler {
  private clients: Map<WebSocket, ClientConnection>;
  
  constructor(clients: Map<WebSocket, ClientConnection>) {
    super();
    this.clients = clients;
  }
  
  async handle(ws: WebSocket, message: SocketMessage): Promise<void> {
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
}

class TestHandler extends SocketMessageHandler {
  async handle(ws: WebSocket, message: SocketMessage): Promise<void> {
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
}

// Factory Pattern for Handler Creation
class HandlerFactory {
  static createHandler(type: string, dependencies: any): SocketMessageHandler | null {
    switch (type) {
      case 'download': 
        return new DownloadHandler(dependencies.dataGenerator);
      case 'list': 
        return new ListHandler();
      case 'status': 
        return new StatusHandler(dependencies.dataGenerator, dependencies.customPort, dependencies.clients);
      case 'subscribe': 
        return new SubscribeHandler(dependencies.clients);
      case 'test': 
        return new TestHandler();
      default: 
        return null;
    }
  }
}

// Singleton Pattern for Socket Service
class SocketService {
  private static instance: SocketService;
  private readonly wss: WebSocketServer;
  private readonly httpServer: Server;
  private readonly clients: Map<WebSocket, ClientConnection> = new Map();
  private readonly dataGenerator: any;
  private readonly messageTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly customPort?: number;
  private readonly handlers: Map<string, SocketMessageHandler> = new Map();

  constructor(customPort?: number) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: socketConfig.path
    });
    this.dataGenerator = DataFileGeneratorFactory.create();
    this.customPort = customPort;
    
    this.initializeHandlers();
    this.setupWebSocketHandlers();
  }
  
  public static getInstance(customPort?: number): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService(customPort);
    }
    return SocketService.instance;
  }
  
  private sendResponse(ws: WebSocket, message: Partial<SocketMessage>): void {
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
  
  private initializeHandlers(): void {
    this.handlers.set('download', new DownloadHandler(this.dataGenerator));
    this.handlers.set('list', new ListHandler());
    this.handlers.set('status', new StatusHandler(this.dataGenerator, this.customPort, this.clients));
    this.handlers.set('subscribe', new SubscribeHandler(this.clients));
    this.handlers.set('test', new TestHandler());
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

  // Template Method Pattern for message handling
  private async handleSocketMessage(ws: WebSocket, message: SocketMessage): Promise<void> {
    const timeoutId = this.setupMessageTimeout(ws, message);
    
    try {
      await this.processMessage(ws, message);
      this.cleanupTimeout(timeoutId, message.id);
    } catch (error) {
      logger.error('Socket message handling failed', { 
        error, 
        type: message.type, 
        id: message.id 
      });
      this.sendError(ws, message.id, 'Internal server error');
      this.cleanupTimeout(timeoutId, message.id);
    }
  }
  
  private setupMessageTimeout(ws: WebSocket, message: SocketMessage): NodeJS.Timeout {
    const timeoutId = setTimeout(() => {
      logger.error('Socket message timeout', { 
        type: message.type, 
        id: message.id 
      });
      this.sendError(ws, message.id, 'Request timeout');
    }, 30000);

    this.messageTimeouts.set(message.id, timeoutId);
    return timeoutId;
  }
  
  private cleanupTimeout(timeoutId: NodeJS.Timeout, messageId: string): void {
    clearTimeout(timeoutId);
    this.messageTimeouts.delete(messageId);
  }
  
  private async processMessage(ws: WebSocket, message: SocketMessage): Promise<void> {
    const handler = this.handlers.get(message.type);
    
    if (handler) {
      await handler.handle(ws, message);
    } else {
      logger.warn('Unknown message type', { type: message.type, id: message.id });
      this.sendError(ws, message.id, `Unknown message type: ${message.type}`);
    }
  }


  private sendError(ws: WebSocket, id: string, error: string): void {
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

  private async sendStatusUpdate(ws: WebSocket): Promise<void> {
    try {
      const statusData = await this.dataGenerator.generateStatusData();
      
      const statusHandler = new StatusHandler(this.dataGenerator, this.customPort, this.clients);
      statusHandler.sendResponse(ws, {
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
    
    // Set up error handler before starting server
    this.httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Socket port ${port} is already in use. Try a different port.`, { error, port });
        throw new Error(`Socket port ${port} is already in use. Please use a different port or stop the conflicting service.`);
      } else {
        logger.error('HTTP server error during socket server startup', { error, port });
        throw error;
      }
    });

    this.httpServer.listen(port, () => {
      logger.info(`Socket server started successfully on port ${port}`, {
        port,
        path: socketConfig.path,
        maxConnections: socketConfig.maxConnections,
        customPort: this.customPort,
        wsPath: `ws://localhost:${port}${socketConfig.path}`
      });
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

// Export factory function for backward compatibility
export function createSocketService(customPort?: number): SocketService {
  return SocketService.getInstance(customPort);
} 