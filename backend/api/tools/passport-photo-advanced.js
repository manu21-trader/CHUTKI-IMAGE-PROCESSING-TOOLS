import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import {
  PassportPhotoError,
  resolvePassportPhotoSpec
} from '../../utils/passportPhoto.js';
import { processPassportPortrait } from '../../services/passportPhotoProcessor.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

router.post('/', async (req, res) => {
  try {
    const fileObj = req.files?.[0] || req.file;
    if (!fileObj) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const {
      size = '2x2',
      dpi = 300,
      background = '#FFFFFF',
      quantity = 1,
      paperSize = '4x6',
      enhance = true,
      country = 'US',
      complianceCheck = true,
      headPositionCheck = true,
      lightingCheck = true,
      backgroundCheck = true
    } = req.body;

    const targetSpec = resolvePassportPhotoSpec({ country, size, dpi, background });
    const {
      countryCode,
      countryRequirement,
      pixelWidth,
      pixelHeight
    } = targetSpec;
    const portrait = await processPassportPortrait({
      buffer: fileObj.buffer,
      targetSpec,
      background,
      enhance
    });
    const { detection, crop } = portrait;
    let processedBuffer = portrait.buffer;

    // Compliance check simulation
    let complianceStatus = {
      passed: true,
      issues: [],
      suggestions: [],
      details: {}
    };

    if (complianceCheck) {
      try {
        const metadata = await sharp(fileObj.buffer).metadata();

        // Resolution check
        if (metadata.width < 600 || metadata.height < 600) {
          complianceStatus.passed = false;
          complianceStatus.issues.push('Image resolution too low (minimum 600x600 pixels recommended)');
          complianceStatus.suggestions.push('Use a higher resolution image for better quality');
        }

        // Head position check (simulated)
        if (headPositionCheck) {
          complianceStatus.details.headPosition = '由真实人脸定位自动居中';
          complianceStatus.details.faceConfidence = detection.face.confidence;
          complianceStatus.details.cropMetrics = crop.metrics;
        }

        if (lightingCheck) {
          complianceStatus.details.lighting = '本版本未自动判定光线合规性';
        }

        if (backgroundCheck) {
          complianceStatus.details.background = portrait.backgroundPreset.mode === 'original'
            ? '保留原始背景'
            : `已使用本地人物分割并合成${portrait.backgroundPreset.label}`;
        }

        // Country-specific compliance checks
        if (countryRequirement) {
          const reqs = countryRequirement;
          complianceStatus.details.country = countryCode;
          complianceStatus.details.dimensions = `${reqs.width}x${reqs.height} ${reqs.unit || 'inches'}`;

          // Add more specific checks based on country requirements
          if (countryCode === 'US') {
            // US passport requirements
            if (metadata.width < 600 || metadata.height < 600) {
              complianceStatus.suggestions.push('US passport photos require high resolution for best results');
            }
          }
        }
      } catch (complianceError) {
        console.log('Compliance check error:', complianceError);
        complianceStatus.issues.push('Could not complete all compliance checks');
      }
    }

    // If quantity > 1, create a grid layout
    if (parseInt(quantity) > 1) {
      const photosPerRow = Math.ceil(Math.sqrt(parseInt(quantity)));
      const photosPerCol = Math.ceil(parseInt(quantity) / photosPerRow);

      // Create a canvas for the grid
      const canvasWidth = pixelWidth * photosPerRow;
      const canvasHeight = pixelHeight * photosPerCol;

      const compositeArray = [];
      for (let i = 0; i < parseInt(quantity); i++) {
        const row = Math.floor(i / photosPerRow);
        const col = i % photosPerRow;
        const x = col * pixelWidth;
        const y = row * pixelHeight;
        compositeArray.push({ input: processedBuffer, left: x, top: y });
      }

      processedBuffer = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 3,
          background: '#FFFFFF'
        }
      })
        .composite(compositeArray)
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    const filename = `passport_${size.replace('x', '_')}_${Date.now()}.jpg`;

    // Add compliance status to response headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Compliance-Status', encodeURIComponent(JSON.stringify(complianceStatus)));

    res.send(processedBuffer);

  } catch (error) {
    console.error('Advanced Passport Photo error:', error);
    if (error instanceof PassportPhotoError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    res.status(500).json({
      error: 'passport_photo_processing_failed',
      message: `证件照处理失败：${error.message}`
    });
  }
});

export default router;
