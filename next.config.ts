import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },

  outputFileTracingExcludes: {
    '**/*': [
      'scripts/**/*',
      'worker-runtime/**/*',
      'docs/**/*',
      '.agents/**/*',
      'ecosystem.config.js',
    ],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', '@heroui/react'],
  },
};

export default nextConfig;
