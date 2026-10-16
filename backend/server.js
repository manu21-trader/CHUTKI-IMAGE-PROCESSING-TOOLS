// backend/server.js

// [FAST] CRITICAL: Catch ALL unhandled promise rejections (e.g. MongoDB DNS errors)
// so the server process never crashes silently on Render
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Caught:', reason?.message || reason);
  // Do NOT exit — let the server keep running without DB if needed
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Caught:', err?.message || err);
  // Do NOT exit — allows server to stay alive even if a module throws
});

import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import PDFDocument from "pdfkit";
import Tesseract from "tesseract.js";
import JSZip from "jszip";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";

// Load environment variables FIRST
dotenv.config({ path: './.env' });

// Import configurations and middleware AFTER dotenv
import connectDB from "./config/database.js";
// Import simplified passport config
import passport from "./config/passport-simple.js";
import { validateFile } from "./utils/validation.js";
import { successResponse, errorResponse } from "./utils/response.js";

// PERMANENT FIX: Import memory monitor to prevent tools from failing after 1 hour
import './memory-monitor.js';

// COLD START PREVENTION: Import comprehensive cold start prevention system
import { initColdStartPrevention } from './cold-start-prevention.js';

import { validateEnvironment, getEnvironmentInfo } from "./utils/envValidation.js";

// Import modular tools router
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import usageRoutes from "./routes/usage.js";
import { protect } from "./middleware/auth.js";
import { enforceMonthlyQuota } from "./middleware/quota.js";
// Modular tool category routers (split from unified-tools.js)
import compressorsRoutes from "./api/tools/compressors.js";
import convertersRoutes from "./api/tools/converters.js";
import resizersRoutes from "./api/tools/resizers.js";
import editorsRoutes from "./api/tools/editors.js";
import chatgptRoutes from "./api/chatgpt.js";
import aiChatRoutes from "./api/ai-chat.js";

// Import passport-photo-advanced (separate advanced router)
import passportPhotoAdvancedRoutes from "./api/tools/passport-photo-advanced.js";

// Import cold start status API
import coldStartStatusRoutes from "./api/cold-start-status.js";

// Validate environment configuration
const { errors, warnings } = validateEnvironment();

if (errors.length > 0) {
  console.error('[ERROR] Environment validation errors:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('[WARN]  Environment warnings:');
  warnings.forEach(warning => console.warn(`  - ${warning}`));
}

const app = express();
const PORT = process.env.PORT || 5001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trust proxy is required when running behind a proxy like Render/Heroku/Nginx
// This fixes the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR error
app.set('trust proxy', 1);

// ================== Security Middleware ==================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Compression middleware — skip binary files (images, PDFs, ZIPs)
// Gzipping images breaks downloads: blob.size shows compressed size, not actual image size
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    const ct = res.getHeader('Content-Type') || '';
    // Never compress already-compressed binary formats
    if (ct.startsWith('image/') || ct === 'application/pdf' ||
        ct === 'application/zip' || ct === 'application/octet-stream') {
      return false;
    }
    return compression.filter(req, res);
  }
}));


// Performance optimization headers
app.use((req, res, next) => {
  // Cache static assets
  if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }

  // Optimize response headers
  res.setHeader('X-Powered-By', 'CHUTKI');
  res.setHeader('Server', 'CHUTKI-Server');

  next();
});

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs (increased for performance testing)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // limit each IP to 5000 uploads per windowMs (increased for performance testing)
  message: {
    error: 'Too many file uploads from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
});

app.use('/api/', generalLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/passport-photo', uploadLimiter);
app.use('/api/tools/', uploadLimiter);

// ================== Basic Middleware ==================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      process.env.CLIENT_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Enhanced logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Import connect-mongo for persistent session storage
import MongoStore from "connect-mongo";

// Session configuration - use MongoStore only if MongoDB URI is available
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Only use MongoStore if we have a valid MongoDB URI (prevents crash on startup)
if (process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith('mongodb')) {
  try {
    sessionConfig.store = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60 // 1 day
    });
    console.log('[SESSION] Using MongoStore for session persistence');
  } catch (err) {
    console.warn('[SESSION] MongoStore failed, using in-memory sessions:', err.message);
  }
} else {
  console.log('[SESSION] Using in-memory session store (no MongoDB URI)');
}

app.use(session(sessionConfig));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// ================== File Upload Configuration ==================
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 20 // Maximum 20 files
  },
  fileFilter
});

// ================== Image Cleanup System ==================
const cleanupInterval = 30 * 60 * 1000; // 30 minutes
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const cleanupOldFiles = () => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();

      if (fileAge > cleanupInterval) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      console.log(`[CLEANUP] Cleaned up ${deletedCount} old files`);
    }
  } catch (error) {
    console.error('[ALERT] Cleanup error:', error.message);
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, cleanupInterval);

