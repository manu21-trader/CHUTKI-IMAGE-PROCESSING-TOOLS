import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { PassportPhotoError } from '../utils/passportPhoto.js';

const require = createRequire(import.meta.url);
const DETECTION_MAX_DIMENSION = 512;
const LEFT_EYE_LANDMARKS = [33, 133, 159, 145];
const RIGHT_EYE_LANDMARKS = [362, 263, 386, 374];

let humanPromise;
let inferenceQueue = Promise.resolve();

const averageLandmarks = (mesh, indexes, scaleX, scaleY) => {
  const points = indexes.map(index => mesh?.[index]).filter(point => Array.isArray(point));
  if (points.length !== indexes.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point[0], 0) / points.length * scaleX,
    y: points.reduce((sum, point) => sum + point[1], 0) / points.length * scaleY
  };
};

const withLocalModelFetch = async task => {
  const platformFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('file://')) {
      const file = await fs.promises.readFile(fileURLToPath(url));
      return new Response(file, { status: 200 });
    }
    return platformFetch(input, init);
  };

  try {
    return await task();
  } finally {
    globalThis.fetch = platformFetch;
  }
};

const createHuman = async () => {
  require('@tensorflow/tfjs-backend-cpu');
  const humanDist = path.dirname(require.resolve('@vladmandic/human'));
  const humanRoot = path.dirname(humanDist);
  const HumanModule = require(path.join(humanDist, 'human.node-wasm.js'));
  const human = new HumanModule.Human({
    backend: 'cpu',
    modelBasePath: `${pathToFileURL(path.join(humanRoot, 'models')).href}/`,
    cacheModels: true,
    cacheSensitivity: 0,
    debug: false,
    async: false,
    warmup: 'none',
    deallocate: true,
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: {
        enabled: true,
        maxDetected: 3,
        minConfidence: 0.5,
        minSize: 24,
        rotation: false,
        return: false,
        skipFrames: 0,
        skipTime: 0
      },
      mesh: { enabled: true, keepInvalid: true },
      iris: { enabled: false },
      description: { enabled: false },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
      attention: { enabled: false },
      gear: { enabled: false }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    gesture: { enabled: false }
  });

  await withLocalModelFetch(() => human.load());
  return human;
};

const getHuman = async () => {
  if (!humanPromise) {
    humanPromise = createHuman().catch(error => {
      humanPromise = undefined;
      throw error;
    });
  }
  return humanPromise;
};

export const selectSingleFace = faces => {
  if (!Array.isArray(faces) || faces.length === 0) {
    throw new PassportPhotoError(
      'face_not_detected',
      '未检测到清晰人脸，请上传正面、光线充足且五官无遮挡的单人照片。'
    );
  }
  if (faces.length > 1) {
    throw new PassportPhotoError(
      'multiple_faces_detected',
      '检测到多个人脸，无法确定证件照主体。请上传只包含一个人的照片。'
    );
  }
  return faces[0];
};

const detectFace = async buffer => {
  let human;
  try {
    human = await getHuman();
  } catch (error) {
    console.error('[FACE-DETECTION] Model initialization failed:', error.message);
    throw new PassportPhotoError(
      'face_detection_unavailable',
      '人脸检测服务暂时不可用，请稍后重试。',
      503
    );
  }

  const metadata = await sharp(buffer).metadata();
  const swapsOrientation = metadata.orientation >= 5 && metadata.orientation <= 8;
  const imageWidth = swapsOrientation ? metadata.height : metadata.width;
  const imageHeight = swapsOrientation ? metadata.width : metadata.height;
  if (!imageWidth || !imageHeight) {
    throw new PassportPhotoError('invalid_face_image', '无法读取照片尺寸，请重新上传 JPG 或 PNG 图片。', 400);
  }

  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({
      width: DETECTION_MAX_DIMENSION,
      height: DETECTION_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new PassportPhotoError('invalid_face_image', '无法读取照片颜色信息，请重新上传 JPG 或 PNG 图片。', 400);
  }

  const tensor = human.tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels],
    'int32'
  );
  let result;
  try {
    result = await human.detect(tensor);
  } catch (error) {
    console.error('[FACE-DETECTION] Inference failed:', error.message);
    throw new PassportPhotoError(
      'face_detection_failed',
      '人脸检测失败，请确认照片清晰后重试。',
      422
    );
  } finally {
    tensor.dispose();
  }

  const scaleX = imageWidth / info.width;
  const scaleY = imageHeight / info.height;
  const faces = (result.face || []).map(face => {
    const [x, y, width, height] = face.box;
    const leftEye = averageLandmarks(face.mesh, LEFT_EYE_LANDMARKS, scaleX, scaleY);
    const rightEye = averageLandmarks(face.mesh, RIGHT_EYE_LANDMARKS, scaleX, scaleY);
    const eyeCenter = leftEye && rightEye ? {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    } : null;
    return {
      box: {
        x: x * scaleX,
        y: y * scaleY,
        width: width * scaleX,
        height: height * scaleY
      },
      center: {
        x: (x + width / 2) * scaleX,
        y: (y + height / 2) * scaleY
      },
      leftEye,
      rightEye,
      eyeCenter,
      confidence: Number(face.faceScore ?? face.score ?? face.boxScore ?? 0)
    };
  });

  return {
    imageWidth,
    imageHeight,
    face: selectSingleFace(faces)
  };
};

export const detectPrimaryFace = buffer => {
  const detection = inferenceQueue.then(() => detectFace(buffer));
  inferenceQueue = detection.catch(() => undefined);
  return detection;
};
