# Load Balancer Startup Script for Windows
# Starts multiple backend instances with load balancer for distributed WebSocket connections

Write-Host "🚀 Starting Stock Trading Dashboard with Load Balancer..." -ForegroundColor Green

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "❌ Error: .env file not found. Please create one based on env.example" -ForegroundColor Red
    exit 1
}

# Function to check if a port is available
function Test-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet
        if ($connection.TcpTestSucceeded) {
            Write-Host "❌ Port $Port is already in use" -ForegroundColor Red
            return $false
        } else {
            Write-Host "✅ Port $Port is available" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "✅ Port $Port is available" -ForegroundColor Green
        return $true
    }
}

# Check required ports
Write-Host "🔍 Checking port availability..." -ForegroundColor Yellow
$requiredPorts = @(3000, 3001, 3002, 3003, 3004, 4001, 4002, 4003, 5432, 5050)

foreach ($port in $requiredPorts) {
    if (-not (Test-Port $port)) {
        Write-Host "❌ Please free up port $port or modify the configuration" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All required ports are available" -ForegroundColor Green

# Build the application
Write-Host "🔨 Building application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed" -ForegroundColor Green

# Start the load balancer setup
Write-Host "🚀 Starting load balancer setup..." -ForegroundColor Yellow

# Option 1: Docker Compose (recommended for production)
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    Write-Host "🐳 Using Docker Compose for load balancer setup..." -ForegroundColor Yellow
    docker-compose -f docker-compose.loadbalancer.yml up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Load balancer setup started successfully with Docker Compose" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Load Balancer Status:" -ForegroundColor Cyan
        Write-Host "   - Load Balancer: http://localhost:3004/health" -ForegroundColor White
        Write-Host "   - Backend 1: http://localhost:4001/health" -ForegroundColor White
        Write-Host "   - Backend 2: http://localhost:4002/health" -ForegroundColor White
        Write-Host "   - Backend 3: http://localhost:4003/health" -ForegroundColor White
        Write-Host "   - Database: localhost:5432" -ForegroundColor White
        Write-Host "   - PGAdmin: http://localhost:5050" -ForegroundColor White
        Write-Host ""
        Write-Host "🔌 WebSocket Endpoints:" -ForegroundColor Cyan
        Write-Host "   - Load Balancer: ws://localhost:3000" -ForegroundColor White
        Write-Host "   - Backend 1: ws://localhost:3001" -ForegroundColor White
        Write-Host "   - Backend 2: ws://localhost:3002" -ForegroundColor White
        Write-Host "   - Backend 3: ws://localhost:3003" -ForegroundColor White
        Write-Host ""
        Write-Host "📱 Frontend should connect to: ws://localhost:3000" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Docker Compose setup failed" -ForegroundColor Red
        exit 1
    }

# Option 2: Manual startup (for development)
} else {
    Write-Host "🔧 Using manual startup for development..." -ForegroundColor Yellow
    
    # Start backend servers in background
    Write-Host "🔗 Starting backend servers..." -ForegroundColor Yellow
    
    # Backend 1
    Start-Process -FilePath "npm" -ArgumentList "run", "backend:dev", "--", "--port=3001" -WindowStyle Hidden
    Write-Host "✅ Backend 1 started" -ForegroundColor Green
    
    # Backend 2
    Start-Process -FilePath "npm" -ArgumentList "run", "backend:dev", "--", "--port=3002" -WindowStyle Hidden
    Write-Host "✅ Backend 2 started" -ForegroundColor Green
    
    # Backend 3
    Start-Process -FilePath "npm" -ArgumentList "run", "backend:dev", "--", "--port=3003" -WindowStyle Hidden
    Write-Host "✅ Backend 3 started" -ForegroundColor Green
    
    # Wait a moment for backends to start
    Start-Sleep -Seconds 5
    
    # Start load balancer
    Write-Host "⚖️ Starting load balancer..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "loadbalancer" -WindowStyle Hidden
    Write-Host "✅ Load balancer started" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "✅ Load balancer setup started successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Load Balancer Status:" -ForegroundColor Cyan
    Write-Host "   - Load Balancer: http://localhost:3004/health" -ForegroundColor White
    Write-Host "   - Backend 1: http://localhost:4001/health" -ForegroundColor White
    Write-Host "   - Backend 2: http://localhost:4002/health" -ForegroundColor White
    Write-Host "   - Backend 3: http://localhost:4003/health" -ForegroundColor White
    Write-Host ""
    Write-Host "🔌 WebSocket Endpoints:" -ForegroundColor Cyan
    Write-Host "   - Load Balancer: ws://localhost:3000" -ForegroundColor White
    Write-Host "   - Backend 1: ws://localhost:3001" -ForegroundColor White
    Write-Host "   - Backend 2: ws://localhost:3002" -ForegroundColor White
    Write-Host "   - Backend 3: ws://localhost:3003" -ForegroundColor White
    Write-Host ""
    Write-Host "📱 Frontend should connect to: ws://localhost:3000" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🛑 To stop all services, run: .\stop-loadbalancer.ps1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Load balancer setup completed!" -ForegroundColor Green
Write-Host "💡 The frontend should now connect to the load balancer at ws://localhost:3000" -ForegroundColor Cyan
Write-Host "📈 Multiple backend instances will distribute the WebSocket connections" -ForegroundColor Cyan 