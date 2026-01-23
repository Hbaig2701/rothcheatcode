import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@react-pdf/renderer',
    'puppeteer-core',
    '@sparticuz/chromium',
    'handlebars',
  ],
};

export default nextConfig;
