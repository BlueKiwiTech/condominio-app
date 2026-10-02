import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Default is 1MB -- too small for a phone camera photo passed straight to
  // a Server Action (extractPaymentFromScreenshot, residentPayments.ts's
  // screenshot upload, etc.), which routinely run 2-8MB. 10mb leaves
  // comfortable headroom above a typical camera capture.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default withNextIntl(nextConfig);
