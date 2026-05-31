export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/services', '/packages', '/staff', '/gallery', '/contact', '/book-appointment', '/login', '/legal/privacy', '/legal/terms'],
      disallow: ['/admin/', '/dashboard/', '/api/'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-salons.vercel.app'}/sitemap.xml`,
  };
}
