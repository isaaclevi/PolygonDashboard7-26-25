import { Injectable } from '@angular/core';
import { Observable, Subject, from, throwError, BehaviorSubject } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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

  constructor() { }

  /**
   * Connection status observable
   */
  get isConnected$(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  /**
   * Real-time data stream observable
   */
  get realTimeData$(): Observable<any> {
    return this.realTimeData.asObservable();
  }

  /**
   * Creates WebSocket connection to data stream
   */
  private async ensureWebSocketConnection(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:3001/data-stream`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('🔗 Socket Service: Connected to data stream');
        this.connectionStatus.next(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SocketMessage = JSON.parse(event.data);
          
          // Handle real-time updates
          if (message.id === 'realtime_update') {
            this.realTimeData.next(message.data);
            return;
          }

          // Handle request-response messages
          const handler = this.messageHandlers.get(message.id);
          if (handler) {
            handler(message);
            this.messageHandlers.delete(message.id);
          }
        } catch (error) {
          console.error('Socket message parsing error:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('🚫 Socket Service: Connection error:', error);
        this.connectionStatus.next(false);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('📡 Socket Service: Connection closed');
        this.connectionStatus.next(false);
        this.ws = null;
      };
    });
  }

  /**
   * Sends a message via WebSocket and waits for response
   */
  private async sendMessage(message: Partial<SocketMessage>): Promise<SocketMessage> {
    await this.ensureWebSocketConnection();
    
    const id = `msg_${++this.messageCounter}`;
    const fullMessage: SocketMessage = { id, ...message } as SocketMessage;

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
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
      console.error('Socket download error:', error);
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
      console.error('Socket stock data download error:', error);
      throw error;
    }
  }

  /**
   * Downloads a file as an Observable.
   * @param fileName The name of the file to download.
   * @returns An Observable that emits the JSON data.
   */
  downloadFileObservable(fileName: string): Observable<any> {
    return from(this.downloadFile(fileName)).pipe(
      catchError(error => {
        console.error('Socket download error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Downloads stock data as an Observable.
   */
  downloadStockDataObservable(symbol: string, timeframe: string, startDate: string, endDate: string): Observable<any> {
    return from(this.downloadStockData(symbol, timeframe, startDate, endDate)).pipe(
      catchError(error => {
        console.error('Socket stock data download error:', error);
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
      console.log('📁 Socket Service: Requesting available data');
      const response = await this.sendMessage({
        type: 'list'
      });
      
      const availableData: AvailableData = response.data;
      
      // For compatibility with existing code, return symbols as "file names"
      const fileNames = availableData.symbols.map(symbol => `${symbol}.json`);
      
      console.log(`📁 Socket Service: Listed ${fileNames.length} symbols`);
      return fileNames;
      
    } catch (error) {
      console.error('Socket list error:', error);
      throw error;
    }
  }

  /**
   * Gets available data types and symbols.
   * @returns A promise that resolves with structured available data.
   */
  async getAvailableData(): Promise<AvailableData> {
    try {
      console.log('📊 Socket Service: Requesting available data types');
      const response = await this.sendMessage({
        type: 'list'
      });
      
      const availableData: AvailableData = response.data;
      console.log(`📊 Socket Service: Available data`, availableData);
      return availableData;
      
    } catch (error) {
      console.error('Socket available data error:', error);
      throw error;
    }
  }

  /**
   * Lists available data as an Observable.
   * @returns An Observable that emits an array of symbols.
   */
  listFilesObservable(): Observable<string[]> {
    return from(this.listFiles()).pipe(
      catchError(error => {
        console.error('Socket list error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Gets server status information.
   * @returns A promise that resolves with status data.
   */
  async getStatus(): Promise<any> {
    try {
      console.log('🔧 Socket Service: Requesting server status');
      const response = await this.sendMessage({
        type: 'status'
      });
      
      console.log('🔧 Socket Service: Server status received');
      return response.data;
      
    } catch (error) {
      console.error('Socket status error:', error);
      throw error;
    }
  }

  /**
   * Subscribes to real-time data for a specific symbol.
   * @param symbol Stock symbol to subscribe to
   */
  async subscribeToSymbol(symbol: string): Promise<void> {
    try {
      console.log(`🔔 Socket Service: Subscribing to ${symbol}`);
      await this.sendMessage({
        type: 'subscribe',
        symbol: symbol
      });
      
      console.log(`🔔 Socket Service: Subscribed to ${symbol}`);
      
    } catch (error) {
      console.error('Socket subscribe error:', error);
      throw error;
    }
  }

  /**
   * Generates a file name based on stock data parameters (for compatibility).
   * Format: SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json
   */
  generateFileName(symbol: string, timeframe: string, startDate: string, endDate: string): string {
    return `${symbol}-${timeframe}-${startDate}-${endDate}.json`;
  }

  /**
   * Tests connection and returns status
   * @returns Promise<boolean> True if connection successful
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔗 Socket Service: Testing connection');
      const response = await this.sendMessage({
        type: 'test'
      });
      
      const success = response.success || false;
      console.log(`🔗 Socket Service: Connection test ${success ? 'successful' : 'failed'}`);
      return success;
    } catch (error) {
      console.error('🚫 Socket Service: Connection test failed:', error);
      return false;
    }
  }

  /**
   * Closes WebSocket connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.messageHandlers.clear();
      this.connectionStatus.next(false);
    }
  }
} 