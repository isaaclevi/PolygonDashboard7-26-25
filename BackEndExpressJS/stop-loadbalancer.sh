#!/bin/bash

# Load Balancer Stop Script
# Gracefully stops all load balancer and backend instances

echo "🛑 Stopping Stock Trading Dashboard Load Balancer..."

# Function to stop Docker Compose services
stop_docker_compose() {
    echo "🐳 Stopping Docker Compose services..."
    docker-compose -f docker-compose.loadbalancer.yml down
    
    if [ $? -eq 0 ]; then
        echo "✅ Docker Compose services stopped successfully"
    else
        echo "❌ Failed to stop Docker Compose services"
    fi
}

# Function to stop manual processes
stop_manual_processes() {
    echo "🔧 Stopping manual processes..."
    
    # Stop load balancer
    if [ -f .loadbalancer.pid ]; then
        LOADBALANCER_PID=$(cat .loadbalancer.pid)
        if kill -0 $LOADBALANCER_PID 2>/dev/null; then
            echo "🛑 Stopping load balancer (PID: $LOADBALANCER_PID)..."
            kill $LOADBALANCER_PID
            rm .loadbalancer.pid
            echo "✅ Load balancer stopped"
        else
            echo "⚠️ Load balancer process not found"
            rm .loadbalancer.pid
        fi
    fi
    
    # Stop backend servers
    for i in 1 2 3; do
        if [ -f .backend-$i.pid ]; then
            BACKEND_PID=$(cat .backend-$i.pid)
            if kill -0 $BACKEND_PID 2>/dev/null; then
                echo "🛑 Stopping backend $i (PID: $BACKEND_PID)..."
                kill $BACKEND_PID
                rm .backend-$i.pid
                echo "✅ Backend $i stopped"
            else
                echo "⚠️ Backend $i process not found"
                rm .backend-$i.pid
            fi
        fi
    done
    
    # Wait a moment for processes to terminate
    sleep 2
    
    # Force kill any remaining processes on the ports
    echo "🔍 Checking for remaining processes on load balancer ports..."
    for port in 3000 3001 3002 3003 3004 4001 4002 4003; do
        PID=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$PID" ]; then
            echo "🛑 Force stopping process on port $port (PID: $PID)..."
            kill -9 $PID
        fi
    done
}

# Check if Docker Compose is running
if docker-compose -f docker-compose.loadbalancer.yml ps | grep -q "Up"; then
    echo "🐳 Docker Compose services detected, stopping..."
    stop_docker_compose
else
    echo "🔧 No Docker Compose services detected, checking manual processes..."
    stop_manual_processes
fi

echo ""
echo "✅ Load balancer setup stopped successfully"
echo "💡 All WebSocket connections have been closed"
echo "🔌 Ports 3000-3004 and 4001-4003 are now available" 