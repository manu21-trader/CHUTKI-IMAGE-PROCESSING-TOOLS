import sharp from 'sharp';
import { IMAGE_LIMITS, assertOutputDimensions } from '../config/imageLimits.js';
import {
  PassportPhotoInputError,
  resolvePassportPhotoSpec
} from '../utils/passportPhoto.js';

let activeRequests = 0;
const activeRequestsByIp = new Map();

const rejectLimit = (res, message, status = 413) => res.status(status).json({
  error: 'image_limit_exceeded',
  message
});

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ensureOutput = (width, height) => {
  try {
    assertOutputDimensions(Math.ceil(width), Math.ceil(height));
    return null;
  } catch (error) {
    return error.message;
  }
};

const projectedOutput = (tool, body, metadata) => {
  const first = metadata[0];
  if (!first) return null;
  const dpi = positiveNumber(body.dpi, 300);
  const width = positiveNumber(body.width, first.width);
  const height = positiveNumber(body.height, first.height);

  switch (tool) {
    case 'resize-pixel': return [width, height];
    case 'resize-cm': return [width * dpi / 2.54, height * dpi / 2.54];
    case 'resize-mm': return [width * dpi / 25.4, height * dpi / 25.4];
    case 'resize-inches': return [width * dpi, height * dpi];
    case 'resize-signature': return [width, height];
    case 'resize-sign-50x20mm': return [50 * dpi / 25.4, 20 * dpi / 25.4];
    case 'bulk-resize': {
      if (body.unit === 'cm') return [width * dpi / 2.54, height * dpi / 2.54];
      if (body.unit === 'mm') return [width * dpi / 25.4, height * dpi / 25.4];
      if (body.unit === 'inch') return [width * dpi, height * dpi];
      return [width, height];
    }
    case 'instagram-grid': return [1080 * positiveNumber(body.cols, 3), 1080 * positiveNumber(body.rows, 3)];
    case 'super-resolution': {
      const scale = positiveNumber(body.scale, 2);
      return [first.width * scale, first.height * scale];
    }
    case 'join-images': {
      const spacing = Math.max(0, Number.parseInt(body.spacing || '0', 10));
      if (body.direction === 'vertical') {
        return [Math.max(...metadata.map(item => item.width)), metadata.reduce((sum, item) => sum + item.height, 0) + spacing * (metadata.length - 1)];
      }
      return [metadata.reduce((sum, item) => sum + item.width, 0) + spacing * (metadata.length - 1), Math.max(...metadata.map(item => item.height))];
    }
    case 'passport-photo-advanced': {
      const { pixelWidth, pixelHeight } = resolvePassportPhotoSpec({
        country: body.country,
        size: body.size,
        dpi,
        background: body.background
      });
      const quantity = positiveNumber(body.quantity, 1);
      const perRow = Math.ceil(Math.sqrt(quantity));
      const perColumn = Math.ceil(quantity / perRow);
      return [pixelWidth * perRow, pixelHeight * perColumn];
    }
    default: return [first.width, first.height];
  }
};

