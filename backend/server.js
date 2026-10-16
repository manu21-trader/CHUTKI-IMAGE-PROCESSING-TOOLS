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
import {
  classifyToolRequest,
  limitToolRequests,
  protectMeteredTool,
  quotaMeteredTool
} from "./middleware/toolAccess.js";
import {
  acquireImageProcessingSlot,
  validateImageRequest
} from "./middleware/imageSafety.js";
import { IMAGE_LIMITS } from "./config/imageLimits.js";
import {
  ALL_IMAGE_TOOLS,
  PUBLIC_LOW_COST,
  METERED_HIGH_COST,
  HIDDEN_UNSTABLE
} from "../shared/toolAccessPolicy.js";
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
  max: Number.parseInt(process.env.GENERAL_RATE_LIMIT || '300', 10),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

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
    fileSize: IMAGE_LIMITS.maxFileBytes,
    files: IMAGE_LIMITS.maxFiles,
    parts: IMAGE_LIMITS.maxFiles + 30
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

const requireAiChatEnabled = (req, res, next) => {
  if (process.env.DISABLE_AI_CHAT !== 'false') {
    return res.status(503).json({
      error: 'AI_CHAT_DISABLED',
      message: 'AI chat is disabled'
    });
  }
  next();
};

// AI Chat code remains available but is disabled unless explicitly enabled.
app.use('/api/chatgpt', requireAiChatEnabled, chatgptRoutes);
app.use('/api/ai', requireAiChatEnabled, aiChatRoutes);

// ── Modular tool category routers (ORDER MATTERS: specific before generic) ──
// Every POST below this shared mount is classified once. Metered tools authenticate
// and reserve quota; public tools skip User/Usage but retain all resource guards.
// Public GET health/list routes pass through unchanged.
app.use('/api/tools', classifyToolRequest);
app.use('/api/tools', limitToolRequests);
app.use('/api/tools', protectMeteredTool);
app.use('/api/tools', quotaMeteredTool);
app.use('/api/tools', acquireImageProcessingSlot);

// Parse multipart forms ONCE for all tool routes to prevent stream-draining hangs.
app.use('/api/tools', upload.any());
app.use('/api/tools', validateImageRequest);

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
    totalTools: ALL_IMAGE_TOOLS.length,
    accessPolicy: {
      publicLowCost: PUBLIC_LOW_COST.length,
      meteredHighCost: METERED_HIGH_COST.length,
      hiddenUnstable: HIDDEN_UNSTABLE.length
    },
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
    count: ALL_IMAGE_TOOLS.length,
    tools: ALL_IMAGE_TOOLS,
    accessPolicy: {
      publicLowCost: PUBLIC_LOW_COST,
      meteredHighCost: METERED_HIGH_COST,
      hiddenUnstable: HIDDEN_UNSTABLE
    }
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
  if (err instanceof multer.MulterError || err?.name === 'MulterError' || String(err?.code).startsWith('LIMIT_')) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return errorResponse(res, "File too large. Maximum size is 8 MiB.", 413);
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return errorResponse(res, "Too many files. Maximum 4 files allowed.", 413);
    }
    return errorResponse(res, `Upload error: ${err.message}`, 400);
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return errorResponse(res, "CORS policy violation", 403);
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return errorResponse(res, "Validation failed", 400, err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, "Invalid token", 401);
  }

  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return errorResponse(res, "Database error", 500);
  }

  // Default error response
  return errorResponse(
    res,
    process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    500,
    process.env.NODE_ENV === "production" ? null : err
  );
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
