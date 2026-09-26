/**
 * SEO regression check for the public website.
 *
 *   npm run seo:check                              # source checks only
 *   npm run seo:check -- http://localhost:3000     # + a running local production build
 *   npm run seo:check -- https://thehaircut.com.np # + the LIVE site (run after every deploy)
 *
 * Fails (exit 1) on: the old Vercel domain in public SEO code, a canonical / sitemap / robots
 * host other than https://thehaircut.com.np, localhost in public SEO output, a missing sitemap
 * line in robots.txt, or private areas in the sitemap. Read-only — it never writes anything.
 */
import fs from 'node:fs';
import path from 'node:path';

const CANONICAL = 'https://thehaircut.com.np';
const BAD_HOSTS = /pos-salons\.vercel\.app|\.vercel\.app|localhost|127\.0\.0\.1/i;
const base = (process.argv[2] || '').replace(/\/+$/, '');
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

// 1. Source: files that produce public SEO output must not hard-code a staging/local host.
const seoSources = [
  'src/lib/seo/site.js', 'src/app/layout.js', 'src/app/robots.js', 'src/app/sitemap.js', 'src/middleware.js',
  'src/modules/public-site/services/seo.js', 'src/modules/public-site/services/cms.js', 'src/modules/public-site/data/salon-info.ts',
  ...fs.readdirSync('src/app/(public)', { recursive: true }).filter((f) => /\.(tsx?|jsx?)$/.test(f)).map((f) => path.join('src/app/(public)', f)),
];
for (const file of seoSources) {
  const text = fs.readFileSync(file, 'utf8');
  check(!/pos-salons\.vercel\.app/i.test(text), `no old Vercel domain in ${file}`);
  check(!/https?:\/\/localhost/i.test(text.replace(/^\s*(\/\/|\*).*$/gm, '')), `no localhost URL in ${file}`);
}
check(!/NEXT_PUBLIC_SITE_URL|VERCEL_URL/.test(fs.readFileSync('src/lib/seo/site.js', 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')), 'canonical URL is not taken from build-time NEXT_PUBLIC_SITE_URL / VERCEL_URL');

// 2. Optional: a running site.
if (base) {
  const get = async (p) => {
    const response = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': 'thehaircut-seo-check' } });
    return { status: response.status, text: await response.text(), headers: response.headers };
  };
  const canonicalOf = (html) => (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';

  const robots = await get('/robots.txt');
  check(robots.status === 200, 'robots.txt returns 200', String(robots.status));
  check(robots.text.includes(`Sitemap: ${CANONICAL}/sitemap.xml`), 'robots.txt points to the production sitemap', robots.text.match(/Sitemap:.*/)?.[0]);
  check(/Disallow: \/admin/.test(robots.text) && /Disallow: \/api\//.test(robots.text), 'robots.txt disallows /admin and /api/');
  check(!/Disallow: \/\s*$/m.test(robots.text), 'robots.txt does not block the whole site');

  const sitemap = await get('/sitemap.xml');
  const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check(sitemap.status === 200 && locs.length > 0, 'sitemap.xml returns URLs', `${sitemap.status}, ${locs.length} urls`);
  check(locs.every((u) => u === CANONICAL || u.startsWith(`${CANONICAL}/`)), 'every sitemap URL is on the production host', locs.find((u) => !u.startsWith(CANONICAL)));
  check(new Set(locs).size === locs.length, 'sitemap has no duplicates');
  check(!locs.some((u) => /\/(admin|dashboard|cashier|store|api|login|auth|review)(\/|$)/.test(new URL(u).pathname)), 'sitemap has no private/internal routes');

  for (const [p, expected] of [['/', [CANONICAL, `${CANONICAL}/`]], ['/services', [`${CANONICAL}/services`]], ['/book-appointment', [`${CANONICAL}/book-appointment`]]]) {
    const page = await get(p);
    const canonical = canonicalOf(page.text);
    check(page.status === 200, `${p} returns 200`, String(page.status));
    check(expected.includes(canonical), `${p} canonical is ${expected.at(-1)}`, canonical || 'missing');
    const head = page.text.split('</head>')[0];
    check(!BAD_HOSTS.test(head), `${p} <head> has no staging/local host`, head.match(BAD_HOSTS)?.[0]);
    check(!/<meta name="robots" content="noindex/.test(head) && !/noindex/i.test(page.headers.get('x-robots-tag') || ''), `${p} is indexable`);
  }
  const admin = await get('/admin');
  check(/noindex/i.test(admin.headers.get('x-robots-tag') || '') || /noindex/.test(admin.text.split('</head>')[0]), '/admin is noindex');
}

console.log(failures ? `\n${failures} SEO check(s) FAILED` : '\nSEO checks passed');
process.exit(failures ? 1 : 0);
