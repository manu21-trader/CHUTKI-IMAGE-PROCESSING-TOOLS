export const PASSPORT_COUNTRY_REQUIREMENTS = Object.freeze({
  US: Object.freeze({ width: 2, height: 2, unit: 'in', backgroundColor: '#FFFFFF', headSizeMin: 1, headSizeMax: 1.375 }),
  GB: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#F5F5F5', headSizeMin: 29, headSizeMax: 34 }),
  CA: Object.freeze({ width: 50, height: 70, unit: 'mm', backgroundColor: '#FFFFFF', headSizeMin: 31, headSizeMax: 36 }),
  IN: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#FFFFFF', headSizeMin: 25, headSizeMax: 35 }),
  AU: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#F5F5F5', headSizeMin: 32, headSizeMax: 36 }),
  DE: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#F5F5F5', headSizeMin: 32, headSizeMax: 36 }),
  FR: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#F5F5F5', headSizeMin: 32, headSizeMax: 36 }),
  JP: Object.freeze({ width: 35, height: 45, unit: 'mm', backgroundColor: '#FFFFFF', headSizeMin: 32, headSizeMax: 36 }),
  CN: Object.freeze({ width: 33, height: 48, unit: 'mm', backgroundColor: '#FFFFFF', headSizeMin: 28, headSizeMax: 33 }),
  BR: Object.freeze({ width: 50, height: 70, unit: 'mm', backgroundColor: '#FFFFFF', headSizeMin: 32, headSizeMax: 36 })
});

const LEGACY_COUNTRY_CODES = Object.freeze({
  UK: 'GB',
  CANADA: 'CA',
  INDIA: 'IN',
  AUSTRALIA: 'AU',
  GERMANY: 'DE',
  FRANCE: 'FR',
  JAPAN: 'JP',
  CHINA: 'CN',
  BRAZIL: 'BR'
});

const UNIT_ALIASES = Object.freeze({
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  in: 'in',
  inch: 'in',
  inches: 'in'
});

export class PassportPhotoInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PassportPhotoInputError';
    this.code = 'invalid_passport_dimensions';
    this.status = 422;
  }
}

export const normalizePassportCountryCode = (country) => {
  const value = String(country || '').trim().toUpperCase();
  if (PASSPORT_COUNTRY_REQUIREMENTS[value]) return value;
  return LEGACY_COUNTRY_CODES[value] || null;
};

export const parsePassportSize = (size) => {
  const value = String(size || '').trim();
  const match = value.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|millimeters?|cm|centimeters?|in|inch|inches)?$/i);

  if (!match) {
    throw new PassportPhotoInputError('证件照尺寸格式无效，请使用例如 33x48mm、35x45mm 或 2x2in。');
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const explicitUnit = match[3]?.toLowerCase();
  const unit = explicitUnit
    ? UNIT_ALIASES[explicitUnit]
    : (width > 10 || height > 10 ? 'mm' : 'in');

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !unit) {
    throw new PassportPhotoInputError('证件照宽度和高度必须是带有效单位的正数。');
  }

  return { width, height, unit };
};

export const passportDimensionToPixels = (dimension, dpi, unit) => {
  if (unit === 'mm') return dimension * dpi / 25.4;
  if (unit === 'cm') return dimension * dpi / 2.54;
  if (unit === 'in') return dimension * dpi;
  throw new PassportPhotoInputError('证件照尺寸单位仅支持 mm、cm 或 inches。');
};

export const resolvePassportPhotoSpec = ({
  country = 'US',
  size = '2x2in',
  dpi = 300,
  background = '#FFFFFF'
} = {}) => {
  const parsedDpi = Number(dpi);
  if (!Number.isFinite(parsedDpi) || parsedDpi <= 0) {
    throw new PassportPhotoInputError('证件照 DPI 必须是正数。');
  }

  const countryCode = normalizePassportCountryCode(country);
  const countryRequirement = countryCode ? PASSPORT_COUNTRY_REQUIREMENTS[countryCode] : null;
  const dimensions = countryRequirement || parsePassportSize(size);
  const pixelWidth = Math.round(passportDimensionToPixels(dimensions.width, parsedDpi, dimensions.unit));
  const pixelHeight = Math.round(passportDimensionToPixels(dimensions.height, parsedDpi, dimensions.unit));

  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new PassportPhotoInputError('证件照输出尺寸必须大于 0 像素。');
  }

  return {
    countryCode,
    countryRequirement,
    width: dimensions.width,
    height: dimensions.height,
    unit: dimensions.unit,
    dpi: parsedDpi,
    pixelWidth,
    pixelHeight,
    backgroundColor: countryRequirement?.backgroundColor || background
  };
};
