import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  // Turbopack — stable default di Next 16, filesystem cache terpisah dev/build
  turbopack: {
    // leaflet/window shim bila Turbopack complain fs
    resolveAlias: {
      fs: { browser: './empty.ts' },
    },
  },
  serverExternalPackages: ['sharp', '@prisma/client', 'bullmq', 'ioredis', 'firebase-admin', 'mysql2'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', '@heroui/react', 'recharts', 'leaflet', 'react-leaflet', 'supercluster'],
    cpus: 1,
    webpackBuildWorker: false,
  },
  images: {
    localPatterns: [{ pathname: '/assets/**' }],
  },
};

export default withBundleAnalyzer(nextConfig);
