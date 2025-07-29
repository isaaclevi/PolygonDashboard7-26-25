#!/bin/bash

# Load Balancer Startup Script
# Starts multiple backend instances with load balancer for distributed WebSocket connections

echo "🚀 Starting Stock Trading Dashboard with Load Balancer..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please create one based on env.example"
    exit 1
fi

# Load environment variables
source .env

# Function to check if a port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ Port $port is already in use"
        return 1
    else
        echo "✅ Port $port is available"
        return 0
    fi
}

# Check required ports
echo "🔍 Checking port availability..."
required_ports=(3000 3001 3002 3003 3004 4001 4002 4003 5432 5050)

for port in "${required_ports[@]}"; do
    if ! check_port $port; then
        echo "❌ Please free up port $port or modify the configuration"
        exit 1
    fi
done

echo "✅ All required ports are available"

# Build the application
echo "🔨 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed"

# Start the load balancer setup
echo "🚀 Starting load balancer setup..."

# Option 1: Docker Compose (recommended for production)
if command -v docker-compose &> /dev/null; then
    echo "🐳 Using Docker Compose for load balancer setup..."
    docker-compose -f docker-compose.loadbalancer.yml up -d
    
    if [ $? -eq 0 ]; then
        echo "✅ Load balancer setup started successfully with Docker Compose"
        echo ""
        echo "📊 Load Balancer Status:"
        echo "   - Load Balancer: http://localhost:3004/health"
        echo "   - Backend 1: http://localhost:4001/health"
        echo "   - Backend 2: http://localhost:4002/health"
        echo "   - Backend 3: http://localhost:4003/health"
        echo "   - Database: localhost:5432"
        echo "   - PGAdmin: http://localhost:5050"
        echo ""
        echo "🔌 WebSocket Endpoints:"
        echo "   - Load Balancer: ws://localhost:3000"
        echo "   - Backend 1: ws://localhost:3001"
        echo "   - Backend 2: ws://localhost:3002"
        echo "   - Backend 3: ws://localhost:3003"
        echo ""
        echo "📱 Frontend should connect to: ws://localhost:3000"
    else
        echo "❌ Docker Compose setup failed"
        exit 1
    fi

# Option 2: Manual startup (for development)
else
    echo "🔧 Using manual startup for development..."
    
    # Start backend servers in background
    echo "🔗 Starting backend servers..."
    
    # Backend 1
    npm run backend:dev -- --port=3001 &
    BACKEND_1_PID=$!
    echo "✅ Backend 1 started (PID: $BACKEND_1_PID)"
    
    # Backend 2
    npm run backend:dev -- --port=3002 &
    BACKEND_2_PID=$!
    echo "✅ Backend 2 started (PID: $BACKEND_2_PID)"
    
    # Backend 3
    npm run backend:dev -- --port=3003 &
    BACKEND_3_PID=$!
    echo "✅ Backend 3 started (PID: $BACKEND_3_PID)"
    
    # Wait a moment for backends to start
    sleep 5
    
    # Start load balancer
    echo "⚖️ Starting load balancer..."
    npm run loadbalancer &
    LOADBALANCER_PID=$!
    echo "✅ Load balancer started (PID: $LOADBALANCER_PID)"
    
    # Save PIDs for cleanup
    echo $BACKEND_1_PID > .backend-1.pid
    echo $BACKEND_2_PID > .backend-2.pid
    echo $BACKEND_3_PID > .backend-3.pid
    echo $LOADBALANCER_PID > .loadbalancer.pid
    
    echo ""
    echo "✅ Load balancer setup started successfully"
    echo ""
    echo "📊 Load Balancer Status:"
    echo "   - Load Balancer: http://localhost:3004/health"
    echo "   - Backend 1: http://localhost:4001/health"
    echo "   - Backend 2: http://localhost:4002/health"
    echo "   - Backend 3: http://localhost:4003/health"
    echo ""
    echo "🔌 WebSocket Endpoints:"
    echo "   - Load Balancer: ws://localhost:3000"
    echo "   - Backend 1: ws://localhost:3001"
    echo "   - Backend 2: ws://localhost:3002"
    echo "   - Backend 3: ws://localhost:3003"
    echo ""
    echo "📱 Frontend should connect to: ws://localhost:3000"
    echo ""
    echo "🛑 To stop all services, run: ./stop-loadbalancer.sh"
fi

echo ""
echo "🎉 Load balancer setup completed!"
echo "💡 The frontend should now connect to the load balancer at ws://localhost:3000"
echo "📈 Multiple backend instances will distribute the WebSocket connections" 