#!/bin/bash

# Stock Trading Dashboard - Backend Startup Script
# This script starts the backend server with proper environment setup

echo "🚀 Starting Stock Trading Dashboard Backend..."
echo "=============================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed. Please install npm first."
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the BackEndExpressJS directory."
    exit 1
fi

# Check if .env file exists, if not create from example
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from env.example..."
    if [ -f "../env.example" ]; then
        cp ../env.example .env
        echo "✅ Created .env file from env.example"
        echo "⚠️  Please edit .env file with your actual configuration values"
    else
        echo "❌ Error: env.example not found. Please create a .env file manually."
        exit 1
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
fi

# Check if TypeScript is compiled
if [ ! -d "dist" ]; then
    echo "🔨 Compiling TypeScript..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to compile TypeScript"
        exit 1
    fi
    echo "✅ TypeScript compiled successfully"
fi

# Check if database is accessible (optional)
echo "🔍 Checking database connection..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stock_data'
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('⚠️  Database connection failed (running in mock mode):', err.message);
    console.log('ℹ️  Backend will run with mock data');
  } else {
    console.log('✅ Database connection successful');
  }
  pool.end();
});
"

echo ""
echo "🎯 Starting backend server..."
echo "📊 Socket server will be available at: ws://localhost:3001/data-stream"
echo "🌐 Health check will be available at: http://localhost:3002/health"
echo ""

# Start the development server
npm run dev 