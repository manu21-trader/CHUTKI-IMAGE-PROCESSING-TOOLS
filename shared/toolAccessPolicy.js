export const TOOL_ACCESS = Object.freeze({
  PUBLIC_LOW_COST: 'PUBLIC_LOW_COST',
  METERED_HIGH_COST: 'METERED_HIGH_COST',
  HIDDEN_UNSTABLE: 'HIDDEN_UNSTABLE'
});

export const PUBLIC_LOW_COST = Object.freeze([
  'image-compressor',
  'webp-to-jpg', 'jpeg-to-png', 'png-to-jpeg',
  'resize-pixel', 'resize-cm', 'resize-mm', 'resize-inches',
  'resize-6x2-300dpi', 'resize-3-5x4-5cm', 'resize-35x45mm',
  'resize-2x2', 'resize-4x6', 'resize-3x4', 'resize-600x600',
  'resize-a4', 'resize-ssc', 'resize-pan', 'resize-upsc',
  'resize-whatsapp-dp', 'resize-instagram', 'resize-youtube-banner',
  'resize-signature', 'resize-sign-50x20mm',
  'rotate', 'flip', 'watermark', 'black-white', 'grayscale',
  'circle-crop', 'pixelate', 'censor', 'freehand-crop', 'color-picker',
  'add-name-dob', 'convert-dpi', 'check-dpi', 'pixel-art',
  'generate-signature'
]);

export const METERED_HIGH_COST = Object.freeze([
  'reduce-size-kb', 'reduce-size-mb', 'increase-size-kb',
  'compress-5kb', 'compress-10kb', 'compress-15kb', 'compress-20kb',
  'compress-20-50kb', 'compress-25kb', 'compress-30kb', 'compress-40kb',
  'compress-50kb', 'compress-100kb', 'compress-150kb', 'compress-200kb',
  'compress-300kb', 'compress-500kb', 'compress-1mb', 'compress-2mb',
  'jpg-to-kb', 'mb-to-kb', 'kb-to-mb',
  'jpg-to-text', 'png-to-text',
  'jpg-to-pdf-50kb', 'jpg-to-pdf-100kb', 'jpeg-to-pdf-200kb',
  'jpg-to-pdf-300kb', 'jpg-to-pdf-500kb', 'image-to-pdf',
  'bulk-resize', 'instagram-grid', 'join-images', 'super-resolution',
  'split-image', 'remove-background', 'passport-photo-advanced'
]);

export const HIDDEN_UNSTABLE = Object.freeze([
  'pdf-to-jpg',
  'heic-to-jpg',
  'ai-face-generator',
  'pixelate-face',
  'blur-face'
]);

// Compatibility endpoints use their canonical tool's access policy and never
// create a fourth, unclassified path around authentication or quota checks.
export const TOOL_ALIASES = Object.freeze({
  'compress-image': 'image-compressor',
  'rotate-tool': 'rotate',
  'flip-tool': 'flip',
  'add-text': 'watermark',
  'resize-35x45cm': 'resize-35x45mm',
  'resize-signature-50x20mm': 'resize-sign-50x20mm',
  'passport-photo': 'passport-photo-advanced',
  'ocr': 'jpg-to-text'
});

export const ALL_IMAGE_TOOLS = Object.freeze([
  ...PUBLIC_LOW_COST,
  ...METERED_HIGH_COST,
  ...HIDDEN_UNSTABLE
]);

const policyByTool = new Map([
  ...PUBLIC_LOW_COST.map(tool => [tool, TOOL_ACCESS.PUBLIC_LOW_COST]),
  ...METERED_HIGH_COST.map(tool => [tool, TOOL_ACCESS.METERED_HIGH_COST]),
  ...HIDDEN_UNSTABLE.map(tool => [tool, TOOL_ACCESS.HIDDEN_UNSTABLE])
]);

if (PUBLIC_LOW_COST.length !== 39 || METERED_HIGH_COST.length !== 37 ||
    HIDDEN_UNSTABLE.length !== 5 || ALL_IMAGE_TOOLS.length !== 81 ||
    new Set(ALL_IMAGE_TOOLS).size !== 81) {
  throw new Error('Invalid image tool policy: expected 39 public + 37 metered + 5 hidden = 81 unique tools');
}

export const getCanonicalToolSlug = tool => TOOL_ALIASES[tool] || tool;

export const getToolAccess = tool => policyByTool.get(getCanonicalToolSlug(tool)) || null;

export const isHiddenTool = tool => getToolAccess(tool) === TOOL_ACCESS.HIDDEN_UNSTABLE;
