export const environment = {
  production: true,
  
  // Socket configuration for direct WebSocket communication with backend
  socketConfig: {
    host: 'localhost', // Update for production deployment
    port: 3001, // Socket port as configured in backend
    path: '/data-stream'
  },
  
  // Health monitoring (read-only, not for data access)
  healthCheckUrl: 'http://localhost:3001/health', // Update for production
  
  // Application settings
  defaultStocks: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'SVIX'],
  
  // Auto-refresh configuration  
  chartRefreshInterval: 60000, // 1 minute in production
  tickerRefreshInterval: 3600000, // 1 hour for ticker data
  statusCheckInterval: 300000, // 5 minutes for backend status
  
  // Auto-refresh behavior
  autoRefresh: {
    enabled: true,
    enableOnStartup: true,
    retryOnFailure: true,
    maxRetries: 5,
    backoffMultiplier: 1.5,
  },
  
  // Production settings
  debug: {
    socketVerbose: false, // Disabled in production
    enableConsoleLogging: false // Disabled in production
  }
};
