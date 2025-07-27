# Multi-stage build for stock trading dashboard
# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY FrontEndAngular/package*.json ./
RUN npm ci

COPY FrontEndAngular/ ./
RUN npm run build -- --configuration production

# Stage 2: Build backend and combine with frontend
FROM node:20-alpine AS production

# Install system dependencies
RUN apk add --no-cache curl bash

# Install PM2 globally for process management
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Copy backend package files
COPY BackEndExpressJS/package*.json ./
RUN npm ci

# Copy backend source
COPY BackEndExpressJS/ ./

# Copy built frontend to backend's public directory
COPY --from=frontend-builder /frontend/dist/stock-dashboard/ ./public/

# Install TypeScript for compilation
RUN npm install -g typescript

# Add build script and compile TypeScript
RUN npm run build

# Clean dev dependencies after build
RUN npm prune --production

# Create PM2 ecosystem file
COPY ecosystem.config.js ./

# Create startup script
COPY start.sh ./
RUN chmod +x start.sh

# Expose ports
EXPOSE 3000 20 4200

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start both services using PM2
CMD ["./start.sh"] 