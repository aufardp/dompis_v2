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
    // cpus:1 + webpackBuildWorker:false sebelumnya dipasang untuk "menghemat"
    // memori, tapi justru itu penyebab `next build` OOM (RSS naik linear
    // sampai puluhan GB tanpa plateau): memaksa seluruh build jalan serial
    // di SATU proses Node tanpa worker terpisah, jadi tidak ada proses yang
    // di-recycle OS di tengah build. Dikembalikan ke default Next (worker
    // terpisah per batch kompilasi) — terverifikasi di VPS: peak RSS turun
    // dari 14-20GB (killed) jadi ~800MB (build selesai).
  },
  images: {
    localPatterns: [{ pathname: '/assets/**' }],
  },
  // File upload user (bukti tiket, dsb.) tidak perlu ikut disalin ke bundel
  // `.next/standalone/` — app baca langsung dari public/uploads asli saat
  // runtime. Tanpa exclude ini, tracing standalone menduplikasi seluruh isi
  // public/uploads/** (49GB di produksi) di SETIAP build, sampai bikin disk
  // penuh (ENOSPC) mid-build.
  outputFileTracingExcludes: {
    '*': ['public/uploads/**'],
  },
};

export default withBundleAnalyzer(nextConfig);
