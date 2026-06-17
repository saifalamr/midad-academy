/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@arabic-platform/ui', '@arabic-platform/shared-types'],
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, canvas: false };
    return config;
  },
};
module.exports = nextConfig;
