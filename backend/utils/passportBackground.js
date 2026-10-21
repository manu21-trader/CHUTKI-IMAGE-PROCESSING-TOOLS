import sharp from 'sharp';
import { PassportPhotoError } from './passportPhoto.js';

export const PASSPORT_BACKGROUND_PRESETS = Object.freeze({
  original: Object.freeze({ mode: 'original', label: '保留原背景', color: null }),
  white: Object.freeze({ mode: 'replace', label: '白底', color: '#FFFFFF' }),
  blue: Object.freeze({ mode: 'replace', label: '蓝底', color: '#438EDB' }),
  red: Object.freeze({ mode: 'replace', label: '红底', color: '#D64545' })
});

const BACKGROUND_ALIASES = Object.freeze({
  original: 'original',
  keep: 'original',
  '#ffffff': 'white',
  white: 'white',
  '#438edb': 'blue',
  blue: 'blue',
  '#d64545': 'red',
  red: 'red'
});

const clampByte = value => Math.max(0, Math.min(255, Math.round(value)));

export const resolvePassportBackground = value => {
  const key = BACKGROUND_ALIASES[String(value || '#FFFFFF').trim().toLowerCase()];
  if (!key) {
    throw new PassportPhotoError(
      'invalid_passport_background',
      '不支持该背景颜色，请选择保留原背景、白底、蓝底或红底。',
      400
    );
  }
  return PASSPORT_BACKGROUND_PRESETS[key];
};

export const validatePersonMask = ({ mask, width, height, face, imageWidth, imageHeight }) => {
  if (!Buffer.isBuffer(mask) || mask.length !== width * height || !width || !height) {
    throw new PassportPhotoError('person_segmentation_failed', '人物分割失败，请重新上传清晰的单人正面照片。');
  }

  let foregroundCount = 0;
  for (const value of mask) if (value >= 128) foregroundCount += 1;
  const coverage = foregroundCount / mask.length;
  if (coverage < 0.01 || coverage > 0.93) {
    console.warn(`[PERSON-SEGMENTATION] Rejected full-image mask coverage=${coverage.toFixed(4)}`);
    throw new PassportPhotoError(
      'person_segmentation_unreliable',
      '人物分割结果不可靠，请上传背景较清晰、人物完整且无遮挡的正面照片。'
    );
  }

  if (face?.box && imageWidth > 0 && imageHeight > 0) {
    const scaleX = width / imageWidth;
    const scaleY = height / imageHeight;
    const left = Math.max(0, Math.floor(face.box.x * scaleX));
    const top = Math.max(0, Math.floor(face.box.y * scaleY));
    const right = Math.min(width, Math.ceil((face.box.x + face.box.width) * scaleX));
    const bottom = Math.min(height, Math.ceil((face.box.y + face.box.height) * scaleY));
    let facePixels = 0;
    let faceForeground = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        facePixels += 1;
        if (mask[y * width + x] >= 96) faceForeground += 1;
      }
    }
    const faceCoverage = facePixels > 0 ? faceForeground / facePixels : 0;
    if (faceCoverage < 0.58) {
      console.warn(`[PERSON-SEGMENTATION] Rejected face mask coverage=${faceCoverage.toFixed(4)}`);
      throw new PassportPhotoError(
        'person_segmentation_unreliable',
        '人物分割未能完整识别面部，请上传人物无遮挡、背景较简单的正面照片。'
      );
    }
    return { coverage, faceCoverage };
  }

  return { coverage, faceCoverage: null };
};

export const postProcessPersonMask = async ({ mask, width, height }) => {
  const softened = Buffer.allocUnsafe(mask.length);
  const lower = 42;
  const upper = 218;
  for (let index = 0; index < mask.length; index += 1) {
    const normalized = Math.max(0, Math.min(1, (mask[index] - lower) / (upper - lower)));
    const smooth = normalized * normalized * (3 - 2 * normalized);
    softened[index] = clampByte(smooth * 255);
  }

  return sharp(softened, { raw: { width, height, channels: 1 } })
    .median(3)
    .blur(0.6)
    .greyscale()
    .raw()
    .toBuffer();
};

export const mapCropToMask = ({ crop, imageWidth, imageHeight, maskWidth, maskHeight }) => {
  const scaleX = maskWidth / imageWidth;
  const scaleY = maskHeight / imageHeight;
  const left = Math.max(0, Math.floor(crop.left * scaleX));
  const top = Math.max(0, Math.floor(crop.top * scaleY));
  const right = Math.min(maskWidth, Math.ceil((crop.left + crop.width) * scaleX));
  const bottom = Math.min(maskHeight, Math.ceil((crop.top + crop.height) * scaleY));
  if (right <= left || bottom <= top) {
    throw new PassportPhotoError('person_segmentation_failed', '人物蒙版与照片构图无法对齐，请重新上传照片。');
  }
  return { left, top, width: right - left, height: bottom - top };
};

