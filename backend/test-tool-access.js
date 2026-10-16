import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import sharp from 'sharp';
import {
  ALL_IMAGE_TOOLS,
  PUBLIC_LOW_COST,
  METERED_HIGH_COST,
  HIDDEN_UNSTABLE
} from '../shared/toolAccessPolicy.js';

const availablePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});

const waitForServer = async baseUrl => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/ping`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Backend did not start');
};

const formFor = (buffer, fields = {}, fileCount = 1) => {
  const form = new FormData();
  for (let index = 0; index < fileCount; index += 1) {
    form.append('image', new Blob([buffer], { type: 'image/png' }), `source-${index}.png`);
  }
  Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
  return form;
};

const processImage = (baseUrl, tool, buffer, fields, fileCount) => fetch(`${baseUrl}/api/tools/${tool}`, {
  method: 'POST',
  body: formFor(buffer, fields, fileCount)
});

let backendProcess;
let output = '';

try {
  assert.equal(PUBLIC_LOW_COST.length, 39);
  assert.equal(METERED_HIGH_COST.length, 37);
  assert.equal(HIDDEN_UNSTABLE.length, 5);
  assert.equal(ALL_IMAGE_TOOLS.length, 81);
  assert.equal(new Set(ALL_IMAGE_TOOLS).size, 81);

  const smallImage = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#663399' }
  }).png().toBuffer();
  const oversizedPixelImage = await sharp({
    create: { width: 4500, height: 4500, channels: 3, background: '#ffffff' }
  }).png({ compressionLevel: 9 }).toBuffer();

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  backendProcess = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: '',
      MONGO_URI: '',
      ENABLE_MONGODB: 'false',
      JWT_SECRET: 'test-only-jwt-secret-that-is-long-enough',
      SESSION_SECRET: 'test-only-session-secret-that-is-long-enough',
      RESEND_API_KEY: 're_test_only_not-a-real-key',
      NODE_ENV: 'test',
      DISABLE_AI_CHAT: 'true',
      PUBLIC_TOOL_RATE_LIMIT: '10',
      METERED_TOOL_RATE_LIMIT: '30',
      GENERAL_RATE_LIMIT: '300'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', chunk => { output += chunk.toString(); });
  backendProcess.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForServer(baseUrl);

  const publicRequests = [
    ['rotate', {}],
    ['resize-pixel', { width: 16, height: 16 }],
    ['jpeg-to-png', {}]
  ];
  for (const [tool, fields] of publicRequests) {
    const response = await processImage(baseUrl, tool, smallImage, fields);
    assert.equal(response.status, 200, `${tool} should work without login and MongoDB`);
  }

  const meteredWithoutLogin = await processImage(baseUrl, 'remove-background', smallImage);
  assert.equal(meteredWithoutLogin.status, 401);

  for (const tool of HIDDEN_UNSTABLE) {
    const response = await processImage(baseUrl, tool, smallImage);
    assert.equal(response.status, 404, `${tool} should be unavailable`);
  }

  const oversized = await processImage(baseUrl, 'grayscale', oversizedPixelImage);
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, 'image_limit_exceeded');

  const tooManyFiles = await processImage(baseUrl, 'join-images', smallImage, {}, 5);
  assert.equal(tooManyFiles.status, 401, 'metered authentication must happen before upload parsing');

  // Exercise the upload count protection through a public compatibility route.
  const publicTooManyFiles = await processImage(baseUrl, 'rotate', smallImage, {}, 5);
  assert.equal(publicTooManyFiles.status, 413);

  const excessiveOutput = await processImage(baseUrl, 'resize-pixel', smallImage, { width: 6001, height: 10 });
  assert.equal(excessiveOutput.status, 422);
  assert.equal((await excessiveOutput.json()).error, 'image_limit_exceeded');

  const oversizedFile = await processImage(baseUrl, 'flip', Buffer.alloc(9 * 1024 * 1024));
  assert.equal(oversizedFile.status, 413);

  let rateLimitedResponse;
  for (let index = 0; index < 4; index += 1) {
    rateLimitedResponse = await processImage(baseUrl, 'flip', smallImage);
  }
  assert.equal(rateLimitedResponse.status, 429);
  assert.equal((await rateLimitedResponse.json()).error, 'rate_limit_exceeded');

  const aiChat = await fetch(`${baseUrl}/api/chatgpt/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' })
  });
  assert.equal(aiChat.status, 503);
  assert.equal((await aiChat.json()).error, 'AI_CHAT_DISABLED');

  const inventory = await fetch(`${baseUrl}/api/tools/list`).then(response => response.json());
  assert.equal(inventory.count, 81);
  assert.equal(inventory.accessPolicy.publicLowCost.length, 39);
  assert.equal(inventory.accessPolicy.meteredHighCost.length, 37);
  assert.equal(inventory.accessPolicy.hiddenUnstable.length, 5);

  console.log('PASS 39 + 37 + 5 equals 81 unique tools');
  console.log('PASS three public tools work without login or MongoDB');
  console.log('PASS metered tools still require authentication');
  console.log('PASS hidden tools return 404 while remaining in inventory');
  console.log('PASS oversized files, pixels, output dimensions and excess files are rejected safely');
  console.log('PASS public tool IP rate limiting is enforced');
  console.log('PASS AI chat is disabled without affecting image tools');
} catch (error) {
  console.error(output);
  throw error;
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
}
