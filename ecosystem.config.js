module.exports = {
  apps: [
    {
      name: 'stock-backend',
      script: 'dist/server.js',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        FTP_PORT: '20',
        LOG_LEVEL: 'info'
      },
      error_file: '/app/logs/backend-error.log',
      out_file: '/app/logs/backend-out.log',
      log_file: '/app/logs/backend.log',
      time: true
    }
  ]
}; 