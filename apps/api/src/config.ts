import 'dotenv/config';

export const config = {
  PORT: Number(process.env.PORT) || 4000,
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map((s) => s.trim()),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  DATABASE_URL: process.env.DATABASE_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  WHITEBOARD_WS_PORT: Number(process.env.WHITEBOARD_WS_PORT) || 1234,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  WEB_URL: process.env.WEB_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:4000',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
} as const;
