export const MONTHLY_QUOTA_LIMITS = Object.freeze({
  free: 5,
  pro: 500
});

// Product metadata only. Payment providers and checkout are intentionally not
// connected yet; use integer fen when this value is eventually sent to one.
export const PLAN_PRICING = Object.freeze({
  free: Object.freeze({ monthlyPriceFen: 0, displayPrice: '¥0' }),
  pro: Object.freeze({ monthlyPriceFen: 1990, displayPrice: '¥19.9/月' })
});
