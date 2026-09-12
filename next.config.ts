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
    // memori, tapi itu memaksa seluruh build (155 API routes + semua
    // halaman) jalan serial di SATU proses Node tanpa worker terpisah —
    // artinya tidak ada proses yang di-recycle OS di tengah build, jadi RSS
    // menumpuk terus sepanjang build (linear naik sampai OOM), bukannya
    // dibatasi. Uji coba: kembalikan ke default Next (worker terpisah per
    // batch kompilasi) supaya memori tiap worker dilepas saat proses itu
    // selesai — kandidat fix untuk RSS yang terus naik tanpa plateau.
  },
  images: {
    localPatterns: [{ pathname: '/assets/**' }],
  },
};

export default withBundleAnalyzer(nextConfig);
