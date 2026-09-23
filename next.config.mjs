/** @type {import('next').NextConfig} */
const nextConfig = {
  // QA builds use their own output folder (NEXT_DIST_DIR=.next-qa) so they never overwrite
  // the .next folder a running `npm run dev` is using. Production / cPanel keep the default.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  images: {
    // Local uploaded media is served from this app; allow optimizer host access in development.
    // dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