export const prepareCroppedMask = async ({
  mask,
  maskWidth,
  maskHeight,
  imageWidth,
  imageHeight,
  crop,
  outputWidth,
  outputHeight
}) => {
  const processed = await postProcessPersonMask({ mask, width: maskWidth, height: maskHeight });
  const maskCrop = mapCropToMask({ crop, imageWidth, imageHeight, maskWidth, maskHeight });
  const output = await sharp(processed, { raw: { width: maskWidth, height: maskHeight, channels: 1 } })
    .extract(maskCrop)
    .resize(outputWidth, outputHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer();

  let foregroundCount = 0;
  for (const value of output) if (value >= 128) foregroundCount += 1;
  const coverage = foregroundCount / output.length;
  if (coverage < 0.08 || coverage > 0.95) {
    console.warn(`[PERSON-SEGMENTATION] Rejected cropped mask coverage=${coverage.toFixed(4)}`);
    throw new PassportPhotoError(
      'person_segmentation_unreliable',
      '裁剪后的人物分割结果不可靠，请上传人物完整、四周留白更多的照片。'
    );
  }
  return output;
};

const analyzeMaskBounds = ({ mask, width, height, threshold = 96 }) => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let topTouches = 0;
  let bottomTouches = 0;
  let leftTouches = 0;
  let rightTouches = 0;
  const edgeBand = Math.min(2, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      if (y < edgeBand) topTouches += 1;
      if (y >= height - edgeBand) bottomTouches += 1;
      if (x < edgeBand) leftTouches += 1;
      if (x >= width - edgeBand) rightTouches += 1;
    }
  }

  if (right < left || bottom < top) {
    throw new PassportPhotoError('person_segmentation_failed', '人物分割失败，请上传背景较清晰、人物完整的正面照片。');
  }
  return {
    left,
    top,
    right,
    bottom,
    touches: {
      top: topTouches >= 2,
      bottom: bottomTouches >= 2,
      left: leftTouches >= 2,
      right: rightTouches >= 2
    }
  };
};

export const validateAdaptivePersonMask = ({
  mask,
  maskWidth,
  maskHeight,
  detection,
  layout
}) => {
  validatePersonMask({
    mask,
    width: maskWidth,
    height: maskHeight,
    face: detection.face,
    imageWidth: detection.imageWidth,
    imageHeight: detection.imageHeight
  });
  const bounds = analyzeMaskBounds({ mask, width: maskWidth, height: maskHeight });
  const scaleY = detection.imageHeight / maskHeight;
  const faceHeight = detection.face.box.height;
  const chinY = detection.face.box.y + faceHeight * 1.05;
  const personBottom = (bounds.bottom + 1) * scaleY;
  if (personBottom < chinY + faceHeight * 0.08) {
    throw new PassportPhotoError(
      'insufficient_portrait_space',
      '照片中的下巴或肩部不完整，请上传头部、下巴和肩部均清晰可见的正面照片。'
    );
  }

  const visibleEdge = {
    top: layout.offsetY > 2,
    bottom: detection.imageHeight * layout.scale + layout.offsetY < layout.outputHeight - 2,
    left: layout.offsetX > 2,
    right: detection.imageWidth * layout.scale + layout.offsetX < layout.outputWidth - 2
  };
  if ((bounds.touches.top && visibleEdge.top) ||
      (bounds.touches.bottom && visibleEdge.bottom) ||
      (bounds.touches.left && visibleEdge.left) ||
      (bounds.touches.right && visibleEdge.right)) {
    throw new PassportPhotoError(
      'insufficient_portrait_space',
      '照片中的人物边缘已被截断，请上传头顶、下巴和肩部完整的正面照片。'
    );
  }
  return bounds;
};

const calculateVisibleSourceWindow = ({ imageWidth, imageHeight, layout }) => {
  const left = Math.max(0, Math.ceil(-layout.offsetX / layout.scale));
  const top = Math.max(0, Math.ceil(-layout.offsetY / layout.scale));
  const right = Math.min(imageWidth, Math.floor((layout.outputWidth - layout.offsetX) / layout.scale));
  const bottom = Math.min(imageHeight, Math.floor((layout.outputHeight - layout.offsetY) / layout.scale));
  if (right <= left || bottom <= top) {
    throw new PassportPhotoError('insufficient_portrait_space', '人物无法放入目标证件照画布，请上传构图更完整的正面照片。');
  }
  return { left, top, width: right - left, height: bottom - top };
};

const joinRgbAndAlpha = ({ rgb, alpha, width, height }) => {
  if (rgb.length !== width * height * 3 || alpha.length !== width * height) {
    throw new PassportPhotoError('person_segmentation_failed', '人物图像与蒙版尺寸不一致，请重新处理。');
  }
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const rgbOffset = pixel * 3;
    const rgbaOffset = pixel * 4;
    rgba[rgbaOffset] = rgb[rgbOffset];
    rgba[rgbaOffset + 1] = rgb[rgbOffset + 1];
    rgba[rgbaOffset + 2] = rgb[rgbOffset + 2];
    rgba[rgbaOffset + 3] = alpha[pixel];
  }
  return rgba;
};

