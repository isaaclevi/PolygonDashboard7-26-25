# 🐳 Docker Setup - Stock Trading Dashboard

This guide explains how to run both the Angular frontend and Express.js backend in a single Docker container with proper communication.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Unified Docker Container                     │
│  ┌─────────────────┐              ┌─────────────────────┐   │
│  │  Angular Frontend│              │  Express.js Backend  │   │
│  │  (Static Files)  │              │                     │   │
│  │                 │              │  • HTTP Server :3000│   │
│  │  Served via     │◄─────────────┤  • FTP Server :20   │   │
│  │  Express Static │              │  • Database Client  │   │
│  │                 │              │  • Polygon.io WS    │   │
│  └─────────────────┘              └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                PostgreSQL Container                         │
│                    (Database)                              │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. **Environment Setup**
```bash
# Copy environment template
cp env.example .env

# Edit with your configuration
nano .env  # or your preferred editor
```

### 2. **Required Environment Variables**
```bash
# Polygon.io API (get free key from polygon.io)
POLYGON_API_KEY=your_api_key

# Database credentials
DB_PASSWORD=your_secure_password
FTP_PASS=your_secure_ftp_password
```

### 3. **Build and Run**
```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

### 4. **Access the Application**
- **Frontend Dashboard**: http://localhost:3000
- **API Health Check**: http://localhost:3000/health
- **Direct FTP Access**: ftp://admin:password@localhost:20
- **Database**: localhost:5432

## 📊 Communication Flow

### Frontend → Backend Communication

The frontend communicates with the backend through **HTTP proxy endpoints** for browser compatibility:

```typescript
// HTTP Proxy Mode (Preferred)
GET http://localhost:3000/ftp-proxy/tickers.json
GET http://localhost:3000/ftp-proxy/AAPL-1min-2024-01-01-2024-01-02.json
GET http://localhost:3000/ftp-proxy        // List files

// Direct FTP (Alternative)
FTP ftp://admin:password@localhost:20/tickers.json
```

## 🔧 Configuration Details

### Port Mapping
- **3000**: HTTP server (Angular app + API endpoints)
- **20**: FTP server (primary data interface)
- **5432**: PostgreSQL database

### Data Flow
1. **Polygon.io** → WebSocket → Backend → Database
2. **Database** → Data Files → FTP Directory
3. **Frontend** → HTTP Proxy → FTP Files → Display

### File Structure in Container
```
/app/
├── dist/                    # Compiled backend (TypeScript → JavaScript)
├── public/                  # Angular static files
├── ftp_data/               # FTP server data files
├── logs/                   # Application logs
├── ecosystem.config.js     # PM2 configuration
└── start.sh               # Container startup script
```

## 🛠️ Development vs Production

### Development Mode
```bash
# Frontend dev server (separate)
cd FrontEndAngular
npm run start  # http://localhost:4200

# Backend dev server (separate)
cd BackEndExpressJS
npm run dev    # http://localhost:3000
```

### Production Mode (Docker)
```bash
# Unified container
docker-compose up --build  # http://localhost:3000
```

## 📋 Available Services

### Express.js Backend Services
- ✅ **HTTP Server**: Serves Angular static files
- ✅ **FTP Server**: Primary data interface (port 20)
- ✅ **HTTP Proxy**: Browser-compatible FTP access
- ✅ **Database Client**: PostgreSQL connection
- ✅ **WebSocket Client**: Real-time Polygon.io data
- ✅ **File Generator**: JSON data file creation
- ✅ **Health Monitoring**: Service status endpoints

### Angular Frontend Features
- ✅ **Stock Selector**: 10,000+ tickers from Polygon.io
- ✅ **Chart Display**: Price and volume visualization
- ✅ **Local Storage**: Offline ticker caching with safety sync
- ✅ **FTP Communication**: Via HTTP proxy for compatibility
- ✅ **Real-time Updates**: Live market data integration

## 🔍 Monitoring & Debugging

### Container Logs
```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f stock-dashboard
docker-compose logs -f postgres
```

### Health Checks
```bash
# Container health status
docker-compose ps

# Application health
curl http://localhost:3000/health

# Database connection
docker-compose exec postgres pg_isready -U postgres
```

### Debug Commands (Inside Container)
```bash
# Enter container
docker-compose exec stock-dashboard sh

# Check PM2 processes
pm2 list
pm2 logs

# Check file generation
ls -la /app/ftp_data/

# Test FTP connectivity
ftp localhost 20
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find and kill process using port
   lsof -ti:3000 | xargs kill -9
   lsof -ti:20 | xargs kill -9
   ```

2. **Permission Denied**
   ```bash
   # Fix Docker permissions
   sudo chmod +x start.sh
   sudo chown -R $USER:$USER .
   ```

3. **Database Connection Failed**
   ```bash
   # Check database logs
   docker-compose logs postgres
   
   # Reset database
   docker-compose down -v
   docker-compose up --build
   ```

4. **Frontend Not Loading**
   ```bash
   # Verify static files
   docker-compose exec stock-dashboard ls -la /app/public/
   
   # Check backend logs
   docker-compose logs stock-dashboard
   ```

### Environment Issues

1. **Missing API Key**
   - Get free Polygon.io API key
   - Add to `.env` file: `POLYGON_API_KEY=your_key`

2. **FTP Connection Failed**
   - Check FTP credentials in `.env`
   - Verify port 20 is available
   - Test with: `ftp localhost 20`

## 🔒 Security Considerations

- 🔐 Change default passwords in `.env`
- 🔐 Use strong database passwords  
- 🔐 Restrict container network access
- 🔐 Enable HTTPS in production
- 🔐 Regular security updates

## 📈 Performance Tips

- **Database**: Use connection pooling (already configured)
- **FTP**: File cleanup runs every 6 hours
- **Frontend**: Large datasets are paginated
- **Memory**: PM2 auto-restart at 1GB usage
- **Logs**: Automatic log rotation

## 🎯 Next Steps

1. **Custom Configuration**: Modify `ecosystem.config.js` for your needs
2. **Scaling**: Add more PM2 instances for load balancing
3. **Monitoring**: Integrate with external monitoring tools
4. **Backup**: Set up database backup strategies
5. **SSL**: Configure HTTPS for production deployment 