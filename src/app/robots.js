export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/legal/privacy', '/legal/terms'],
      disallow: ['/admin/', '/dashboard/', '/api/'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-salons.vercel.app'}/sitemap.xml`,
  };
}
