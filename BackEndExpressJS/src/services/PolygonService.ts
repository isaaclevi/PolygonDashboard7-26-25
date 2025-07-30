import WebSocket from 'ws';
import axios from 'axios';
import { polygonConfig } from '../config/polygon';
import logger from '../utils/logger';
import DatabaseService from './DatabaseService';
import { CreateTradeInput } from '../models/Trades';

// Interfaces for Polygon.io API responses
export interface PolygonTicker {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange?: string;
  type?: string;
  active: boolean;
  currency_name?: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  market_cap?: number;
  phone_number?: string;
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  description?: string;
  sic_code?: string;
  sic_description?: string;
  ticker_root?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  round_lot?: number;
}

export interface PolygonTickersResponse {
  results?: PolygonTicker[];
  status: string;
  request_id: string;
  count?: number;
  next_url?: string;
}

// Command Pattern for different message types
interface MessageCommand {
  execute(data: any): Promise<void>;
}

class TradeCommand implements MessageCommand {
  async execute(message: any): Promise<void> {
    const tradeData: CreateTradeInput = {
      trade_id: message.i?.toString(),
      symbol: message.sym,
      timestamp: new Date(message.t),
      open: message.p,
      high: message.p,
      low: message.p,
      close: message.p,
      volume: message.s || 0,
      price: message.p,
      quantity: message.s,
      side: this.determineTradeSide(message.c),
      timeframe: undefined,
      source: 'polygon'
    };

    await DatabaseService.insertTradeData(tradeData);
    logger.debug('Trade data processed', { symbol: message.sym, price: message.p });
  }

  private determineTradeSide(conditions: number[] = []): 'buy' | 'sell' | 'unknown' {
    if (conditions.includes(1)) return 'buy';
    if (conditions.includes(2)) return 'sell';
    return 'unknown';
  }
}

class QuoteCommand implements MessageCommand {
  async execute(message: any): Promise<void> {
    const quoteData: CreateTradeInput = {
      symbol: message.sym,
      timestamp: new Date(message.t),
      open: message.bp,
      high: Math.max(message.bp, message.ap),
      low: Math.min(message.bp, message.ap),
      close: message.ap,
      volume: message.bs + message.as,
      price: (message.bp + message.ap) / 2,
      timeframe: undefined,
      source: 'polygon'
    };

    await DatabaseService.insertTradeData(quoteData);
    logger.debug('Quote data processed', { symbol: message.sym, bid: message.bp, ask: message.ap });
  }
}

class AggregateCommand implements MessageCommand {
  async execute(message: any): Promise<void> {
    const aggregateData: CreateTradeInput = {
      symbol: message.sym,
      timestamp: new Date(message.s),
      open: message.o,
      high: message.h,
      low: message.l,
      close: message.c,
      volume: message.v,
      price: message.c,
      timeframe: '1min',
      source: 'polygon'
    };

    await DatabaseService.insertTradeData(aggregateData);
    logger.debug('Aggregate minute data processed', { symbol: message.sym, close: message.c });
  }
}

class StatusCommand implements MessageCommand {
  async execute(message: any): Promise<void> {
    logger.info('Polygon.io status update', { status: message.status, message: message.message });
  }
}

// Factory Pattern for Command creation  
class CommandFactory {
  static createCommand(messageType: string): MessageCommand | null {
    switch (messageType) {
      case 'T': return new TradeCommand();
      case 'Q': return new QuoteCommand();
      case 'AM': return new AggregateCommand();
      case 'status': return new StatusCommand();
      default: return null;
    }
  }
}

// Observer Pattern for symbol tracking
interface SymbolObserver {
  onNewSymbol(symbol: string): void;
}

class TickerUpdateObserver implements SymbolObserver {
  private lastUpdate = 0;
  private readonly UPDATE_THROTTLE = 5 * 60 * 1000; // 5 minutes

  onNewSymbol(symbol: string): void {
    const now = Date.now();
    
    if (now - this.lastUpdate > this.UPDATE_THROTTLE) {
      this.lastUpdate = now;
      logger.info('Triggering ticker file regeneration due to new symbols');
      
      try {
        const DataFileGeneratorFactory = require('../generators/DataFileGenerator').default;
        const dataGenerator = DataFileGeneratorFactory.create();
        
        dataGenerator.generateTickersFile('stocks', true)
          .then(() => dataGenerator.generateTickerIndex())
          .then(() => dataGenerator.generateStatusFile())
          .then(() => {
            logger.info('Background ticker regeneration completed due to new symbols');
          })
          .catch((error: any) => {
            logger.error('Background ticker regeneration failed', { error });
          });
      } catch (error) {
        logger.error('Failed to trigger ticker regeneration', { error });
      }
    }
  }
}

