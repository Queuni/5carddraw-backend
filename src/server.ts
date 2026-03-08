import express, { Application } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { SocketService } from './services/socketService';
import './config/firebase'; // Initialize Firebase

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers

// CORS configuration - allow multiple origins for development and production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
    'https://5carddraw.app',      // Original domain
    'https://5carddraw.net',       // WordPress deployment
    'https://www.5carddraw.net',  // WordPress with www
    process.env.FRONTEND_URL,      // Additional from environment variable
  ].filter(Boolean) // Remove undefined values
  : [
    'http://localhost:3000',
    'http://localhost:8080', // Unity WebGL default port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (conditional for production)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Routes
app.use('/api', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize WebSocket service
new SocketService(httpServer);

// Start server
httpServer.listen(PORT, () => {
  // Always log server startup
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server initialized`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  }
});

export default app;

