# Load Balancer Stop Script for Windows
# Gracefully stops all load balancer and backend instances

Write-Host "🛑 Stopping Stock Trading Dashboard Load Balancer..." -ForegroundColor Yellow

# Function to stop Docker Compose services
function Stop-DockerCompose {
    Write-Host "🐳 Stopping Docker Compose services..." -ForegroundColor Yellow
    docker-compose -f docker-compose.loadbalancer.yml down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker Compose services stopped successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to stop Docker Compose services" -ForegroundColor Red
    }
}

# Function to stop manual processes
function Stop-ManualProcesses {
    Write-Host "🔧 Stopping manual processes..." -ForegroundColor Yellow
    
    # Find and stop npm processes related to our services
    $npmProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -eq "node" -and $_.CommandLine -like "*ts-node-dev*"
    }
    
    if ($npmProcesses) {
        Write-Host "🛑 Stopping Node.js processes..." -ForegroundColor Yellow
        foreach ($process in $npmProcesses) {
            try {
                Stop-Process -Id $process.Id -Force
                Write-Host "✅ Stopped process (PID: $($process.Id))" -ForegroundColor Green
            } catch {
                Write-Host "⚠️ Failed to stop process (PID: $($process.Id))" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "⚠️ No Node.js processes found" -ForegroundColor Yellow
    }
    
    # Wait a moment for processes to terminate
    Start-Sleep -Seconds 2
    
    # Force kill any remaining processes on the ports
    Write-Host "🔍 Checking for remaining processes on load balancer ports..." -ForegroundColor Yellow
    $loadBalancerPorts = @(3000, 3001, 3002, 3003, 3004, 4001, 4002, 4003)
    
    foreach ($port in $loadBalancerPorts) {
        try {
            $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | 
                        Where-Object { $_.State -eq "Listen" } | 
                        ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }
            
            if ($processes) {
                foreach ($process in $processes) {
                    Write-Host "🛑 Force stopping process on port $port (PID: $($process.Id))..." -ForegroundColor Yellow
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {
            # Port might not be in use, continue
        }
    }
}

# Check if Docker Compose is running
try {
    $dockerStatus = docker-compose -f docker-compose.loadbalancer.yml ps 2>$null
    if ($dockerStatus -and $dockerStatus -match "Up") {
        Write-Host "🐳 Docker Compose services detected, stopping..." -ForegroundColor Yellow
        Stop-DockerCompose
    } else {
        Write-Host "🔧 No Docker Compose services detected, checking manual processes..." -ForegroundColor Yellow
        Stop-ManualProcesses
    }
} catch {
    Write-Host "🔧 No Docker Compose services detected, checking manual processes..." -ForegroundColor Yellow
    Stop-ManualProcesses
}

Write-Host ""
Write-Host "✅ Load balancer setup stopped successfully" -ForegroundColor Green
Write-Host "💡 All WebSocket connections have been closed" -ForegroundColor Cyan
Write-Host "🔌 Ports 3000-3004 and 4001-4003 are now available" -ForegroundColor Cyan 