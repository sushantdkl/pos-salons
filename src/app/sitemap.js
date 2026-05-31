export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-salons.vercel.app';
  const lastModified = new Date();

  const routes = [
    ['', 'weekly', 1],
    ['/services', 'monthly', 0.8],
    ['/packages', 'monthly', 0.8],
    ['/staff', 'monthly', 0.7],
    ['/gallery', 'monthly', 0.6],
    ['/contact', 'monthly', 0.8],
    ['/book-appointment', 'weekly', 0.9],
    ['/login', 'monthly', 0.4],
    ['/legal/privacy', 'yearly', 0.3],
    ['/legal/terms', 'yearly', 0.3],
  ];

  return routes.map(([path, changeFrequency, priority]) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
