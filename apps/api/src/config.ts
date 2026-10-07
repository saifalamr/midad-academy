import 'dotenv/config';

export const config = {
  PORT: Number(process.env.PORT) || 4000,
  HOST: process.env.HOST || '0.0.0.0',
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map((s) => s.trim()),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  DATABASE_URL: process.env.DATABASE_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  WHITEBOARD_WS_PORT: Number(process.env.WHITEBOARD_WS_PORT) || 1234,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  MAIL_FROM: process.env.MAIL_FROM || '',
  TEACHER_INVITE_CODE: process.env.TEACHER_INVITE_CODE || '',
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.WEB_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:4000',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
} as const;

export function validateConfig() {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET.length < 32 || config.JWT_SECRET === 'dev-secret-change-in-production') {
      throw new Error('Set a strong JWT_SECRET (at least 32 characters)');
    }
    if (!config.CORS_ORIGIN.every((origin) => origin.startsWith('https://'))) {
      throw new Error('Production CORS_ORIGIN must list HTTPS origins');
    }
  }
}
