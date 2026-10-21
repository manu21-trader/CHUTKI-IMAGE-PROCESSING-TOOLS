import sharp from 'sharp';
import { calculatePassportCrop } from '../utils/passportCrop.js';
import {
  compositeRgbWithBackground,
  prepareCroppedMask,
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

  const crop = calculatePassportCrop({
    imageWidth: detection.imageWidth,
    imageHeight: detection.imageHeight,
    face: detection.face,
    targetSpec
  });
  const width = targetSpec.pixelWidth;
  const height = targetSpec.pixelHeight;
  const portrait = createPortraitPipeline({ buffer, crop, width, height, enhance });

  let outputBuffer;
  if (backgroundPreset.mode === 'original') {
    outputBuffer = await portrait
      .flatten({ background: '#FFFFFF' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  } else {
    const { data: rgb } = await portrait.raw().toBuffer({ resolveWithObject: true });
    const alpha = await prepareCroppedMask({
      mask: segmentation.mask,
      maskWidth: segmentation.width,
      maskHeight: segmentation.height,
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      crop,
      outputWidth: width,
      outputHeight: height
    });
    const composited = compositeRgbWithBackground({
      rgb,
      alpha,
      width,
      height,
      backgroundColor: backgroundPreset.color
    });
    outputBuffer = await sharp(composited, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  }

  return { buffer: outputBuffer, detection, crop, segmentation, backgroundPreset };
};
