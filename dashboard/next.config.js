/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow Next.js built-in optimal caching for static chunks and assets
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

module.exports = nextConfig;