// State Pattern for WebSocket connection management
abstract class ConnectionState {
  protected context: PolygonService;

  constructor(context: PolygonService) {
    this.context = context;
  }

  abstract connect(): void;
  abstract disconnect(): void;
  abstract send(message: any): void;
}

class DisconnectedState extends ConnectionState {
  connect(): void {
    logger.info('Attempting to connect to Polygon.io WebSocket');
    this.context.initializeWebSocket();
  }

  disconnect(): void {
    logger.warn('Already disconnected');
  }

  send(message: any): void {
    logger.error('Cannot send message while disconnected');
  }
}

class ConnectedState extends ConnectionState {
  connect(): void {
    logger.warn('Already connected');
  }

  disconnect(): void {
    this.context.closeWebSocket();
    this.context.setState(new DisconnectedState(this.context));
  }

  send(message: any): void {
    const ws = this.context.getWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

class ConnectingState extends ConnectionState {
  connect(): void {
    logger.warn('Connection already in progress');
  }

  disconnect(): void {
    this.context.closeWebSocket();
    this.context.setState(new DisconnectedState(this.context));
  }

  send(message: any): void {
    logger.warn('Cannot send message while connecting');
  }
}

// Singleton Pattern with improved structure
class PolygonService {
  private static instance: PolygonService;
  private ws!: WebSocket;
  private state: ConnectionState;
  private restApiBaseUrl = 'https://api.polygon.io';
  private seenSymbols = new Set<string>();
  private observers: SymbolObserver[] = [];
  private commandFactory = CommandFactory;

  private constructor() {
    this.state = new DisconnectedState(this);
    this.addObserver(new TickerUpdateObserver());
    this.connect();
  }

  public static getInstance(): PolygonService {
    if (!PolygonService.instance) {
      PolygonService.instance = new PolygonService();
    }
    return PolygonService.instance;
  }

  // Observer Pattern methods
  addObserver(observer: SymbolObserver): void {
    this.observers.push(observer);
  }

  removeObserver(observer: SymbolObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  private notifyObservers(symbol: string): void {
    this.observers.forEach(observer => observer.onNewSymbol(symbol));
  }

  // State Pattern methods
  setState(state: ConnectionState): void {
    this.state = state;
  }

  getWebSocket(): WebSocket {
    return this.ws;
  }

  closeWebSocket(): void {
    if (this.ws) {
      this.ws.close();
    }
  }

  initializeWebSocket(): void {
    this.setState(new ConnectingState(this));
    this.setupWebSocket();
  }

  private connect(): void {
    this.state.connect();
  }

  private setupWebSocket(): void {
    this.ws = new WebSocket('wss://socket.polygon.io/stocks');

    this.ws.on('open', () => {
      logger.info('Connected to Polygon.io WebSocket');
      this.setState(new ConnectedState(this));
      this.authenticate();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const messages = JSON.parse(data.toString());
      if (Array.isArray(messages)) {
        messages.forEach((message) => this.handleMessage(message));
      } else {
        this.handleMessage(messages);
      }
    });

    this.ws.on('close', () => {
      logger.info('Disconnected from Polygon.io WebSocket. Reconnecting...');
      this.setState(new DisconnectedState(this));
      setTimeout(() => this.connect(), 30000);
    });

    this.ws.on('error', (error) => {
      logger.error('Polygon.io WebSocket error', error);
      this.setState(new DisconnectedState(this));
      if (error.message && error.message.includes('Maximum number of websocket connections exceeded')) {
        logger.warn('Connection limit reached, waiting 2 minutes before reconnecting...');
        setTimeout(() => this.connect(), 120000);
      }
    });
  }

  private authenticate(): void {
    this.state.send({ action: 'auth', params: polygonConfig.apiKey });
  }

  public subscribeToTrades(symbols: string[]): void {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `T.${s}`).join(','),
    };
    
    this.state.send(message);
    logger.info(`Subscribed to trades for ${symbols.join(', ')}`);
  }

  public subscribeToQuotes(symbols: string[]): void {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `Q.${s}`).join(','),
    };
    
