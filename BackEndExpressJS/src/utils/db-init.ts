import DatabaseService from '../services/DatabaseService';
import logger from './logger';

const createTables = async () => {
  const pool = DatabaseService.getPool();
  if (!pool) {
    logger.error('Database pool not available');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        trade_id VARCHAR(255),
        symbol VARCHAR(10) NOT NULL,
        company_name VARCHAR(255),
        sector VARCHAR(255),
        timestamp TIMESTAMPTZ NOT NULL,
        open DOUBLE PRECISION NOT NULL,
        high DOUBLE PRECISION NOT NULL,
        low DOUBLE PRECISION NOT NULL,
        close DOUBLE PRECISION NOT NULL,
        volume BIGINT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        quantity BIGINT,
        side VARCHAR(10),
        timeframe VARCHAR(10),
        source VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS trades_symbol_timestamp_idx ON trades (symbol, timestamp DESC);
      CREATE INDEX IF NOT EXISTS trades_timeframe_idx ON trades (timeframe);
      CREATE INDEX IF NOT EXISTS trades_source_idx ON trades (source);
      CREATE UNIQUE INDEX IF NOT EXISTS trades_symbol_timestamp_timeframe_unique 
        ON trades (symbol, timestamp, timeframe) WHERE timeframe IS NOT NULL;
    `);
    logger.info('Consolidated trades table created successfully');
  } catch (error) {
    logger.error('Error creating trades table', error);
  } finally {
    client.release();
  }
};

createTables();
