// src/toolsConfig.js
import config from './config.js';

export const toolsConfig = {
  "Image Editing Tools": [
    {
      name: "Passport Photo Maker",
      route: "/tools/passport-photo",
      description: "Generate professional passport photos with custom sizes",
      endpoint: `${config.API_BASE_URL}/api/tools/passport-photo-advanced`,
      method: "POST",
      fields: ["file", "size", "dpi", "background", "format", "quantity"]
    },
    {
      name: "Reduce Image Size in KB",
      route: "/tools/reduce-size-kb",
      description: "Reduce image file size to specific KB target",
      endpoint: `${config.API_BASE_URL}/api/tools/reduce-size-kb`,
      method: "POST",
      fields: ["file", "targetKB"]
    },
    {
      name: "Resize Image Pixel",
      route: "/tools/resize-pixel",
      description: "Resize image by pixel dimensions",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-pixel`,
      method: "POST",
      fields: ["file", "width", "height", "maintainAspectRatio", "quality", "format", "resizeMethod", "upscaling", "smartCrop"]
    },
    {
      name: "Generate Signature",
      route: "/tools/generate-signature",
      description: "Create and enhance signature images",
      endpoint: `${config.API_BASE_URL}/api/tools/generate-signature`,
      method: "POST",
      fields: ["file", "style", "enhance", "background", "format"]
    },
    {
      name: "Increase Image Size In KB",
      route: "/tools/increase-size-kb",
      description: "Increase image file size to meet minimum requirements",
      endpoint: `${config.API_BASE_URL}/api/tools/increase-size-kb`,
      method: "POST",
      fields: ["file", "targetSize"],
      defaults: { targetSize: "500" }
    },
    {
      name: "Watermark Images",
      route: "/tools/watermark",
      description: "Add text or image watermark to photos",
      endpoint: `${config.API_BASE_URL}/api/tools/watermark`,
      method: "POST",
      fields: ["file", "text", "position", "opacity", "color"]
    },
    {
      name: "Resize Signature",
      route: "/tools/resize-signature",
      description: "Resize signature to standard dimensions",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-signature`,
      method: "POST",
      fields: ["file", "width", "height"]
    },
    {
      name: "Rotate Image",
      route: "/tools/rotate",
      description: "Rotate image by any angle",
      endpoint: `${config.API_BASE_URL}/api/tools/rotate`,
      method: "POST",
      fields: ["file", "angle", "background"]
    },
    {
      name: "Flip Image",
      route: "/tools/flip",
      description: "Flip image horizontally or vertically",
      endpoint: `${config.API_BASE_URL}/api/tools/flip`,
      method: "POST",
      fields: ["file", "direction"]
    },
    {
      name: "Resize Image to 6cm x 2cm (300 DPI)",
      route: "/tools/resize-6x2-300dpi",
      description: "Resize to exact 6cm x 2cm at customizable DPI",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-6x2-300dpi`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Chutki Bulk Image Resizer",
      route: "/tools/bulk-resize",
      description: "Resize multiple images at once",
      endpoint: `${config.API_BASE_URL}/api/tools/bulk-resize`,
      method: "POST",
      fields: ["files", "width", "height", "unit", "dpi"]
    },
    {
      name: "Resize Image In Centimeter",
      route: "/tools/resize-cm",
      description: "Resize image using centimeter measurements",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-cm`,
      method: "POST",
      fields: ["file", "width", "height", "dpi"]
    },
    {
      name: "Resize Image In MM",
      route: "/tools/resize-mm",
      description: "Resize image using millimeter measurements",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-mm`,
      method: "POST",
      fields: ["file", "width", "height", "dpi"]
    },
    {
      name: "Resize Image In Inches",
      route: "/tools/resize-inches",
      description: "Resize image using inch measurements",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-inches`,
      method: "POST",
      fields: ["file", "width", "height", "dpi"]
    },
    {
      name: "Add Name & DOB on Photo",
      route: "/tools/add-name-dob",
      description: "Add name and date of birth text to photos",
      endpoint: `${config.API_BASE_URL}/api/tools/add-name-dob`,
      method: "POST",
      fields: ["file", "name", "dob", "position", "fontSize"]
    },
    {
      name: "Convert DPI (200,300,600)",
      route: "/tools/convert-dpi",
      description: "Convert image DPI to 200, 300, or 600",
      endpoint: `${config.API_BASE_URL}/api/tools/convert-dpi`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Check Image DPI",
      route: "/tools/check-dpi",
      description: "Check current DPI of image",
      endpoint: `${config.API_BASE_URL}/api/tools/check-dpi`,
      method: "POST",
      fields: ["file"],
      returnsJson: true
    },
    {
      name: "Resize Image (3.5cm x 4.5cm)",
      route: "/tools/resize-3-5x4-5cm",
      description: "Resize to passport photo size 3.5cm x 4.5cm",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-3-5x4-5cm`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Sign (50mm x 20mm)",
      route: "/tools/resize-sign-50x20mm",
      description: "Resize signature to 50mm x 20mm",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-sign-50x20mm`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image for Instagram (No Crop)",
      route: "/tools/resize-instagram",
      description: "Resize for Instagram without cropping",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-instagram`,
      method: "POST",
      fields: ["file", "format"]
    },
    {
      name: "Resize Image for WhatsApp DP",
      route: "/tools/resize-whatsapp-dp",
      description: "Resize for WhatsApp display picture",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-whatsapp-dp`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Instagram Grid Maker",
      route: "/tools/instagram-grid",
      description: "Create Instagram grid layout from single image",
      endpoint: `${config.API_BASE_URL}/api/tools/instagram-grid`,
      method: "POST",
      fields: ["file", "rows", "cols"]
    },
    {
      name: "Join Images In One Image",
      route: "/tools/join-images",
      description: "Combine multiple images into one",
      endpoint: `${config.API_BASE_URL}/api/tools/join-images`,
      method: "POST",
      fields: ["files", "direction", "spacing"]
    },
    {
      name: "Image Color Picker",
      route: "/tools/color-picker",
      description: "Pick colors from image coordinates",
      endpoint: `${config.API_BASE_URL}/api/tools/color-picker`,
      method: "POST",
      fields: ["file", "x", "y"],
      returnsJson: true
    },
    {
      name: "Split Image",
      route: "/tools/split-image",
      description: "Split image into multiple parts",
      endpoint: `${config.API_BASE_URL}/api/tools/split-image`,
      method: "POST",
      fields: ["file", "rows", "cols"]
    },
    {
      name: "Circle Crop",
      route: "/tools/circle-crop",
      description: "Crop image into perfect circle",
      endpoint: `${config.API_BASE_URL}/api/tools/circle-crop`,
      method: "POST",
      fields: ["file", "border"]
    },
    {
      name: "Pixelate Image",
      route: "/tools/pixelate",
      description: "Apply pixelate effect to image",
      endpoint: `${config.API_BASE_URL}/api/tools/pixelate`,
      method: "POST",
      fields: ["file", "intensity"]
    },
    {
      name: "Censor Photo",
      route: "/tools/censor",
      description: "Add censoring effects to photos",
      endpoint: `${config.API_BASE_URL}/api/tools/censor`,
      method: "POST",
      fields: ["file", "x", "y", "width", "height"]
    },
    {
      name: "Pixelate Face",
      route: "/tools/pixelate-face",
      description: "Automatically pixelate faces in image",
      endpoint: `${config.API_BASE_URL}/api/tools/pixelate-face`,
      method: "POST",
      fields: ["file", "intensity"]
    },
    {
      name: "Blur Face",
      route: "/tools/blur-face",
      description: "Automatically blur faces in image",
      endpoint: `${config.API_BASE_URL}/api/tools/blur-face`,
      method: "POST",
      fields: ["file", "intensity"]
    },
    {
      name: "Freehand Crop (Custom Selection)",
      route: "/tools/freehand-crop",
      description: "Custom freehand cropping tool",
      endpoint: `${config.API_BASE_URL}/api/tools/freehand-crop`,
      method: "POST",
      fields: ["file", "x", "y", "width", "height"]
    },
    {
      name: "Black & White Image",
      route: "/tools/black-white",
      description: "Convert image to black and white",
      endpoint: `${config.API_BASE_URL}/api/tools/black-white`,
      method: "POST",
      fields: ["file", "quality", "contrast"]
    },
    {
      name: "Grayscale Image",
      route: "/tools/grayscale",
      description: "Convert image to grayscale",
      endpoint: `${config.API_BASE_URL}/api/tools/grayscale`,
      method: "POST",
      fields: ["file", "quality", "intensity"]
    },
    {
      name: "Remove Image Background",
      route: "/tools/remove-background",
      description: "Remove background from image automatically",
      endpoint: `${config.API_BASE_URL}/api/tools/remove-background`,
      method: "POST",
      fields: ["file", "quality"]
    },
    {
      name: "Resize Image to 4x6",
      route: "/tools/resize-4x6",
      description: "Resize image to 4x6 inch format",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-4x6`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image to 3x4",
      route: "/tools/resize-3x4",
      description: "Resize image to 3x4 inch format",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-3x4`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image to 2x2 Inch",
      route: "/tools/resize-2x2",
      description: "Resize image to 2x2 inch format",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-2x2`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image to 600x600",
      route: "/tools/resize-600x600",
      description: "Resize image to 600x600 pixels",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-600x600`,
      method: "POST",
      fields: ["file", "quality", "maintain"]
    },
    {
      name: "Resize Image to 35mm x 45mm",
      route: "/tools/resize-35x45mm",
      description: "Resize to passport photo size 35mm x 45mm",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-35x45mm`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image to A4 Size",
      route: "/tools/resize-a4",
      description: "Resize image to A4 paper size",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-a4`,
      method: "POST",
      fields: ["file", "dpi"]
    },
    {
      name: "Resize Image For SSC",
      route: "/tools/resize-ssc",
      description: "Resize image for SSC applications",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-ssc`,
      method: "POST",
      fields: ["file", "dpi", "quality"]
    },
    {
      name: "Resize Image For PAN Card",
      route: "/tools/resize-pan",
      description: "Resize image for PAN card applications",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-pan`,
      method: "POST",
      fields: ["file", "dpi", "quality"]
    },
    {
      name: "Resize Image For UPSC",
      route: "/tools/resize-upsc",
      description: "Resize image for UPSC applications",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-upsc`,
      method: "POST",
      fields: ["file", "dpi", "quality"]
    },
    {
      name: "Picture to Pixel Art",
      route: "/tools/pixel-art",
      description: "Convert photo to pixel art style",
      endpoint: `${config.API_BASE_URL}/api/tools/pixel-art`,
      method: "POST",
      fields: ["file", "pixelSize"]
    },
    {
      name: "Resize Image for YouTube Banner",
      route: "/tools/resize-youtube-banner",
      description: "Resize image for YouTube banner (2560x1440)",
      endpoint: `${config.API_BASE_URL}/api/tools/resize-youtube-banner`,
      method: "POST",
      fields: ["file", "quality", "maintain"]
    },
    {
      name: "Super Resolution (Increase Image Quality)",
      route: "/tools/super-resolution",
      description: "Enhance image quality using AI upscaling",
      endpoint: `${config.API_BASE_URL}/api/tools/super-resolution`,
      method: "POST",
      fields: ["file", "scale"]
    },
    {
      name: "Ai Face Generator (This Person Not Exist)",
      route: "/tools/ai-face-generator",
      description: "Generate AI faces that don't exist",
      endpoint: `${config.API_BASE_URL}/api/tools/ai-face-generator`,
      method: "POST",
      fields: ["gender", "age", "style"]
    }
  ],
  "Image Conversion Tools": [
    {
      name: "HEIC to JPG",
      route: "/tools/heic-to-jpg",
      description: "Convert HEIC images to JPG format",
      endpoint: `${config.API_BASE_URL}/api/tools/heic-to-jpg`,
      method: "POST",
      fields: ["file", "quality"]
    },
    {
      name: "WEBP to JPG",
      route: "/tools/webp-to-jpg",
      description: "Convert WEBP images to JPG format",
      endpoint: `${config.API_BASE_URL}/api/tools/webp-to-jpg`,
      method: "POST",
      fields: ["file", "quality"]
    },
    {
      name: "JPEG to PNG",
      route: "/tools/jpeg-to-png",
      description: "Convert JPEG images to PNG format",
      endpoint: `${config.API_BASE_URL}/api/tools/jpeg-to-png`,
      method: "POST",
      fields: ["file", "quality"]
    },
    {
      name: "PNG to JPEG",
      route: "/tools/png-to-jpeg",
      description: "Convert PNG images to JPEG format",
      endpoint: `${config.API_BASE_URL}/api/tools/png-to-jpeg`,
      method: "POST",
      fields: ["file", "quality", "background"]
    },
    {
      name: "JPG to Text",
      route: "/tools/jpg-to-text",
      description: "Extract text from JPG images using OCR",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-text`,
      method: "POST",
      fields: ["file", "language"],
      returnsJson: true
    },
    {
      name: "PNG to Text",
      route: "/tools/png-to-text",
      description: "Extract text from PNG images using OCR",
      endpoint: `${config.API_BASE_URL}/api/tools/png-to-text`,
      method: "POST",
      fields: ["file", "language"],
      returnsJson: true
    },
    {
      name: "JPG to PDF Under 50KB",
      route: "/tools/jpg-to-pdf-50kb",
      description: "Convert JPG to PDF under 50KB",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-50kb`,
      method: "POST",
      fields: ["file", "quality", "pageSize"]
    },
    {
      name: "JPG to PDF Under 100KB",
      route: "/tools/jpg-to-pdf-100kb",
      description: "Convert JPG to PDF under 100KB",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-100kb`,
      method: "POST",
      fields: ["file", "quality", "pageSize"]
    },
    {
      name: "JPEG to PDF Under 200KB",
      route: "/tools/jpeg-to-pdf-200kb",
      description: "Convert JPEG to PDF under 200KB",
      endpoint: `${config.API_BASE_URL}/api/tools/jpeg-to-pdf-200kb`,
      method: "POST",
      fields: ["file", "quality", "pageSize"]
    },
    {
      name: "JPG to PDF Under 300KB",
      route: "/tools/jpg-to-pdf-300kb",
      description: "Convert JPG to PDF under 300KB",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-300kb`,
      method: "POST",
      fields: ["file", "quality", "pageSize"]
    },
    {
      name: "JPG to PDF Under 500KB",
      route: "/tools/jpg-to-pdf-500kb",
      description: "Convert JPG to PDF under 500KB",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-500kb`,
      method: "POST",
      fields: ["file", "quality", "pageSize"]
    },
    {
      name: "Image To PDF",
      route: "/tools/image-to-pdf",
      description: "Convert any image format to PDF",
      endpoint: `${config.API_BASE_URL}/api/tools/image-to-pdf`,
      method: "POST",
      fields: ["files", "pageSize", "maxSize"]
    },
    {
      name: "PDF To JPG",
      route: "/tools/pdf-to-jpg",
      description: "Convert PDF pages to JPG images",
      endpoint: `${config.API_BASE_URL}/api/tools/pdf-to-jpg`,
      method: "POST",
      fields: ["file", "dpi", "quality"],
      accept: "application/pdf"
    }
  ],
  "Image Compression Tools": [
    {
      name: "Image Compressor",
      route: "/tools/image-compressor",
      description: "General purpose image compressor with quality control",
      endpoint: `${config.API_BASE_URL}/api/tools/image-compressor`,
      method: "POST",
      fields: ["file", "quality", "format"]
    },
    {
      name: "Reduce Image Size in MB",
      route: "/tools/reduce-size-mb",
      description: "Reduce image size to target MB",
      endpoint: `${config.API_BASE_URL}/api/tools/reduce-size-mb`,
      method: "POST",
      fields: ["file", "targetMB"]
    },
    {
      name: "Compress Image To 5kb",
      route: "/tools/compress-5kb",
      description: "Compress image to exactly 5KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-5kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 10kb",
      route: "/tools/compress-10kb",
      description: "Compress JPEG to exactly 10KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-10kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image To 15kb",
      route: "/tools/compress-15kb",
      description: "Compress image to exactly 15KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-15kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image To 20kb",
      route: "/tools/compress-20kb",
      description: "Compress image to exactly 20KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-20kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image Between 20kb to 50kb",
      route: "/tools/compress-20-50kb",
      description: "Compress image between 20KB to 50KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-20-50kb`,
      method: "POST",
      fields: ["file", "targetKB"]
    },
    {
      name: "Compress Image To 25kb",
      route: "/tools/compress-25kb",
      description: "Compress image to exactly 25KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-25kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 30kb",
      route: "/tools/compress-30kb",
      description: "Compress JPEG to exactly 30KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-30kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 40kb",
      route: "/tools/compress-40kb",
      description: "Compress JPEG to exactly 40KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-40kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image to 50kb",
      route: "/tools/compress-50kb",
      description: "Compress image to exactly 50KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-50kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image to 100kb",
      route: "/tools/compress-100kb",
      description: "Compress image to exactly 100KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-100kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 150kb",
      route: "/tools/compress-150kb",
      description: "Compress JPEG to exactly 150KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-150kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image To 200kb",
      route: "/tools/compress-200kb",
      description: "Compress image to exactly 200KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-200kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 300kb",
      route: "/tools/compress-300kb",
      description: "Compress JPEG to exactly 300KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-300kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress JPEG To 500kb",
      route: "/tools/compress-500kb",
      description: "Compress JPEG to exactly 500KB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-500kb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image To 1 MB",
      route: "/tools/compress-1mb",
      description: "Compress image to exactly 1MB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-1mb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "Compress Image To 2 MB",
      route: "/tools/compress-2mb",
      description: "Compress image to exactly 2MB",
      endpoint: `${config.API_BASE_URL}/api/tools/compress-2mb`,
      method: "POST",
      fields: ["file"]
    },
    {
      name: "JPG To KB Convert",
      route: "/tools/jpg-to-kb",
      description: "Convert JPG to specific KB size",
      endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-kb`,
      method: "POST",
      fields: ["file", "targetKB"]
    },
    {
      name: "Convert Image MB To KB",
      route: "/tools/mb-to-kb",
      description: "Convert image from MB to KB size",
      endpoint: `${config.API_BASE_URL}/api/tools/mb-to-kb`,
      method: "POST",
      fields: ["file", "targetKB"]
    },
    {
      name: "Convert Image KB To MB",
      route: "/tools/kb-to-mb",
      description: "Convert image from KB to MB size",
      endpoint: `${config.API_BASE_URL}/api/tools/kb-to-mb`,
      method: "POST",
      fields: ["file", "targetMB"]
    }

  ]
};

// Helper function to get tool by name
export const getToolByName = (name) => {
  for (const category of Object.values(toolsConfig)) {
    const tool = category.find(t => t.name === name);
    if (tool) return tool;
  }
  return null;
};

// Helper function to get all tools
export const getAllTools = () => {
  const allTools = [];
  for (const category of Object.values(toolsConfig)) {
    allTools.push(...category);
  }
  return allTools;
};

// Helper function to search tools
export const searchTools = (query) => {
  const allTools = getAllTools();
  const lowercaseQuery = query.toLowerCase();
  return allTools.filter(tool =>
    tool.name.toLowerCase().includes(lowercaseQuery) ||
    tool.description.toLowerCase().includes(lowercaseQuery)
  );
};

// Helper function to get tool count
export const getToolCount = () => {
  return getAllTools().length;
};

// Helper function to get tool by route
export const getToolByRoute = (route) => {
  for (const category of Object.values(toolsConfig)) {
    const tool = category.find(t => t.route === route);
    if (tool) return tool;
  }
  return null;
};

// Helper function to get tools by category
export const getToolsByCategory = (category) => {
  return toolsConfig[category] || [];
};
