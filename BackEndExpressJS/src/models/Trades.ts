/**
 * Trades Model - Comprehensive stock trading data interface
 * Consolidates Stock, PriceData, and TradeData into a single table
 * Supports OHLCV data, timestamps, volume, and individual trade records
 */
export interface Trades {
  // Primary identifiers
  id: number;
  trade_id?: string; // Optional for aggregated data
  symbol: string;
  
  // Company information (consolidated from Stock model)
  company_name?: string;
  sector?: string;
  
  // Temporal data
  timestamp: Date;
  
  // OHLCV price data (consolidated from PriceData model)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  
  // Individual trade data (consolidated from TradeData model)
  price: number; // Current/trade price
  quantity?: number; // Trade quantity
  side?: 'buy' | 'sell' | 'unknown'; // Trade side
  
  // Metadata
  timeframe?: '1min' | '5min' | '1hour' | '1day'; // Data aggregation level
  source?: 'polygon' | 'manual' | 'calculated'; // Data source
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Database column mapping for PostgreSQL
 * Using snake_case for database consistency
 */
export interface TradesDbRow {
  id: number;
  trade_id: string | null;
  symbol: string;
  company_name: string | null;
  sector: string | null;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  price: number;
  quantity: number | null;
  side: string | null;
  timeframe: string | null;
  source: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

/**
 * Input interface for creating new trade records
 */
export interface CreateTradeInput {
  trade_id?: string;
  symbol: string;
  company_name?: string;
  sector?: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  price: number;
  quantity?: number;
  side?: 'buy' | 'sell' | 'unknown';
  timeframe?: '1min' | '5min' | '1hour' | '1day';
  source?: 'polygon' | 'manual' | 'calculated';
}

/**
 * Query parameters for trades data retrieval
 */
export interface TradesQueryParams {
  symbol: string;
  timeframe: '1min' | '5min' | '1hour' | '1day';
  startDate: Date;
  endDate: Date;
  limit?: number;
  offset?: number;
}

/**
 * Aggregated trade data for API responses
 */
export interface TradesApiResponse {
  timestamp: string; // ISO 8601 format for JSON compatibility
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Type guards for trade data validation
 */
export function isValidTradeData(data: any): data is Trades {
  return (
    typeof data === 'object' &&
    typeof data.symbol === 'string' &&
    data.timestamp instanceof Date &&
    typeof data.open === 'number' &&
    typeof data.high === 'number' &&
    typeof data.low === 'number' &&
    typeof data.close === 'number' &&
    typeof data.volume === 'number' &&
    typeof data.price === 'number'
  );
}

/**
 * Transform database row to API response format
 */
export function dbRowToApiResponse(row: TradesDbRow): TradesApiResponse {
  return {
    timestamp: row.timestamp.toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume
  };
}

/**
 * Transform API input to database format
 */
export function apiInputToDbRow(input: CreateTradeInput): Partial<TradesDbRow> {
  return {
    trade_id: input.trade_id || null,
    symbol: input.symbol,
    company_name: input.company_name || null,
    sector: input.sector || null,
    timestamp: input.timestamp,
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    volume: input.volume,
    price: input.price,
    quantity: input.quantity || null,
    side: input.side || null,
    timeframe: input.timeframe || null,
    source: input.source || null,
    created_at: new Date(),
    updated_at: new Date()
  };
} 