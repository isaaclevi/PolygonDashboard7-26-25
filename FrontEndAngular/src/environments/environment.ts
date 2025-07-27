export const environment = {
  production: false,
  // Base API URL for HTTP communication
  apiUrl: 'http://localhost:3000',
  
  // HTTP proxy configuration (preferred for browser compatibility)
  httpProxy: {
    enabled: true,
    baseUrl: 'http://localhost:3000/ftp-proxy',
    listUrl: 'http://localhost:3000/ftp-proxy'
  },
  
  // FTP configuration (fallback for direct FTP access)
  ftpConfig: {
    host: 'localhost',
    port: 20, // Updated to match backend FTP port
    user: 'admin',
    password: 'admin'
  },
  
  // Application settings
  defaultStocks: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
  chartRefreshInterval: 30000, // 30 seconds for development
  
  // Data source priority: 'http-proxy' | 'ftp' | 'both'
  dataSourceMode: 'http-proxy'
};