export const prepareAdaptiveForeground = async ({
  buffer,
  segmentation,
  detection,
  layout,
  enhance
}) => {
  const processedMask = await postProcessPersonMask({
    mask: segmentation.mask,
    width: segmentation.width,
    height: segmentation.height
  });
  const bounds = validateAdaptivePersonMask({
    mask: processedMask,
    maskWidth: segmentation.width,
    maskHeight: segmentation.height,
    detection,
    layout
  });
  const sourceCrop = calculateVisibleSourceWindow({
    imageWidth: detection.imageWidth,
    imageHeight: detection.imageHeight,
    layout
  });
  const alpha = await sharp(processedMask, {
    raw: { width: segmentation.width, height: segmentation.height, channels: 1 }
  })
    .resize(detection.imageWidth, detection.imageHeight, { fit: 'fill', kernel: sharp.kernel.cubic })
    .extract(sourceCrop)
    .greyscale()
    .raw()
    .toBuffer();

  let rgbPipeline = sharp(buffer)
    .rotate()
    .extract(sourceCrop)
    .toColourspace('srgb')
    .removeAlpha();
  if (enhance === 'true' || enhance === true) {
    rgbPipeline = rgbPipeline
      .sharpen({ sigma: 1, m1: 1, m2: 2 })
      .modulate({ brightness: 1.05, contrast: 1.1 });
  }
  const { data: rgb, info: rgbInfo } = await rgbPipeline.raw().toBuffer({ resolveWithObject: true });
  const rgba = joinRgbAndAlpha({ rgb, alpha, width: rgbInfo.width, height: rgbInfo.height });
  const scaledWidth = Math.max(1, Math.round(sourceCrop.width * layout.scale));
  let { data: layer, info } = await sharp(rgba, {
    raw: { width: sourceCrop.width, height: sourceCrop.height, channels: 4 }
  })
    .resize({ width: scaledWidth, kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const left = Math.max(0, Math.round(layout.offsetX + sourceCrop.left * layout.scale));
  const top = Math.max(0, Math.round(layout.offsetY + sourceCrop.top * layout.scale));
  const fittedWidth = Math.min(info.width, layout.outputWidth - left);
  const fittedHeight = Math.min(info.height, layout.outputHeight - top);
  if (fittedWidth <= 0 || fittedHeight <= 0) {
    throw new PassportPhotoError('insufficient_portrait_space', '人物无法放入目标证件照画布，请重新上传照片。');
  }
  if (fittedWidth !== info.width || fittedHeight !== info.height) {
    const extracted = await sharp(layer, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .extract({ left: 0, top: 0, width: fittedWidth, height: fittedHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });
    layer = extracted.data;
    info = extracted.info;
  }

  let foregroundCount = 0;
  for (let offset = 3; offset < layer.length; offset += 4) {
    if (layer[offset] >= 128) foregroundCount += 1;
  }
  const coverage = foregroundCount / (layout.outputWidth * layout.outputHeight);
  if (coverage < 0.08 || coverage > 0.95) {
    throw new PassportPhotoError(
      'person_segmentation_unreliable',
      '重新排版后的人物比例不可靠，请上传人物完整、背景较简单的正面照片。'
    );
  }

  return {
    data: layer,
    width: info.width,
    height: info.height,
    left,
    top,
    sourceCrop,
    bounds,
    metrics: {
      coverage,
      scaleX: info.width / sourceCrop.width,
      scaleY: info.height / sourceCrop.height
    }
  };
};

const parseHexColor = color => {
  const value = color.replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
};

export const compositeRgbWithBackground = ({ rgb, alpha, width, height, backgroundColor }) => {
  if (!Buffer.isBuffer(rgb) || rgb.length !== width * height * 3 ||
      !Buffer.isBuffer(alpha) || alpha.length !== width * height) {
    throw new PassportPhotoError('person_segmentation_failed', '人物图像与蒙版尺寸不一致，请重新处理。');
  }
  const background = parseHexColor(backgroundColor);
  const output = Buffer.allocUnsafe(rgb.length);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const opacity = alpha[pixel] / 255;
    const rgbOffset = pixel * 3;
    output[rgbOffset] = clampByte(rgb[rgbOffset] * opacity + background[0] * (1 - opacity));
    output[rgbOffset + 1] = clampByte(rgb[rgbOffset + 1] * opacity + background[1] * (1 - opacity));
    output[rgbOffset + 2] = clampByte(rgb[rgbOffset + 2] * opacity + background[2] * (1 - opacity));
  }
  return output;
};
