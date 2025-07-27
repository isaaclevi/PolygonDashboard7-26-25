#!/bin/bash

# Create logs directory
mkdir -p /app/logs

# Create FTP data directory if it doesn't exist
mkdir -p /app/ftp_data

# Set proper permissions
chmod 755 /app/ftp_data
chmod 755 /app/logs

# Initialize database schema if needed (optional, can be run separately)
echo "🗄️ Checking database connection..."
if [ ! -z "$DB_HOST" ]; then
  echo "Database configuration found, initializing..."
  node dist/utils/db-init.js || echo "⚠️ Database initialization skipped or failed"
fi

# Generate initial ticker data if API key is available
echo "📊 Generating initial ticker data..."
if [ ! -z "$POLYGON_API_KEY" ]; then
  echo "Polygon.io API key found, generating ticker data..."
else
  echo "⚠️ No Polygon.io API key found, using fallback data"
fi

# Start the backend with PM2
echo "🚀 Starting stock trading dashboard..."
pm2-runtime start ecosystem.config.js --env production

# Keep container running
tail -f /dev/null 