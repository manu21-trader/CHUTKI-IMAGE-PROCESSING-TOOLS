// backend/api/tools/resizers.js
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';

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
    // Pass through tools that don't require an image file
    const noFileTools = ['ai-face-generator'];
    if (!fileBuffer && !noFileTools.includes(req.params.tool)) return res.status(400).json({ error: 'No image file provided' });
    const customFilename = req.body.customFilename;
    let processedBuffer, filename, contentType = 'image/jpeg';

    switch (tool) {
      case 'resize-pixel': {
        const { width, height, maintain = true, quality = 90, format = 'jpeg', resizeMethod = 'lanczos3', smartCrop = false } = req.body;
        const kernelMap = { nearest:'nearest', cubic:'cubic', mitchell:'mitchell', lanczos3:'lanczos3' };
        const kernel = kernelMap[resizeMethod] || 'lanczos3';
        const meta = await sharp(fileBuffer).metadata();
        let tw = parseInt(width), th = parseInt(height);
        const fmt = format.toLowerCase();
        const applyFormat = async (p) => {
          if (fmt === 'png') { contentType = 'image/png'; filename = customFilename?`${customFilename}.png`:`resized_${Date.now()}.png`; return p.png({quality:parseInt(quality),compressionLevel:6}).toBuffer(); }
          if (fmt === 'webp') { contentType = 'image/webp'; filename = customFilename?`${customFilename}.webp`:`resized_${Date.now()}.webp`; return p.webp({quality:parseInt(quality)}).toBuffer(); }
          filename = customFilename?`${customFilename}.jpg`:`resized_${Date.now()}.jpg`;
          return p.jpeg({quality:parseInt(quality),mozjpeg:true}).toBuffer();
        };
        if (maintain==='true'||maintain===true) {
          const ar = meta.width/meta.height;
          if (tw&&th) {
            if (smartCrop==='true'||smartCrop===true) {
              const tr=tw/th;
              if (ar>tr){const nw=Math.round(meta.height*tr);const l=Math.floor((meta.width-nw)/2);processedBuffer=await applyFormat(sharp(fileBuffer).extract({left:l,top:0,width:nw,height:meta.height}).resize(tw,th,{kernel}));}
              else{const nh=Math.round(meta.width/tr);const t=Math.floor((meta.height-nh)/2);processedBuffer=await applyFormat(sharp(fileBuffer).extract({left:0,top:t,width:meta.width,height:nh}).resize(tw,th,{kernel}));}
            } else { processedBuffer = await applyFormat(sharp(fileBuffer).resize(tw,th,{fit:'inside',kernel})); }
          } else {
            if(tw&&!th) th=Math.round(tw/ar); else if(th&&!tw) tw=Math.round(th*ar);
            processedBuffer=await applyFormat(sharp(fileBuffer).resize(tw,th,{kernel}));
          }
        } else { processedBuffer=await applyFormat(sharp(fileBuffer).resize(tw,th,{fit:'fill',kernel})); }
        break;
      }
      case 'resize-cm': {
        const {width,height,dpi=300}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(parseFloat(width)*parseInt(dpi)/2.54),Math.round(parseFloat(height)*parseInt(dpi)/2.54),{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`resized_${width}x${height}cm_${Date.now()}.jpg`; break;
      }
      case 'resize-mm': {
        const {width,height,dpi=300}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(parseFloat(width)*parseInt(dpi)/25.4),Math.round(parseFloat(height)*parseInt(dpi)/25.4),{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`resized_${width}x${height}mm_${Date.now()}.jpg`; break;
      }
      case 'resize-inches': {
        const {width,height,dpi=300}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(parseFloat(width)*parseInt(dpi)),Math.round(parseFloat(height)*parseInt(dpi)),{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`resized_${width}x${height}in_${Date.now()}.jpg`; break;
      }
      case 'resize-6x2-300dpi': {
        const dpi=300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(6*dpi/2.54),Math.round(2*dpi/2.54),{fit:'cover'}).withMetadata({density:dpi}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`6cm_2cm_${Date.now()}.jpg`; break;
      }
      case 'resize-3-5x4-5cm': {
        const {dpi=300}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(3.5*parseInt(dpi)/2.54),Math.round(4.5*parseInt(dpi)/2.54),{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`3_5x4_5cm_${Date.now()}.jpg`; break;
      }
      case 'resize-35x45mm': {
        const {dpi=300}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(35*parseInt(dpi)/25.4),Math.round(45*parseInt(dpi)/25.4),{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`35x45mm_${Date.now()}.jpg`; break;
      }
      case 'resize-35x45cm': {
        const dpi=parseInt(req.body.dpi)||300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round((35/25.4)*dpi),Math.round((45/25.4)*dpi),{fit:'fill'}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`35x45mm_${Date.now()}.jpg`; break;
      }
      case 'resize-2x2': {
        const {dpi=300}=req.body;const px=Math.round(2*parseInt(dpi));
        processedBuffer=await sharp(fileBuffer).resize(px,px,{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`2x2_inch_${Date.now()}.jpg`; break;
      }
      case 'resize-4x6': {
        const dpi=300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(4*dpi),Math.round(6*dpi),{fit:'cover'}).withMetadata({density:dpi}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`4x6_${Date.now()}.jpg`; break;
      }
      case 'resize-3x4': {
        const dpi=300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(3*dpi),Math.round(4*dpi),{fit:'cover'}).withMetadata({density:dpi}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`3x4_${Date.now()}.jpg`; break;
      }
      case 'resize-600x600':
        processedBuffer=await sharp(fileBuffer).resize(600,600,{fit:'cover'}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`600x600_${Date.now()}.jpg`; break;
      case 'resize-a4': {
        const dpi=300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round(8.27*dpi),Math.round(11.69*dpi),{fit:'contain',background:'white'}).withMetadata({density:dpi}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`a4_${Date.now()}.jpg`; break;
      }
      case 'resize-ssc':
        processedBuffer=await sharp(fileBuffer).resize(300,300,{fit:'cover'}).withMetadata({density:300}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`ssc_${Date.now()}.jpg`; break;
      case 'resize-pan':
        processedBuffer=await sharp(fileBuffer).resize(300,360,{fit:'cover'}).withMetadata({density:300}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`pan_${Date.now()}.jpg`; break;
      case 'resize-upsc':
        processedBuffer=await sharp(fileBuffer).resize(300,400,{fit:'cover'}).withMetadata({density:300}).jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`upsc_${Date.now()}.jpg`; break;
      case 'resize-whatsapp-dp':
        processedBuffer=await sharp(fileBuffer).resize(500,500,{fit:'cover'}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`whatsapp_dp_${Date.now()}.jpg`; break;
      case 'resize-instagram': {
        const meta=await sharp(fileBuffer).metadata();const size=Math.max(meta.width,meta.height);
        processedBuffer=await sharp({create:{width:size,height:size,channels:3,background:{r:255,g:255,b:255}}}).composite([{input:fileBuffer,gravity:'center'}]).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`instagram_${Date.now()}.jpg`; break;
      }
      case 'instagram-grid': {
        const nr=parseInt(req.body.rows)||3,nc=parseInt(req.body.cols)||3;
        processedBuffer=await sharp(fileBuffer).resize(1080*nc,1080*nr,{fit:'cover'}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`insta_grid_${nr}x${nc}_${Date.now()}.jpg`; break;
      }
      case 'resize-youtube-banner':
        processedBuffer=await sharp(fileBuffer).resize(2560,1440,{fit:'cover'}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`yt_banner_${Date.now()}.jpg`; break;
      case 'super-resolution': {
        const scale=parseFloat(req.body.scale)||2;const meta=await sharp(fileBuffer).metadata();
        processedBuffer=await sharp(fileBuffer).resize(Math.round(meta.width*scale),Math.round(meta.height*scale),{kernel:'lanczos3'}).sharpen().jpeg({quality:95}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`super_res_${scale}x_${Date.now()}.jpg`; break;
      }
      case 'resize-signature': {
        const {width=200,height=50}=req.body;
        processedBuffer=await sharp(fileBuffer).resize(parseInt(width),parseInt(height),{fit:'contain',background:'transparent'}).png().toBuffer();
        filename=customFilename?`${customFilename}.png`:`signature_${width}x${height}_${Date.now()}.png`;contentType='image/png'; break;
      }
      case 'resize-sign-50x20mm':
      case 'resize-signature-50x20mm': {
        const dpi=parseInt(req.body.dpi)||300;
        processedBuffer=await sharp(fileBuffer).resize(Math.round((50/25.4)*dpi),Math.round((20/25.4)*dpi),{fit:'contain',background:'transparent'}).png().toBuffer();
        filename=customFilename?`${customFilename}.png`:`sign_50x20mm_${Date.now()}.png`;contentType='image/png'; break;
      }
      case 'bulk-resize': {
        const {width,height,unit='px',dpi=300}=req.body;let pw,ph;
        if(unit==='cm'){pw=Math.round(parseFloat(width)*parseInt(dpi)/2.54);ph=Math.round(parseFloat(height)*parseInt(dpi)/2.54);}
        else if(unit==='mm'){pw=Math.round(parseFloat(width)*parseInt(dpi)/25.4);ph=Math.round(parseFloat(height)*parseInt(dpi)/25.4);}
        else if(unit==='inch'){pw=Math.round(parseFloat(width)*parseInt(dpi));ph=Math.round(parseFloat(height)*parseInt(dpi));}
        else{pw=parseInt(width);ph=parseInt(height);}
        processedBuffer=await sharp(fileBuffer).resize(pw,ph,{fit:'cover'}).withMetadata({density:parseInt(dpi)}).jpeg({quality:90}).toBuffer();
        filename=customFilename?`${customFilename}.jpg`:`bulk_${width}x${height}_${unit}_${Date.now()}.jpg`; break;
      }
      case 'join-images': {
        const {direction='horizontal',spacing=0}=req.body;const images=req.files||[];
        if(images.length<2){processedBuffer=await sharp(fileBuffer).jpeg({quality:90}).toBuffer();}
        else{
          const metas=await Promise.all(images.map(img=>sharp(img.buffer).metadata()));
          if(direction==='horizontal'){
            const totalW=metas.reduce((s,m)=>s+m.width,0)+(parseInt(spacing)*(images.length-1));
            const maxH=Math.max(...metas.map(m=>m.height));
            const composites=[];let lo=0;
            for(let i=0;i<images.length;i++){composites.push({input:await sharp(images[i].buffer).resize({height:maxH,fit:'inside'}).toBuffer(),left:lo,top:0});lo+=metas[i].width+parseInt(spacing);}
            processedBuffer=await sharp({create:{width:totalW,height:maxH,channels:3,background:{r:255,g:255,b:255}}}).composite(composites).jpeg({quality:90}).toBuffer();
          }else{
            const maxW=Math.max(...metas.map(m=>m.width));
            const totalH=metas.reduce((s,m)=>s+m.height,0)+(parseInt(spacing)*(images.length-1));
            const composites=[];let to=0;
            for(let i=0;i<images.length;i++){composites.push({input:await sharp(images[i].buffer).resize({width:maxW,fit:'inside'}).toBuffer(),left:0,top:to});to+=metas[i].height+parseInt(spacing);}
            processedBuffer=await sharp({create:{width:maxW,height:totalH,channels:3,background:{r:255,g:255,b:255}}}).composite(composites).jpeg({quality:90}).toBuffer();
          }
        }
        filename=customFilename?`${customFilename}.jpg`:`joined_${Date.now()}.jpg`; break;
      }
      default:
        return next();
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(processedBuffer);
    setImmediate(() => { processedBuffer = null; if (global.gc) global.gc(); });
  } catch (error) {
    console.error(`[RESIZERS] ${req.params.tool} error:`, error.message);
    res.status(500).json({ error: 'Resize failed: ' + error.message });
  }
});

export default router;
