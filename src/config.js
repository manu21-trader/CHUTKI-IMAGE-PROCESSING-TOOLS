// Configuration for CHUTKI Image Tools
const config = {
  // Empty means same-origin. This is the portable production default when the
  // backend serves the built frontend; split deployments can set an absolute URL.
  API_BASE_URL: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),

  FRONTEND_URL: import.meta.env.VITE_FRONTEND_URL ||
    (typeof window !== 'undefined' ? window.location.origin : ''),

  // API endpoints
  ENDPOINTS: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    GOOGLE_AUTH: '/api/auth/google',
    UPLOAD: '/api/upload',
    CONVERT: '/api/convert',
    COMPRESS: '/api/compress',
    HEALTH: '/api/health',
    // Modular tools endpoints
    TOOLS_HEALTH: '/api/tools/health',
    TOOLS_LIST: '/api/tools/list',
    TOOLS_BASE: '/api/tools'
  }
};

export default config;
