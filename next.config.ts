import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  output: 'standalone',
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', '@heroui/react', 'recharts', 'leaflet', 'react-leaflet', 'supercluster'],
    serverComponentsExternalPackages: ['sharp', '@prisma/client', 'bullmq', 'ioredis', 'firebase-admin', 'mysql2'],
    webpackBuildWorker: true,
  },
  images: {
    localPatterns: [{ pathname: '/assets/**', search: '?v=*' }],
  },
};

export default withBundleAnalyzer(nextConfig);
