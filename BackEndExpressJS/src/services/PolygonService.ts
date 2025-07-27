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

class PolygonService {
  private ws!: WebSocket;
  private restApiBaseUrl = 'https://api.polygon.io';

  constructor() {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket('wss://socket.polygon.io/stocks');

    this.ws.on('open', () => {
      logger.info('Connected to Polygon.io WebSocket');
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
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      logger.error('Polygon.io WebSocket error', error);
    });
  }

  private authenticate() {
    this.ws.send(JSON.stringify({ action: 'auth', params: polygonConfig.apiKey }));
  }

  public subscribeToTrades(symbols: string[]) {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `T.${s}`).join(','),
    };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      logger.info(`Subscribed to trades for ${symbols.join(', ')}`);
    } else {
      this.ws.once('open', () => {
        this.ws.send(JSON.stringify(message));
        logger.info(`Subscribed to trades for ${symbols.join(', ')}`);
      });
    }
  }

  public subscribeToQuotes(symbols: string[]) {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `Q.${s}`).join(','),
    };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      logger.info(`Subscribed to quotes for ${symbols.join(', ')}`);
    } else {
      this.ws.once('open', () => {
        this.ws.send(JSON.stringify(message));
        logger.info(`Subscribed to quotes for ${symbols.join(', ')}`);
      });
    }
  }

  public subscribeToAggregates(symbols: string[]) {
    const message = {
      action: 'subscribe',
      params: symbols.map((s) => `AM.${s}`).join(','),
    };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      logger.info(`Subscribed to aggregates for ${symbols.join(', ')}`);
    } else {
      this.ws.once('open', () => {
        this.ws.send(JSON.stringify(message));
        logger.info(`Subscribed to aggregates for ${symbols.join(', ')}`);
      });
    }
  }

  /**
   * Subscribe to all data types for given symbols
   */
  public subscribeToAllData(symbols: string[]) {
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

  private async handleMessage(message: any) {
    try {
      if (message.ev === 'T') {
        // Trade data - store as individual trade record
        const tradeData: CreateTradeInput = {
          trade_id: message.i?.toString(),
          symbol: message.sym,
          timestamp: new Date(message.t),
          open: message.p, // Use trade price as OHLC values for individual trades
          high: message.p,
          low: message.p,
          close: message.p,
          volume: message.s || 0,
          price: message.p,
          quantity: message.s,
          side: this.determineTradeSide(message.c),
          timeframe: undefined, // Individual trades don't have timeframe
          source: 'polygon'
        };

        await DatabaseService.insertTradeData(tradeData);
        logger.debug('Trade data processed', { symbol: message.sym, price: message.p });

      } else if (message.ev === 'Q') {
        // Quote data - store as current market data
        const quoteData: CreateTradeInput = {
          symbol: message.sym,
          timestamp: new Date(message.t),
          open: message.bp, // Use bid price as baseline
          high: Math.max(message.bp, message.ap),
          low: Math.min(message.bp, message.ap),
          close: message.ap, // Use ask price as close
          volume: message.bs + message.as, // Total bid + ask size
          price: (message.bp + message.ap) / 2, // Mid-market price
          timeframe: undefined, // Live quotes don't have timeframe
          source: 'polygon'
        };

        await DatabaseService.insertTradeData(quoteData);
        logger.debug('Quote data processed', { symbol: message.sym, bid: message.bp, ask: message.ap });

      } else if (message.ev === 'AM') {
        // Aggregate Minute data - store with timeframe
        const aggregateData: CreateTradeInput = {
          symbol: message.sym,
          timestamp: new Date(message.s), // Start time of the minute
          open: message.o,
          high: message.h,
          low: message.l,
          close: message.c,
          volume: message.v,
          price: message.c, // Close price as current price
          timeframe: '1min',
          source: 'polygon'
        };

        await DatabaseService.insertTradeData(aggregateData);
        logger.debug('Aggregate minute data processed', { symbol: message.sym, close: message.c });

      } else if (message.ev === 'status') {
        logger.info('Polygon.io status update', { status: message.status, message: message.message });
      }
    } catch (error) {
      logger.error('Error processing Polygon.io message', { error, message });
    }
  }

  /**
   * Determine trade side from Polygon.io conditions array
   */
  private determineTradeSide(conditions: number[] = []): 'buy' | 'sell' | 'unknown' {
    // Polygon.io trade conditions - simplified logic
    // Condition 1 typically indicates buy, others may indicate sell or unknown
    if (conditions.includes(1)) return 'buy';
    if (conditions.includes(2)) return 'sell';
    return 'unknown';
  }
}

export default new PolygonService();
