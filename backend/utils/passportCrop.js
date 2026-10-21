import { PassportPhotoError } from './passportPhoto.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const finitePositive = value => Number.isFinite(value) && value > 0;

const cropError = () => new PassportPhotoError(
  'insufficient_portrait_space',
  '照片四周空间不足，无法保留完整头部和肩部。请上传取景更宽、头顶和肩部留白更多的正面照片。'
);

const targetHeadRatio = (requirement, outputHeight) => {
  if (finitePositive(requirement?.headSizeMin) && finitePositive(requirement?.headSizeMax) && finitePositive(outputHeight)) {
    return clamp(((requirement.headSizeMin + requirement.headSizeMax) / 2) / outputHeight, 0.42, 0.74);
  }
  return clamp((requirement?.headSizePercentage || 68) / 100, 0.42, 0.74);
};

const readFaceGeometry = ({ imageWidth, imageHeight, face, targetSpec }) => {
  if (!finitePositive(imageWidth) || !finitePositive(imageHeight) || !face?.box) {
    throw new PassportPhotoError('invalid_face_geometry', '无法读取有效的人脸位置，请重新上传清晰的正面照片。');
  }

  const { x, y, width: faceWidth, height: faceHeight } = face.box;
  if (![x, y, faceWidth, faceHeight].every(Number.isFinite) || !finitePositive(faceWidth) || !finitePositive(faceHeight)) {
    throw new PassportPhotoError('invalid_face_geometry', '无法读取有效的人脸位置，请重新上传清晰的正面照片。');
  }

  const outputWidth = targetSpec?.width;
  const outputHeight = targetSpec?.height;
  if (!finitePositive(outputWidth) || !finitePositive(outputHeight)) {
    throw new PassportPhotoError('invalid_passport_dimensions', '无法确定证件照目标尺寸。');
  }

  const headTop = y - faceHeight * 0.18;
  const chinY = y + faceHeight * 1.05;
  const eyeY = Number.isFinite(face.eyeCenter?.y)
    ? face.eyeCenter.y
    : y + faceHeight * 0.42;

  return {
    x,
    y,
    faceWidth,
    faceHeight,
    faceCenterX: x + faceWidth / 2,
    eyeY,
    headTop,
    chinY,
    estimatedHeadHeight: chinY - headTop,
    requirement: targetSpec.countryRequirement,
    outputWidth,
    outputHeight
  };
};

export const calculatePassportCrop = ({ imageWidth, imageHeight, face, targetSpec }) => {
  const {
    faceCenterX,
    eyeY,
    headTop,
    chinY,
    estimatedHeadHeight,
    requirement,
    outputWidth,
    outputHeight
  } = readFaceGeometry({ imageWidth, imageHeight, face, targetSpec });
  const aspectRatio = outputWidth / outputHeight;
  const desiredHeadRatio = targetHeadRatio(requirement, outputHeight);
  const cropHeightFloat = estimatedHeadHeight / desiredHeadRatio;
  const cropWidthFloat = cropHeightFloat * aspectRatio;

  if (cropWidthFloat > imageWidth || cropHeightFloat > imageHeight) throw cropError();

  // Existing country data expresses eye height from the bottom edge.
  const eyeFromTopRatio = 1 - clamp((requirement?.eyeLevelPercentage || 58) / 100, 0.45, 0.65);
  const preferredTop = eyeY - cropHeightFloat * eyeFromTopRatio;
  const minimumBottomMargin = cropHeightFloat * 0.12;
  const minimumTopMargin = cropHeightFloat * 0.04;
  const lowestAllowedTop = chinY + minimumBottomMargin - cropHeightFloat;
  const highestAllowedTop = headTop - minimumTopMargin;

  if (lowestAllowedTop > highestAllowedTop) throw cropError();

  const geometryTop = clamp(preferredTop, lowestAllowedTop, highestAllowedTop);
  const geometryLeft = faceCenterX - cropWidthFloat / 2;
  const fittedLeft = clamp(geometryLeft, 0, imageWidth - cropWidthFloat);
  const fittedTop = clamp(geometryTop, 0, imageHeight - cropHeightFloat);

  // Large boundary shifts would make the detected face visibly off-center or
  // remove the required head/shoulder margin, so reject instead of stretching.
  if (Math.abs(fittedLeft - geometryLeft) > cropWidthFloat * 0.06 ||
      Math.abs(fittedTop - geometryTop) > cropHeightFloat * 0.06) {
    throw cropError();
  }

  const width = Math.round(cropWidthFloat);
  const height = Math.round(cropHeightFloat);
  const left = clamp(Math.round(faceCenterX - width / 2), 0, imageWidth - width);
  const top = clamp(Math.round(fittedTop), 0, imageHeight - height);
  const headTopWhitespace = (headTop - top) / height;
  const chinToBottom = (top + height - chinY) / height;
  const horizontalFacePosition = (faceCenterX - left) / width;

  if (headTopWhitespace < 0.025 || chinToBottom < 0.09 ||
      horizontalFacePosition < 0.44 || horizontalFacePosition > 0.56) {
    throw cropError();
  }

  return {
    left,
    top,
    width,
    height,
    metrics: {
      targetAspectRatio: aspectRatio,
      headHeightRatio: estimatedHeadHeight / height,
      headTopWhitespace,
      chinToBottom,
      horizontalFacePosition,
      eyePositionFromTop: (eyeY - top) / height
    }
  };
};

