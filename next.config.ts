import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  typescript: {
    // skip typescript saat build
    ignoreBuildErrors: false,
  },
  eslint: {
    // skip eslint saat build
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      '@heroicons/react',
      '@tanstack/react-query',
      'lucide-react',
    ],
    serverActions: {
      // Naikkan batas untuk upload foto evidence teknisi
      // 5 foto × compressed ~1MB + FormData overhead = ~6-8MB
      // 15mb memberikan safety margin yang cukup
      bodySizeLimit: '15mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,DELETE,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'Content-Type, Authorization, x-cron-secret, x-signature, x-timestamp, x-source',
          },
          {
            key: 'Access-Control-Expose-Headers',
            value: 'Content-Length, Retry-After',
          },
        ],
      },
    ];
  },
  compress: true,
};

export default nextConfig;
