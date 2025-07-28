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
}

/**
 * SocketService - Primary and ONLY communication channel with frontend dashboard
 * Serves JSON data directly over WebSocket without file system intermediary
 * Supports real-time data streaming and on-demand data generation
 */
class SocketService {
  private wss: WebSocketServer;
  private httpServer: Server;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private dataGenerator: any;

  constructor() {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/data-stream'
    });
    this.dataGenerator = DataFileGeneratorFactory.create();
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Socket client connected');
      
      // Initialize client connection
      this.clients.set(ws, {
        ws,
        authenticated: false,
        subscriptions: new Set()
      });

      ws.on('message', async (data) => {
        try {
          const message: SocketMessage = JSON.parse(data.toString());
          await this.handleSocketMessage(ws, message);
        } catch (error) {
          logger.error('Socket message handling error', { error });
          this.sendError(ws, 'unknown', 'Invalid message format');
        }
      });

      ws.on('close', () => {
        logger.info('Socket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('Socket client error', { error });
        this.clients.delete(ws);
      });

      // Send initial status after connection
      this.sendStatusUpdate(ws);
    });
  }

  private async handleSocketMessage(ws: WebSocket, message: SocketMessage) {
    try {
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
          this.sendError(ws, message.id, `Unknown operation type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Socket operation error', { type: message.type, error });
      this.sendError(ws, message.id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleDownload(ws: WebSocket, message: SocketMessage) {
    try {
      let jsonData: any;

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
        this.sendError(ws, message.id, 'Either fileName or (symbol, timeframe, startDate, endDate) required');
        return;
      }

      this.sendResponse(ws, {
        id: message.id,
        type: 'download',
        data: jsonData
      });

      logger.info('Socket data served', { 
        fileName: message.fileName, 
        symbol: message.symbol,
        dataSize: JSON.stringify(jsonData).length 
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

      logger.info('Socket data types listed', { symbolCount: availableData.symbols.length });

    } catch (error) {
      logger.error('Socket list error', { error });
      this.sendError(ws, message.id, 'Failed to list available data');
    }
  }

  private async handleStatus(ws: WebSocket, message: SocketMessage) {
    try {
      const statusData = await this.dataGenerator.generateStatusData();
      
      this.sendResponse(ws, {
        id: message.id,
        type: 'status',
        data: statusData
      });

      logger.info('Socket status served');

    } catch (error) {
      logger.error('Socket status error', { error });
      this.sendError(ws, message.id, 'Failed to get status');
    }
  }

  private async handleSubscribe(ws: WebSocket, message: SocketMessage) {
    try {
      const client = this.clients.get(ws);
      if (!client) {
        this.sendError(ws, message.id, 'Client not found');
        return;
      }

      if (message.symbol) {
        client.subscriptions.add(message.symbol);
        logger.info('Client subscribed to symbol', { symbol: message.symbol });
      }

      this.sendResponse(ws, {
        id: message.id,
        type: 'subscribe',
        success: true,
        data: { subscriptions: Array.from(client.subscriptions) }
      });

    } catch (error) {
      logger.error('Socket subscribe error', { error });
      this.sendError(ws, message.id, 'Failed to subscribe');
    }
  }

  private async handleTest(ws: WebSocket, message: SocketMessage) {
    this.sendResponse(ws, {
      id: message.id,
      type: 'test',
      success: true,
      data: { 
        connected: true, 
        timestamp: new Date().toISOString(),
        server: 'Socket Service v1.0'
      }
    });
  }

  private async generateFileData(fileName: string): Promise<any> {
    // Parse filename if it follows the old convention: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
    if (fileName.includes('-') && fileName.endsWith('.json') && fileName !== 'status.json') {
      const nameParts = fileName.replace('.json', '').split('-');
      
      if (nameParts.length !== 4) {
        throw new Error('Invalid filename format. Expected: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json');
      }

      const [symbol, timeframe, startDate, endDate] = nameParts;
      
      return await this.dataGenerator.generateTradesData({
        symbol: symbol.toUpperCase(),
        timeframe: timeframe as '1min' | '5min' | '1hour' | '1day',
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString()
      });
    } else if (fileName === 'status.json') {
      return await this.dataGenerator.generateStatusData();
    } else if (fileName === 'tickers.json') {
      return await this.dataGenerator.generateTickersData();
    } else {
      throw new Error(`Unknown file type: ${fileName}`);
    }
  }

  private async getAvailableSymbols(): Promise<string[]> {
    try {
      const tickersData = await this.dataGenerator.generateTickersData();
      return tickersData.results?.map((ticker: any) => ticker.ticker) || [];
    } catch (error) {
      logger.error('Failed to get available symbols', { error });
      return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN']; // Fallback symbols
    }
  }

  private sendResponse(ws: WebSocket, message: Partial<SocketMessage>) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, id: string, error: string) {
    this.sendResponse(ws, {
      id,
      error,
      success: false
    });
  }

  private async sendStatusUpdate(ws: WebSocket) {
    try {
      const statusData = await this.dataGenerator.generateStatusData();
      this.sendResponse(ws, {
        id: 'status_update',
        type: 'status',
        data: statusData
      });
    } catch (error) {
      logger.error('Failed to send status update', { error });
    }
  }

  /**
   * Broadcast real-time data to subscribed clients
   */
  public broadcastRealTimeData(symbol: string, data: any) {
    this.clients.forEach((client, ws) => {
      if (client.subscriptions.has(symbol)) {
        this.sendResponse(ws, {
          id: 'realtime_update',
          type: 'subscribe',
          data: {
            symbol,
            ...data,
            timestamp: new Date().toISOString()
          }
        });
      }
    });
  }

  /**
   * Start the socket service
   */
  public start(): void {
    this.httpServer.listen(socketConfig.port, () => {
      logger.info(`Socket Service started on port ${socketConfig.port}`);
      logger.info('Frontend can access data via WebSocket at /data-stream');
    });
  }

  /**
   * Stop the socket service
   */
  public stop(): void {
    this.wss.close();
    this.httpServer.close();
    this.clients.clear();
    logger.info('Socket Service stopped');
  }
}

export default new SocketService(); 