// Initial cleanup
cleanupOldFiles();
console.log(`[CLEANUP] Cleanup completed. 0 files checked.`);

// Static files with security headers
app.use("/uploads", (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
}, express.static(path.join(__dirname, "uploads")));

// ================== Routes ==================
// Favicon route to prevent 500 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).send();
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Profile routes
app.use('/api/profile', profileRoutes);

// Current user's monthly image processing usage
app.use('/api/usage', usageRoutes);

// ChatGPT API routes
app.use('/api/chatgpt', chatgptRoutes);

// AI Chat routes
app.use('/api/ai', aiChatRoutes);

// ── Modular tool category routers (ORDER MATTERS: specific before generic) ──
// Every POST below this shared mount is an image-processing request. Authenticate
// and reserve quota before parsing uploads so no category router or alias can
// bypass usage enforcement. Public GET health/list routes pass through unchanged.
const protectToolProcessing = (req, res, next) => {
  if (req.method !== 'POST') return next();
  return protect(req, res, next);
};
const enforceToolProcessingQuota = (req, res, next) => {
  if (req.method !== 'POST') return next();
  return enforceMonthlyQuota(req, res, next);
};

app.use('/api/tools', protectToolProcessing);
app.use('/api/tools', enforceToolProcessingQuota);

// Parse multipart forms ONCE for all tool routes to prevent stream-draining hangs.
app.use('/api/tools', upload.any());

// IMPORTANT: passport-photo-advanced MUST come BEFORE editorsRoutes
// because editorsRoutes uses a wildcard /:tool that would capture it first
app.use('/api/tools/passport-photo-advanced', passportPhotoAdvancedRoutes);

// Compression tools: compress-Xkb, reduce-size-kb, image-compressor, etc.
app.use('/api/tools', compressorsRoutes);
// Conversion tools: heic-to-jpg, image-to-pdf, pdf-to-jpg, OCR, etc.
app.use('/api/tools', convertersRoutes);
// Resize tools: resize-pixel, resize-cm, passport sizes, social media, etc.
app.use('/api/tools', resizersRoutes);
// Editor tools: rotate, flip, watermark, circle-crop, grayscale, effects, etc.
app.use('/api/tools', editorsRoutes);

// Cold start prevention status API
app.use('/api/cold-start', coldStartStatusRoutes);

// ── Tools health & list routes ─────────────────────────────────────────────────
app.get('/api/tools/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'image-tools',
    timestamp: new Date().toISOString(),
    totalTools: 81,
    categories: {
      compression: 23,
      conversion: 13,
      resize: 24,
      editing: 20,
      special: 1
    },
    database: global.DATABASE_CONNECTED ? 'connected' : 'standalone',
    message: 'All image processing tools are operational'
  });
});

app.get('/api/tools/list', (req, res) => {
  res.json({
    status: 'OK',
    count: 81,
    tools: [
      // Compression
      'image-compressor','reduce-size-kb','reduce-size-mb','increase-size-kb',
      'compress-5kb','compress-10kb','compress-15kb','compress-20kb','compress-20-50kb',
      'compress-25kb','compress-30kb','compress-40kb','compress-50kb','compress-100kb',
      'compress-150kb','compress-200kb','compress-300kb','compress-500kb',
      'compress-1mb','compress-2mb','jpg-to-kb','mb-to-kb','kb-to-mb',
      // Conversion
      'heic-to-jpg','webp-to-jpg','jpeg-to-png','png-to-jpeg','jpg-to-text','png-to-text',
      'jpg-to-pdf-50kb','jpg-to-pdf-100kb','jpeg-to-pdf-200kb','jpg-to-pdf-300kb',
      'jpg-to-pdf-500kb','image-to-pdf','pdf-to-jpg',
      // Resize
      'resize-pixel','resize-cm','resize-mm','resize-inches','resize-6x2-300dpi',
      'resize-3-5x4-5cm','resize-35x45mm','resize-2x2','resize-4x6','resize-3x4',
      'resize-600x600','resize-a4','resize-ssc','resize-pan','resize-upsc',
      'resize-whatsapp-dp','resize-instagram','instagram-grid','resize-youtube-banner',
      'super-resolution','resize-signature','resize-sign-50x20mm','bulk-resize','join-images',
      // Editing
      'rotate','flip','watermark','black-white','grayscale','circle-crop','pixelate',
      'pixelate-face','blur-face','censor','freehand-crop','remove-background',
      'color-picker','split-image','add-name-dob','convert-dpi','check-dpi',
      'pixel-art','generate-signature','ai-face-generator',
      // Special
      'passport-photo-advanced'
    ]
  });
});

