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
      return;
    }

    if (this.isReconnecting) {
      // Wait for existing reconnection attempt
      return new Promise((resolve) => {
        const checkConnection = () => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            resolve();
          } else if (!this.isReconnecting) {
            resolve();
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    this.isReconnecting = true;
    console.log('🔌 Socket Service: Attempting to connect to backend...');

    try {
      const socketUrl = `ws://${environment.socketConfig.host}:${environment.socketConfig.port}${environment.socketConfig.path}`;
      console.log('🔌 Socket Service: Connecting to', socketUrl);

      this.ws = new WebSocket(socketUrl);

      this.ws.onopen = () => {
        console.log('✅ Socket Service: Connected to backend successfully');
        this.connectionStatus.next(true);
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.reconnectDelay = 2000; // Reset delay
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SocketMessage = JSON.parse(event.data);
          console.log('📨 Socket Service: Received message', { type: message.type, id: message.id });
          
          const handler = this.messageHandlers.get(message.id);
          if (handler) {
            this.messageHandlers.delete(message.id);
            handler(message);
          } else {
            console.warn('⚠️ Socket Service: No handler found for message', { id: message.id });
          }
        } catch (error) {
          console.error('❌ Socket Service: Failed to parse message', { error, data: event.data });
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 Socket Service: Connection closed', { code: event.code, reason: event.reason });
        this.connectionStatus.next(false);
        this.isReconnecting = false;
        
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Socket Service: WebSocket error', error);
        this.connectionStatus.next(false);
      };

    } catch (error) {
      console.error('❌ Socket Service: Failed to create WebSocket connection', error);
      this.isReconnecting = false;
      throw error;
    }
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
    await this.ensureWebSocketConnection();

    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageCounter}_${Date.now()}`;
      const fullMessage = { ...message, id };

      console.log('📤 Socket Service: Sending message', { type: message.type, id });

      this.messageHandlers.set(id, (response: SocketMessage) => {
        if (response.error) {
          console.error('❌ Socket Service: Received error response', { error: response.error, id });
          reject(new Error(response.error));
        } else {
          console.log('✅ Socket Service: Received successful response', { type: response.type, id });
          resolve(response);
        }
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(fullMessage));
      } else {
        this.messageHandlers.delete(id);
        reject(new Error('WebSocket not connected'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          console.error('⏰ Socket Service: Operation timed out', { id, type: message.type });
          reject(new Error('Socket operation timeout'));
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