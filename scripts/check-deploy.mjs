// Validate values without printing secrets. This does not contact providers.
export function deploymentErrors(env, target, full = false) {
  const errors = [];
  const required = (name) => { if (!env[name]?.trim()) errors.push(`${name} is required`); };
  const url = (name, protocols = ['https:']) => {
    required(name);
    if (!env[name]) return;
    try {
      const value = new URL(env[name]);
      if (!protocols.includes(value.protocol) || value.username || value.password || ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname) || value.hostname.endsWith('.example')) throw new Error();
    } catch { errors.push(`${name} must be a hosted ${protocols.join('/')} URL`); }
  };
  if (target === 'web') {
    url('NEXT_PUBLIC_API_URL'); url('NEXT_PUBLIC_APP_URL');
    if (env.NEXT_PUBLIC_WHITEBOARD_WS_URL) url('NEXT_PUBLIC_WHITEBOARD_WS_URL', ['wss:']);
    for (const name of Object.keys(env)) {
      if (name.startsWith('NEXT_PUBLIC_') && /(SECRET|PASSWORD|PRIVATE_KEY|TOKEN|DATABASE_URL|INVITE_CODE)/.test(name)) errors.push(`${name} must not be exposed to the browser`);
    }
    if (full) required('NEXT_PUBLIC_SUPPORT_EMAIL');
  } else if (target === 'api') {
    if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production for a hosted API');
    required('DATABASE_URL');
    if (env.DATABASE_URL) { try { if (!['postgres:', 'postgresql:'].includes(new URL(env.DATABASE_URL).protocol)) throw new Error(); } catch { errors.push('DATABASE_URL must be a PostgreSQL connection URL'); } }
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /change.me|dev.secret|preview/i.test(env.JWT_SECRET)) errors.push('JWT_SECRET must be a private random secret of at least 32 characters');
    required('TEACHER_INVITE_CODE'); url('FRONTEND_URL'); url('API_URL'); required('CORS_ORIGIN');
    for (const origin of (env.CORS_ORIGIN || '').split(',')) {
      try { const parsed = new URL(origin.trim()); if (parsed.protocol !== 'https:' || parsed.origin !== origin.trim() || parsed.hostname === 'localhost') throw new Error(); }
      catch { errors.push('CORS_ORIGIN must contain exact HTTPS origins without paths or wildcards'); }
    }
    if (env.FRONTEND_URL && !(env.CORS_ORIGIN || '').split(',').map(s => s.trim()).includes(env.FRONTEND_URL.replace(/\/$/, ''))) errors.push('CORS_ORIGIN must include FRONTEND_URL');
    if (full) {
      url('LIVEKIT_URL', ['https:', 'wss:']);
      for (const name of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']) required(name);
    }
  } else errors.push('Choose api or web: npm run check:deploy -- api|web [--full]');
  return [...new Set(errors)];
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = deploymentErrors(process.env, process.argv[2], process.argv.includes('--full'));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Configuration checks passed. Provider connectivity and end-to-end acceptance still need verification.');
}
