// backend/api/tools/compressors.js
// All compression-related tools (compress to X KB/MB, image-compressor, etc.)

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { IMAGE_LIMITS, assertOutputDimensions } from '../../config/imageLimits.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ── Helper: Compress image to exact target byte size ───────────────────────────
// Strategy:
//   1) Binary-search on quality (1–95) — no resolution loss
//   2) If quality=1 still exceeds target, progressively downscale resolution
const compressToTarget = async (buffer, targetBytes, format = 'jpeg') => {
  const getOpts = (q) =>
    format === 'jpeg' ? { quality: q, mozjpeg: true }
    : format === 'webp' ? { quality: q }
    : { quality: q, compressionLevel: 9 };

  // Step 1: Quality binary search
  let low = 1, high = 95, bestBuffer = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const test = await sharp(buffer).toFormat(format, getOpts(mid)).toBuffer();
    if (test.length <= targetBytes) { bestBuffer = test; low = mid + 1; }
    else { high = mid - 1; }
  }
  if (bestBuffer !== null) return bestBuffer;

  // Step 2: Resolution downscaling fallback
  const meta = await sharp(buffer).metadata();
  let scale = 0.9;
  while (scale > 0.05) {
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));
    const test = await sharp(buffer)
      .resize(w, h, { fit: 'inside', kernel: 'lanczos3' })
      .toFormat(format, getOpts(1))
      .toBuffer();
    if (test.length <= targetBytes) {
      // Found working scale — optimize quality at this scale
      let qLow = 1, qHigh = 95, qBest = test;
      while (qLow <= qHigh) {
        const qMid = Math.floor((qLow + qHigh) / 2);
        const qTest = await sharp(buffer)
          .resize(w, h, { fit: 'inside', kernel: 'lanczos3' })
          .toFormat(format, getOpts(qMid))
          .toBuffer();
        if (qTest.length <= targetBytes) { qBest = qTest; qLow = qMid + 1; }
        else { qHigh = qMid - 1; }
      }
      return qBest;
    }
    scale = Math.round((scale - 0.1) * 10) / 10;
  }

  // Absolute minimum fallback
  const minW = Math.max(1, Math.round(meta.width * 0.05));
  const minH = Math.max(1, Math.round(meta.height * 0.05));
  return sharp(buffer).resize(minW, minH, { fit: 'inside' }).toFormat(format, getOpts(1)).toBuffer();
};

