# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack real-time stock trading dashboard with two independent applications:

- **Backend (BackEndExpressJS/)**: Node.js/Express/TypeScript server with WebSocket-based data streaming
- **Frontend (FrontEndAngular/)**: Angular 20+ TypeScript application with Chart.js visualization

### Architecture Independence
- **No Direct Dependencies**: Frontend and backend are completely independent applications
- **Socket-Only Communication**: All data exchange via JSON messages through WebSocket protocol  
- **Separate Deployment**: Each application can be deployed and scaled independently
- **Different Tech Stacks**: Backend (Node.js/Express) and Frontend (Angular) with no shared code

## Common Development Commands

### Backend (BackEndExpressJS/)
```bash
# Development
npm run dev                  # Start development server with hot reload
npm run loadbalancer        # Start load balancer in development mode
npm run backend:dev         # Start single backend instance on port 3001
npm run backend:dev:2       # Start second backend instance on port 3002
npm run backend:dev:3       # Start third backend instance on port 3003

# Database
npm run db:init             # Initialize database schema and indexes

# Production
npm run build               # Compile TypeScript to JavaScript
npm start                   # Start production server
npm run loadbalancer:start  # Start production load balancer

# Testing
npm test                    # Run test suite
```

### Frontend (FrontEndAngular/)
```bash
# Development
ng serve                    # Start Angular development server (default port 4200)
ng build                    # Build for production
ng build --watch            # Build with file watching for development

# Testing
ng test                     # Run unit tests with Karma
ng e2e                      # Run end-to-end tests
```

## Data Flow Architecture

### Real-time Data Ingestion
1. **Polygon.io → WebSocket → PolygonService**
   - Live Trades (T): Individual trade executions with price, volume, and side
   - Live Quotes (Q): Real-time bid/ask prices and sizes  
   - Minute Aggregates (AM): OHLCV data aggregated per minute

2. **PolygonService → DatabaseService → PostgreSQL**
   - All data stored in consolidated `trades` table
   - Individual trades: trade_id, price, quantity, side, no timeframe
   - Quote data: bid/ask converted to OHLCV format
   - Minute aggregates: OHLCV with '1min' timeframe

### Frontend Communication
- **Protocol**: WebSocket ONLY - no HTTP/REST API connections to frontend
- **Data Format**: JSON only - no CSV, XML, or other formats
- **Socket Server**: Primary communication channel on port 3001 (configurable)
- **Error Handling**: Error information embedded in JSON message structure

## Service Architecture

### Backend Services (BackEndExpressJS/src/services/)

**DatabaseService**: PostgreSQL connection and query management
- Direct database connection via `pg` client
- Parameterized SQL queries for stock data retrieval
- Connection pooling and transaction handling
- Mock mode fallback when database unavailable

**PolygonService**: Real-time data ingestion from Polygon.io
- WebSocket connection to `wss://socket.polygon.io/stocks`
- Processes trades (T.SYMBOL), quotes (Q.SYMBOL), aggregates (AM.SYMBOL)
- Auto-reconnection logic and error handling
- Transforms data to unified CreateTradeInput format

**SocketService**: Primary frontend communication channel
- WebSocket server using `ws` library (port 3001)
- Handles client authentication and message requests
- Serves ALL data in JSON format only
- Real-time and historical data access

**LoadBalancerService**: Distributes connections across backend instances
- WebSocket proxy server for connection distribution
- Health monitoring and automatic failover
- Supports round-robin, least-connections, weighted algorithms

### Frontend Services (FrontEndAngular/src/app/services/)

**SocketService**: Backend communication via WebSocket
- Manages WebSocket connection with auto-reconnection
- Message-based request/response pattern
- Handles data downloads, subscriptions, status requests

**StockApiService**: Stock data management and caching
**ChartService**: Chart.js integration and configuration
**ChartSyncService**: Multi-chart synchronization

## Database Schema

### Consolidated `trades` Table
- **Individual Trades**: trade_id, symbol, timestamp, price, quantity, side, source='polygon'
- **Quote Data**: symbol, timestamp, bid/ask converted to OHLCV, source='polygon'
- **Minute Aggregates**: symbol, timestamp, OHLCV data, timeframe='1min', source='polygon'
- **Indexing**: Optimized for symbol+timestamp queries, timeframe filtering

## Environment Configuration

### Required Backend Environment Variables (.env)
```bash
# Polygon.io API
POLYGON_API_KEY=your_polygon_api_key

# PostgreSQL Database  
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=stock_data

# Socket Server
SOCKET_PORT=3001
FRONTEND_URL=http://localhost:4200

# Load Balancer Configuration
LOAD_BALANCER_PORT=3000
LOAD_BALANCER_ALGORITHM=least-connections
BACKEND_SERVERS=[{"host":"localhost","port":3001,"weight":1}]

# Application
HTTP_PROXY_PORT=3002
LOG_LEVEL=info
```

### Frontend Environment (FrontEndAngular/src/environments/)
- `environment.ts`: Development configuration
- `environment.prod.ts`: Production configuration
- Socket connection settings (host, port, path)

## Key Dependencies

