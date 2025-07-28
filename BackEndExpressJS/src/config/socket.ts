import dotenv from 'dotenv';

dotenv.config();

export const socketConfig = {
  port: Number(process.env.SOCKET_PORT) || 3001,
  path: '/data-stream',
  pingInterval: 30000, // 30 seconds
  pingTimeout: 60000,  // 60 seconds
  maxConnections: 100,
  compression: true,
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    methods: ['GET', 'POST'],
    credentials: true
  }
}; 