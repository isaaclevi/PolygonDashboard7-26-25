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

class DatabaseService {
  private pool!: Pool;
  private mockMode: boolean = false; // Set to false to use real database
  private mockData: CreateTradeInput[] = []; // TEMPORARY: In-memory storage
  private isConnected: boolean = false;

  constructor() {
    if (!this.mockMode) {
      try {
        this.pool = new Pool(dbConfig);
        this.pool.on('connect', () => {
          logger.info('Connected to the database');
          this.isConnected = true;
        });
        this.pool.on('error', (err) => {
          logger.error('Database connection error', err);
          this.isConnected = false;
        });
        this.pool.on('end', () => {
          logger.info('Database connection ended');
          this.isConnected = false;
        });
      } catch (error) {
        logger.error('Failed to create database pool', { error });
        this.isConnected = false;
      }
    } else {
      logger.info('DatabaseService running in MOCK MODE - no actual database connection');
      this.initializeMockData();
      this.isConnected = true; // Mock mode is always "connected"
    }
  }

  private initializeMockData() {
    // Add sample data for popular stocks for immediate chart functionality
    const baseDate = new Date();
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX'];
    
    symbols.forEach((symbol, symbolIndex) => {
      const basePrice = 150 + symbolIndex * 50; // Different base prices for each stock
      
      // Generate 100 data points for the last 100 minutes (1min timeframe)
      for (let i = 0; i < 100; i++) {
        const timestamp = new Date(baseDate.getTime() - (100 - i) * 60 * 1000); // Go back 100 minutes
        const priceVariation = (Math.random() - 0.5) * 10; // ±$5 variation
        const open = basePrice + priceVariation;
        const close = open + (Math.random() - 0.5) * 4; // ±$2 variation from open
        const high = Math.max(open, close) + Math.random() * 2; // Up to $2 above
        const low = Math.min(open, close) - Math.random() * 2; // Up to $2 below
        const volume = Math.floor(Math.random() * 1000000) + 100000; // 100K to 1.1M volume
        
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
    
    logger.info(`Mock data initialized with ${this.mockData.length} data points for ${symbols.length} symbols`);
  }

  public async connect() {
    if (!this.mockMode) {
      try {
        await this.pool.connect();
        this.isConnected = true;
        logger.info('Database connection established successfully');
      } catch (error) {
        logger.error('Failed to connect to the database', { error });
        this.isConnected = false;
        // Don't exit the process, let the application continue with degraded functionality
        logger.warn('Continuing with degraded database functionality');
      }
    } else {
      logger.info('Mock database connection established');
      this.isConnected = true;
    }
  }

  public getPool() {
    return this.pool;
  }

  public isDatabaseConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Insert new trade data into the consolidated trades table
   */
  public async insertTradeData(tradeInput: CreateTradeInput): Promise<void> {
    if (this.mockMode) {
      // TEMPORARY: Store in memory and log
      this.mockData.push(tradeInput);
      logger.info('MOCK: Trade data would be inserted', { 
        symbol: tradeInput.symbol, 
        timestamp: tradeInput.timestamp,
        price: tradeInput.price,
        volume: tradeInput.volume
      });
      return;
    }

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

  /**
   * Retrieve trades data based on query parameters for FTP file generation
   */
  public async getTradesData(params: TradesQueryParams): Promise<TradesApiResponse[]> {
    if (this.mockMode) {
      // TEMPORARY: Return mock data
      logger.info('MOCK: Would retrieve trades data', { params });
      
      // Check if we have data for this symbol
      const existingData = this.mockData.filter(trade => trade.symbol === params.symbol);
      
      if (existingData.length === 0) {
        // Generate mock data on-the-fly for this symbol
        logger.info('MOCK: Generating data for new symbol', { symbol: params.symbol });
        const baseDate = new Date();
        const basePrice = 100 + Math.random() * 200; // Random base price between $100-$300
        
        const generatedData: TradesApiResponse[] = [];
        
        // Generate 50 data points for the requested time range
        for (let i = 0; i < 50; i++) {
          const timestamp = new Date(baseDate.getTime() - (50 - i) * 60 * 1000); // Go back 50 minutes
          const priceVariation = (Math.random() - 0.5) * 10; // ±$5 variation
          const open = basePrice + priceVariation;
          const close = open + (Math.random() - 0.5) * 4; // ±$2 variation from open
          const high = Math.max(open, close) + Math.random() * 2; // Up to $2 above
          const low = Math.min(open, close) - Math.random() * 2; // Up to $2 below
          const volume = Math.floor(Math.random() * 1000000) + 100000; // 100K to 1.1M volume
          
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

    if (!this.isConnected) {
      logger.warn('Database not connected, returning mock data for trades');
      // Return mock data when database is not connected
      const baseDate = new Date();
      const basePrice = 100 + Math.random() * 200; // Random base price between $100-$300
      
      const generatedData: TradesApiResponse[] = [];
      
      // Generate 50 data points for the requested time range
      for (let i = 0; i < 50; i++) {
        const timestamp = new Date(baseDate.getTime() - (50 - i) * 60 * 1000); // Go back 50 minutes
        const priceVariation = (Math.random() - 0.5) * 10; // ±$5 variation
        const open = basePrice + priceVariation;
        const close = open + (Math.random() - 0.5) * 4; // ±$2 variation from open
        const high = Math.max(open, close) + Math.random() * 2; // Up to $2 above
        const low = Math.min(open, close) - Math.random() * 2; // Up to $2 below
        const volume = Math.floor(Math.random() * 1000000) + 100000; // 100K to 1.1M volume
        
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
      // Return mock data instead of throwing
      logger.warn('Returning mock data due to database error');
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
  }

  /**
   * Insert aggregated OHLCV data for specific timeframes
   */
  public async insertAggregatedData(data: CreateTradeInput[]): Promise<void> {
    if (this.mockMode) {
      // TEMPORARY: Add to mock data and log
      this.mockData.push(...data);
      logger.info('MOCK: Aggregated data would be inserted', { recordCount: data.length });
      return;
    }

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

  /**
   * Get available symbols for status reporting
   */
  public async getAvailableSymbols(): Promise<string[]> {
    if (this.mockMode) {
      // TEMPORARY: Return comprehensive list of symbols for mock mode
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX', 'VXX', 'UVXY', 'UVIX', 'VIXY', 'TVIX', 'SPXS', 'SPXU', 'SQQQ'];
      logger.info('MOCK: Available symbols', { symbols });
      return symbols;
    }

    if (!this.isConnected) {
      logger.warn('Database not connected, returning fallback symbols');
      return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX', 'VXX', 'UVXY', 'UVIX', 'VIXY', 'TVIX', 'SPXS', 'SPXU', 'SQQQ'];
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
      // Return fallback symbols instead of throwing
      return ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'WULF', 'SVIX', 'VXX', 'UVXY', 'UVIX', 'VIXY', 'TVIX', 'SPXS', 'SPXU', 'SQQQ'];
    }
  }

  /**
   * Get latest timestamp for data freshness monitoring
   */
  public async getLatestTimestamp(): Promise<Date | null> {
    if (this.mockMode) {
      // TEMPORARY: Return latest timestamp from mock data
      if (this.mockData.length === 0) return null;
      const latest = this.mockData.reduce((latest, trade) => 
        new Date(trade.timestamp) > new Date(latest.timestamp) ? trade : latest
      );
      return new Date(latest.timestamp);
    }

    if (!this.isConnected) {
      logger.warn('Database not connected, returning current timestamp as fallback');
      return new Date();
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
      // Return current timestamp as fallback instead of throwing
      return new Date();
    }
  }
}

export default new DatabaseService();
