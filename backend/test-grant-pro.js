import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const getAvailablePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});

const runProcess = (command, argumentsList, options) => new Promise((resolve, reject) => {
  const child = spawn(command, argumentsList, options);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('exit', code => resolve({ code, stdout, stderr }));
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
  return { response, body: await response.json() };
};

let mongoServer;
let databaseConnection;
let backendProcess;
let backendOutput = '';

try {
  const testDatabaseName = `chutki_grant_pro_test_${Date.now()}`;
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
  const childEnvironment = {
    ...process.env,
    PORT: String(port),
    MONGODB_URI: mongoUri,
    ENABLE_MONGODB: 'true',
    JWT_SECRET: 'test-only-jwt-secret-that-is-long-enough',
    SESSION_SECRET: 'test-only-session-secret-that-is-long-enough',
    RESEND_API_KEY: 're_test_only_not-a-real-key',
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173'
  };

  backendProcess = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', chunk => { backendOutput += chunk.toString(); });
  backendProcess.stderr.on('data', chunk => { backendOutput += chunk.toString(); });

  await waitForDatabase(baseUrl, () => backendOutput);
  databaseConnection = await mongoose.createConnection(mongoUri).asPromise();

  const email = `manual-pro-${Date.now()}@example.com`;
  const registration = await requestJson(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Manual Pro Test', email, password: 'test-password-123' })
  });
  assert.equal(registration.response.status, 201);

  const initialUsage = await requestJson(`${baseUrl}/api/usage/me`, {
    headers: { Authorization: `Bearer ${registration.body.token}` }
  });
  assert.deepEqual(initialUsage.body, {
    plan: 'free', limit: 5, used: 0, remaining: 5, period: initialUsage.body.period
  });

  const firstGrantStartedAt = Date.now();
  const firstGrant = await runProcess(process.execPath, [
    'scripts/grant-pro.js', '--email', email, '--days', '30', '--yes'
  ], {
    cwd: new URL('.', import.meta.url),
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(firstGrant.code, 0, firstGrant.stderr);
  assert.match(firstGrant.stdout, /Target user:/);
  assert.match(firstGrant.stdout, /Pro membership granted successfully/);

  const userId = new mongoose.Types.ObjectId(registration.body.user.id);
  let storedUser = await databaseConnection.collection('users').findOne({ _id: userId });
  assert.equal(storedUser.subscription.plan, 'pro');
  assert.equal(storedUser.subscription.status, 'active');
  const firstExpiry = storedUser.subscription.endDate.getTime();
  assert.ok(firstExpiry >= firstGrantStartedAt + 30 * 24 * 60 * 60 * 1000);
  assert.ok(firstExpiry <= Date.now() + 30 * 24 * 60 * 60 * 1000 + 5_000);

  const proUsage = await requestJson(`${baseUrl}/api/usage/me`, {
    headers: { Authorization: `Bearer ${registration.body.token}` }
  });
  assert.equal(proUsage.body.plan, 'pro');
  assert.equal(proUsage.body.limit, 500);
  assert.equal(proUsage.body.remaining, 500);

  const secondGrant = await runProcess(process.execPath, [
    'scripts/grant-pro.js', '--userId', userId.toString(), '--days', '30', '--yes'
  ], {
    cwd: new URL('.', import.meta.url),
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(secondGrant.code, 0, secondGrant.stderr);
  storedUser = await databaseConnection.collection('users').findOne({ _id: userId });
  assert.equal(storedUser.subscription.endDate.getTime(), firstExpiry + 30 * 24 * 60 * 60 * 1000);

  const userCountBeforeMissingGrant = await databaseConnection.collection('users').countDocuments();
  const missingGrant = await runProcess(process.execPath, [
    'scripts/grant-pro.js', '--email', 'missing-user@example.com', '--days', '30', '--yes'
  ], {
    cwd: new URL('.', import.meta.url),
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.notEqual(missingGrant.code, 0);
  assert.match(missingGrant.stderr, /User not found/);
  assert.equal(await databaseConnection.collection('users').countDocuments(), userCountBeforeMissingGrant);

  console.log('PASS free user starts with 5 monthly uses');
  console.log('PASS grant-pro resolves and displays the target user before updating');
  console.log('PASS email grant activates Pro for 30 days');
  console.log('PASS /api/usage/me returns the Pro 500-use allowance after grant');
  console.log('PASS userId grant extends an unexpired membership from its existing expiry');
  console.log('PASS a missing user fails without creating an account');
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
