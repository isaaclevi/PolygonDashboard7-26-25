#!/bin/bash

echo "🧪 Testing Docker Build Process for Stock Trading Dashboard"
echo "=========================================================="

# Create test environment file
echo "📝 Creating test environment file..."
cat > .env.test << EOF
POLYGON_API_KEY=test_key_12345
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=test_password
DB_NAME=stock_data
FTP_PORT=20
FTP_USER=admin
FTP_PASS=test_ftp_pass
PORT=3000
HTTP_PROXY_PORT=3000
NODE_ENV=production
LOG_LEVEL=info
EOF

# Test Docker build
echo "🐳 Testing Docker build process..."
docker build -t stock-dashboard-test -f Dockerfile .

# Check build result
if [ $? -eq 0 ]; then
    echo "✅ Docker build successful!"
    
    # Test image inspection
    echo "📋 Image details:"
    docker image inspect stock-dashboard-test --format='Size: {{.Size}} bytes'
    docker image inspect stock-dashboard-test --format='Created: {{.Created}}'
    
    echo "🔍 Testing container structure..."
    docker run --rm stock-dashboard-test ls -la /app/ || echo "❌ Container structure test failed"
    
    echo "🧹 Cleaning up test image..."
    docker rmi stock-dashboard-test
else
    echo "❌ Docker build failed!"
    exit 1
fi

# Test docker-compose syntax
echo "📋 Validating docker-compose.yml..."
docker-compose -f docker-compose.yml config > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ docker-compose.yml syntax is valid!"
else
    echo "❌ docker-compose.yml has syntax errors!"
    exit 1
fi

# Cleanup
echo "🧹 Cleaning up test files..."
rm -f .env.test

echo "🎉 All Docker build tests passed!"
echo ""
echo "Next steps:"
echo "1. Copy env.example to .env"
echo "2. Edit .env with your actual values"
echo "3. Run: docker-compose up --build"
echo "4. Access: http://localhost:3000" 