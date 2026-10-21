import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MONTHLY_QUOTA_LIMITS, PLAN_PRICING } from './config/quota.js';
import { getPeriodKey } from './services/quotaService.js';
import {
  PUBLIC_LOW_COST,
  METERED_HIGH_COST,
  HIDDEN_UNSTABLE
} from '../shared/toolAccessPolicy.js';

const require = createRequire(import.meta.url);

const getAvailablePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});

const waitForDatabase = async (baseUrl, serverLogs) => {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/status`);
      const body = await response.json();
      if (response.ok && body.features?.database) return;
    } catch (_) {
      // Backend or MongoDB may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not connect to the test database.\n${serverLogs()}`);
};

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
};

let validImageBuffer;
const createImageForm = (valid = true, fields = {}, sourceBuffer = validImageBuffer) => {
  const form = new FormData();
  const buffer = sourceBuffer && valid ? sourceBuffer : Buffer.from('not-an-image');
  form.append('image', new Blob([buffer], { type: 'image/png' }), 'source.png');
  Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
  return form;
};

const processImage = (baseUrl, tool, token, options = {}) => {
  const { valid = true, fields = {}, headers = {}, buffer } = options;
  return fetch(`${baseUrl}/api/tools/${tool}`, {
    method: 'POST',
    headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    body: createImageForm(valid, fields, buffer || validImageBuffer)
  });
};

