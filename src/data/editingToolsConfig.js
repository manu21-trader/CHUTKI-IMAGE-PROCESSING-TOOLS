// src/data/editingToolsConfig.js
// Sourced from toolsConfig.js - Image Editing Tools list for category hub page
import config from '../config.js';
import { isHiddenTool } from '../../shared/toolAccessPolicy.js';

const allEditingToolsConfig = [
  { name: "Passport Photo Maker", route: "/tools/passport-photo", description: "Generate professional passport photos with custom sizes", endpoint: `${config.API_BASE_URL}/api/tools/passport-photo-advanced` },
  { name: "Reduce Image Size in KB", route: "/tools/reduce-size-kb", description: "Reduce image file size to specific KB target", endpoint: `${config.API_BASE_URL}/api/tools/reduce-size-kb` },
  { name: "Resize Image Pixel", route: "/tools/resize-pixel", description: "Resize image by pixel dimensions", endpoint: `${config.API_BASE_URL}/api/tools/resize-pixel` },
  { name: "Generate Signature", route: "/tools/generate-signature", description: "Create and enhance signature images", endpoint: `${config.API_BASE_URL}/api/tools/generate-signature` },
  { name: "Increase Image Size In KB", route: "/tools/increase-size-kb", description: "Increase image file size to meet minimum requirements", endpoint: `${config.API_BASE_URL}/api/tools/increase-size-kb` },
  { name: "Watermark Images", route: "/tools/watermark", description: "Add text or image watermark to photos", endpoint: `${config.API_BASE_URL}/api/tools/watermark` },
  { name: "Resize Signature", route: "/tools/resize-signature", description: "Resize signature to standard dimensions", endpoint: `${config.API_BASE_URL}/api/tools/resize-signature` },
  { name: "Rotate Image", route: "/tools/rotate", description: "Rotate image by any angle", endpoint: `${config.API_BASE_URL}/api/tools/rotate` },
  { name: "Flip Image", route: "/tools/flip", description: "Flip image horizontally or vertically", endpoint: `${config.API_BASE_URL}/api/tools/flip` },
  { name: "Resize Image to 6cm x 2cm (300 DPI)", route: "/tools/resize-6x2-300dpi", description: "Resize to exact 6cm x 2cm at customizable DPI", endpoint: `${config.API_BASE_URL}/api/tools/resize-6x2-300dpi` },
  { name: "Chutki Bulk Image Resizer", route: "/tools/bulk-resize", description: "Resize multiple images at once", endpoint: `${config.API_BASE_URL}/api/tools/bulk-resize` },
  { name: "Resize Image In Centimeter", route: "/tools/resize-cm", description: "Resize image using centimeter measurements", endpoint: `${config.API_BASE_URL}/api/tools/resize-cm` },
  { name: "Resize Image In MM", route: "/tools/resize-mm", description: "Resize image using millimeter measurements", endpoint: `${config.API_BASE_URL}/api/tools/resize-mm` },
  { name: "Resize Image In Inches", route: "/tools/resize-inches", description: "Resize image using inch measurements", endpoint: `${config.API_BASE_URL}/api/tools/resize-inches` },
  { name: "Add Name & DOB on Photo", route: "/tools/add-name-dob", description: "Add name and date of birth text to photos", endpoint: `${config.API_BASE_URL}/api/tools/add-name-dob` },
  { name: "Convert DPI (200,300,600)", route: "/tools/convert-dpi", description: "Convert image DPI to 200, 300, or 600", endpoint: `${config.API_BASE_URL}/api/tools/convert-dpi` },
  { name: "Check Image DPI", route: "/tools/check-dpi", description: "Check current DPI of image", endpoint: `${config.API_BASE_URL}/api/tools/check-dpi` },
  { name: "Resize Image (3.5cm x 4.5cm)", route: "/tools/resize-3-5x4-5cm", description: "Resize to passport photo size 3.5cm x 4.5cm", endpoint: `${config.API_BASE_URL}/api/tools/resize-3-5x4-5cm` },
  { name: "Resize Sign (50mm x 20mm)", route: "/tools/resize-sign-50x20mm", description: "Resize signature to 50mm x 20mm", endpoint: `${config.API_BASE_URL}/api/tools/resize-sign-50x20mm` },
  { name: "Resize Image for Instagram (No Crop)", route: "/tools/resize-instagram", description: "Resize for Instagram without cropping", endpoint: `${config.API_BASE_URL}/api/tools/resize-instagram` },
  { name: "Resize Image for WhatsApp DP", route: "/tools/resize-whatsapp-dp", description: "Resize for WhatsApp display picture", endpoint: `${config.API_BASE_URL}/api/tools/resize-whatsapp-dp` },
  { name: "Instagram Grid Maker", route: "/tools/instagram-grid", description: "Create Instagram grid layout from single image", endpoint: `${config.API_BASE_URL}/api/tools/instagram-grid` },
  { name: "Join Images In One Image", route: "/tools/join-images", description: "Combine multiple images into one", endpoint: `${config.API_BASE_URL}/api/tools/join-images` },
  { name: "Image Color Picker", route: "/tools/color-picker", description: "Pick colors from image coordinates", endpoint: `${config.API_BASE_URL}/api/tools/color-picker` },
  { name: "Split Image", route: "/tools/split-image", description: "Split image into multiple parts", endpoint: `${config.API_BASE_URL}/api/tools/split-image` },
  { name: "Circle Crop", route: "/tools/circle-crop", description: "Crop image into perfect circle", endpoint: `${config.API_BASE_URL}/api/tools/circle-crop` },
  { name: "Pixelate Image", route: "/tools/pixelate", description: "Apply pixelate effect to image", endpoint: `${config.API_BASE_URL}/api/tools/pixelate` },
  { name: "Censor Photo", route: "/tools/censor", description: "Add censoring effects to photos", endpoint: `${config.API_BASE_URL}/api/tools/censor` },
  { name: "Pixelate Face", route: "/tools/pixelate-face", description: "Automatically pixelate faces in image", endpoint: `${config.API_BASE_URL}/api/tools/pixelate-face` },
  { name: "Blur Face", route: "/tools/blur-face", description: "Automatically blur faces in image", endpoint: `${config.API_BASE_URL}/api/tools/blur-face` },
  { name: "Freehand Crop (Custom Selection)", route: "/tools/freehand-crop", description: "Custom freehand cropping tool", endpoint: `${config.API_BASE_URL}/api/tools/freehand-crop` },
  { name: "Black & White Image", route: "/tools/black-white", description: "Convert image to black and white", endpoint: `${config.API_BASE_URL}/api/tools/black-white` },
  { name: "Grayscale Image", route: "/tools/grayscale", description: "Convert image to grayscale", endpoint: `${config.API_BASE_URL}/api/tools/grayscale` },
  { name: "Remove Image Background", route: "/tools/remove-background", description: "Remove background from image automatically", endpoint: `${config.API_BASE_URL}/api/tools/remove-background` },
  { name: "Resize Image to 4x6", route: "/tools/resize-4x6", description: "Resize image to 4x6 inch format", endpoint: `${config.API_BASE_URL}/api/tools/resize-4x6` },
  { name: "Resize Image to 3x4", route: "/tools/resize-3x4", description: "Resize image to 3x4 inch format", endpoint: `${config.API_BASE_URL}/api/tools/resize-3x4` },
  { name: "Resize Image to 2x2 Inch", route: "/tools/resize-2x2", description: "Resize image to 2x2 inch format", endpoint: `${config.API_BASE_URL}/api/tools/resize-2x2` },
  { name: "Resize Image to 600x600", route: "/tools/resize-600x600", description: "Resize image to 600x600 pixels", endpoint: `${config.API_BASE_URL}/api/tools/resize-600x600` },
  { name: "Resize Image to 35mm x 45mm", route: "/tools/resize-35x45mm", description: "Resize to passport photo size 35mm x 45mm", endpoint: `${config.API_BASE_URL}/api/tools/resize-35x45mm` },
  { name: "Resize Image to A4 Size", route: "/tools/resize-a4", description: "Resize image to A4 paper size", endpoint: `${config.API_BASE_URL}/api/tools/resize-a4` },
  { name: "Resize Image For SSC", route: "/tools/resize-ssc", description: "Resize image for SSC applications", endpoint: `${config.API_BASE_URL}/api/tools/resize-ssc` },
  { name: "Resize Image For PAN Card", route: "/tools/resize-pan", description: "Resize image for PAN card applications", endpoint: `${config.API_BASE_URL}/api/tools/resize-pan` },
  { name: "Resize Image For UPSC", route: "/tools/resize-upsc", description: "Resize image for UPSC applications", endpoint: `${config.API_BASE_URL}/api/tools/resize-upsc` },
  { name: "Picture to Pixel Art", route: "/tools/pixel-art", description: "Convert photo to pixel art style", endpoint: `${config.API_BASE_URL}/api/tools/pixel-art` },
  { name: "Resize Image for YouTube Banner", route: "/tools/resize-youtube-banner", description: "Resize image for YouTube banner (2560x1440)", endpoint: `${config.API_BASE_URL}/api/tools/resize-youtube-banner` },
  { name: "Super Resolution (Increase Image Quality)", route: "/tools/super-resolution", description: "Enhance image quality using AI upscaling", endpoint: `${config.API_BASE_URL}/api/tools/super-resolution` },
  { name: "Ai Face Generator (This Person Not Exist)", route: "/tools/ai-face-generator", description: "Generate AI faces that don't exist", endpoint: `${config.API_BASE_URL}/api/tools/ai-face-generator` },
];

export const editingToolsConfig = allEditingToolsConfig.filter(
  tool => !isHiddenTool(tool.route.split('/').pop())
);
