-- Stock Trading Dashboard Database Setup
-- Run this in PGAdmin to create the database and user

-- Create database
CREATE DATABASE stock_data;

-- Create user (if it doesn't exist)
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'postgres') THEN

      CREATE ROLE postgres LOGIN PASSWORD 'postgres';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE stock_data TO postgres;

-- Connect to the stock_data database
\c stock_data;

-- Create the consolidated trades table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS trades_symbol_timestamp_idx ON trades (symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS trades_timeframe_idx ON trades (timeframe);
CREATE INDEX IF NOT EXISTS trades_source_idx ON trades (source);
CREATE UNIQUE INDEX IF NOT EXISTS trades_symbol_timestamp_timeframe_unique 
  ON trades (symbol, timestamp, timeframe) WHERE timeframe IS NOT NULL;

-- Insert sample data for testing
INSERT INTO trades (
  symbol, timestamp, open, high, low, close, volume, price, 
  quantity, side, timeframe, source
) VALUES 
-- AAPL sample data
('AAPL', '2024-01-01 09:30:00-05', 150.00, 152.50, 149.75, 151.25, 1000000, 151.25, 1000000, 'buy', '1min', 'polygon'),
('AAPL', '2024-01-01 09:31:00-05', 151.25, 153.00, 150.50, 152.75, 950000, 152.75, 950000, 'buy', '1min', 'polygon'),
('AAPL', '2024-01-01 09:32:00-05', 152.75, 153.25, 151.00, 151.50, 1100000, 151.50, 1100000, 'sell', '1min', 'polygon'),
('AAPL', '2024-01-02 09:30:00-05', 151.50, 154.00, 151.00, 153.75, 1200000, 153.75, 1200000, 'buy', '1min', 'polygon'),
('AAPL', '2024-01-02 09:31:00-05', 153.75, 155.00, 153.25, 154.50, 1050000, 154.50, 1050000, 'buy', '1min', 'polygon'),

-- TSLA sample data  
('TSLA', '2024-01-01 09:30:00-05', 250.00, 255.00, 248.50, 253.25, 800000, 253.25, 800000, 'buy', '1hour', 'polygon'),
('TSLA', '2024-01-01 10:30:00-05', 253.25, 258.75, 252.00, 257.50, 750000, 257.50, 750000, 'buy', '1hour', 'polygon'),
('TSLA', '2024-01-02 09:30:00-05', 257.50, 262.00, 255.75, 260.25, 900000, 260.25, 900000, 'buy', '1hour', 'polygon'),

-- GOOGL sample data
('GOOGL', '2024-01-01 09:30:00-05', 2800.00, 2825.00, 2790.00, 2815.50, 500000, 2815.50, 500000, 'buy', '1min', 'polygon'),
('GOOGL', '2024-01-01 09:31:00-05', 2815.50, 2830.00, 2810.00, 2822.75, 480000, 2822.75, 480000, 'buy', '1min', 'polygon'),

-- MSFT sample data
('MSFT', '2024-01-01 09:30:00-05', 380.00, 385.50, 378.25, 383.75, 600000, 383.75, 600000, 'buy', '1min', 'polygon'),
('MSFT', '2024-01-01 09:31:00-05', 383.75, 387.00, 382.50, 385.25, 580000, 385.25, 580000, 'buy', '1min', 'polygon')

ON CONFLICT DO NOTHING;

-- Grant permissions on the table
GRANT ALL PRIVILEGES ON TABLE trades TO postgres;
GRANT USAGE, SELECT ON SEQUENCE trades_id_seq TO postgres;

-- Display summary
SELECT 
  'Database Setup Complete!' as status,
  COUNT(*) as sample_records,
  COUNT(DISTINCT symbol) as unique_symbols,
  MIN(timestamp) as earliest_date,
  MAX(timestamp) as latest_date
FROM trades; 