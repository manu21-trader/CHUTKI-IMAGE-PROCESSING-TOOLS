// backend/api/tools/editors.js
// All image editing/effects tools (rotate, flip, watermark, crop, grayscale, filters, etc.)

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import {
  PassportPhotoError,
  resolvePassportPhotoSpec
} from '../../utils/passportPhoto.js';
import { calculatePassportCrop } from '../../utils/passportCrop.js';
import { detectPrimaryFace } from '../../services/faceDetection.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => { file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images')); }
});

router.post('/:tool', async (req, res, next) => {
  try {
    const { tool } = req.params;
    const fileBuffer = req.files?.[0]?.buffer || req.file?.buffer;
    
    // Tools that do NOT need an input image file
    const noFileTools = ['ai-face-generator'];
    
    if (!fileBuffer && !noFileTools.includes(tool)) return res.status(400).json({ error: 'No image file provided' });
    const customFilename = req.body.customFilename;
    let processedBuffer, filename, contentType = 'image/jpeg';

    switch (tool) {

      // ── passport-photo ───────────────────────────────────────────────────────
      case 'passport-photo': {
        const { size = '2x2', dpi = 300, background = '#FFFFFF', quantity = 1, enhance = true, country = 'US', complianceCheck = true } = req.body;
        const targetSpec = resolvePassportPhotoSpec({ country, size, dpi, background });
        const { pixelWidth: pw, pixelHeight: ph } = targetSpec;
        const detection = await detectPrimaryFace(fileBuffer);
        const crop = calculatePassportCrop({
          imageWidth: detection.imageWidth,
          imageHeight: detection.imageHeight,
          face: detection.face,
          targetSpec
        });

        let proc = sharp(fileBuffer).rotate().extract({
          left: crop.left,
          top: crop.top,
          width: crop.width,
          height: crop.height
        });
        if (enhance === 'true' || enhance === true) proc = proc.sharpen({ sigma: 1, m1: 1, m2: 2 }).modulate({ brightness: 1.05, contrast: 1.1 });
        processedBuffer = await proc
          .resize(pw, ph, { fit: 'cover', position: 'center' })
          .flatten({ background: '#FFFFFF' })
          .jpeg({ quality: 95, mozjpeg: true })
          .toBuffer();

        if (parseInt(quantity) > 1) {
          const perRow = Math.ceil(Math.sqrt(parseInt(quantity)));
          const perCol = Math.ceil(parseInt(quantity) / perRow);
          const compositeArr = [];
          for (let i = 0; i < parseInt(quantity); i++) {
            compositeArr.push({ input: processedBuffer, top: Math.floor(i / perRow) * ph, left: (i % perRow) * pw });
          }
          processedBuffer = await sharp({ create: { width: pw * perRow, height: ph * perCol, channels: 3, background: { r: 255, g: 255, b: 255 } } }).composite(compositeArr).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
        }
        filename = customFilename ? `${customFilename}.jpg` : `passport_${country}_${Date.now()}.jpg`;
        break;
      }

      // ── rotate ───────────────────────────────────────────────────────────────
      case 'rotate':
      case 'rotate-tool': {
        const { angle = 90, background = 'white', expandCanvas = true, quality = 90 } = req.body;
        let proc = sharp(fileBuffer);
        if (expandCanvas === 'false' || expandCanvas === false) {
          const meta = await sharp(fileBuffer).metadata();
          proc = proc.rotate(parseFloat(angle), { background, fit: 'cover' }).resize(meta.width, meta.height, { fit: 'cover' });
        } else { proc = proc.rotate(parseFloat(angle), { background }); }
        processedBuffer = await proc.jpeg({ quality: parseInt(quality), mozjpeg: true }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `rotated_${angle}_${Date.now()}.jpg`;
        break;
      }

      // ── flip ─────────────────────────────────────────────────────────────────
      case 'flip':
      case 'flip-tool': {
        const { direction = 'horizontal' } = req.body;
        let proc = sharp(fileBuffer);
        proc = direction === 'horizontal' ? proc.flop() : proc.flip();
        processedBuffer = await proc.jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `flipped_${direction}_${Date.now()}.jpg`;
        break;
      }

      // ── watermark ────────────────────────────────────────────────────────────
      case 'watermark': {
        const { text = 'WATERMARK', position = 'bottom-right', opacity = 0.5, fontSize = 48, color = '#ffffff' } = req.body;
        const meta = await sharp(fileBuffer).metadata();
        const posMap = {
          'top-left':    { x: 20, y: 50, anchor: 'start' },
          'top-right':   { x: meta.width - 20, y: 50, anchor: 'end' },
          'bottom-left': { x: 20, y: meta.height - 20, anchor: 'start' },
          'bottom-right':{ x: meta.width - 20, y: meta.height - 20, anchor: 'end' },
          'center':      { x: meta.width / 2, y: meta.height / 2, anchor: 'middle' }
        };
        const pos = posMap[position] || posMap['bottom-right'];
        const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><text x="${pos.x}" y="${pos.y}" font-family="Arial" font-size="${fontSize}" fill="${color}" opacity="${opacity}" text-anchor="${pos.anchor}">${text}</text></svg>`);
        processedBuffer = await sharp(fileBuffer).composite([{ input: svg, blend: 'over' }]).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `watermarked_${Date.now()}.jpg`;
        break;
      }

      // ── circle-crop ──────────────────────────────────────────────────────────
      case 'circle-crop': {
        const { border = false, borderColor = 'white', borderWidth = 10 } = req.body;
        const meta = await sharp(fileBuffer).metadata();
        const size = Math.min(meta.width, meta.height);
        const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
        let proc = sharp(fileBuffer).resize(size, size, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png();
        if (border) {
          const bw = parseInt(borderWidth);
          const borderMask = Buffer.from(`<svg width="${size+bw*2}" height="${size+bw*2}"><circle cx="${(size+bw*2)/2}" cy="${(size+bw*2)/2}" r="${size/2+bw}" fill="${borderColor}"/></svg>`);
          proc = sharp({ create: { width: size+bw*2, height: size+bw*2, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
            .composite([{ input: borderMask, blend: 'over' }, { input: await proc.toBuffer(), left: bw, top: bw }]).png();
        }
        processedBuffer = await proc.toBuffer();
        filename = customFilename ? `${customFilename}.png` : `circle_crop_${Date.now()}.png`;
        contentType = 'image/png';
        break;
      }

      // ── grayscale ────────────────────────────────────────────────────────────
      case 'grayscale':
        processedBuffer = await sharp(fileBuffer).grayscale().jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `grayscale_${Date.now()}.jpg`;
        break;

      // ── black-white ──────────────────────────────────────────────────────────
      case 'black-white':
        processedBuffer = await sharp(fileBuffer).threshold(128).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `black_white_${Date.now()}.jpg`;
        break;

      // ── pixelate / pixel-art ─────────────────────────────────────────────────
      case 'pixelate':
      case 'pixel-art': {
        const intensity = parseInt(req.body.intensity || req.body.pixelSize) || 10;
        const meta = await sharp(fileBuffer).metadata();
        const sw = Math.max(1, Math.floor(meta.width / intensity));
        const sh = Math.max(1, Math.floor(meta.height / intensity));
        processedBuffer = await sharp(fileBuffer).resize(sw, sh, { kernel: 'nearest' }).resize(meta.width, meta.height, { kernel: 'nearest' }).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `${tool}_${Date.now()}.jpg`;
        break;
      }

      // ── pixelate-face ────────────────────────────────────────────────────────
      case 'pixelate-face': {
        const pixelSize = parseInt(req.body.pixelSize) || 20;
        const meta = await sharp(fileBuffer).metadata();
        const sw = Math.max(1, Math.floor(meta.width / pixelSize));
        const sh = Math.max(1, Math.floor(meta.height / pixelSize));
        processedBuffer = await sharp(fileBuffer).resize(sw, sh, { kernel: 'nearest' }).resize(meta.width, meta.height, { kernel: 'nearest' }).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `pixelated_face_${Date.now()}.jpg`;
        break;
      }

      // ── blur-face ────────────────────────────────────────────────────────────
      case 'blur-face': {
        const blurAmount = parseFloat(req.body.blurAmount) || 10;
        processedBuffer = await sharp(fileBuffer).blur(blurAmount).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `blurred_face_${Date.now()}.jpg`;
        break;
      }

      // ── censor ───────────────────────────────────────────────────────────────
      case 'censor': {
        const { x = 0, y = 0, width = 100, height = 100 } = req.body;
        const meta = await sharp(fileBuffer).metadata();
        const blurOverlay = await sharp(fileBuffer).extract({ left: Math.max(0,parseInt(x)), top: Math.max(0,parseInt(y)), width: Math.min(parseInt(width),meta.width), height: Math.min(parseInt(height),meta.height) }).blur(20).toBuffer();
        processedBuffer = await sharp(fileBuffer).composite([{ input: blurOverlay, left: parseInt(x), top: parseInt(y) }]).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `censored_${Date.now()}.jpg`;
        break;
      }

      // ── freehand-crop ────────────────────────────────────────────────────────
      case 'freehand-crop': {
        const meta = await sharp(fileBuffer).metadata();
        const x = parseInt(req.body.x) || 0, y = parseInt(req.body.y) || 0;
        const w = parseInt(req.body.width) || Math.min(200, meta.width);
        const h = parseInt(req.body.height) || Math.min(200, meta.height);
        const sl = Math.max(0,Math.min(x,meta.width-1)), st = Math.max(0,Math.min(y,meta.height-1));
        const sw = Math.min(w,meta.width-sl), sh = Math.min(h,meta.height-st);
        processedBuffer = await sharp(fileBuffer).extract({ left: sl, top: st, width: sw, height: sh }).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `cropped_${Date.now()}.jpg`;
        break;
      }

      // ── split-image ──────────────────────────────────────────────────────────
      case 'split-image': {
        const JSZip = (await import('jszip')).default;
        const meta = await sharp(fileBuffer).metadata();
        const direction = req.body.direction || 'grid';
        const rows = Math.max(1, parseInt(req.body.rows) || 2);
        const cols = Math.max(1, parseInt(req.body.cols) || 2);
        const parts = Math.max(1, parseInt(req.body.parts) || 2);
        const pieces = [];
        if (direction === 'horizontal') {
          const pieceW = Math.floor(meta.width / parts);
          for (let i = 0; i < parts; i++) {
            const left = i * pieceW;
            const w = i === parts - 1 ? meta.width - left : pieceW;
            if (w > 0) pieces.push({ left, top: 0, width: w, height: meta.height, name: `piece_${i+1}.jpg` });
          }
        } else if (direction === 'vertical') {
          const pieceH = Math.floor(meta.height / parts);
          for (let i = 0; i < parts; i++) {
            const top = i * pieceH;
            const h = i === parts - 1 ? meta.height - top : pieceH;
            if (h > 0) pieces.push({ left: 0, top, width: meta.width, height: h, name: `piece_${i+1}.jpg` });
          }
        } else {
          const pieceW = Math.floor(meta.width / cols);
          const pieceH = Math.floor(meta.height / rows);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const left = c * pieceW, top = r * pieceH;
              const w = c === cols - 1 ? meta.width - left : pieceW;
              const h = r === rows - 1 ? meta.height - top : pieceH;
              if (w > 0 && h > 0) pieces.push({ left, top, width: w, height: h, name: `piece_r${r+1}_c${c+1}.jpg` });
            }
          }
        }
        if (pieces.length === 1) {
          const p = pieces[0];
          processedBuffer = await sharp(fileBuffer).extract({ left: p.left, top: p.top, width: p.width, height: p.height }).jpeg({ quality: 90 }).toBuffer();
          filename = `split_piece1_${Date.now()}.jpg`;
        } else {
          const zip = new JSZip();
          for (const piece of pieces) {
            const buf = await sharp(fileBuffer).extract({ left: piece.left, top: piece.top, width: piece.width, height: piece.height }).jpeg({ quality: 90 }).toBuffer();
            zip.file(piece.name, buf);
          }
          const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="split_${rows}x${cols}_${Date.now()}.zip"`);
          res.send(zipBuffer);
          return;
        }
        break;
      }


      // ── remove-background (local Sharp-based edge-detection method) ────────────
      case 'remove-background': {
        // Local background removal using color-distance thresholding
        // Samples the corner pixels as background color, then makes similar pixels transparent
        const edge = Math.max(1, parseInt(req.body.edge) || 5);
        const threshold = parseInt(req.body.threshold) || 50;
        const quality = parseInt(req.body.quality) || 90;

        const meta = await sharp(fileBuffer).metadata();
        const { data, info } = await sharp(fileBuffer)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const { width, height, channels } = info; // channels = 4 (RGBA)

        // Sample background color from the 4 corners (average)
        const sampleCorner = (x, y) => {
          const idx = (y * width + x) * channels;
          return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
        };
        const corners = [
          sampleCorner(0, 0),
          sampleCorner(width - 1, 0),
          sampleCorner(0, height - 1),
          sampleCorner(width - 1, height - 1)
        ];
        const bgR = Math.round(corners.reduce((s, c) => s + c.r, 0) / 4);
        const bgG = Math.round(corners.reduce((s, c) => s + c.g, 0) / 4);
        const bgB = Math.round(corners.reduce((s, c) => s + c.b, 0) / 4);

        // Make pixels that are close to background color transparent
        for (let i = 0; i < data.length; i += channels) {
          const dr = data[i] - bgR;
          const dg = data[i + 1] - bgG;
          const db = data[i + 2] - bgB;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < threshold) {
            data[i + 3] = 0; // fully transparent
          }
        }

        processedBuffer = await sharp(data, { raw: { width, height, channels } })
          .png({ quality })
          .toBuffer();
        filename = customFilename ? `${customFilename}.png` : `removed_bg_${Date.now()}.png`;
        contentType = 'image/png';
        break;
      }

      // ── color-picker (returns JSON) ──────────────────────────────────────────
      case 'color-picker': {
        const { x = 50, y = 50 } = req.body;
        const { data, info } = await sharp(fileBuffer).raw().toBuffer({ resolveWithObject: true });
        const px = Math.min(parseInt(x), info.width - 1), py = Math.min(parseInt(y), info.height - 1);
        const idx = (py * info.width + px) * info.channels;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        return res.json({ color: { r,g,b }, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`, position: { x: px, y: py } });
      }

      // ── convert-dpi / check-dpi ──────────────────────────────────────────────
      case 'convert-dpi': {
        const { dpi = 300 } = req.body;
        processedBuffer = await sharp(fileBuffer).withMetadata({ density: parseInt(dpi) }).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `${dpi}dpi_${Date.now()}.jpg`;
        break;
      }
      case 'check-dpi': {
        const meta = await sharp(fileBuffer).metadata();
        return res.json({ success: true, dpi: meta.density || 72, width: meta.width, height: meta.height, format: meta.format });
      }

      // ── generate-signature ───────────────────────────────────────────────────
      case 'generate-signature': {
        const { enhance = true, background = 'transparent', style = 'natural', quality = 95, format = 'png', signatureText = '', generateType = 'enhance' } = req.body;
        if (generateType === 'generate' && signatureText) {
          const svg = Buffer.from(`<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg"><text x="50" y="130" style="fill:black;font-family:cursive;font-size:100px;">${signatureText}</text></svg>`);
          processedBuffer = await sharp(svg).png().toBuffer();
          contentType = 'image/png';
          filename = customFilename ? `${customFilename}.png` : `sig_${Date.now()}.png`;
        } else {
          let proc = sharp(fileBuffer);
          if (style === 'sharp') proc = proc.sharpen({ sigma: 3, m1: 2, m2: 4 }).modulate({ brightness: 1.2, contrast: 1.4 });
          else if (style === 'smooth') proc = proc.blur(0.5).modulate({ brightness: 1.1, contrast: 1.1 });
          else proc = proc.sharpen({ sigma: 2, m1: 1, m2: 3 }).modulate({ brightness: 1.1, contrast: 1.2 });
          if (format === 'jpg' || format === 'jpeg') {
            processedBuffer = await proc.flatten({ background: background === 'transparent' ? '#FFFFFF' : background }).jpeg({ quality: parseInt(quality), mozjpeg: true }).toBuffer();
            contentType = 'image/jpeg'; filename = customFilename ? `${customFilename}.jpg` : `sig_${Date.now()}.jpg`;
          } else {
            processedBuffer = background === 'transparent' ? await proc.png({ quality: parseInt(quality) }).toBuffer() : await proc.flatten({ background }).png({ quality: parseInt(quality) }).toBuffer();
            contentType = 'image/png'; filename = customFilename ? `${customFilename}.png` : `sig_${Date.now()}.png`;
          }
        }
        break;
      }

      // ── add-name-dob ─────────────────────────────────────────────────────────
      case 'add-name-dob': {
        const { name = '', dob = '', position = 'bottom', fontSize = 24 } = req.body;
        const meta = await sharp(fileBuffer).metadata();
        const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><text x="20" y="${position==='bottom'?meta.height-40:40}" font-family="Arial" font-size="${fontSize}" fill="white" stroke="black" stroke-width="1">${name}</text><text x="20" y="${position==='bottom'?meta.height-20:60}" font-family="Arial" font-size="${fontSize}" fill="white" stroke="black" stroke-width="1">${dob}</text></svg>`);
        processedBuffer = await sharp(fileBuffer).composite([{ input: svg, blend: 'over' }]).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `name_dob_${Date.now()}.jpg`;
        break;
      }

      // ── add-text ─────────────────────────────────────────────────────────────
      case 'add-text': {
        const { text = 'Sample Text', fontSize = 48, color = 'white', position = 'bottom-right' } = req.body;
        const meta = await sharp(fileBuffer).metadata();
        const posMap = { 'top-left':{x:20,y:fontSize+20,anchor:'start'}, 'top-right':{x:meta.width-20,y:fontSize+20,anchor:'end'}, center:{x:meta.width/2,y:meta.height/2,anchor:'middle'}, default:{x:meta.width-20,y:meta.height-20,anchor:'end'} };
        const p = posMap[position] || posMap.default;
        const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><text x="${p.x}" y="${p.y}" font-size="${fontSize}" fill="${color}" text-anchor="${p.anchor}" font-family="Arial" font-weight="bold" stroke="black" stroke-width="2">${text}</text></svg>`);
        processedBuffer = await sharp(fileBuffer).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 95 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `text_added_${Date.now()}.jpg`;
        break;
      }

      // ── ai-face-generator (generates a colorful gradient face placeholder) ──────
      case 'ai-face-generator': {
        const { gender = 'random', age = 'adult', style = 'realistic' } = req.body;
        // Generate a gradient placeholder image representing a face silhouette
        const size = 512;
        const skinColors = {
          'male':   { r: 210, g: 170, b: 130 },
          'female': { r: 230, g: 185, b: 150 },
          'random': { r: 220, g: 178, b: 140 }
        };
        const skin = skinColors[gender] || skinColors['random'];
        // Create a simple stylized portrait with SVG overlaid on colored background
        const svg = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stop-color="#e8f4f8"/>
              <stop offset="100%" stop-color="#b8d4e8"/>
            </radialGradient>
            <radialGradient id="face" cx="50%" cy="45%" r="40%">
              <stop offset="0%" stop-color="rgb(${skin.r},${skin.g},${skin.b})"/>
              <stop offset="100%" stop-color="rgb(${Math.max(0,skin.r-30)},${Math.max(0,skin.g-30)},${Math.max(0,skin.b-30)})"/>
            </radialGradient>
          </defs>
          <!-- Background -->
          <rect width="512" height="512" fill="url(#bg)"/>
          <!-- Body -->
          <ellipse cx="256" cy="500" rx="160" ry="100" fill="rgb(${Math.max(0,skin.r-20)},${Math.max(0,skin.g-20)},${Math.max(0,skin.b-20)})"/>
          <!-- Neck -->
          <rect x="216" y="340" width="80" height="80" rx="10" fill="url(#face)"/>
          <!-- Head -->
          <ellipse cx="256" cy="220" rx="130" ry="150" fill="url(#face)"/>
          <!-- Eyes -->
          <ellipse cx="200" cy="200" rx="20" ry="14" fill="white"/>
          <ellipse cx="312" cy="200" rx="20" ry="14" fill="white"/>
          <circle cx="200" cy="202" r="10" fill="#3a2010"/>
          <circle cx="312" cy="202" r="10" fill="#3a2010"/>
          <circle cx="204" cy="199" r="3" fill="white"/>
          <circle cx="316" cy="199" r="3" fill="white"/>
          <!-- Eyebrows -->
          <path d="M180 180 Q200 170 220 178" stroke="#3a2010" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M292 178 Q312 170 332 180" stroke="#3a2010" stroke-width="5" fill="none" stroke-linecap="round"/>
          <!-- Nose -->
          <path d="M256 215 Q248 260 240 275 Q256 280 272 275 Q264 260 256 215" fill="rgba(0,0,0,0.08)"/>
          <!-- Mouth -->
          <path d="M220 310 Q256 335 292 310" stroke="#c0604040" stroke-width="5" fill="none" stroke-linecap="round"/>
          <!-- Hair -->
          <ellipse cx="256" cy="105" rx="135" ry="90" fill="#3a2010"/>
          <ellipse cx="256" cy="175" rx="135" ry="60" fill="url(#face)"/>
          <!-- Ears -->
          <ellipse cx="128" cy="235" rx="22" ry="30" fill="url(#face)"/>
          <ellipse cx="384" cy="235" rx="22" ry="30" fill="url(#face)"/>
          <!-- Label -->
          <text x="256" y="490" text-anchor="middle" font-family="Arial" font-size="16" fill="#555">AI Generated · ${gender} · ${age}</text>
        </svg>`);
        processedBuffer = await sharp(svg).jpeg({ quality: 90 }).toBuffer();
        filename = customFilename ? `${customFilename}.jpg` : `ai_face_${gender}_${age}_${Date.now()}.jpg`;
        break;
      }

      default:
        return res.status(400).json({ error: `Editor tool '${tool}' not supported` });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(processedBuffer);
    setImmediate(() => { processedBuffer = null; if (global.gc) global.gc(); });
  } catch (error) {
    console.error(`[EDITORS] ${req.params.tool} error:`, error.message);
    if (error instanceof PassportPhotoError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    res.status(500).json({ error: 'Edit failed: ' + error.message });
  }
});

export default router;
