import Usage from '../models/Usage.js';
import { MONTHLY_QUOTA_LIMITS } from '../config/quota.js';

const BILLING_TIME_ZONE = 'Asia/Shanghai';
const billingPeriodFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BILLING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit'
});

export const getPeriodKey = (date = new Date()) => {
  const parts = billingPeriodFormatter.formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
};

export const getEffectivePlan = (user, now = new Date()) => {
  const subscription = user.subscription;
  const proIsActive = subscription?.plan === 'pro' &&
    subscription?.status === 'active' &&
    (!subscription.endDate || subscription.endDate > now);

  return proIsActive ? 'pro' : 'free';
};

const ensureUsageRecord = async (userId, periodKey) => {
  try {
    await Usage.updateOne(
      { userId, periodKey },
      { $setOnInsert: { userId, periodKey, usedCount: 0 } },
      { upsert: true }
    );
  } catch (error) {
    // Concurrent first requests may race to create the same unique record.
    if (error?.code !== 11000) throw error;
  }
};

export const getUsageSummary = async (user, date = new Date()) => {
  const period = getPeriodKey(date);
  const plan = getEffectivePlan(user, date);
  const limit = MONTHLY_QUOTA_LIMITS[plan];
  const usage = await Usage.findOne({ userId: user._id, periodKey: period }).lean();
  const used = usage?.usedCount || 0;

  return {
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period
  };
};

export const reserveUsage = async (user, date = new Date()) => {
  const period = getPeriodKey(date);
  const plan = getEffectivePlan(user, date);
  const limit = MONTHLY_QUOTA_LIMITS[plan];

  await ensureUsageRecord(user._id, period);

  const usage = await Usage.findOneAndUpdate(
    {
      userId: user._id,
      periodKey: period,
      usedCount: { $lt: limit }
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );

  if (!usage) {
    const current = await Usage.findOne({ userId: user._id, periodKey: period }).lean();
    return {
      allowed: false,
      plan,
      limit,
      used: current?.usedCount || 0,
      period
    };
  }

  return {
    allowed: true,
    reservationId: usage._id,
    plan,
    limit,
    used: usage.usedCount,
    period
  };
};

export const releaseUsage = async (reservationId) => {
  if (!reservationId) return;

  await Usage.updateOne(
    { _id: reservationId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }
  );
};
