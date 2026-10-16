export const IMAGE_LIMITS = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxFiles: 4,
  maxTotalUploadBytes: 20 * 1024 * 1024,
  maxInputPixelsPerFile: 20_000_000,
  maxInputPixelsPerRequest: 30_000_000,
  maxOutputWidth: 6_000,
  maxOutputHeight: 6_000,
  maxOutputPixels: 24_000_000,
  maxGridRows: 3,
  maxGridCols: 3,
  maxResizeScale: 4,
  maxSuperResolutionScale: 2,
  maxPassportDpi: 600,
  maxPassportQuantity: 9,
  maxTargetBytes: 5 * 1024 * 1024,
  maxConcurrentRequests: 2,
  maxConcurrentRequestsPerIp: 1
});

export const assertOutputDimensions = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new RangeError('Output dimensions must be positive numbers');
  }
  if (width > IMAGE_LIMITS.maxOutputWidth || height > IMAGE_LIMITS.maxOutputHeight ||
      width * height > IMAGE_LIMITS.maxOutputPixels) {
    throw new RangeError(
      `Output is limited to ${IMAGE_LIMITS.maxOutputWidth}x${IMAGE_LIMITS.maxOutputHeight} and ${IMAGE_LIMITS.maxOutputPixels} pixels`
    );
  }
};
