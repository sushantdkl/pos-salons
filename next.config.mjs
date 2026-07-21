/** @type {import('next').NextConfig} */
const nextConfig = {
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
