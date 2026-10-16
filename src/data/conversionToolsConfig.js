// src/data/conversionToolsConfig.js
// Sourced from toolsConfig.js - Image Conversion Tools list for category hub page
import config from '../config.js';
import { isHiddenTool } from '../../shared/toolAccessPolicy.js';

const allConversionToolsConfig = [
  { name: "HEIC to JPG", route: "/tools/heic-to-jpg", description: "Convert HEIC images to JPG format", endpoint: `${config.API_BASE_URL}/api/tools/heic-to-jpg` },
  { name: "WEBP to JPG", route: "/tools/webp-to-jpg", description: "Convert WEBP images to JPG format", endpoint: `${config.API_BASE_URL}/api/tools/webp-to-jpg` },
  { name: "JPEG to PNG", route: "/tools/jpeg-to-png", description: "Convert JPEG images to PNG format", endpoint: `${config.API_BASE_URL}/api/tools/jpeg-to-png` },
  { name: "PNG to JPEG", route: "/tools/png-to-jpeg", description: "Convert PNG images to JPEG format", endpoint: `${config.API_BASE_URL}/api/tools/png-to-jpeg` },
  { name: "JPG to Text", route: "/tools/jpg-to-text", description: "Extract text from JPG images using OCR", endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-text` },
  { name: "PNG to Text", route: "/tools/png-to-text", description: "Extract text from PNG images using OCR", endpoint: `${config.API_BASE_URL}/api/tools/png-to-text` },
  { name: "JPG to PDF Under 50KB", route: "/tools/jpg-to-pdf-50kb", description: "Convert JPG to PDF under 50KB", endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-50kb` },
  { name: "JPG to PDF Under 100KB", route: "/tools/jpg-to-pdf-100kb", description: "Convert JPG to PDF under 100KB", endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-100kb` },
  { name: "JPEG to PDF Under 200KB", route: "/tools/jpeg-to-pdf-200kb", description: "Convert JPEG to PDF under 200KB", endpoint: `${config.API_BASE_URL}/api/tools/jpeg-to-pdf-200kb` },
  { name: "JPG to PDF Under 300KB", route: "/tools/jpg-to-pdf-300kb", description: "Convert JPG to PDF under 300KB", endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-300kb` },
  { name: "JPG to PDF Under 500KB", route: "/tools/jpg-to-pdf-500kb", description: "Convert JPG to PDF under 500KB", endpoint: `${config.API_BASE_URL}/api/tools/jpg-to-pdf-500kb` },
  { name: "Image To PDF", route: "/tools/image-to-pdf", description: "Convert any image format to PDF", endpoint: `${config.API_BASE_URL}/api/tools/image-to-pdf` },
  { name: "PDF To JPG", route: "/tools/pdf-to-jpg", description: "Convert PDF pages to JPG images", endpoint: `${config.API_BASE_URL}/api/tools/pdf-to-jpg` },
];

export const conversionToolsConfig = allConversionToolsConfig.filter(
  tool => !isHiddenTool(tool.route.split('/').pop())
);
