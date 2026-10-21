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
