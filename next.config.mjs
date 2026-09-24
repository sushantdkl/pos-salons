/** @type {import('next').NextConfig} */
const nextConfig = {
  // QA builds use their own output folder (NEXT_DIST_DIR=.next-qa) so they never overwrite
  // the .next folder a running `npm run dev` is using. Production / cPanel keep the default.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    // Private app areas: never indexed, whatever links to them. Auth is what actually protects them.
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const privateAreas = [
      '/admin/:path*', '/dashboard/:path*', '/cashier/:path*', '/store/:path*', '/appointments/:path*',
      '/attendance/:path*', '/api/:path*', '/auth/:path*', '/login', '/activate', '/license-expired', '/review', '/legal/:path*',
    ];
    return [
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ] },
      ...privateAreas.map((source) => ({ source, headers: noindex })),
      // Original salon photos never change name → cache them for a month.
      { source: '/assets/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
    ];
  },
  async redirects() {
    // Short, shareable booking link for Google Business Profile, Instagram and Facebook.
    return [{ source: '/book', destination: '/book-appointment', statusCode: 301 }];
  },
  images: {
    // 30 = decorative page-hero wash (12% opacity); 75 = everything else.
    qualities: [30, 75],
    // Local uploaded media is served from this app; allow optimizer host access in development.
    // dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
