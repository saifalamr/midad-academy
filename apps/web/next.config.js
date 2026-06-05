/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@arabic-platform/ui', '@arabic-platform/shared-types'],
  webpack: (config) => {
    // livekit-client ships ES modules that reference browser worker APIs.
    // Marking these as external-side-effect-free keeps Next.js from
    // trying to bundle them during SSR.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false };
    return config;
  },
};

module.exports = nextConfig;