    this.state.send(message);
    logger.info(`Subscribed to quotes for ${symbols.join(', ')}`);
  }

  public subscribeToAggregates(symbols: string[]): void {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `AM.${s}`).join(','),
    };
    
    this.state.send(message);
    logger.info(`Subscribed to aggregates for ${symbols.join(', ')}`);
  }

  public subscribeToAllData(symbols: string[]): void {
    this.subscribeToTrades(symbols);
    this.subscribeToQuotes(symbols);
    this.subscribeToAggregates(symbols);
    logger.info(`Subscribed to all data types for ${symbols.join(', ')}`);
  }

  /**
   * Fetches all available tickers from Polygon.io REST API
   * @param market Market type filter (stocks, crypto, fx, etc.)
   * @param active Whether to only return actively traded tickers
   * @param limit Number of results per page (max 1000)
   * @returns Promise resolving to array of ticker data
   */
  public async fetchAllTickers(
    market: string = 'stocks',
    active: boolean = true,
    limit: number = 1000
  ): Promise<PolygonTicker[]> {
    try {
      const allTickers: PolygonTicker[] = [];
      let nextUrl: string | undefined;
      let isFirstRequest = true;

      do {
        const url = isFirstRequest 
          ? `${this.restApiBaseUrl}/v3/reference/tickers`
          : nextUrl;

        const params = isFirstRequest ? {
          market,
          active: active.toString(),
          limit: limit.toString(),
          apikey: polygonConfig.apiKey
        } : { apikey: polygonConfig.apiKey };

        logger.info(`Fetching tickers from: ${url}`);
        
        const response = await axios.get<PolygonTickersResponse>(url!, { params });
        
        if (response.data.status === 'OK' && response.data.results) {
          allTickers.push(...response.data.results);
          logger.info(`Fetched ${response.data.results.length} tickers. Total: ${allTickers.length}`);
        }

        nextUrl = response.data.next_url;
        isFirstRequest = false;

        // Add small delay to respect rate limits
        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } while (nextUrl && allTickers.length < 10000); // Limit to prevent excessive requests

      logger.info(`Successfully fetched ${allTickers.length} total tickers from Polygon.io`);
      return allTickers;

    } catch (error) {
      logger.error('Error fetching tickers from Polygon.io REST API', { error });
      throw error;
    }
  }

  /**
   * Fetches ticker details for a specific symbol
   * @param ticker The ticker symbol to fetch details for
   * @returns Promise resolving to ticker details
   */
  public async fetchTickerDetails(ticker: string): Promise<PolygonTicker | null> {
    try {
      const url = `${this.restApiBaseUrl}/v3/reference/tickers/${ticker}`;
      const params = {
        apikey: polygonConfig.apiKey
      };

      logger.info(`Fetching ticker details for: ${ticker}`);
      
      const response = await axios.get<{ results: PolygonTicker; status: string }>(url, { params });
      
      if (response.data.status === 'OK' && response.data.results) {
        logger.info(`Successfully fetched details for ${ticker}`);
        return response.data.results;
      }

      return null;

    } catch (error) {
      logger.error(`Error fetching ticker details for ${ticker}`, { error });
      return null;
    }
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      // Check for new symbols first
      if (message.sym) {
        await this.checkForNewSymbol(message.sym);
      }

      // Use Command Pattern to handle different message types  
      const command = this.commandFactory.createCommand(message.ev);
      if (command) {
        await command.execute(message);
      } else {
        logger.warn('Unknown message type', { eventType: message.ev });
      }
    } catch (error) {
      logger.error('Error processing Polygon.io message', { error, message });
    }
  }

  private async checkForNewSymbol(symbol: string): Promise<void> {
    if (!this.seenSymbols.has(symbol)) {
      this.seenSymbols.add(symbol);
      logger.info(`New symbol detected from Polygon WebSocket: ${symbol}`);
      
      // Notify observers about new symbol
      this.notifyObservers(symbol);
    }
  }

  public async forceTickerRegeneration(): Promise<void> {
    logger.info('Manual ticker regeneration triggered');
    try {
      const DataFileGeneratorFactory = require('../generators/DataFileGenerator').default;
      const dataGenerator = DataFileGeneratorFactory.create();
      
      await dataGenerator.generateTickersFile('stocks', true);
      await dataGenerator.generateTickerIndex();
      await dataGenerator.generateStatusFile();
      
      logger.info('Manual ticker regeneration completed');
    } catch (error) {
      logger.error('Manual ticker regeneration failed', { error });
      throw error;
    }
  }

  public getSeenSymbols(): string[] {
    return Array.from(this.seenSymbols).sort();
  }

}

export default PolygonService.getInstance();