// Debug endpoint to verify routing
app.get('/api/debug/routes', (req, res) => {
  res.json({
    message: 'Server is running with modular tools router',
    timestamp: new Date().toISOString(),
    routes: {
      '/api/tools/test': 'GET - Test endpoint',
      '/api/tools/passport-photo': 'POST - Passport photo tool',
      '/api/tools/passport-photo-advanced': 'POST - Advanced passport photo tool',
      '/api/tools/resize-pixel': 'POST - Resize image pixel tool',
      '/api/tools/:tool': 'POST - Any tool via modular router'
    }
  });
});

// ================== Health & Monitoring Endpoints ==================

// Ultra-lightweight ping endpoint for cold start prevention
// No database checks, minimal processing - responds in <100ms
app.get("/ping", (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Powered-By', 'CHUTKI');
  res.status(200).json({
    status: "pong",
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime())
  });
});

// Warmup endpoint to pre-load dependencies after cold start
app.get("/api/warmup", async (req, res) => {
  try {
    const startTime = Date.now();

    // Pre-warm image processing libraries
    const warmupTasks = [
      // Test Sharp
      sharp(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))
        .metadata()
        .catch(() => { }),

      // Ensure database connection is active
      mongoose.connection.db ? Promise.resolve() : Promise.reject(),
    ];

    await Promise.allSettled(warmupTasks);

    const warmupTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      message: 'Server warmed up successfully',
      warmupTime: `${warmupTime}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: 'Warmup completed with warnings',
      timestamp: new Date().toISOString()
    });
  }
});

// Optimized health check endpoint with caching
let healthCache = null;
let healthCacheTime = 0;
const HEALTH_CACHE_TTL = 30000; // 30 seconds

app.get("/api/health", (req, res) => {
  // Set performance headers
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.setHeader('X-Response-Time', Date.now());

  const now = Date.now();

  // Return cached response if still valid
  if (healthCache && (now - healthCacheTime) < HEALTH_CACHE_TTL) {
    return res.status(200).json(healthCache);
  }

  // Generate fresh health data
  const environmentInfo = getEnvironmentInfo();
  const healthData = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: environmentInfo,
    database: global.DATABASE_CONNECTED ? "connected" : "disconnected",
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    version: process.env.npm_package_version || '1.0.0',
    keepAlive: true
  };

  const response = successResponse({ message: 'Service healthy', data: healthData });

  // Cache the response
  healthCache = response;
  healthCacheTime = now;

  res.status(200).json(response);
});

// Google OAuth routes are handled in routes/auth.js

// ... rest of your code ...

// ================== Error Handling ==================
app.use((err, req, res, next) => {
  console.error(`[ALERT] Error [${req.requestId}]:`, err.stack);

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json(errorResponse(res, "File too large. Maximum size is 10MB."));
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json(errorResponse(res, "Too many files. Maximum 20 files allowed."));
    }
    return res.status(400).json(errorResponse(res, `Upload error: ${err.message}`));
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json(errorResponse(res, "CORS policy violation"));
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json(errorResponse(res, "Validation failed", err.errors));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(errorResponse(res, "Invalid token"));
  }

  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(500).json(errorResponse(res, "Database error"));
  }

  // Default error response
  res.status(500).json(errorResponse(res,
    process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    process.env.NODE_ENV === "production" ? undefined : err.stack
  ));
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// ================== Graceful Shutdown ==================
const gracefulShutdown = (signal) => {
  console.log(`\n[PKG] Received ${signal}. Starting graceful shutdown...`);

  // Close server
  server.close(() => {
    console.log('[SERVER] HTTP server closed');

    // Close database connection
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close(() => {
        console.log('[PKG] MongoDB connection closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('[WARN]  Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// ================== Start Server ==================
const startServer = () => {
  try {
    // [START] ULTRA-FAST COLD START FIX:
    // Start Express immediately so Render connects to Port 10000 within milliseconds!
    // This allows the frontend to load instantly while the database connects in the background.
    const server = app.listen(PORT, () => {
      console.log(`[START] Server instantly bound to port ${PORT} to bypass Render delays`);
      console.log(`[FRONTEND] Frontend URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
      console.log(`[BACKEND] Backend URL: http://localhost:${PORT}`);
      console.log(`[HEALTH] Health check: http://localhost:${PORT}/api/health`);
      
      // Initialize comprehensive cold start prevention system
      const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      initColdStartPrevention(serverUrl);
      console.log(`[COLD-START] [SHIELD] 100% uptime protection enabled`);
    });

    // Connect to database completely asynchronously in the background
    console.log('[CONNECTING] Initiating background database connection...');
    connectDB().catch(err => console.error('[DB ERROR]', err));

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error("[ERROR] Failed to start server:", error);
    process.exit(1);
  }
};

const server = startServer();