const register = (baseUrl, email) => requestJson(`${baseUrl}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Usage Test User', email, password: 'test-password-123' })
});

const getUsage = (baseUrl, token) => requestJson(`${baseUrl}/api/usage/me`, {
  headers: { Authorization: `Bearer ${token}` }
});

let mongoServer;
let databaseConnection;
let backendProcess;
let output = '';

try {
  assert.deepEqual(MONTHLY_QUOTA_LIMITS, { free: 5, pro: 500 });
  assert.deepEqual(PLAN_PRICING.free, { monthlyPriceFen: 0, displayPrice: '¥0' });
  assert.deepEqual(PLAN_PRICING.pro, { monthlyPriceFen: 1990, displayPrice: '¥19.9 / 30天' });

  // Beijing changes month at 16:00 UTC on the previous UTC calendar day.
  assert.equal(getPeriodKey(new Date('2026-10-31T15:59:59.999Z')), '2026-10');
  assert.equal(getPeriodKey(new Date('2026-10-31T16:00:00.000Z')), '2026-11');
  assert.equal(getPeriodKey(new Date('2026-11-30T16:00:00.000Z')), '2026-12');

  validImageBuffer = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#663399' }
  }).png().toBuffer();

  const testDatabaseName = `chutki_usage_test_${Date.now()}`;
  let mongoUri;

  if (process.env.TEST_MONGODB_URI) {
    const separator = process.env.TEST_MONGODB_URI.endsWith('/') ? '' : '/';
    mongoUri = `${process.env.TEST_MONGODB_URI}${separator}${testDatabaseName}`;
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: process.env.MONGOMS_VERSION || '7.0.14',
        downloadDir: process.env.MONGOMS_DOWNLOAD_DIR || path.join(os.tmpdir(), 'chutki-mongodb-binaries')
      }
    });
    mongoUri = mongoServer.getUri(testDatabaseName);
  }

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  backendProcess = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: mongoUri,
      ENABLE_MONGODB: 'true',
      JWT_SECRET: 'test-only-jwt-secret-that-is-long-enough',
      SESSION_SECRET: 'test-only-session-secret-that-is-long-enough',
      RESEND_API_KEY: 're_test_only_not-a-real-key',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      PUBLIC_TOOL_RATE_LIMIT: '500',
      METERED_TOOL_RATE_LIMIT: '500'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', chunk => { output += chunk.toString(); });
  backendProcess.stderr.on('data', chunk => { output += chunk.toString(); });

  await waitForDatabase(baseUrl, () => output);
  databaseConnection = await mongoose.createConnection(mongoUri).asPromise();

  // The real server route exposes the shared 81-tool processing inventory.
  const toolList = await requestJson(`${baseUrl}/api/tools/list`);
  assert.equal(toolList.response.status, 200);
  assert.equal(toolList.body.count, 81);
  assert.equal(toolList.body.tools.length, 81);

  assert.equal(toolList.body.accessPolicy.publicLowCost.length, 39);
  assert.equal(toolList.body.accessPolicy.meteredHighCost.length, 37);
  assert.equal(toolList.body.accessPolicy.hiddenUnstable.length, 5);

  const unauthenticatedMetered = await Promise.all(
    [...METERED_HIGH_COST, 'passport-photo', 'ocr'].map(tool => fetch(`${baseUrl}/api/tools/${tool}`, { method: 'POST' }))
  );
  unauthenticatedMetered.forEach(response => assert.equal(response.status, 401));

  for (const tool of [...PUBLIC_LOW_COST, 'rotate-tool', 'flip-tool', 'compress-image']) {
    const response = await fetch(`${baseUrl}/api/tools/${tool}`, { method: 'POST' });
    assert.equal(response.status, 400);
  }

  const hiddenResults = await Promise.all(
    HIDDEN_UNSTABLE.map(tool => fetch(`${baseUrl}/api/tools/${tool}`, { method: 'POST' }))
  );
  hiddenResults.forEach(response => assert.equal(response.status, 404));
  assert.equal((await fetch(`${baseUrl}/api/tools/compress-arbitrary`, { method: 'POST' })).status, 404);

  const freeRegistration = await register(baseUrl, `free-${Date.now()}@example.com`);
  assert.equal(freeRegistration.response.status, 201);
  const freeToken = freeRegistration.body.token;
  const currentPeriod = getPeriodKey();

  const initialUsage = await getUsage(baseUrl, freeToken);
  assert.deepEqual(initialUsage.body, {
    plan: 'free', limit: 5, used: 0, remaining: 5, period: currentPeriod
  });

  for (const [tool, fields] of [
    ['rotate', {}],
    ['resize-pixel', { width: 16, height: 16 }],
    ['jpeg-to-png', {}]
  ]) {
    const response = await processImage(baseUrl, tool, null, { fields });
    assert.equal(response.status, 200, `${tool} should be public`);
  }
  const usageAfterPublicTools = await getUsage(baseUrl, freeToken);
  assert.equal(usageAfterPublicTools.body.used, 0);

  const profilePlanInjection = await requestJson(`${baseUrl}/api/profile`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${freeToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Still Free User',
      plan: 'pro',
      membershipStatus: 'active',
      subscription: { plan: 'pro', status: 'active' }
    })
  });
  assert.equal(profilePlanInjection.response.status, 200);
  const usageAfterProfileInjection = await getUsage(baseUrl, freeToken);
  assert.equal(usageAfterProfileInjection.body.plan, 'free');
  assert.equal(usageAfterProfileInjection.body.limit, 5);

  // Invalid processing must be refunded before the error response completes.
  const failedProcessing = await processImage(baseUrl, 'remove-background', freeToken, { valid: false });
  assert.equal(failedProcessing.status, 400);
  const usageAfterFailure = await getUsage(baseUrl, freeToken);
  assert.equal(usageAfterFailure.body.used, 0);

  // Request-controlled fields and headers must not elevate a database-backed plan.
  const spoofedPlan = await processImage(baseUrl, 'remove-background', freeToken, {
    fields: { plan: 'pro', membershipStatus: 'active' },
    headers: { 'X-Plan': 'pro', 'X-Membership-Status': 'active' }
  });
  assert.equal(spoofedPlan.status, 200);
  const usageAfterSpoof = await getUsage(baseUrl, freeToken);
  assert.equal(usageAfterSpoof.body.plan, 'free');
  assert.equal(usageAfterSpoof.body.limit, 5);
  assert.equal(usageAfterSpoof.body.used, 1);

  // Leave exactly one free request, then race ten valid requests for it.
  for (let index = 1; index < 4; index += 1) {
    const response = await processImage(baseUrl, 'remove-background', freeToken);
    assert.equal(response.status, 200, `free request ${index + 1} should succeed`);
  }

  const beforeConcurrency = await getUsage(baseUrl, freeToken);
  assert.equal(beforeConcurrency.body.used, 4);
  assert.equal(beforeConcurrency.body.remaining, 1);

  const concurrentResponses = await Promise.all(
    Array.from({ length: 10 }, () => processImage(baseUrl, 'remove-background', freeToken))
  );
  const concurrentSuccesses = concurrentResponses.filter(response => response.status === 200);
  const concurrentRejections = concurrentResponses.filter(response => response.status === 429);
  assert.equal(concurrentSuccesses.length, 1);
  assert.equal(concurrentRejections.length, 9);
  for (const response of concurrentRejections) {
    assert.deepEqual(await response.json(), {
      error: 'quota_exceeded',
      message: 'Monthly usage limit reached',
      plan: 'free',
      limit: 5,
      used: 5
    });
  }

  const exhaustedUsage = await getUsage(baseUrl, freeToken);
  assert.equal(exhaustedUsage.body.used, 5);
  assert.equal(exhaustedUsage.body.remaining, 0);

  const sixth = await processImage(baseUrl, 'remove-background', freeToken);
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).error, 'quota_exceeded');

  // With quota exhausted, every metered path is stopped at the common quota
  // entry, while public and hidden policies remain independent.
  const exhaustedCoverage = await Promise.all(
    [...METERED_HIGH_COST, 'passport-photo', 'ocr'].map(tool => fetch(`${baseUrl}/api/tools/${tool}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${freeToken}` }
    }))
  );
  exhaustedCoverage.forEach(response => assert.equal(response.status, 429));

  const freeUserId = new mongoose.Types.ObjectId(freeRegistration.body.user.id);
  const freeUsageRecords = await databaseConnection.collection('usages').find({ userId: freeUserId }).toArray();
  assert.equal(freeUsageRecords.length, 1);
  assert.equal(freeUsageRecords[0].periodKey, currentPeriod);
  assert.equal(freeUsageRecords[0].usedCount, 5);

  // Usage and health queries are system endpoints and must not consume quota.
  const health = await requestJson(`${baseUrl}/api/tools/health`);
  assert.equal(health.response.status, 200);
  const usageQueryAgain = await getUsage(baseUrl, freeToken);
  assert.equal(usageQueryAgain.body.used, 5);

  // Only an active, unexpired pro membership stored in MongoDB receives 500.
  const proRegistration = await register(baseUrl, `pro-${Date.now()}@example.com`);
  assert.equal(proRegistration.response.status, 201);
  await databaseConnection.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(proRegistration.body.user.id) },
    {
      $set: {
        'subscription.plan': 'pro',
        'subscription.status': 'active',
        'subscription.endDate': new Date(Date.now() + 86_400_000)
      }
    }
  );

  const proUsage = await getUsage(baseUrl, proRegistration.body.token);
  assert.equal(proUsage.body.plan, 'pro');
  assert.equal(proUsage.body.limit, 500);

  const humanDist = path.dirname(require.resolve('@vladmandic/human'));
  const faceSample = path.join(path.dirname(humanDist), 'assets', 'screenshot-faceid.jpg');
  const testHeadshot = await sharp(faceSample)
    .extract({ left: 15, top: 142, width: 140, height: 140 })
    .resize(360, 360)
    .jpeg({ quality: 92 })
    .toBuffer();
  const passportSource = await sharp({
    create: { width: 1206, height: 2622, channels: 3, background: '#d8d8d8' }
  })
    .composite([{ input: testHeadshot, left: 423, top: 400 }])
    .jpeg({ quality: 88 })
    .toBuffer();

  // Exercise every mounted processing category with valid images.
  const categoryRequests = [
    ['reduce-size-kb', { fields: { targetKB: 10 } }],
    ['jpg-to-pdf-50kb', { fields: {} }],
    ['super-resolution', { fields: { scale: 2 } }],
    ['remove-background', { fields: {} }],
    ['passport-photo-advanced', {
      fields: { country: 'US', size: '2x2in', dpi: 72, background: 'original' },
      buffer: passportSource
    }]
  ];
  for (const [tool, options] of categoryRequests) {
    const response = await processImage(baseUrl, tool, proRegistration.body.token, options);
    assert.equal(response.status, 200, `${tool} should still process a valid image`);
  }
  const proUsageAfter = await getUsage(baseUrl, proRegistration.body.token);
  assert.equal(proUsageAfter.body.used, categoryRequests.length);
  assert.equal(proUsageAfter.body.remaining, 500 - categoryRequests.length);

  const inactiveRegistration = await register(baseUrl, `inactive-${Date.now()}@example.com`);
  await databaseConnection.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(inactiveRegistration.body.user.id) },
    { $set: { 'subscription.plan': 'pro', 'subscription.status': 'expired', 'subscription.endDate': new Date(Date.now() + 86_400_000) } }
  );
  const inactiveUsage = await getUsage(baseUrl, inactiveRegistration.body.token);
  assert.equal(inactiveUsage.body.plan, 'free');
  assert.equal(inactiveUsage.body.limit, 5);

  const expiredRegistration = await register(baseUrl, `expired-${Date.now()}@example.com`);
  await databaseConnection.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(expiredRegistration.body.user.id) },
    { $set: { 'subscription.plan': 'pro', 'subscription.status': 'active', 'subscription.endDate': new Date(Date.now() - 1_000) } }
  );
  const expiredUsage = await getUsage(baseUrl, expiredRegistration.body.token);
  assert.equal(expiredUsage.body.plan, 'free');
  assert.equal(expiredUsage.body.limit, 5);

  const noExpiryRegistration = await register(baseUrl, `no-expiry-${Date.now()}@example.com`);
  await databaseConnection.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(noExpiryRegistration.body.user.id) },
    { $set: { 'subscription.plan': 'pro', 'subscription.status': 'active', 'subscription.endDate': null } }
  );
  const noExpiryUsage = await getUsage(baseUrl, noExpiryRegistration.body.token);
  assert.equal(noExpiryUsage.body.plan, 'free');
  assert.equal(noExpiryUsage.body.limit, 5);

  console.log('PASS 39 public tools bypass auth while 37 metered tools require it and 5 hidden tools return 404');
  console.log('PASS public tools do not create or increment Usage');
  console.log('PASS free users receive 5 monthly uses and the 6th returns quota_exceeded');
  console.log('PASS ten concurrent requests can consume at most one remaining use');
  console.log('PASS unsuccessful image processing is refunded before the response completes');
  console.log('PASS plan spoofing via tool/profile fields or headers does not elevate quota');
  console.log('PASS only active Pro membership with a future expiry receives 500 uses');
  console.log('PASS /api/usage/me and GET /api/tools/health do not consume quota');
  console.log('PASS all mounted image-processing categories still produce successful results');
  console.log('PASS Beijing month boundaries map to the correct periodKey');
  console.log('PASS one unique Usage record remains capped at usedCount 5');
} finally {
  if (backendProcess && backendProcess.exitCode === null) {
    backendProcess.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 5_000);
      backendProcess.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (databaseConnection) {
    await databaseConnection.dropDatabase();
    await databaseConnection.close();
  }
  if (mongoServer) await mongoServer.stop();
}
