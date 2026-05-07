import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  // Output standalone untuk better container support
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
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
  // --- PERBAIKAN CHUNK LOAD ERROR ---
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    optimizePackageImports: [
      '@heroicons/react',
      '@tanstack/react-query',
      'lucide-react',
    ],
  },
  // -------------------------
  async headers() {
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
      'https://dompis.telkomakses-area3.id',
    ].filter(Boolean);

    return [
      // Static files - prevent stale cache issues
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
        ],
      },
      // API headers
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