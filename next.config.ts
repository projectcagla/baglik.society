import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    authInterrupts: true,
    taint: true,
  },
  // read at runtime by the invitation export (src/app/(uye)/geceler/[no]/davetiye/[format])
  outputFileTracingIncludes: {
    '/geceler/[no]/davetiye/[format]': ['./src/assets/**/*'],
  },
  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ];
  },
};

export default nextConfig;
