import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // Cross-origin resource policy set to 'cross-origin' so deployed frontend can read API responses & blobs
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Standard development and production origins
  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://order-to-audit-system-for-a-small-food-manufacturer-p6fs4skc2.vercel.app',
  ];

  const configuredOrigins = env.corsOrigin
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return true; // allow non-browser clients (curl, Postman, health monitors)
    const normalized = origin.trim().replace(/\/+$/, '');
    if (configuredOrigins.includes(normalized)) return true;
    if (defaultAllowedOrigins.includes(normalized)) return true;
    // Allow any Vercel preview or branch deployment for this project
    if (/^https:\/\/order-to-audit-system-for-a-small-food-manufacturer.*\.vercel\.app$/.test(normalized)) {
      return true;
    }
    return false;
  };

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Disposition'],
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (env.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  // Root & Health endpoints
  app.get('/', (_req, res) => {
    res.json({
      name: 'FactoryFlow ERP API',
      version: '1.0.0',
      status: 'ok',
      docs: '/api/health',
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', service: 'FactoryFlow API' });
  });

  app.use('/api', apiRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });

  app.use(errorHandler);

  return app;
}
