import dotenv from 'dotenv';

dotenv.config();

export interface BackendServer {
  id: string;
  host: string;
  port: number;
  weight: number;
  health: boolean;
  activeConnections: number;
  lastHealthCheck: Date;
}

export interface LoadBalancerConfig {
  port: number;
  backends: BackendServer[];
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxRetries: number;
}

// Default backend servers configuration
const defaultBackends: BackendServer[] = [
  {
    id: 'backend-1',
    host: 'localhost',
    port: 3001,
    weight: 1,
    health: true,
    activeConnections: 0,
    lastHealthCheck: new Date()
  },
  {
    id: 'backend-2',
    host: 'localhost',
    port: 3002,
    weight: 1,
    health: true,
    activeConnections: 0,
    lastHealthCheck: new Date()
  },
  {
    id: 'backend-3',
    host: 'localhost',
    port: 3003,
    weight: 1,
    health: true,
    activeConnections: 0,
    lastHealthCheck: new Date()
  }
];

// Load balancer configuration
export const loadBalancerConfig: LoadBalancerConfig = {
  port: Number(process.env.LOAD_BALANCER_PORT) || 3000,
  backends: process.env.BACKEND_SERVERS 
    ? JSON.parse(process.env.BACKEND_SERVERS).map((server: any, index: number) => ({
        id: `backend-${index + 1}`,
        host: server.host || 'localhost',
        port: server.port || (3001 + index),
        weight: server.weight || 1,
        health: true,
        activeConnections: 0,
        lastHealthCheck: new Date()
      }))
    : defaultBackends,
  algorithm: (process.env.LOAD_BALANCER_ALGORITHM as any) || 'round-robin',
  healthCheckInterval: Number(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
  healthCheckTimeout: Number(process.env.HEALTH_CHECK_TIMEOUT) || 5000,   // 5 seconds
  maxRetries: Number(process.env.MAX_RETRIES) || 3
};

// Environment-specific configurations
export const getLoadBalancerConfig = (): LoadBalancerConfig => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return {
        ...loadBalancerConfig,
        algorithm: 'least-connections',
        healthCheckInterval: 15000, // More frequent health checks in production
        healthCheckTimeout: 3000    // Faster timeout in production
      };
    
    case 'staging':
      return {
        ...loadBalancerConfig,
        algorithm: 'weighted',
        healthCheckInterval: 20000
      };
    
    case 'development':
    default:
      return {
        ...loadBalancerConfig,
        algorithm: 'round-robin',
        healthCheckInterval: 30000
      };
  }
}; 