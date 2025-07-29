import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, from, throwError } from 'rxjs';
import { catchError, retry, delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

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

interface AvailableData {
  timeframes: string[];
  symbols: string[];
  dataTypes: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private ws: WebSocket | null = null;
  private messageHandlers = new Map<string, (message: SocketMessage) => void>();
  private messageCounter = 0;
  private connectionStatus = new BehaviorSubject<boolean>(false);
  private realTimeData = new Subject<any>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // Start with 2 seconds
  private isReconnecting = false;

  constructor() { }

  get isConnected$(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  get realTimeData$(): Observable<any> {
    return this.realTimeData.asObservable();
  }

  private async ensureWebSocketConnection(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 Socket Service: Already connected');
      return;
    }

    if (this.isReconnecting) {
      console.log('🔌 Socket Service: Already attempting reconnection');
      // Wait for existing reconnection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('🔌 Socket Service: Reconnection successful');
            resolve();
          } else if (!this.isReconnecting) {
            console.error('🔌 Socket Service: Reconnection failed');
            reject(new Error('Connection attempt failed - backend may not be running'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    this.isReconnecting = true;
    console.log('🔌 Socket Service: Attempting to connect to backend...');

    return new Promise((resolve, reject) => {
      try {
        const socketUrl = `ws://${environment.socketConfig.host}:${environment.socketConfig.port}${environment.socketConfig.path}`;
        console.log('🔌 Socket Service: Connecting to', socketUrl);

        this.ws = new WebSocket(socketUrl);

        // Set up a connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ Socket Service: Connection timeout - backend server may not be running');
            this.ws.close();
            this.isReconnecting = false;
            reject(new Error('Connection timeout - please ensure the backend server is running on port 3001'));
          }
        }, 10000); // 10 second timeout

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('✅ Socket Service: Connected to backend successfully');
          this.connectionStatus.next(true);
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.reconnectDelay = 2000; // Reset delay
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SocketMessage = JSON.parse(event.data);
            console.log('📨 Socket Service: Received message', { type: message.type, id: message.id, dataSize: event.data.length });
            
            const handler = this.messageHandlers.get(message.id);
            if (handler) {
              this.messageHandlers.delete(message.id);
              handler(message);
            } else {
              console.warn('⚠️ Socket Service: No handler found for message', { id: message.id, type: message.type });
            }
          } catch (error) {
            console.error('❌ Socket Service: Error parsing message', error, 'Raw data:', event.data);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('❌ Socket Service: WebSocket error', error);
          this.connectionStatus.next(false);
          this.isReconnecting = false;
          reject(new Error('WebSocket connection error - please ensure the backend server is running'));
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('🔌 Socket Service: Connection closed', { code: event.code, reason: event.reason });
          this.connectionStatus.next(false);
          
          if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            this.isReconnecting = false;
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              reject(new Error('Maximum reconnection attempts reached - backend server may be down'));
            }
          }
        };

      } catch (error) {
        console.error('❌ Socket Service: Failed to create WebSocket connection', error);
        this.isReconnecting = false;
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(`🔄 Socket Service: Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);
    
    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000); // Exponential backoff, max 10s
      this.ensureWebSocketConnection();
    }, this.reconnectDelay);
  }

  private async sendMessage(message: Partial<SocketMessage>): Promise<SocketMessage> {
    try {
      console.log('📤 Socket Service: Attempting to send message', { type: message.type, symbol: message.symbol });
      await this.ensureWebSocketConnection();
    } catch (connectionError: any) {
      console.error('❌ Socket Service: Failed to establish connection', connectionError);
      throw new Error(`Backend connection failed: ${connectionError?.message || 'Unknown error'}. Please ensure the backend server is running on port 3001.`);
    }

    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageCounter}_${Date.now()}`;
      const fullMessage: SocketMessage = { id, ...message } as SocketMessage;

      console.log('📤 Socket Service: Sending message', { id, type: fullMessage.type, symbol: fullMessage.symbol });

      // Store message handler
      this.messageHandlers.set(id, (response: SocketMessage) => {
        if (response.error) {
          console.error('❌ Socket Service: Received error response', { error: response.error, id });
          reject(new Error(response.error));
        } else {
          console.log('✅ Socket Service: Received successful response', { type: response.type, id, dataSize: response.data ? JSON.stringify(response.data).length : 0 });
          resolve(response);
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const messageString = JSON.stringify(fullMessage);
          console.log('📤 Socket Service: Sending JSON message', { size: messageString.length });
          this.ws.send(messageString);
        } catch (sendError: any) {
          this.messageHandlers.delete(id);
          console.error('❌ Socket Service: Failed to send message', sendError);
          reject(new Error(`Failed to send message: ${sendError?.message || 'Unknown error'}`));
        }
      } else {
        this.messageHandlers.delete(id);
        console.error('❌ Socket Service: WebSocket not in OPEN state', { readyState: this.ws?.readyState });
        reject(new Error('WebSocket connection lost - please try again'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          console.error('⏰ Socket Service: Operation timed out', { id, type: message.type });
          reject(new Error('Socket operation timeout - backend may be unresponsive'));
        }
      }, 30000);
    });
  }

  /**
   * Downloads data from the backend via WebSocket.
   * @param fileName The name of the file to download (for compatibility).
   * @returns A promise that resolves with the JSON data.
   */
  async downloadFile(fileName: string): Promise<any> {
    try {
      console.log(`📁 Socket Service: Requesting data ${fileName}`);
      const response = await this.sendMessage({
        type: 'download',
        fileName: fileName
      });
      
      console.log(`📁 Socket Service: Downloaded data ${fileName}`, { size: JSON.stringify(response.data).length });
      return response.data;
      
    } catch (error) {
      console.error('❌ Socket download error:', error);
      throw error;
    }
  }

  /**
   * Downloads data using specific parameters instead of filename.
   * @param symbol Stock symbol (e.g., 'AAPL')
   * @param timeframe Data timeframe (e.g., '1min', '1hour', '1day')
   * @param startDate Start date in ISO format
   * @param endDate End date in ISO format
   */
  async downloadStockData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<any> {
    try {
      console.log(`📊 Socket Service: Requesting stock data`, { symbol, timeframe, startDate, endDate });
      const response = await this.sendMessage({
        type: 'download',
        symbol: symbol,
        timeframe: timeframe,
        startDate: startDate,
        endDate: endDate
      });
      
      console.log(`📊 Socket Service: Downloaded stock data`, { symbol, dataSize: JSON.stringify(response.data).length });
      return response.data;
      
    } catch (error) {
      console.error('❌ Socket stock data download error:', error);
      throw error;
    }
  }

  /**
   * Downloads a file as an Observable with retry logic.
   * @param fileName The name of the file to download.
   * @returns An Observable that emits the JSON data.
   */
  downloadFileObservable(fileName: string): Observable<any> {
    return from(this.downloadFile(fileName)).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(error => {
        console.error('❌ Socket download error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Downloads stock data as an Observable with retry logic.
   */
  downloadStockDataObservable(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<any> {
    return from(this.downloadStockData(symbol, timeframe, startDate, endDate)).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(error => {
        console.error('❌ Socket stock data download error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Lists available data types and symbols from the backend.
   * @returns A promise that resolves with available data information.
   */
  async listFiles(): Promise<string[]> {
    try {
      console.log('📋 Socket Service: Requesting available data list');
      const response = await this.sendMessage({ type: 'list' });
      
      if (response.data && response.data.symbols) {
        console.log('📋 Socket Service: Received available data', { symbolCount: response.data.symbols.length });
        return response.data.symbols;
      } else {
        console.warn('⚠️ Socket Service: Unexpected list response format', response);
        return [];
      }
    } catch (error) {
      console.error('❌ Socket list error:', error);
      throw error;
    }
  }

  /**
   * Lists available data as an Observable.
   */
  listFilesObservable(): Observable<string[]> {
    return from(this.listFiles()).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(error => {
        console.error('❌ Socket list error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Gets system status from the backend.
   * @returns A promise that resolves with status information.
   */
  async getStatus(): Promise<any> {
    try {
      console.log('📊 Socket Service: Requesting system status');
      const response = await this.sendMessage({ type: 'status' });
      
      console.log('📊 Socket Service: Received status', response.data);
      return response.data;
      
    } catch (error) {
      console.error('❌ Socket status error:', error);
      throw error;
    }
  }

  /**
   * Subscribes to real-time data for a specific symbol.
   * @param symbol The stock symbol to subscribe to.
   */
  async subscribeToSymbol(symbol: string): Promise<void> {
    try {
      console.log('🔔 Socket Service: Subscribing to symbol', { symbol });
      await this.sendMessage({
        type: 'subscribe',
        symbol: symbol
      });
      
      console.log('🔔 Socket Service: Successfully subscribed to', { symbol });
      
    } catch (error) {
      console.error('❌ Socket subscription error:', error);
      throw error;
    }
  }

  /**
   * Generates a filename from parameters for compatibility.
   */
  generateFileName(symbol: string, timeframe: string, startDate: string, endDate: string): string {
    return `${symbol}-${timeframe}-${startDate}-${endDate}.json`;
  }

  /**
   * Tests the connection to the backend.
   * @returns A promise that resolves to true if connection is successful.
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Socket Service: Testing connection');
      const response = await this.sendMessage({ type: 'test' });
      
      console.log('🧪 Socket Service: Connection test successful');
      return response.success || false;
      
    } catch (error) {
      console.error('❌ Socket connection test failed:', error);
      return false;
    }
  }

  /**
   * Disconnects from the WebSocket.
   */
  disconnect(): void {
    if (this.ws) {
      console.log('🔌 Socket Service: Disconnecting from backend');
      this.ws.close();
      this.ws = null;
      this.connectionStatus.next(false);
    }
  }
} 