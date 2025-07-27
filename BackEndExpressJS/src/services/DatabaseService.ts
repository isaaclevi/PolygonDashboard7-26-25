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
  private pool: Pool;

  constructor() {
    this.pool = new Pool(dbConfig);
    this.pool.on('connect', () => {
      logger.info('Connected to the database');
    });
    this.pool.on('error', (err) => {
      logger.error('Database connection error', err);
    });
  }

  public async connect() {
    try {
      await this.pool.connect();
    } catch (error) {
      logger.error('Failed to connect to the database', error);
      process.exit(1);
    }
  }

  public getPool() {
    return this.pool;
  }

  /**
   * Insert new trade data into the consolidated trades table
   */
  public async insertTradeData(tradeInput: CreateTradeInput): Promise<void> {
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
    } catch (error) {
      logger.error('Failed to retrieve trades data', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert aggregated OHLCV data for specific timeframes
   */
  public async insertAggregatedData(data: CreateTradeInput[]): Promise<void> {
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
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT DISTINCT symbol FROM trades ORDER BY symbol');
      return result.rows.map(row => row.symbol);
    } catch (error) {
      logger.error('Failed to get available symbols', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get latest timestamp for data freshness monitoring
   */
  public async getLatestTimestamp(): Promise<Date | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT MAX(timestamp) as latest_timestamp FROM trades');
      return result.rows[0]?.latest_timestamp || null;
    } catch (error) {
      logger.error('Failed to get latest timestamp', { error });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new DatabaseService();
