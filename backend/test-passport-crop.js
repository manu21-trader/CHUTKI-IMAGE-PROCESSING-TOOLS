import assert from 'node:assert/strict';
import { selectSingleFace } from './services/faceDetection.js';
import { calculatePassportCrop } from './utils/passportCrop.js';
import { resolvePassportPhotoSpec } from './utils/passportPhoto.js';

const imageWidth = 1200;
const imageHeight = 2000;
const face = {
  box: { x: 450, y: 430, width: 300, height: 400 },
  center: { x: 600, y: 630 },
  eyeCenter: { x: 600, y: 575 },
  confidence: 0.98
};

for (const country of ['CN', 'GB', 'CA', 'US']) {
  const targetSpec = resolvePassportPhotoSpec({ country, dpi: 300 });
  const crop = calculatePassportCrop({ imageWidth, imageHeight, face, targetSpec });
  const expectedAspect = targetSpec.width / targetSpec.height;
  const actualAspect = crop.width / crop.height;

  assert.ok(Math.abs(actualAspect - expectedAspect) < 0.003, `${country} crop aspect ratio`);
  assert.ok(crop.metrics.horizontalFacePosition >= 0.49 && crop.metrics.horizontalFacePosition <= 0.51, `${country} face centered`);
  assert.ok(crop.metrics.headTopWhitespace >= 0.025 && crop.metrics.headTopWhitespace <= 0.25, `${country} top whitespace`);
  assert.ok(crop.metrics.chinToBottom >= 0.09 && crop.metrics.chinToBottom <= 0.48, `${country} chin/shoulder space`);
  assert.ok(crop.metrics.headHeightRatio >= 0.42 && crop.metrics.headHeightRatio <= 0.74, `${country} head ratio`);
  assert.ok(crop.left >= 0 && crop.top >= 0);
  assert.ok(crop.left + crop.width <= imageWidth);
  assert.ok(crop.top + crop.height <= imageHeight);
}

assert.throws(
  () => selectSingleFace([]),
  error => error.code === 'face_not_detected' && /未检测到清晰人脸/.test(error.message)
);
assert.throws(
  () => selectSingleFace([face, { ...face, confidence: 0.9 }]),
  error => error.code === 'multiple_faces_detected' && /检测到多个人脸/.test(error.message)
);
assert.throws(
  () => calculatePassportCrop({
    imageWidth: 600,
    imageHeight: 800,
    face: { ...face, box: { x: 5, y: 5, width: 500, height: 600 } },
    targetSpec: resolvePassportPhotoSpec({ country: 'CN', dpi: 300 })
  }),
  error => error.code === 'insufficient_portrait_space'
);

console.log('PASS CN, GB, CA and US crop aspect ratios are correct');
console.log('PASS face is horizontally centered with top and chin/shoulder margins');
console.log('PASS no-face and multiple-face results never fall back to center crop');
console.log('PASS insufficient source space returns a specific framing error');
