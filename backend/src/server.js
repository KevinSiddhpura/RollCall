require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./logger');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');

const app = express();

// Compression — gzip responses
app.use(compression({ threshold: 512 }));

// Security headers
app.use(helmet());

// CORS — restrict in production
app.use(cors());

// Body parsing with size limits
app.use(express.json({ limit: '5mb' }));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Auth-specific rate limiter (stricter)
app.use('/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
}));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.url}  →  ${res.statusCode}  (${ms}ms)`);
  });
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/sync', syncRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/ping', (req, res) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
  const platform = String(req.body?.platform || 'unknown').replace(/[\r\n\t]/g, '');
  const appVersion = String(req.body?.appVersion || '?').replace(/[\r\n\t]/g, '');
  logger.info(`Device connected  |  ip=${ip}  platform=${platform}  v${appVersion}`);
  res.json({ ok: true });
});

const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) {
  logger.error('MONGO_URI not set — copy .env.example to .env');
  process.exit(1);
}
if (!JWT_SECRET) {
  logger.error('JWT_SECRET not set');
  process.exit(1);
}

// Mongoose connection with optimized pool
mongoose.connect(MONGO_URI, {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
}).then(() => {
  logger.info('MongoDB connected');
  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
}).catch((err) => {
  logger.error(`MongoDB connection error — ${err.message}`);
  process.exit(1);
});
