import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@react-pdf/renderer',
    'puppeteer-core',
    '@sparticuz/chromium',
    'handlebars',
    // Resolves its binary via __dirname; bundling breaks that path.
    'ffmpeg-static',
  ],
  // The ffmpeg binary isn't imported as JS, so file tracing won't pick it up on
  // its own — ship it with the sales-call upload function that re-encodes audio.
  outputFileTracingIncludes: {
    '/api/sales-calls': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
