import assert from 'node:assert/strict';
import Usage from './models/Usage.js';
import {
  getPeriodKey,
  getUsageSummary,
  releaseUsage,
  reserveUsage
} from './services/quotaService.js';

const originals = {
  updateOne: Usage.updateOne,
  findOne: Usage.findOne,
  findOneAndUpdate: Usage.findOneAndUpdate
};
const records = new Map();
let nextId = 1;
const keyFor = query => `${String(query.userId)}:${query.periodKey}`;

Usage.updateOne = async (query, update, options = {}) => {
  if (query._id) {
    const record = [...records.values()].find(item => item._id === query._id);
    if (record && record.usedCount > 0 && update.$inc?.usedCount) record.usedCount += update.$inc.usedCount;
    return { modifiedCount: record ? 1 : 0 };
  }
  const key = keyFor(query);
  if (!records.has(key) && options.upsert) {
    records.set(key, { _id: String(nextId++), ...update.$setOnInsert });
  }
  return { acknowledged: true };
};

Usage.findOneAndUpdate = async (query, update) => {
  const record = records.get(keyFor(query));
  if (!record || record.usedCount >= query.usedCount.$lt) return null;
  record.usedCount += update.$inc.usedCount;
  return { ...record };
};

Usage.findOne = query => ({
  lean: async () => {
    const record = records.get(keyFor(query));
    return record ? { ...record } : null;
  }
});

try {
  assert.equal(getPeriodKey(new Date('2026-10-31T15:59:59.999Z')), '2026-10');
  assert.equal(getPeriodKey(new Date('2026-10-31T16:00:00.000Z')), '2026-11');

  const now = new Date('2026-10-16T00:00:00.000Z');
  const freeUser = { _id: 'free-user', subscription: { plan: 'free', status: 'active', endDate: null } };
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await reserveUsage(freeUser, now)).allowed, true);
  }
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () => reserveUsage(freeUser, now))
  );
  assert.equal(concurrent.filter(result => result.allowed).length, 1);
  assert.equal(concurrent.filter(result => !result.allowed).length, 9);
  assert.deepEqual(await getUsageSummary(freeUser, now), {
    plan: 'free', limit: 5, used: 5, remaining: 0, period: '2026-10'
  });

  const sixth = await reserveUsage(freeUser, now);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.limit, 5);

  const refundableUser = { _id: 'refundable-user', subscription: { plan: 'free', status: 'active' } };
  const reservation = await reserveUsage(refundableUser, now);
  await releaseUsage(reservation.reservationId);
  assert.equal((await getUsageSummary(refundableUser, now)).used, 0);

  const proUser = {
    _id: 'pro-user',
    subscription: { plan: 'pro', status: 'active', endDate: new Date('2026-11-16T00:00:00.000Z') }
  };
  const proSummary = await getUsageSummary(proUser, now);
  assert.equal(proSummary.plan, 'pro');
  assert.equal(proSummary.limit, 500);
  for (let index = 0; index < 500; index += 1) {
    assert.equal((await reserveUsage(proUser, now)).allowed, true);
  }
  assert.equal((await reserveUsage(proUser, now)).allowed, false);

  console.log('PASS Beijing natural-month boundary remains unchanged');
  console.log('PASS free quota allows 5 and rejects the 6th');
  console.log('PASS ten concurrent reservations consume at most one remaining use');
  console.log('PASS failed work can release a reserved use');
  console.log('PASS active unexpired Pro receives 500 uses');
} finally {
  Usage.updateOne = originals.updateOne;
  Usage.findOne = originals.findOne;
  Usage.findOneAndUpdate = originals.findOneAndUpdate;
}
