// cache-bust deploy
// Content Security Policy. 'unsafe-eval' is required by our whiteboard stack
// (Fabric.js / Yjs); 'unsafe-inline' is required by Next.js's inline bootstrap
// scripts. connect-src allows https/wss so the prod API and whiteboard socket
// work. Kept as a single line — CSP header values cannot contain newlines.
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
  `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss: http://localhost:4000 ws://localhost:4000 ${configuredConnections}; worker-src 'self' blob: 'unsafe-eval'; frame-src 'self' https:;`;

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
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, canvas: false };
    return config;
  },
};
module.exports = nextConfig;
