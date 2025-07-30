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

// Strategy Pattern for different connection strategies
abstract class ConnectionStrategy {
  abstract connect(url: string): Promise<WebSocket>;
  abstract disconnect(ws: WebSocket): void;
  abstract send(ws: WebSocket, message: any): void;
}

class WebSocketStrategy extends ConnectionStrategy {
  async connect(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      const connectionTimeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout - please ensure the backend server is running'));
      }, environment.connectionTimeout);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        resolve(ws);
      };
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        reject(new Error('WebSocket connection error - please ensure the backend server is running'));
      };
    });
  }
  
  disconnect(ws: WebSocket): void {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
  
  send(ws: WebSocket, message: any): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not in OPEN state');
    }
  }
}

// State Pattern for connection states  
abstract class ConnectionState {
  protected context: SocketService;
  
  constructor(context: SocketService) {
    this.context = context;
  }
  
  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract send(message: any): Promise<SocketMessage>;
}

class DisconnectedState extends ConnectionState {
  async connect(): Promise<void> {
    if (this.context.isReconnecting) {
      // Wait for existing reconnection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.context.state instanceof ConnectedState) {
            resolve();
          } else if (!this.context.isReconnecting) {
            reject(new Error('Connection attempt failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }
    
    this.context.isReconnecting = true;
    this.context.setState(new ConnectingState(this.context));
    
    try {
      await this.context.establishConnection();
    } catch (error) {
      this.context.isReconnecting = false;
      throw error;
    }
  }
  
  disconnect(): void {
    console.warn('⚠️ Socket Service: Already disconnected');
  }
  
  async send(message: any): Promise<SocketMessage> {
    console.log('🔄 Socket Service: Attempting to reconnect before sending message');
    try {
      await this.connect();
      // After successful connection, delegate to the connected state
      return await this.context.state.send(message);
    } catch (error) {
      throw new Error(`Cannot send message while disconnected: ${error}`);
    }
  }
}

class ConnectedState extends ConnectionState {
  async connect(): Promise<void> {
    console.warn('⚠️ Socket Service: Already connected');
  }
  
  disconnect(): void {
    this.context.closeConnection();
    this.context.setState(new DisconnectedState(this.context));
  }
  
  async send(message: any): Promise<SocketMessage> {
    return this.context.sendMessageDirect(message);
  }
}

class ConnectingState extends ConnectionState {
  async connect(): Promise<void> {
    console.warn('⚠️ Socket Service: Connection already in progress');
  }
  
  disconnect(): void {
    this.context.closeConnection();
    this.context.setState(new DisconnectedState(this.context));
  }
  
  async send(message: any): Promise<SocketMessage> {
    console.log('⏳ Socket Service: Waiting for connection to complete before sending message');
    // Wait for connection to be established, then send
    return new Promise((resolve, reject) => {
      const checkConnection = () => {
        if (this.context.state instanceof ConnectedState) {
          this.context.state.send(message).then(resolve).catch(reject);
        } else if (this.context.state instanceof DisconnectedState) {
          reject(new Error('Connection failed while waiting'));
        } else {
          // Still connecting, check again in 100ms
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });
  }
}

// Observer Pattern for message handling
interface MessageObserver {
  onMessage(message: SocketMessage): void;
}

class MessageSubject {
  private observers: MessageObserver[] = [];
  
  addObserver(observer: MessageObserver): void {
    this.observers.push(observer);
  }
  
  removeObserver(observer: MessageObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }
  
  notifyObservers(message: SocketMessage): void {
    this.observers.forEach(observer => observer.onMessage(message));
  }
}

// Command Pattern for different message types
abstract class MessageCommand {
  abstract execute(): Promise<SocketMessage>;
}

class DownloadCommand extends MessageCommand {
  constructor(
    private socketService: SocketService,
    private fileName?: string,
    private symbol?: string,
    private timeframe?: string,
    private startDate?: string,
    private endDate?: string
  ) {
    super();
  }
  
  async execute(): Promise<SocketMessage> {
    const message: Partial<SocketMessage> = {
      type: 'download',
      fileName: this.fileName,
      symbol: this.symbol,
      timeframe: this.timeframe,
      startDate: this.startDate,
      endDate: this.endDate
    };
    
    return this.socketService.executeCommand(message);
  }
}

class StatusCommand extends MessageCommand {
  constructor(private socketService: SocketService) {
    super();
  }
  
  async execute(): Promise<SocketMessage> {
    return this.socketService.executeCommand({ type: 'status' });
  }
}

class ListCommand extends MessageCommand {
  constructor(private socketService: SocketService) {
    super();
  }
  
  async execute(): Promise<SocketMessage> {
    return this.socketService.executeCommand({ type: 'list' });
  }
}

class TestCommand extends MessageCommand {
  constructor(private socketService: SocketService) {
    super();
  }
  
  async execute(): Promise<SocketMessage> {
    return this.socketService.executeCommand({ type: 'test' });
  }
}

class SubscribeCommand extends MessageCommand {
  constructor(private socketService: SocketService, private symbol: string) {
    super();
  }
  
  async execute(): Promise<SocketMessage> {
    return this.socketService.executeCommand({ type: 'subscribe', symbol: this.symbol });
  }
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
  private reconnectDelay = 2000;
  public isReconnecting = false;
  
  // Pattern implementations
  private connectionStrategy: ConnectionStrategy;
  public state: ConnectionState;
  private messageSubject: MessageSubject;

  constructor() {
    this.connectionStrategy = new WebSocketStrategy();
    this.state = new DisconnectedState(this);
    this.messageSubject = new MessageSubject();
  }
  
  // State Pattern methods
  setState(state: ConnectionState): void {
    this.state = state;
  }
  
  async establishConnection(): Promise<void> {
    try {
      const socketUrl = `ws://${environment.socketConfig.host}:${environment.socketConfig.port}${environment.socketConfig.path}`;
      console.log('🔌 Socket Service: Connecting to', socketUrl);
      
      this.ws = await this.connectionStrategy.connect(socketUrl);
      this.setupEventHandlers();
      this.setState(new ConnectedState(this));
      
      console.log('✅ Socket Service: Connected to backend successfully');
      this.connectionStatus.next(true);
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.reconnectDelay = 2000;
    } catch (error) {
      this.setState(new DisconnectedState(this));
      throw error;
    }
  }
  
  closeConnection(): void {
    if (this.ws) {
      this.connectionStrategy.disconnect(this.ws);
      this.ws = null;
      this.connectionStatus.next(false);
    }
  }
  
  private setupEventHandlers(): void {
    if (!this.ws) return;
    
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
        
        // Notify observers
        this.messageSubject.notifyObservers(message);
      } catch (error) {
        console.error('❌ Socket Service: Error parsing message', error, 'Raw data:', event.data);
      }
    };
    
    this.ws.onclose = (event) => {
      console.log('🔌 Socket Service: Connection closed', { code: event.code, reason: event.reason });
      this.connectionStatus.next(false);
      this.setState(new DisconnectedState(this));
      
      if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('❌ Socket Service: WebSocket error', error);
      this.connectionStatus.next(false);
      this.setState(new DisconnectedState(this));
    };
  }
  
  async sendMessageDirect(message: Partial<SocketMessage>): Promise<SocketMessage> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageCounter}_${Date.now()}`;
      const fullMessage: SocketMessage = { id, ...message } as SocketMessage;

      console.log('📤 Socket Service: Sending message', { id, type: fullMessage.type, symbol: fullMessage.symbol });

      this.messageHandlers.set(id, (response: SocketMessage) => {
        if (response.error) {
          console.error('❌ Socket Service: Received error response', { error: response.error, id });
          reject(new Error(response.error));
        } else {
          console.log('✅ Socket Service: Received successful response', { type: response.type, id, dataSize: response.data ? JSON.stringify(response.data).length : 0 });
          resolve(response);
        }
      });

      try {
        this.connectionStrategy.send(this.ws!, fullMessage);
      } catch (sendError: any) {
        this.messageHandlers.delete(id);
        console.error('❌ Socket Service: Failed to send message', sendError);
        reject(new Error(`Failed to send message: ${sendError?.message || 'Unknown error'}`));
      }

      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          console.error('⏰ Socket Service: Operation timed out', { id, type: message.type });
          reject(new Error('Socket operation timeout - backend may be unresponsive'));
        }
      }, environment.messageTimeout);
    });
  }
  
  // Command Pattern execution
  async executeCommand(message: Partial<SocketMessage>): Promise<SocketMessage> {
    return this.state.send(message);
  }

  get isConnected$(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  get realTimeData$(): Observable<any> {
    return this.realTimeData.asObservable();
  }

  private async ensureWebSocketConnection(): Promise<void> {
    await this.state.connect();
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
      return await this.executeCommand(message);
    } catch (connectionError: any) {
      console.error('❌ Socket Service: Failed to establish connection', connectionError);
      throw new Error(`Backend connection failed: ${connectionError?.message || 'Unknown error'}. Please ensure the backend server is running on port 3001.`);
    }
  }

  async downloadFile(fileName: string): Promise<any> {
    try {
      console.log(`📁 Socket Service: Requesting data ${fileName}`);
      const command = new DownloadCommand(this, fileName);
      const response = await command.execute();
      
      console.log(`📁 Socket Service: Downloaded data ${fileName}`, { size: JSON.stringify(response.data).length });
      return response.data;
      
    } catch (error) {
      console.error('❌ Socket download error:', error);
      throw error;
    }
  }

  async downloadStockData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<any> {
    try {
      console.log(`📊 Socket Service: Requesting stock data`, { symbol, timeframe, startDate, endDate });
      const command = new DownloadCommand(this, undefined, symbol, timeframe, startDate, endDate);
      const response = await command.execute();
      
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

  async listFiles(): Promise<string[]> {
    try {
      console.log('📋 Socket Service: Requesting available data list');
      const command = new ListCommand(this);
      const response = await command.execute();
      
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

  async getStatus(): Promise<any> {
    try {
      console.log('📊 Socket Service: Requesting system status');
      const command = new StatusCommand(this);
      const response = await command.execute();
      
      console.log('📊 Socket Service: Received status', response.data);
      return response.data;
      
    } catch (error) {
      console.error('❌ Socket status error:', error);
      throw error;
    }
  }

  async subscribeToSymbol(symbol: string): Promise<void> {
    try {
      console.log('🔔 Socket Service: Subscribing to symbol', { symbol });
      const command = new SubscribeCommand(this, symbol);
      await command.execute();
      
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

  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Socket Service: Testing connection');
      const command = new TestCommand(this);
      const response = await command.execute();
      
      console.log('🧪 Socket Service: Connection test successful');
      return response.success || false;
      
    } catch (error) {
      console.error('❌ Socket connection test failed:', error);
      return false;
    }
  }

  disconnect(): void {
    console.log('🔌 Socket Service: Disconnecting from backend');
    this.state.disconnect();
  }
  
  // Observer Pattern methods
  addMessageObserver(observer: MessageObserver): void {
    this.messageSubject.addObserver(observer);
  }
  
  removeMessageObserver(observer: MessageObserver): void {
    this.messageSubject.removeObserver(observer);
  }
} 