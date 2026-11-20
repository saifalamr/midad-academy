// cache-bust deploy
// Content Security Policy. Keep the compatibility allowances used by the
// classroom, Next.js bootstrap and the pinned PDF.js worker CDN, but never
// permit scripts from arbitrary HTTPS origins.
// Same-origin framing is needed for the embedded writing activity.
function connectionOrigins(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return '';
    const websocket = url.origin.replace(/^http/, 'ws');
    const http = url.origin.replace(/^ws/, 'http');
    return `${websocket} ${http}`;
  } catch { return ''; }
}
const configuredConnections = [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_WHITEBOARD_WS_URL, process.env.LIVEKIT_URL].map(connectionOrigins).join(' ');
const contentSecurityPolicy =
  `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss: http://localhost:4000 ws://localhost:4000 ${configuredConnections}; worker-src 'self' blob: 'unsafe-eval'; frame-src 'self' https://www.youtube.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self';`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@arabic-platform/ui', '@arabic-platform/shared-types'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
      {
        source: '/reset-password',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, canvas: false };
    return config;
  },
};
module.exports = nextConfig;
