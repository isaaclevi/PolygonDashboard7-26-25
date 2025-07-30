import { Pool, PoolClient } from 'pg';
import { dbConfig } from '../config/database';
import logger from '../utils/logger';
import { 
  CreateTradeInput, 
  TradesQueryParams, 
  TradesDbRow, 
  TradesApiResponse,
  apiInputToDbRow,
  dbRowToApiResponse
} from '../models/Trades';

// Strategy Pattern for Database Connection
interface DatabaseStrategy {
  connect(): Promise<void>;
  insertTradeData(tradeInput: CreateTradeInput): Promise<void>;
  getTradesData(params: TradesQueryParams): Promise<TradesApiResponse[]>;
  insertAggregatedData(data: CreateTradeInput[]): Promise<void>;
  getAvailableSymbols(): Promise<string[]>;
  getLatestTimestamp(): Promise<Date | null>;
  isConnected(): boolean;
}

// Real Database Strategy
class PostgreSQLStrategy implements DatabaseStrategy {
  private readonly pool: Pool;
  private connectionStatus: boolean = false;

  constructor(config: any) {
    this.pool = new Pool(config);
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.pool.on('connect', () => {
      logger.info('Connected to the database');
      this.connectionStatus = true;
    });
    
    this.pool.on('error', (err) => {
      logger.error('Database connection error', err);
      this.connectionStatus = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.connect();
      this.connectionStatus = true;
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to the database', { error });
      this.connectionStatus = false;
      logger.warn('Continuing with degraded database functionality');
    }
  }

  isConnected(): boolean {
    return this.connectionStatus;
  }

  async insertTradeData(tradeInput: CreateTradeInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      const dbRow = apiInputToDbRow(tradeInput);
      
      await client.query(`
        INSERT INTO trades (
          trade_id, symbol, company_name, sector, timestamp,
          open, high, low, close, volume, price, quantity,
          side, timeframe, source, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        dbRow.trade_id, dbRow.symbol, dbRow.company_name, dbRow.sector,
        dbRow.timestamp, dbRow.open, dbRow.high, dbRow.low, dbRow.close,
        dbRow.volume, dbRow.price, dbRow.quantity, dbRow.side,
        dbRow.timeframe, dbRow.source, dbRow.created_at, dbRow.updated_at
      ]);

      logger.info('Trade data inserted successfully', { symbol: tradeInput.symbol, timestamp: tradeInput.timestamp });
    } catch (error) {
      logger.error('Failed to insert trade data', { error, tradeInput });
      throw error;
    } finally {
      client.release();
    }
  }

  async getTradesData(params: TradesQueryParams): Promise<TradesApiResponse[]> {
    if (!this.connectionStatus) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      try {
        const query = `
          SELECT timestamp, open, high, low, close, volume
          FROM trades 
          WHERE symbol = $1 
            AND timestamp >= $2 
            AND timestamp <= $3
            AND ($4::varchar IS NULL OR timeframe = $4)
          ORDER BY timestamp ASC
          ${params.limit ? `LIMIT $5` : ''}
          ${params.offset ? `OFFSET $${params.limit ? '6' : '5'}` : ''}
        `;

        const queryParams = [
          params.symbol,
          params.startDate,
          params.endDate,
          params.timeframe
        ];

        if (params.limit) queryParams.push(params.limit.toString());
        if (params.offset) queryParams.push(params.offset.toString());

        const result = await client.query(query, queryParams);
        
        const tradesData = result.rows.map((row: TradesDbRow) => dbRowToApiResponse(row));
        
        logger.info('Trades data retrieved successfully', { 
          symbol: params.symbol, 
          timeframe: params.timeframe,
          recordCount: tradesData.length 
        });

        return tradesData;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to retrieve trades data', { error, params });
      throw error;
    }
  }

  async insertAggregatedData(data: CreateTradeInput[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const tradeData of data) {
        await this.insertTradeData(tradeData);
      }

      await client.query('COMMIT');
      logger.info('Aggregated data inserted successfully', { recordCount: data.length });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to insert aggregated data', { error, recordCount: data.length });
      throw error;
    } finally {
      client.release();
    }
  }

  async getAvailableSymbols(): Promise<string[]> {
    if (!this.connectionStatus) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT DISTINCT symbol FROM trades ORDER BY symbol');
        return result.rows.map(row => row.symbol);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get available symbols', { error });
      throw error;
    }
  }

  async getLatestTimestamp(): Promise<Date | null> {
    if (!this.connectionStatus) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT MAX(timestamp) as latest_timestamp FROM trades');
        return result.rows[0]?.latest_timestamp || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get latest timestamp', { error });
      throw error;
    }
  }

  getPool(): Pool {
    return this.pool;
  }
}

// Mock Database Strategy  
class MockStrategy implements DatabaseStrategy {
  private mockData: CreateTradeInput[] = [];
  private readonly symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX'];

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    const baseDate = new Date();
    
    this.symbols.forEach((symbol, symbolIndex) => {
      const basePrice = 150 + symbolIndex * 50;
      
      for (let i = 0; i < 100; i++) {
        const timestamp = new Date(baseDate.getTime() - (100 - i) * 60 * 1000);
        const priceVariation = (Math.random() - 0.5) * 10;
        const open = basePrice + priceVariation;
        const close = open + (Math.random() - 0.5) * 4;
        const high = Math.max(open, close) + Math.random() * 2;
        const low = Math.min(open, close) - Math.random() * 2;
        const volume = Math.floor(Math.random() * 1000000) + 100000;
        
        this.mockData.push({
          symbol,
          timestamp: timestamp,
          open,
          high,
          low,
          close,
          volume,
          price: close,
          timeframe: '1min',
          source: 'manual'
        });
      }
    });
    
    logger.info(`Mock data initialized with ${this.mockData.length} data points for ${this.symbols.length} symbols`);
  }

  async connect(): Promise<void> {
    logger.info('Mock database connection established');
  }

  isConnected(): boolean {
    return true;
  }

  async insertTradeData(tradeInput: CreateTradeInput): Promise<void> {
    this.mockData.push(tradeInput);
    logger.info('MOCK: Trade data would be inserted', { 
      symbol: tradeInput.symbol, 
      timestamp: tradeInput.timestamp,
      price: tradeInput.price,
      volume: tradeInput.volume
    });
  }

  async getTradesData(params: TradesQueryParams): Promise<TradesApiResponse[]> {
    logger.info('MOCK: Would retrieve trades data', { params });
    
    const existingData = this.mockData.filter(trade => trade.symbol === params.symbol);
    
    if (existingData.length === 0) {
      return this.generateMockData(params);
    }
    
    return existingData
      .slice(0, params.limit || 100)
      .map(trade => ({
        timestamp: trade.timestamp.toISOString(),
        open: trade.open || trade.price,
        high: trade.high || trade.price,
        low: trade.low || trade.price,
        close: trade.close || trade.price,
        volume: trade.volume || 0
      }));
  }

  private generateMockData(params: TradesQueryParams): TradesApiResponse[] {
    logger.info('MOCK: Generating data for new symbol', { symbol: params.symbol });
    const baseDate = new Date();
    const basePrice = 100 + Math.random() * 200;
    
    const generatedData: TradesApiResponse[] = [];
    
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(baseDate.getTime() - (50 - i) * 60 * 1000);
      const priceVariation = (Math.random() - 0.5) * 10;
      const open = basePrice + priceVariation;
      const close = open + (Math.random() - 0.5) * 4;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      
      generatedData.push({
        timestamp: timestamp.toISOString(),
        open,
        high,
        low,
        close,
        volume
      });
    }
    
    return generatedData.slice(0, params.limit || 100);
  }

  async insertAggregatedData(data: CreateTradeInput[]): Promise<void> {
    this.mockData.push(...data);
    logger.info('MOCK: Aggregated data would be inserted', { recordCount: data.length });
  }

  async getAvailableSymbols(): Promise<string[]> {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX', 'VXX', 'UVXY', 'UVIX', 'VIXY', 'TVIX', 'SPXS', 'SPXU', 'SQQQ'];
    logger.info('MOCK: Available symbols', { symbols });
    return symbols;
  }

  async getLatestTimestamp(): Promise<Date | null> {
    if (this.mockData.length === 0) return null;
    const latest = this.mockData.reduce((latest, trade) => 
      new Date(trade.timestamp) > new Date(latest.timestamp) ? trade : latest
    );
    return new Date(latest.timestamp);
  }
}

// Singleton Pattern with Strategy Pattern
class DatabaseService {
  private static instance: DatabaseService;
  private strategy: DatabaseStrategy;
  private readonly mockMode: boolean = false;

  private constructor() {
    this.strategy = this.mockMode 
      ? new MockStrategy() 
      : new PostgreSQLStrategy(dbConfig);
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Facade Pattern - Simple interface for complex operations
  public async initialize(): Promise<void> {
    try {
      await this.strategy.connect();
    } catch (error) {
      logger.error('Failed to initialize database service', { error });
      // Switch to mock strategy on failure
      if (!(this.strategy instanceof MockStrategy)) {
        logger.info('Switching to mock database strategy');
        this.strategy = new MockStrategy();
        await this.strategy.connect();
      }
    }
  }

  // Delegate methods to strategy
  public async connect(): Promise<void> {
    return this.strategy.connect();
  }

  public isDatabaseConnected(): boolean {
    return this.strategy.isConnected();
  }

  public async insertTradeData(tradeInput: CreateTradeInput): Promise<void> {
    try {
      return await this.strategy.insertTradeData(tradeInput);
    } catch (error) {
      return this.handleFallback('insertTradeData', async () => {
        await this.switchToMockStrategy();
        return await this.strategy.insertTradeData(tradeInput);
      });
    }
  }

  public async getTradesData(params: TradesQueryParams): Promise<TradesApiResponse[]> {
    try {
      return await this.strategy.getTradesData(params);
    } catch (error) {
      return this.handleFallback('getTradesData', async () => {
        await this.switchToMockStrategy();
        return await this.strategy.getTradesData(params);
      });
    }
  }

  public async insertAggregatedData(data: CreateTradeInput[]): Promise<void> {
    try {
      return await this.strategy.insertAggregatedData(data);
    } catch (error) {
      return this.handleFallback('insertAggregatedData', async () => {
        await this.switchToMockStrategy();
        return await this.strategy.insertAggregatedData(data);
      });
    }
  }

  public async getAvailableSymbols(): Promise<string[]> {
    try {
      return await this.strategy.getAvailableSymbols();
    } catch (error) {
      return this.handleFallback('getAvailableSymbols', async () => {
        await this.switchToMockStrategy();
        return await this.strategy.getAvailableSymbols();
      });
    }
  }

  public async getLatestTimestamp(): Promise<Date | null> {
    try {
      return await this.strategy.getLatestTimestamp();
    } catch (error) {
      return this.handleFallback('getLatestTimestamp', async () => {
        await this.switchToMockStrategy();
        return await this.strategy.getLatestTimestamp();
      });
    }
  }

  // Template Method Pattern for error handling
  private async handleFallback<T>(operation: string, fallbackFn: () => Promise<T>): Promise<T> {
    logger.warn(`Database operation '${operation}' failed, switching to fallback`);
    return await fallbackFn();
  }

  private async switchToMockStrategy(): Promise<void> {
    if (!(this.strategy instanceof MockStrategy)) {
      logger.info('Switching to mock database strategy due to error');
      this.strategy = new MockStrategy();
      await this.strategy.connect();
    }
  }

  public getPool(): Pool | null {
    if (this.strategy instanceof PostgreSQLStrategy) {
      return (this.strategy as any).getPool();
    }
    return null;
  }

}

export default DatabaseService.getInstance();
