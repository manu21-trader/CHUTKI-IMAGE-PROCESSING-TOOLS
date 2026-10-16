import express from 'express';
import { protect } from '../middleware/auth.js';
import { getUsageSummary } from '../services/quotaService.js';

const router = express.Router();

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

router.get('/me', requireDatabase, protect, async (req, res, next) => {
  try {
    res.json(await getUsageSummary(req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
