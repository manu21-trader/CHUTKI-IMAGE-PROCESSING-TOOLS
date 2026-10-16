import rateLimit from 'express-rate-limit';
import { protect } from './auth.js';
import { enforceMonthlyQuota } from './quota.js';
import {
  TOOL_ACCESS,
  getCanonicalToolSlug,
  getToolAccess
} from '../../shared/toolAccessPolicy.js';

const toolSlugFromRequest = req => decodeURIComponent(req.path).split('/').filter(Boolean)[0] || '';

const makeLimiter = (max, scope) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limit_exceeded',
    message: `${scope} image processing rate limit reached`,
    retryAfter: '15 minutes'
  }
});

const publicToolLimiter = makeLimiter(
  Number.parseInt(process.env.PUBLIC_TOOL_RATE_LIMIT || '60', 10),
  'Public'
);
const meteredToolLimiter = makeLimiter(
  Number.parseInt(process.env.METERED_TOOL_RATE_LIMIT || '30', 10),
  'Metered'
);

export const classifyToolRequest = (req, res, next) => {
  if (req.method !== 'POST') return next();

  const requestedTool = toolSlugFromRequest(req);
  const access = getToolAccess(requestedTool);
  if (!access) {
    return res.status(404).json({
      error: 'tool_not_found',
      message: 'Image tool is not available'
    });
  }
  if (access === TOOL_ACCESS.HIDDEN_UNSTABLE) {
    return res.status(404).json({
      error: 'tool_unavailable',
      message: 'This image tool is temporarily unavailable'
    });
  }

  req.toolPolicy = {
    requestedTool,
    canonicalTool: getCanonicalToolSlug(requestedTool),
    access
  };
  next();
};

export const limitToolRequests = (req, res, next) => {
  if (req.method !== 'POST') return next();
  const limiter = req.toolPolicy?.access === TOOL_ACCESS.PUBLIC_LOW_COST
    ? publicToolLimiter
    : meteredToolLimiter;
  return limiter(req, res, next);
};

export const protectMeteredTool = (req, res, next) => {
  if (req.method !== 'POST' || req.toolPolicy?.access === TOOL_ACCESS.PUBLIC_LOW_COST) return next();
  return protect(req, res, next);
};

export const quotaMeteredTool = (req, res, next) => {
  if (req.method !== 'POST' || req.toolPolicy?.access === TOOL_ACCESS.PUBLIC_LOW_COST) return next();
  return enforceMonthlyQuota(req, res, next);
};
