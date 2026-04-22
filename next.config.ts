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
  // Naikkan batas body size untuk API routes (App Router) - Next.js 15
  // Juga untuk serverActions
  serverActions: {
    bodySizeLimit: '25mb',
  },
  experimental: {
    optimizePackageImports: [
      '@heroicons/react',
      '@tanstack/react-query',
      'lucide-react',
    ],
  },
  async headers() {
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
      'https://dompis.yourdomain.com', // ganti dengan production domain
    ].filter(Boolean);

    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: allowedOrigins[0] || '*',
          },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
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
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
  compress: true,
};

export default nextConfig;
