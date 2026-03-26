import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // JWT (Admin Portal)
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiry: process.env.JWT_EXPIRY || '8h',
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5174',

  // Ed25519 keys (offline licence signing)
  ed25519: {
    privateKeyPath: process.env.ED25519_PRIVATE_KEY_PATH || './keys/private.pem',
    publicKeyPath: process.env.ED25519_PUBLIC_KEY_PATH || './keys/public.pem',
  },

  // HMAC (check-in payload validation)
  hmacSecret: process.env.HMAC_SECRET || 'dev-hmac-secret-change-me',

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'debug',
} as const;
