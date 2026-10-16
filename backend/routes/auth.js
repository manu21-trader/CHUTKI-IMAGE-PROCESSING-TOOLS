import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  verifyToken,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

// Middleware to check database connection
const requireDatabase = (req, res, next) => {
  if (!global.DATABASE_CONNECTED) {
    return res.status(503).json({
      success: false,
      message: 'Database not available',
      error: 'DATABASE_UNAVAILABLE'
    });
  }
  next();
};

const router = express.Router();

// Local authentication routes
router.post('/register', requireDatabase, register);
router.post('/login', requireDatabase, login);
router.post('/logout', requireDatabase, logout);

// Password reset routes
router.post('/forgot-password', requireDatabase, forgotPassword);
router.post('/reset-password', requireDatabase, resetPassword);

// Token verification endpoint
router.get('/verify-token', requireDatabase, protect, verifyToken);

// Status check endpoint for keep-alive monitoring (no auth required)
router.get('/status', (req, res) => {
  const hasGoogleOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const databaseConnected = global.DATABASE_CONNECTED || false;

  res.status(200).json({
    status: 'OK',
    service: 'auth',
    timestamp: new Date().toISOString(),
    features: {
      googleOAuth: hasGoogleOAuth,
      database: databaseConnected
    },
    message: 'Authentication service is healthy'
  });
});

router.get('/verify', requireDatabase, protect, verifyToken);

// Protected routes
router.get('/profile', requireDatabase, protect, getProfile);
router.put('/profile', requireDatabase, protect, updateProfile);

// Google OAuth routes — always registered, credentials/DB checked at request time
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Google OAuth initiation
  router.get('/google', (req, res, next) => {
    if (!global.DATABASE_CONNECTED) {
      return res.status(503).json({ success: false, message: 'Database not connected', error: 'DATABASE_UNAVAILABLE' });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });

  // Google OAuth callback
  router.get('/google/callback',
    (req, res, next) => {
      if (!global.DATABASE_CONNECTED) {
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=database_unavailable`);
      }
      passport.authenticate('google', {
        failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`,
        session: true
      })(req, res, next);
    },
    async (req, res) => {
      try {
        console.log('[OAUTH] Callback received, user:', req.user ? req.user.email : 'Missing');
        if (!req.user) {
          return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`);
        }
        const token = jwt.sign(
          { userId: req.user._id, email: req.user.email, provider: req.user.provider || 'google' },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth-success?token=${token}`);
      } catch (error) {
        console.error('[OAUTH] Callback error:', error.message);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_error`);
      }
    }
  );

  console.log('[OK] Google OAuth routes initialized successfully');
} else {
  router.get('/google', (req, res) => {
    res.status(503).json({ success: false, message: 'Google OAuth not configured', error: 'OAUTH_DISABLED' });
  });
  router.get('/google/callback', (req, res) => {
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_disabled`);
  });
  console.log('[LOG] Google OAuth routes disabled — GOOGLE_CLIENT_ID/SECRET not set');
}

export default router;
