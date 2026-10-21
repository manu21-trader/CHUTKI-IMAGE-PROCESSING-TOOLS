import assert from 'node:assert/strict';
import sharp from 'sharp';
import { processPassportPortrait } from './services/passportPhotoProcessor.js';
import {
  compositeRgbWithBackground,
  mapCropToMask,
  prepareCroppedMask,
  validatePersonMask
} from './utils/passportBackground.js';
import { resolvePassportPhotoSpec } from './utils/passportPhoto.js';

const foreground = Buffer.from([
  10, 20, 30, 40, 50, 60,
  70, 80, 90, 100, 110, 120
]);
const alpha = Buffer.from([255, 0, 255, 0]);
for (const backgroundColor of ['#FFFFFF', '#438EDB', '#D64545']) {
  const output = compositeRgbWithBackground({
    rgb: foreground,
    alpha,
    width: 2,
    height: 2,
    backgroundColor
  });
  assert.deepEqual([...output.subarray(0, 3)], [10, 20, 30], `${backgroundColor} keeps foreground`);
  const expectedBackground = backgroundColor.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16));
  assert.deepEqual([...output.subarray(3, 6)], expectedBackground, `${backgroundColor} replaces background`);
}

const crop = { left: 200, top: 400, width: 600, height: 1000 };
assert.deepEqual(
  mapCropToMask({
    crop,
    imageWidth: 1000,
    imageHeight: 2000,
    maskWidth: 100,
    maskHeight: 200
  }),
  { left: 20, top: 40, width: 60, height: 100 }
);

const alignedMask = Buffer.alloc(100 * 200);
for (let y = 50; y < 130; y += 1) {
  for (let x = 30; x < 70; x += 1) alignedMask[y * 100 + x] = 255;
}
const croppedMask = await prepareCroppedMask({
  mask: alignedMask,
  maskWidth: 100,
  maskHeight: 200,
  imageWidth: 1000,
  imageHeight: 2000,
  crop,
  outputWidth: 60,
  outputHeight: 100
});
let mass = 0;
let weightedX = 0;
let weightedY = 0;
for (let y = 0; y < 100; y += 1) {
  for (let x = 0; x < 60; x += 1) {
    const value = croppedMask[y * 60 + x];
    mass += value;
    weightedX += x * value;
    weightedY += y * value;
  }
}
assert.ok(Math.abs(weightedX / mass - 29.5) < 0.6, 'mask stays horizontally aligned');
assert.ok(Math.abs(weightedY / mass - 49.5) < 0.6, 'mask stays vertically aligned');

assert.throws(
  () => validatePersonMask({ mask: Buffer.alloc(100), width: 10, height: 10 }),
  error => error.status === 422 && /人物分割结果不可靠/.test(error.message)
);
assert.throws(
  () => validatePersonMask({ mask: Buffer.alloc(100, 255), width: 10, height: 10 }),
  error => error.status === 422 && /人物分割结果不可靠/.test(error.message)
);

const sourceImage = await sharp({
  create: { width: 1200, height: 2000, channels: 3, background: '#8A7B6A' }
}).jpeg().toBuffer();
const mockDetection = {
  imageWidth: 1200,
  imageHeight: 2000,
  face: {
    box: { x: 450, y: 430, width: 300, height: 400 },
    center: { x: 600, y: 630 },
    eyeCenter: { x: 600, y: 575 },
    confidence: 0.99
  }
};
let segmentationCalled = false;
const originalResult = await processPassportPortrait({
  buffer: sourceImage,
  targetSpec: resolvePassportPhotoSpec({ country: 'CN', dpi: 300 }),
  background: 'original',
  enhance: false,
  faceDetector: async () => mockDetection,
  personSegmenter: async () => {
    segmentationCalled = true;
    throw new Error('Original background must not invoke segmentation');
  }
});
assert.equal(segmentationCalled, false);
assert.equal((await sharp(originalResult.buffer).metadata()).width, 390);

await assert.rejects(
  processPassportPortrait({
    buffer: sourceImage,
    targetSpec: resolvePassportPhotoSpec({ country: 'CN', dpi: 300 }),
    background: '#FFFFFF',
    enhance: false,
    faceDetector: async () => mockDetection,
    personSegmenter: async () => ({ mask: Buffer.alloc(100 * 200), width: 100, height: 200 })
  }),
  error => error.status === 422 && /人物分割/.test(error.message)
);

const closeSource = await sharp({
  create: { width: 650, height: 900, channels: 3, background: '#1E7A4C' }
}).jpeg({ quality: 100 }).toBuffer();
const closeDetection = {
  imageWidth: 650,
  imageHeight: 900,
  face: {
    box: { x: 125, y: 120, width: 400, height: 500 },
    center: { x: 325, y: 370 },
    eyeCenter: { x: 325, y: 330 },
    confidence: 0.99
  }
};
const closeMask = Buffer.alloc(130 * 180);
for (let y = 6; y < 171; y += 1) {
  for (let x = 10; x < 120; x += 1) closeMask[y * 130 + x] = 255;
}
const closeSegmenter = async () => ({ mask: closeMask, width: 130, height: 180 });
const closeSpec = resolvePassportPhotoSpec({ country: 'CN', dpi: 300 });

for (const background of ['#FFFFFF', '#438EDB', '#D64545']) {
  const adaptiveResult = await processPassportPortrait({
    buffer: closeSource,
    targetSpec: closeSpec,
    background,
    enhance: false,
    faceDetector: async () => closeDetection,
    personSegmenter: closeSegmenter
  });
  assert.equal(adaptiveResult.crop.mode, 'adaptive-canvas');
  assert.equal((await sharp(adaptiveResult.buffer).metadata()).width, 390);
  assert.equal((await sharp(adaptiveResult.buffer).metadata()).height, 567);
  assert.ok(
    Math.abs(adaptiveResult.foreground.metrics.scaleX - adaptiveResult.foreground.metrics.scaleY) < 0.002,
    `${background} must preserve the person's aspect ratio`
  );
  const corner = await sharp(adaptiveResult.buffer)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const expected = background.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16));
  expected.forEach((channel, index) => {
    assert.ok(Math.abs(corner[index] - channel) <= 20, `${background} canvas background channel ${index}`);
  });
}

await assert.rejects(
  processPassportPortrait({
    buffer: closeSource,
    targetSpec: closeSpec,
    background: 'original',
    enhance: false,
    faceDetector: async () => closeDetection,
    personSegmenter: closeSegmenter
  }),
  error => error.code === 'insufficient_portrait_space'
);

const clippedHeadDetection = {
  ...closeDetection,
  face: {
    ...closeDetection.face,
    box: { ...closeDetection.face.box, y: 20 },
    eyeCenter: { x: 325, y: 230 }
  }
};
await assert.rejects(
  processPassportPortrait({
    buffer: closeSource,
    targetSpec: closeSpec,
    background: '#FFFFFF',
    enhance: false,
    faceDetector: async () => clippedHeadDetection,
    personSegmenter: closeSegmenter
  }),
  error => error.code === 'insufficient_portrait_space'
);

console.log('PASS mock alpha composites foreground onto white, blue and red backgrounds');
console.log('PASS crop and resize keep the portrait mask geometrically aligned');
console.log('PASS invalid segmentation masks fail with a specific Chinese 422 error');
console.log('PASS preserve-original mode skips person segmentation');
console.log('PASS close but complete portraits adapt onto white, blue and red canvases without stretching');
console.log('PASS the same close portrait remains strict with original background');
console.log('PASS adaptive canvas rejects a genuinely clipped head');
