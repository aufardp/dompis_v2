import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // --- PERBAIKAN REDIRECT LOOP ---
  // Memaksa Next.js untuk mempercayai header dari Nginx (X-Forwarded-Proto)
  // Ini mencegah Next.js melakukan redirect internal yang tidak perlu
  skipMiddlewareUrlNormalize: true,

  // 1. Solusi untuk error "Circular Structure" ESLint di Next.js 15
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 2. Kontrol ketat pada Type Safety
  typescript: {
    ignoreBuildErrors: false,
  },

  // 3. Konfigurasi Image untuk integrasi Google
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

  // 4. Fitur Experimental & Optimasi
  experimental: {
    optimizePackageImports: [
      '@heroicons/react',
      '@tanstack/react-query',
      'lucide-react',
    ],
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },

  // 5. Konfigurasi API Headers & CORS
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
