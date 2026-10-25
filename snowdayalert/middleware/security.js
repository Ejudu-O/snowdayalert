

import helmet from 'helmet';
import cors from 'cors';
import { RateLimiterMemory } from 'rate-limit-flexible';

// Rate limiter configuration
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 900, // Per 15 minutes (900 seconds)
});

// Stricter rate limiter for calculation endpoints
const calculationRateLimiter = new RateLimiterMemory({
  points: 30,
  duration: 900,
});

// Security middleware
export const securityMiddleware = {
  // Helmet with strict CSP
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.weatherapi.com", "https://*.supabase.co"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),

  // CORS with strict origin checking
  cors: cors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      const isDev = process.env.NODE_ENV === 'development';
      
      if (isDev && (!origin || origin === 'http://localhost:3000')) {
        return callback(null, true);
      }
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400, // 24 hours
  }),

  // Rate limiting middleware
  rateLimit: async (req, res, next) => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'anonymous';
      await rateLimiter.consume(ip);
      next();
    } catch (error) {
      res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(error.msBeforeNext / 1000),
      });
    }
  },

  // Stricter rate limit for calculations
  calculationRateLimit: async (req, res, next) => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'anonymous';
      await calculationRateLimiter.consume(ip);
      next();
    } catch (error) {
      res.status(429).json({
        error: 'Too many calculation requests. Please wait a few minutes.',
        retryAfter: Math.ceil(error.msBeforeNext / 1000),
      });
    }
  },

  // Input sanitization
  sanitizeParams: (req, res, next) => {
    // Sanitize all URL parameters
    const sanitize = (value) => {
      if (typeof value !== 'string') return value;
      // Allow alphanumeric, spaces, hyphens, underscores, periods, commas
      return value.replace(/[^a-zA-Z0-9\s\-_,.]/g, '').trim();
    };

    // Sanitize route params
    if (req.params) {
      for (const key of Object.keys(req.params)) {
        req.params[key] = sanitize(req.params[key]);
      }
    }

    // Sanitize query params
    if (req.query) {
      for (const key of Object.keys(req.query)) {
        req.query[key] = sanitize(req.query[key]);
      }
    }

    // Validate body (if exists)
    if (req.body && typeof req.body === 'object') {
      const allowedFields = ['lat', 'lon', 'regionType', 'readinessIndex'];
      for (const field of Object.keys(req.body)) {
        if (!allowedFields.includes(field)) {
          delete req.body[field];
        }
        if (typeof req.body[field] === 'string') {
          req.body[field] = sanitize(req.body[field]);
        }
      }
    }

    next();
  },

  // Prevent SQL injection (parametrized queries are handled by Supabase)
  // No additional middleware needed as Supabase uses parameterized queries
};