// ── POST /api/tools/:tool ────────────────────────────────────────────────────────
router.post('/:tool', async (req, res, next) => {
  try {
    const { tool } = req.params;
    const fileBuffer = req.files?.[0]?.buffer || req.file?.buffer;
    // Pass through tools that don't require an image file
    const noFileTools = ['ai-face-generator'];
    if (!fileBuffer && !noFileTools.includes(tool)) return res.status(400).json({ error: 'No image file provided' });

    const customFilename = req.body.customFilename;
    let processedBuffer;
    let filename;
    let contentType = 'image/jpeg';

    // ── reduce-size-kb ───────────────────────────────────────────────────────
    if (tool === 'reduce-size-kb') {
      const targetKB = parseInt(req.body.targetKB) || 100;
      if (isNaN(targetKB) || targetKB < 1) return res.status(400).json({ error: 'Invalid targetKB' });
      const targetBytes = targetKB * 1024;
      const fmt = (req.body.format || 'jpeg').toLowerCase();

      if (fmt === 'png') contentType = 'image/png';
      else if (fmt === 'webp') contentType = 'image/webp';
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      filename = customFilename ? `${customFilename}.${ext}` : `compressed_${targetKB}kb_${Date.now()}.${ext}`;

      // Re-encode at high quality first to see if it already fits
      const hqBuffer = await sharp(fileBuffer)
        .toFormat(fmt, fmt === 'jpeg' ? { quality: 95, mozjpeg: true } : { quality: 95 })
        .toBuffer();

      processedBuffer = hqBuffer.length <= targetBytes
        ? hqBuffer
        : await compressToTarget(fileBuffer, targetBytes, fmt);

      // Send compression stats in header for frontend display
      res.setHeader('X-Compression-Info', JSON.stringify({
        originalSize: fileBuffer.length,
        compressedSize: processedBuffer.length,
        savings: fileBuffer.length - processedBuffer.length,
        savingsPercentage: ((fileBuffer.length - processedBuffer.length) / fileBuffer.length * 100).toFixed(1),
        targetKB, quality: 'auto', format: fmt
      }));

    // ── reduce-size-mb ───────────────────────────────────────────────────────
    } else if (tool === 'reduce-size-mb') {
      const targetMB = parseFloat(req.body.targetMB) || 1;
      if (isNaN(targetMB) || targetMB <= 0) return res.status(400).json({ error: 'Invalid targetMB' });
      const targetBytes = Math.round(targetMB * 1024 * 1024);
      const fmt = (req.body.format || 'jpeg').toLowerCase();

      if (fmt === 'png') contentType = 'image/png';
      else if (fmt === 'webp') contentType = 'image/webp';
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      filename = customFilename ? `${customFilename}.${ext}` : `compressed_${targetMB}mb_${Date.now()}.${ext}`;
      processedBuffer = await compressToTarget(fileBuffer, targetBytes, fmt);

    // ── increase-size-kb ─────────────────────────────────────────────────────
    } else if (tool === 'increase-size-kb') {
      const targetKB = parseInt(req.body.targetSize) || parseInt(req.body.targetKB) || 500;
      const targetBytes = targetKB * 1024;
      const metadata = await sharp(fileBuffer).metadata();

      const safeScale = Math.min(
        IMAGE_LIMITS.maxResizeScale,
        IMAGE_LIMITS.maxOutputWidth / metadata.width,
        IMAGE_LIMITS.maxOutputHeight / metadata.height,
        Math.sqrt(IMAGE_LIMITS.maxOutputPixels / (metadata.width * metadata.height))
      );
      if (safeScale < 1) return res.status(422).json({ error: 'image_limit_exceeded', message: 'Input image is already at the safe output limit' });

      // Try progressively larger scales until output meets target, without ever
      // constructing a canvas beyond the shared 512MB safety budget.
      let processedResult = null;
      for (let scale = 1.2; scale <= safeScale; scale += 0.2) {
        const newW = Math.round(metadata.width * scale);
        const newH = Math.round(metadata.height * scale);
        assertOutputDimensions(newW, newH);
        const test = await sharp(fileBuffer)
          .resize(newW, newH, { kernel: 'lanczos3' })
          .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: false })
          .toBuffer();
        if (test.length >= targetBytes) { processedResult = test; break; }
      }
      const fallbackWidth = Math.max(1, Math.floor(metadata.width * safeScale));
      const fallbackHeight = Math.max(1, Math.floor(metadata.height * safeScale));
      assertOutputDimensions(fallbackWidth, fallbackHeight);
      processedBuffer = processedResult || await sharp(fileBuffer)
        .resize(fallbackWidth, fallbackHeight, { kernel: 'lanczos3' })
        .jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: false })
        .toBuffer();
      filename = customFilename ? `${customFilename}.jpg` : `increased_${targetKB}kb_${Date.now()}.jpg`;

    // ── image-compressor ─────────────────────────────────────────────────────
    } else if (tool === 'image-compressor' || tool === 'compress-image') {
      const quality = parseInt(req.body.quality) || 80;
      const fmt = (req.body.format || 'jpeg').toLowerCase();
      const preserveMetadata = req.body.preserveMetadata === 'true';

      let processor = sharp(fileBuffer);
      if (!preserveMetadata) processor = processor.withMetadata({ exif: null, iptc: null, xmp: null });

      if (fmt === 'png') {
        processedBuffer = await processor.png({ quality, compressionLevel: 6 }).toBuffer();
        contentType = 'image/png';
        filename = customFilename ? `${customFilename}.png` : `compressed_q${quality}_${Date.now()}.png`;
      } else if (fmt === 'webp') {
        processedBuffer = await processor.webp({ quality }).toBuffer();
        contentType = 'image/webp';
        filename = customFilename ? `${customFilename}.webp` : `compressed_q${quality}_${Date.now()}.webp`;
      } else {
        processedBuffer = await processor.jpeg({ quality, mozjpeg: true }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `compressed_q${quality}_${Date.now()}.jpg`;
      }

    // ── All compress-XKB / compress-XMB / jpg-to-kb / mb-to-kb / kb-to-mb ──
    } else {
      const isCompressTool = tool.startsWith('compress-') || 
                             tool === 'jpg-to-kb' || 
                             tool === 'kb-to-mb' || 
                             tool === 'mb-to-kb';

      if (!isCompressTool) {
        return next(); // CRITICAL FIX: Pass to converters/resizers/editors router!
      }

      const sizeMatch = tool.match(/compress-(\d+)(kb|mb)/) || tool.match(/(\d+)(kb|mb)/);
      let targetBytes;

      if (tool === 'compress-20-50kb') targetBytes = 35 * 1024;
      else if (tool === 'jpg-to-kb') targetBytes = (parseInt(req.body.targetKB) || 100) * 1024;
      else if (tool === 'kb-to-mb') targetBytes = Math.round((parseFloat(req.body.targetMB) || 1) * 1024 * 1024);
      else if (tool === 'mb-to-kb') targetBytes = (parseInt(req.body.targetKB) || 500) * 1024;
      else if (sizeMatch) {
        const [, size, unit] = sizeMatch;
        targetBytes = unit === 'mb' ? parseInt(size) * 1024 * 1024 : parseInt(size) * 1024;
      } else {
        targetBytes = 100 * 1024;
      }

      processedBuffer = await compressToTarget(fileBuffer, targetBytes);
      filename = customFilename ? `${customFilename}.jpg` : `compressed_${Date.now()}.jpg`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(processedBuffer);

    setImmediate(() => { processedBuffer = null; if (global.gc) global.gc(); });
  } catch (error) {
    console.error(`[COMPRESSORS] ${req.params.tool} error:`, error.message);
    res.status(500).json({ error: 'Compression failed: ' + error.message });
  }
});

export default router;
