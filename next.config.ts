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
    // keep for 15 compat, 16 prefers top-level serverExternalPackages
    webpackBuildWorker: true,
  },
  images: {
    localPatterns: [{ pathname: '/assets/**' }],
  },
};

export default withBundleAnalyzer(nextConfig);
