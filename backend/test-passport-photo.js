import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import passportCountries from '../src/data/passportCountries.js';
import User from './models/User.js';
import {
  PASSPORT_COUNTRY_REQUIREMENTS,
  resolvePassportPhotoSpec
} from './utils/passportPhoto.js';

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
      // The backend or database may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not connect to the test database.\n${serverLogs()}`);
};

const createPassportForm = (buffer, { country, size }) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'wechat-photo.jpg');
  form.append('country', country);
  form.append('size', size);
  form.append('dpi', '300');
  form.append('quantity', '1');
  form.append('enhance', 'false');
  return form;
};

const processPassportPhoto = (baseUrl, endpoint, token, buffer, fields) => fetch(
  `${baseUrl}/api/tools/${endpoint}`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: createPassportForm(buffer, fields)
  }
);

const expectedCountries = {
  US: { size: '2x2in', width: 600, height: 600 },
  GB: { size: '35x45mm', width: 413, height: 531 },
  CA: { size: '50x70mm', width: 591, height: 827 },
  CN: { size: '33x48mm', width: 390, height: 567 }
};

let mongoServer;
let databaseConnection;
let backendProcess;
let output = '';

try {
  assert.deepEqual(
    Object.keys(PASSPORT_COUNTRY_REQUIREMENTS),
    Object.keys(passportCountries),
    'Frontend and backend passport country codes must stay aligned'
  );

  for (const [country, expected] of Object.entries(expectedCountries)) {
    const spec = resolvePassportPhotoSpec({ country, size: expected.size, dpi: 300 });
    assert.equal(spec.pixelWidth, expected.width);
    assert.equal(spec.pixelHeight, expected.height);
  }
  const millimeterFallback = resolvePassportPhotoSpec({ country: 'unknown', size: '33x48mm', dpi: 300 });
  assert.equal(millimeterFallback.pixelWidth, 390);
  assert.equal(millimeterFallback.pixelHeight, 567);

  const testDatabaseName = `chutki_passport_test_${Date.now()}`;
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
      CLIENT_URL: 'http://localhost:5173',
      METERED_TOOL_RATE_LIMIT: '100'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', chunk => { output += chunk.toString(); });
  backendProcess.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForDatabase(baseUrl, () => output);

  const email = `passport-${Date.now()}@example.com`;
  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Passport Test User', email, password: 'test-password-123' })
  });
  const registration = await registrationResponse.json();
  assert.equal(registrationResponse.status, 201);
  assert.ok(registration.token);

  databaseConnection = await mongoose.connect(mongoUri);
  await User.updateOne(
    { email },
    {
      $set: {
        'subscription.plan': 'pro',
        'subscription.status': 'active',
        'subscription.endDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    }
  );

  const sourceImage = await sharp({
    create: { width: 1206, height: 2622, channels: 3, background: '#d7b899' }
  }).jpeg({ quality: 88 }).toBuffer();
  const sourceMetadata = await sharp(sourceImage).metadata();
  assert.equal(sourceMetadata.width, 1206);
  assert.equal(sourceMetadata.height, 2622);

  for (const endpoint of ['passport-photo', 'passport-photo-advanced']) {
    for (const [country, expected] of Object.entries(expectedCountries)) {
      const response = await processPassportPhoto(
        baseUrl,
        endpoint,
        registration.token,
        sourceImage,
        { country, size: expected.size }
      );
      if (response.status !== 200) {
        const errorBody = await response.text();
        assert.equal(response.status, 200, `${endpoint} ${country} failed: ${errorBody}`);
      }
      assert.match(response.headers.get('content-type') || '', /^image\/jpeg/);
      const resultMetadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(resultMetadata.width, expected.width, `${endpoint} ${country} width`);
      assert.equal(resultMetadata.height, expected.height, `${endpoint} ${country} height`);
    }
  }

  const fallbackResponse = await processPassportPhoto(
    baseUrl,
    'passport-photo',
    registration.token,
    sourceImage,
    { country: 'unknown', size: '33x48mm' }
  );
  assert.equal(fallbackResponse.status, 200);
  const fallbackMetadata = await sharp(Buffer.from(await fallbackResponse.arrayBuffer())).metadata();
  assert.equal(fallbackMetadata.width, 390);
  assert.equal(fallbackMetadata.height, 567);

  const invalidResponse = await processPassportPhoto(
    baseUrl,
    'passport-photo',
    registration.token,
    sourceImage,
    { country: 'unknown', size: '33x48invalid' }
  );
  assert.equal(invalidResponse.status, 422);
  const invalidBody = await invalidResponse.json();
  assert.match(invalidBody.message, /证件照尺寸格式无效/);

  console.log('PASS frontend and backend share all 10 passport country codes');
  console.log('PASS CN, GB, CA and US dimensions use correct mm/inches conversion');
  console.log('PASS passport-photo and passport-photo-advanced return 200 for 1206x2622 JPEG');
  console.log('PASS 33x48mm fallback parses units without NaN');
  console.log('PASS invalid dimensions return a specific Chinese 422 message');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (databaseConnection) {
    await databaseConnection.connection.dropDatabase().catch(() => {});
    await databaseConnection.disconnect().catch(() => {});
  }
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
  if (mongoServer) await mongoServer.stop();
}
