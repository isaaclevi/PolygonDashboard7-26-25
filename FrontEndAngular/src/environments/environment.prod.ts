export const environment = {
  production: true,
  // Base API URL for HTTP communication
  apiUrl: 'http://localhost:3001',
  
  // HTTP proxy configuration (preferred for browser compatibility)
  httpProxy: {
    enabled: true,
    baseUrl: 'http://localhost:3001/ftp-proxy',
    listUrl: 'http://localhost:3001/ftp-proxy'
  },
  
  // FTP configuration (fallback for direct FTP access)
  ftpConfig: {
    host: 'localhost',
    port: 20,  // Updated to correct FTP port
    user: 'admin',
    password: 'admin'
  },
  
  // Application settings
  defaultStocks: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
  chartRefreshInterval: 60000, // 1 minute
  
  // Data source priority: 'http-proxy' | 'ftp' | 'both'
  dataSourceMode: 'http-proxy'
};