export const calculateAdaptivePortraitLayout = ({ imageWidth, imageHeight, face, targetSpec }) => {
  const geometry = readFaceGeometry({ imageWidth, imageHeight, face, targetSpec });
  const {
    faceCenterX,
    eyeY,
    headTop,
    chinY,
    estimatedHeadHeight,
    requirement
  } = geometry;
  const outputWidth = targetSpec?.pixelWidth;
  const outputHeight = targetSpec?.pixelHeight;
  if (!finitePositive(outputWidth) || !finitePositive(outputHeight)) {
    throw new PassportPhotoError('invalid_passport_dimensions', '无法确定证件照目标像素尺寸。');
  }

  // A new background can replace missing surrounding space, but it cannot
  // reconstruct a crown or chin that was absent at capture. Side truncation is
  // checked against the segmentation mask after the final layout is known.
  if (headTop < 0 || chinY > imageHeight) {
    throw cropError();
  }

  const desiredHeadRatio = targetHeadRatio(requirement, geometry.outputHeight);
  const desiredHeadHeight = outputHeight * desiredHeadRatio;
  const scale = desiredHeadHeight / estimatedHeadHeight;
  const eyeFromTopRatio = 1 - clamp((requirement?.eyeLevelPercentage || 58) / 100, 0.45, 0.65);
  const offsetX = outputWidth / 2 - faceCenterX * scale;
  const offsetY = outputHeight * eyeFromTopRatio - eyeY * scale;

  if (![scale, offsetX, offsetY].every(Number.isFinite) || scale <= 0) throw cropError();

  const transformedHeadTop = headTop * scale + offsetY;
  const transformedChin = chinY * scale + offsetY;
  const headTopWhitespace = transformedHeadTop / outputHeight;
  const chinToBottom = (outputHeight - transformedChin) / outputHeight;
  const horizontalFacePosition = (faceCenterX * scale + offsetX) / outputWidth;
  if (headTopWhitespace < 0.025 || chinToBottom < 0.09 ||
      horizontalFacePosition < 0.49 || horizontalFacePosition > 0.51) {
    throw cropError();
  }

  return {
    mode: 'adaptive-canvas',
    scale,
    offsetX,
    offsetY,
    outputWidth,
    outputHeight,
    source: { width: imageWidth, height: imageHeight },
    metrics: {
      targetAspectRatio: outputWidth / outputHeight,
      headHeightRatio: desiredHeadRatio,
      headTopWhitespace,
      chinToBottom,
      horizontalFacePosition,
      eyePositionFromTop: (eyeY * scale + offsetY) / outputHeight,
      uniformScale: scale
    }
  };
};
