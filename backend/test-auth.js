import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from './models/User.js';

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
      // The HTTP server or MongoDB connection may still be starting.
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

let mongoServer;
let databaseConnection;
let backendProcess;
let output = '';

try {
  const testDatabaseName = `chutki_auth_test_${Date.now()}`;
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
      RESEND_API_KEY: 're_test_only_not_a_real_key',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', chunk => { output += chunk.toString(); });
  backendProcess.stderr.on('data', chunk => { output += chunk.toString(); });

  await waitForDatabase(baseUrl, () => output);

  const statusResult = await requestJson(`${baseUrl}/api/auth/status`);
  assert.equal(statusResult.response.status, 200);
  assert.equal(statusResult.body.features?.googleOAuth, false);

  const email = `mvp-${Date.now()}@example.com`;
  const password = 'test-password-123';
  const registerResult = await requestJson(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'MVP Test User', email: email.toUpperCase(), password })
  });

  assert.equal(registerResult.response.status, 201);
  assert.equal(registerResult.body.success, true);
  assert.equal(registerResult.body.user.plan, 'free');
  assert.equal(registerResult.body.user.membershipStatus, 'active');
  assert.ok(Date.parse(registerResult.body.user.createdAt), 'Registration must return createdAt');
  assert.ok(registerResult.body.token);

  const duplicateRegisterResult = await requestJson(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Duplicate User', email, password })
  });
  assert.ok([400, 409].includes(duplicateRegisterResult.response.status));
  assert.equal(duplicateRegisterResult.body.success, false);

  databaseConnection = await mongoose.connect(mongoUri);
  await User.init();
  const storedUser = await mongoose.connection.collection('users').findOne({ email });
  assert.ok(storedUser, 'Registration must persist a user document');
  assert.equal(storedUser.subscription.plan, 'free');
  assert.equal(storedUser.subscription.status, 'active');
  assert.notEqual(storedUser.password, password, 'Password must not be stored as plaintext');
  assert.equal(
    new Date(registerResult.body.user.createdAt).toISOString(),
    storedUser.createdAt.toISOString(),
    'Registration must return the persisted createdAt value'
  );

  const phoneUser = await User.create({
    name: 'Phone Test User',
    phone: '+8613800138000',
    provider: 'phone'
  });
  const wechatUser = await User.create({
    name: 'WeChat Test User',
    provider: 'wechat',
    providerUserId: 'shared-provider-user-id'
  });
  const qqUser = await User.create({
    name: 'QQ Test User',
    provider: 'qq',
    providerUserId: 'shared-provider-user-id'
  });

  assert.equal(phoneUser.email, undefined);
  assert.equal(phoneUser.password, undefined);
  assert.equal(phoneUser.subscription.plan, 'free');
  assert.equal(wechatUser.email, undefined);
  assert.equal(qqUser.email, undefined);

  const wrongPasswordResult = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'definitely-wrong-password' })
  });
  assert.equal(wrongPasswordResult.response.status, 401);
  assert.equal(wrongPasswordResult.body.success, false);

  const loginResult = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase(), password })
  });

  assert.equal(loginResult.response.status, 200);
  assert.equal(loginResult.body.success, true);
  assert.equal(loginResult.body.user.id, storedUser._id.toString());
  assert.equal(loginResult.body.user.plan, 'free');
  assert.equal(
    new Date(loginResult.body.user.createdAt).toISOString(),
    storedUser.createdAt.toISOString()
  );
  assert.ok(loginResult.body.token);

  const logoutResult = await requestJson(`${baseUrl}/api/auth/logout`, {
    method: 'POST'
  });
  assert.equal(logoutResult.response.status, 200);
  assert.equal(logoutResult.body.success, true);

  const missingTokenResult = await requestJson(`${baseUrl}/api/auth/profile`);
  assert.equal(missingTokenResult.response.status, 401);

  const invalidTokenResult = await requestJson(`${baseUrl}/api/auth/verify-token`, {
    headers: { Authorization: 'Bearer invalid.test.token' }
  });
  assert.equal(invalidTokenResult.response.status, 401);

  const verifyResult = await requestJson(`${baseUrl}/api/auth/verify-token`, {
    headers: { Authorization: `Bearer ${loginResult.body.token}` }
  });

  assert.equal(verifyResult.response.status, 200);
  assert.equal(verifyResult.body.user.id, storedUser._id.toString());
  assert.equal(verifyResult.body.user.email, email);
  assert.equal(
    new Date(verifyResult.body.user.createdAt).toISOString(),
    storedUser.createdAt.toISOString()
  );

  const profileResult = await requestJson(`${baseUrl}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${loginResult.body.token}` }
  });

  assert.equal(profileResult.response.status, 200);
  assert.equal(profileResult.body.user.id, storedUser._id.toString());
  assert.equal(profileResult.body.user.plan, 'free');
  assert.equal(
    new Date(profileResult.body.user.createdAt).toISOString(),
    storedUser.createdAt.toISOString()
  );

  const sourceImage = await sharp({
    create: { width: 32, height: 16, channels: 3, background: '#663399' }
  }).png().toBuffer();
  const form = new FormData();
  form.append('image', new Blob([sourceImage], { type: 'image/png' }), 'source.png');
  form.append('angle', '90');

  const rotateResponse = await fetch(`${baseUrl}/api/tools/rotate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginResult.body.token}` },
    body: form
  });
  assert.equal(rotateResponse.status, 200);
  const rotatedMetadata = await sharp(Buffer.from(await rotateResponse.arrayBuffer())).metadata();
  assert.equal(rotatedMetadata.width, 16);
  assert.equal(rotatedMetadata.height, 32);

  console.log('PASS registration persisted a user');
  console.log('PASS registration returns a JWT for immediate login');
  console.log('PASS duplicate email registration is rejected');
  console.log('PASS new user defaults to free/active membership');
  console.log('PASS phone, WeChat, and QQ identities can exist without email/password');
  console.log('PASS correct password returns a valid JWT and wrong password is rejected');
  console.log('PASS logout endpoint responds successfully');
  console.log('PASS Google OAuth status is false without credentials');
  console.log('PASS register, login, verify-token, and profile return persisted createdAt');
  console.log('PASS missing and invalid JWTs are rejected');
  console.log('PASS protected endpoints identify the current user');
  console.log('PASS rotate image processing still works');
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
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (mongoServer) await mongoServer.stop();
}
