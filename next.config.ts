import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  // Type-check dilepas dari fase `next build` (dobel kerja + tambah beban
  // memori) — dijalankan terpisah lewat `npm run typecheck` sebagai gerbang
  // CI/pre-deploy sendiri. (Next 16 sudah tak menjalankan ESLint bawaan saat
  // build — `eslint.ignoreDuringBuilds` bukan lagi opsi yang valid di sini.)
  typescript: { ignoreBuildErrors: true },
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
