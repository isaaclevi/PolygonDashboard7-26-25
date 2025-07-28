export const environment = {
  production: false,
  
  // Socket configuration for direct WebSocket communication with backend
  socketConfig: {
    host: 'localhost',
    port: 3001, // Socket port as configured in backend
    path: '/data-stream'
  },
  
  // Health monitoring (read-only, not for data access)
  healthCheckUrl: 'http://localhost:3001/health',
  
  // Application settings
  defaultStocks: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'SVIX'],
  
  // Auto-refresh configuration
  chartRefreshInterval: 3600000, // 1 hour (3,600,000 ms) for chart data
  tickerRefreshInterval: 3600000, // 1 hour for ticker data  
  statusCheckInterval: 300000, // 5 minutes for backend status (more frequent for health monitoring)
  
  // Auto-refresh behavior
  autoRefresh: {
    enabled: true, // Enable by default
    enableOnStartup: true, // Start auto-refresh when dashboard loads
    retryOnFailure: true, // Retry after failures
    maxRetries: 5, // Maximum retry attempts before giving up
    backoffMultiplier: 1.5, // Exponential backoff for retries
  },
  
  // Development settings
  debug: {
    socketVerbose: false, // Set to true for WebSocket debugging
    enableConsoleLogging: true
  }
};
