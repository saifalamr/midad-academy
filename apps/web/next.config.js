// Content Security Policy. 'unsafe-eval' is required by our whiteboard stack
// (Fabric.js / Yjs); 'unsafe-inline' is required by Next.js's inline bootstrap
// scripts. connect-src allows https/wss so the prod API and whiteboard socket
// work. Kept as a single line — CSP header values cannot contain newlines.
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' https:;";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
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
