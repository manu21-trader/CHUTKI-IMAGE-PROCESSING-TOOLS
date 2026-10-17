import dotenv from 'dotenv';

dotenv.config();

// Required environment variables
const requiredEnvVars = [
  'JWT_SECRET'
];

// Optional environment variables with defaults
const optionalEnvVars = {
  PORT: '5001',
  NODE_ENV: 'development',
  JWT_EXPIRES_IN: '7d',
  MAX_FILE_SIZE: '8388608', // 8 MiB; the shared image middleware is authoritative
  FILE_RETENTION_MINUTES: '30',
  UPLOAD_DIR: 'uploads',
  CLIENT_URL: 'http://localhost:3000',
  SESSION_SECRET: 'default-session-secret-change-in-production'
};

// Validate environment configuration
export const validateEnvironment = () => {
  const errors = [];
  const warnings = [];

  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  });

  // Set defaults for optional variables
  Object.entries(optionalEnvVars).forEach(([varName, defaultValue]) => {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      // Silently set default - no warning needed for standard defaults
    }
  });

  // Validate specific configurations
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SESSION_SECRET === optionalEnvVars.SESSION_SECRET) {
      warnings.push('Using default SESSION_SECRET in production - this should be changed');
    }

    if (!process.env.MONGODB_URI) {
      warnings.push('No MONGODB_URI provided - database features will be disabled');
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      warnings.push('Google OAuth not configured - social login will be disabled');
    }
  }

  // Validate numeric values
  const numericVars = ['PORT', 'MAX_FILE_SIZE', 'FILE_RETENTION_MINUTES'];
  numericVars.forEach(varName => {
    if (process.env[varName] && isNaN(parseInt(process.env[varName]))) {
      errors.push(`Invalid numeric value for ${varName}: ${process.env[varName]}`);
    }
  });

  return { errors, warnings };
};

// Get environment info for health checks
export const getEnvironmentInfo = () => {
  return {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    databaseConfigured: !!process.env.MONGODB_URI,
    googleOAuthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    maxFileSize: process.env.MAX_FILE_SIZE,
    fileRetentionMinutes: process.env.FILE_RETENTION_MINUTES
  };
};

export default { validateEnvironment, getEnvironmentInfo };
