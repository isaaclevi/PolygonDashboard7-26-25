# WebSocket Load Balancer for Stock Trading Dashboard

This document explains the load balancer implementation for distributing WebSocket connections across multiple backend server instances.

## Overview

The load balancer provides high availability and scalability for the WebSocket-based stock trading dashboard by distributing client connections across multiple backend servers.

### Architecture

```
Frontend (Angular) → Load Balancer (Port 3000) → Backend Servers (Ports 3001, 3002, 3003)
```

## Features

### Load Balancing Algorithms

1. **Round Robin** - Distributes connections sequentially across backends
2. **Least Connections** - Routes to backend with fewest active connections
3. **Weighted** - Distributes based on configured weights
4. **IP Hash** - Routes based on client IP address for session affinity

### Health Checking

- Automatic health checks every 15-30 seconds
- Configurable health check intervals and timeouts
- Automatic removal of unhealthy backends from rotation
- Automatic re-addition when backends become healthy

### Monitoring

- Real-time status monitoring at `http://localhost:3004/status`
- Health check endpoint at `http://localhost:3004/health`
- Connection statistics and backend health information

## Quick Start

### Prerequisites

1. Node.js 18+ installed
2. PostgreSQL database running
3. Polygon.io API key configured
4. Environment variables set up

### Option 1: Docker Compose (Recommended)

```bash
# Start all services with load balancer
docker-compose -f docker-compose.loadbalancer.yml up -d

# Check status
docker-compose -f docker-compose.loadbalancer.yml ps

# View logs
docker-compose -f docker-compose.loadbalancer.yml logs -f loadbalancer

# Stop all services
docker-compose -f docker-compose.loadbalancer.yml down
```

### Option 2: Manual Startup (Development)

#### Windows (PowerShell)
```powershell
# Start load balancer setup
.\start-loadbalancer.ps1

# Stop load balancer setup
.\stop-loadbalancer.ps1
```

#### Linux/Mac (Bash)
```bash
# Start load balancer setup
./start-loadbalancer.sh

# Stop load balancer setup
./stop-loadbalancer.sh
```

### Option 3: Manual NPM Scripts

```bash
# Build the application
npm run build

# Start individual backend servers
npm run backend:dev -- --port=3001
npm run backend:dev -- --port=3002
npm run backend:dev -- --port=3003

# Start load balancer
npm run loadbalancer
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Load Balancer Configuration
LOAD_BALANCER_PORT=3000
LOAD_BALANCER_MONITORING_PORT=3004
LOAD_BALANCER_ALGORITHM=least-connections
HEALTH_CHECK_INTERVAL=15000
HEALTH_CHECK_TIMEOUT=3000
MAX_RETRIES=3

# Backend server configuration (JSON array)
BACKEND_SERVERS=[{"host":"localhost","port":3001,"weight":1},{"host":"localhost","port":3002,"weight":1},{"host":"localhost","port":3003,"weight":1}]
```

### Load Balancing Algorithms

#### Round Robin (Default)
```env
LOAD_BALANCER_ALGORITHM=round-robin
```
- Distributes connections sequentially
- Good for equal-capacity backends
- Simple and predictable

#### Least Connections
```env
LOAD_BALANCER_ALGORITHM=least-connections
```
- Routes to backend with fewest active connections
- Best for varying backend capacities
- Recommended for production

#### Weighted
```env
LOAD_BALANCER_ALGORITHM=weighted
```
- Distributes based on configured weights
- Good for backends with different capacities
- Configure weights in BACKEND_SERVERS

#### IP Hash
```env
LOAD_BALANCER_ALGORITHM=ip-hash
```
- Routes based on client IP address
- Provides session affinity
- Good for stateful applications

## Port Configuration

| Service | Port | Description |
|---------|------|-------------|
| Load Balancer | 3000 | WebSocket endpoint for clients |
| Load Balancer Monitoring | 3004 | HTTP health/status endpoints |
| Backend 1 | 3001 | WebSocket server |
| Backend 1 Monitoring | 4001 | HTTP health endpoint |
| Backend 2 | 3002 | WebSocket server |
| Backend 2 Monitoring | 4002 | HTTP health endpoint |
| Backend 3 | 3003 | WebSocket server |
| Backend 3 Monitoring | 4003 | HTTP health endpoint |
| PostgreSQL | 5432 | Database |
| PGAdmin | 5050 | Database management |

## Monitoring and Health Checks

### Load Balancer Status
```bash
# Check load balancer health
curl http://localhost:3004/health

# Get detailed status
curl http://localhost:3004/status
```

### Backend Health Checks
```bash
# Check individual backends
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health
```

### WebSocket Connection Test
```javascript
// Test load balancer connection
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected to load balancer');
ws.onmessage = (event) => console.log('Received:', event.data);
```

## Frontend Integration

Update your Angular frontend to connect to the load balancer:

```typescript
// In your socket service
const socket = new WebSocket('ws://localhost:3000');
```

The load balancer will automatically distribute your connection to one of the backend servers.

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   netstat -ano | findstr :3000
   
   # Kill the process
   taskkill /PID <PID> /F
   ```

2. **Backend Not Responding**
   ```bash
   # Check backend health
   curl http://localhost:4001/health
   
   # Check logs
   docker-compose logs backend-1
   ```

3. **Load Balancer Not Starting**
   ```bash
   # Check configuration
   npm run loadbalancer
   
   # Verify environment variables
   echo $LOAD_BALANCER_PORT
   ```

### Logs and Debugging

```bash
# View load balancer logs
docker-compose logs -f loadbalancer

# View backend logs
docker-compose logs -f backend-1
docker-compose logs -f backend-2
docker-compose logs -f backend-3

# Check all services
docker-compose ps
```

## Performance Considerations

### Scaling

- Add more backend servers by updating `BACKEND_SERVERS` configuration
- Use weighted algorithm for backends with different capacities
- Monitor connection distribution and adjust weights accordingly

### Monitoring

- Use the status endpoint to monitor connection distribution
- Set up alerts for backend health status
- Monitor WebSocket connection counts per backend

### Security

- Load balancer provides connection distribution only
- No data processing or storage on load balancer
- All security should be implemented on backend servers

## Development vs Production

### Development
- Use manual startup scripts
- Single machine deployment
- Round-robin algorithm for simplicity

### Production
- Use Docker Compose for orchestration
- Multiple machine deployment
- Least-connections algorithm for optimal distribution
- Regular health checks and monitoring

## API Reference

### Load Balancer Endpoints

#### GET /health
Returns load balancer health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "loadBalancer": {
    "algorithm": "least-connections",
    "totalConnections": 5,
    "backendCount": 3,
    "healthyBackends": 3
  },
  "backends": [
    {
      "id": "backend-1",
      "host": "localhost",
      "port": 3001,
      "health": true,
      "activeConnections": 2,
      "weight": 1,
      "lastHealthCheck": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### GET /status
Returns detailed load balancer status.

**Response:**
```json
{
  "loadBalancer": {
    "algorithm": "least-connections",
    "totalConnections": 5,
    "backends": [...]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Contributing

When modifying the load balancer:

1. Update configuration in `src/config/loadbalancer.ts`
2. Test with multiple backend instances
3. Verify health checking works correctly
4. Update documentation for new features

## License

This load balancer implementation is part of the Stock Trading Dashboard project. 