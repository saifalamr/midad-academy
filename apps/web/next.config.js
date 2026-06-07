/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@arabic-platform/ui', '@arabic-platform/shared-types'],
  webpack: (config) => {
    // livekit-client ships ES modules that reference browser worker APIs, and
    // fabric.js optionally depends on node-canvas for server-side rendering —
    // none of these exist (or are needed) in the browser bundle.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