### Backend Core Dependencies
- `express`: Minimal web framework (health checks only)
- `pg`: PostgreSQL client for database operations  
- `ws`: WebSocket server and client (PRIMARY frontend interface)
- `winston`: Structured logging system
- `zod`: Runtime type validation for data processing
- `dotenv`: Environment variable management

### Frontend Core Dependencies  
- `@angular/core`: Angular framework (v20+)
- `@angular/material`: Material Design UI components
- `chart.js`: Financial chart rendering
- `ng2-charts`: Angular Chart.js integration
- `chartjs-chart-financial`: Financial charting extensions
- `rxjs`: Reactive programming for WebSocket handling

## Development Patterns

### Backend Patterns
- **Service Layer Architecture**: Business logic in dedicated service classes
- **Factory Pattern**: Service instantiation and data processing
- **WebSocket-First**: All frontend communication through WebSocket messages
- **JSON Message Format**: Consistent data structure for socket communication
- **Error Resilience**: Graceful degradation when external services fail

### Frontend Patterns
- **Standalone Components**: Modern Angular 20+ component architecture
- **Reactive Programming**: RxJS for WebSocket data streams
- **Socket-Only Communication**: No HTTP client usage for backend communication
- **Material Design**: Consistent UI with Angular Material components

## File Structure

### Backend Structure (BackEndExpressJS/src/)
```
src/
├── config/           # Configuration (database.ts, polygon.ts, socket.ts)
├── generators/       # Data generators (DataFileGenerator.ts)
├── middleware/       # Express middleware (errorHandler.ts)
├── models/           # Database models (Trades.ts)
├── services/         # Business logic services
├── types/            # TypeScript type definitions
├── utils/            # Utilities (logger.ts, validators.ts, db-init.ts)
└── server.ts         # Main application entry point
```

### Frontend Structure (FrontEndAngular/src/app/)
```
src/app/
├── components/       # Angular components
│   ├── dashboard/    # Main dashboard
│   ├── stock-selector/ # Stock selection
│   ├── data-controls/  # Data controls
│   └── dual-chart-display/ # Chart displays
├── services/         # Angular services
├── models/           # TypeScript interfaces
├── pipes/            # Data formatting pipes
└── environments/     # Environment configurations
```

## WebSocket Message Protocol

### Message Types
- **download**: Request stock data with parameters (symbol, timeframe, dates)
- **list**: Request available symbols and data types
- **status**: Get system health and data freshness
- **subscribe**: Subscribe to real-time data streams
- **test**: Test connection health

### Message Format
```json
{
  "id": "unique_message_id",
  "type": "download|list|status|subscribe|test",
  "symbol": "AAPL",
  "timeframe": "1min",
  "startDate": "2023-01-01T00:00:00Z",
  "endDate": "2023-01-02T00:00:00Z",
  "data": { /* response data */ },
  "error": "error message if any"
}
```

## Load Balancer Configuration

The system supports WebSocket load balancing across multiple backend instances:

### Scripts for Multi-Instance Development
- `npm run loadbalancer`: Start load balancer on port 3000
- `npm run backend:dev`: Start backend instance on port 3001  
- `npm run backend:dev:2`: Start backend instance on port 3002
- `npm run backend:dev:3`: Start backend instance on port 3003

### Load Balancer Features
- Health monitoring with configurable intervals
- Multiple balancing algorithms (round-robin, least-connections, weighted)
- Automatic failover and unhealthy instance removal
- WebSocket connection proxying and message forwarding

## Testing and Validation

### Backend Testing
- Use Jest or similar framework for unit tests
- Mock external dependencies (Polygon.io, Database)
- Test WebSocket connection handling and message processing
- Maintain test coverage above 80%

### Frontend Testing  
- Use Jasmine and Karma for unit tests
- Test Angular components and services
- Mock WebSocket communications for isolated testing
- Test chart rendering and data visualization

## Docker Deployment

### Available Docker Configurations
- `Dockerfile`: Backend containerization
- `docker-compose.yml`: Multi-service deployment
- `docker-compose.loadbalancer.yml`: Load balancer setup

### Docker Commands
```bash
docker-compose build          # Build images
docker-compose up            # Start services
docker-compose -f docker-compose.loadbalancer.yml up  # Start with load balancer
```

## Important Development Notes

### When Making Backend Changes
- Update TypeScript interfaces when modifying data structures
- Add Zod validation for new message types
- Test Polygon.io WebSocket subscriptions and data processing  
- Ensure all frontend communication uses WebSocket (NO HTTP endpoints)
- Generate only JSON messages for frontend consumption
- Test connection failures and auto-reconnection scenarios

### When Making Frontend Changes
- Use Angular standalone components when possible
- Implement proper error handling for socket operations
- Use only Socket service for backend communication (NO HTTP requests)
- Validate and parse JSON messages from socket communications
- Test responsive design across screen sizes
- Show user-friendly error messages for socket failures

### Cross-Application Considerations
- Maintain independence between frontend and backend
- Keep consistent JSON message structure across applications
- Validate JSON data on both generation (backend) and consumption (frontend)
- Ensure socket configuration matches between applications

## Known Issues to Monitor
- WebSocket connection stability with Polygon.io
- Database connection pool exhaustion under high load
- Memory usage with large WebSocket data streams
- Socket message queue management under high volume
- Load balancer health check frequency and timeout settings