export const acquireImageProcessingSlot = (req, res, next) => {
  if (req.method !== 'POST') return next();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const activeForIp = activeRequestsByIp.get(ip) || 0;
  if (activeRequests >= IMAGE_LIMITS.maxConcurrentRequests ||
      activeForIp >= IMAGE_LIMITS.maxConcurrentRequestsPerIp) {
    return res.status(503).json({
      error: 'server_busy',
      message: 'Image processing is busy. Please retry shortly.'
    });
  }

  activeRequests += 1;
  activeRequestsByIp.set(ip, activeForIp + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
    const remaining = Math.max(0, (activeRequestsByIp.get(ip) || 1) - 1);
    if (remaining === 0) activeRequestsByIp.delete(ip);
    else activeRequestsByIp.set(ip, remaining);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
};

export const validateImageRequest = async (req, res, next) => {
  if (req.method !== 'POST') return next();
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) return rejectLimit(res, 'An image file is required', 400);
    if (files.length > IMAGE_LIMITS.maxFiles) {
      return rejectLimit(res, `A maximum of ${IMAGE_LIMITS.maxFiles} files is allowed`);
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > IMAGE_LIMITS.maxTotalUploadBytes) {
      return rejectLimit(res, 'Total upload size exceeds 20 MiB');
    }

    const metadata = [];
    let totalPixels = 0;
    for (const file of files) {
      const info = await sharp(file.buffer, {
        failOnError: true,
        limitInputPixels: IMAGE_LIMITS.maxInputPixelsPerFile
      }).metadata();
      const pages = Math.max(1, info.pages || 1);
      const pixels = (info.width || 0) * (info.height || 0) * pages;
      if (!info.width || !info.height || pixels > IMAGE_LIMITS.maxInputPixelsPerFile) {
        return rejectLimit(res, 'An input image exceeds the 20 megapixel limit');
      }
      totalPixels += pixels;
      metadata.push({ width: info.width, height: info.height, pages, pixels });
    }
    if (totalPixels > IMAGE_LIMITS.maxInputPixelsPerRequest) {
      return rejectLimit(res, 'Combined input images exceed the 30 megapixel limit');
    }

    const tool = req.toolPolicy.canonicalTool;
    if (tool === 'instagram-grid' || tool === 'split-image') {
      const rows = positiveNumber(req.body.rows, 3);
      const cols = positiveNumber(req.body.cols, 3);
      if (rows > IMAGE_LIMITS.maxGridRows || cols > IMAGE_LIMITS.maxGridCols) {
        return rejectLimit(res, 'Grid size is limited to 3x3', 422);
      }
    }
    if (tool === 'super-resolution' && positiveNumber(req.body.scale, 2) > IMAGE_LIMITS.maxSuperResolutionScale) {
      return rejectLimit(res, 'Super resolution is limited to 2x', 422);
    }
    if (positiveNumber(req.body.dpi, 300) > IMAGE_LIMITS.maxPassportDpi) {
      return rejectLimit(res, 'DPI is limited to 600', 422);
    }
    if (positiveNumber(req.body.quantity, 1) > IMAGE_LIMITS.maxPassportQuantity) {
      return rejectLimit(res, 'Passport photo quantity is limited to 9', 422);
    }
    const targetBytes = req.body.targetMB !== undefined
      ? positiveNumber(req.body.targetMB, 1) * 1024 * 1024
      : positiveNumber(req.body.targetKB ?? req.body.targetSize, 1) * 1024;
    if ((req.body.targetMB !== undefined || req.body.targetKB !== undefined || req.body.targetSize !== undefined) &&
        targetBytes > IMAGE_LIMITS.maxTargetBytes) {
      return rejectLimit(res, 'Target file size is limited to 5 MiB', 422);
    }
    if ((tool === 'jpg-to-text' || tool === 'png-to-text') && (req.body.lang || 'eng') !== 'eng') {
      return rejectLimit(res, 'Only the bundled English OCR language is available', 422);
    }

    const output = projectedOutput(tool, req.body, metadata);
    if (output) {
      const outputError = ensureOutput(output[0], output[1]);
      if (outputError) return rejectLimit(res, outputError, 422);
      const input = metadata[0];
      const scale = Math.max(output[0] / input.width, output[1] / input.height);
      if (tool !== 'super-resolution' && scale > IMAGE_LIMITS.maxResizeScale) {
        return rejectLimit(res, 'Image enlargement is limited to 4x', 422);
      }
    }

    req.imageMetadata = metadata;
    next();
  } catch (error) {
    if (error instanceof PassportPhotoInputError) {
      return rejectLimit(res, error.message, error.status);
    }
    if (error?.message?.includes('pixel limit')) {
      return rejectLimit(res, 'An input image exceeds the 20 megapixel limit');
    }
    return rejectLimit(res, 'The uploaded image could not be safely decoded', 400);
  }
};
