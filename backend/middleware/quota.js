import { releaseUsage, reserveUsage } from '../services/quotaService.js';

const attachQuotaSettlement = (req, res) => {
  const originalEnd = res.end.bind(res);
  let responseEnding = false;

  // Settle before a failed response reaches the client. This makes a failed
  // image request immediately refundable while keeping success accounting
  // synchronous and centralized for every tool router.
  res.end = (...args) => {
    const reservation = req.quotaReservation;
    if (!reservation || reservation.settled) return originalEnd(...args);
    if (responseEnding) return res;

    responseEnding = true;
    if (res.statusCode >= 200 && res.statusCode < 300) {
      confirmQuotaUsage(req);
      return originalEnd(...args);
    }

    rollbackQuotaUsage(req)
      .catch(error => {
        console.error('[QUOTA] Failed to roll back unsuccessful request:', error.message);
      })
      .finally(() => originalEnd(...args));
    return res;
  };

  // Refund a reservation if the client disconnects while processing is still
  // underway and no response was completed.
  res.once('close', () => {
    if (!res.writableEnded) {
      rollbackQuotaUsage(req).catch(error => {
        console.error('[QUOTA] Failed to roll back aborted request:', error.message);
      });
    }
  });
};

export const enforceMonthlyQuota = async (req, res, next) => {
  try {
    const reservation = await reserveUsage(req.user);

    if (!reservation.allowed) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message: 'Monthly usage limit reached',
        plan: reservation.plan,
        limit: reservation.limit,
        used: reservation.used
      });
    }

    req.quotaReservation = {
      id: reservation.reservationId,
      settled: false
    };
    attachQuotaSettlement(req, res);
    next();
  } catch (error) {
    next(error);
  }
};

export const confirmQuotaUsage = (req) => {
  if (req.quotaReservation) {
    req.quotaReservation.settled = true;
  }
};

export const rollbackQuotaUsage = async (req) => {
  const reservation = req.quotaReservation;
  if (!reservation || reservation.settled) return;

  // Mark first so multiple error paths cannot refund the same request twice.
  reservation.settled = true;
  await releaseUsage(reservation.id);
};
