import sharp from 'sharp';
import {
  calculateAdaptivePortraitLayout,
  calculatePassportCrop
} from '../utils/passportCrop.js';
import {
  prepareAdaptiveForeground,
  resolvePassportBackground
} from '../utils/passportBackground.js';
import { detectPrimaryFace, segmentPerson } from './faceDetection.js';

const createPortraitPipeline = ({ buffer, crop, width, height, enhance }) => {
  let pipeline = sharp(buffer)
    .rotate()
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .removeAlpha();
  if (enhance === 'true' || enhance === true) {
    pipeline = pipeline
      .sharpen({ sigma: 1, m1: 1, m2: 2 })
      .modulate({ brightness: 1.05, contrast: 1.1 });
  }
  return pipeline;
};

export const processPassportPortrait = async ({
  buffer,
  targetSpec,
  background,
  enhance,
  faceDetector = detectPrimaryFace,
  personSegmenter = segmentPerson
}) => {
  const backgroundPreset = resolvePassportBackground(background);
  const detection = await faceDetector(buffer);

  // Preserve-original mode deliberately skips segmentation.
  const segmentation = backgroundPreset.mode === 'replace'
    ? await personSegmenter(buffer, detection)
    : null;

  const width = targetSpec.pixelWidth;
  const height = targetSpec.pixelHeight;

  let outputBuffer;
  let crop;
  let foreground = null;
  if (backgroundPreset.mode === 'original') {
    crop = calculatePassportCrop({
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      face: detection.face,
      targetSpec
    });
    const portrait = createPortraitPipeline({ buffer, crop, width, height, enhance });
    outputBuffer = await portrait
      .flatten({ background: '#FFFFFF' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  } else {
    crop = calculateAdaptivePortraitLayout({
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      face: detection.face,
      targetSpec
    });
    foreground = await prepareAdaptiveForeground({
      buffer,
      segmentation,
      detection,
      layout: crop,
      enhance
    });
    outputBuffer = await sharp({
      create: { width, height, channels: 3, background: backgroundPreset.color }
    })
      .composite([{
        input: foreground.data,
        raw: { width: foreground.width, height: foreground.height, channels: 4 },
        left: foreground.left,
        top: foreground.top
      }])
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  }

  return { buffer: outputBuffer, detection, crop, segmentation, foreground, backgroundPreset };
};
