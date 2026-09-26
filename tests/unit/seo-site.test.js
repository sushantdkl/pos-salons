import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_URL, absoluteUrl, isPrivatePath, resolveSiteUrl } from '../../src/lib/seo/site.js';

test('canonical site URL defaults to production', () => {
  assert.equal(DEFAULT_SITE_URL, 'https://thehaircut.com.np');
  assert.equal(resolveSiteUrl(''), 'https://thehaircut.com.np');
  assert.equal(resolveSiteUrl('https://thehaircut.com.np/'), 'https://thehaircut.com.np');
});

test('staging, local and plain-http values can never become canonical', () => {
  for (const value of ['https://pos-salons.vercel.app', 'https://pos-salons-git-main-x.vercel.app', 'http://localhost:3002', 'https://localhost', 'http://127.0.0.1:3000', 'http://thehaircut.com.np', 'not a url']) {
    assert.equal(resolveSiteUrl(value), 'https://thehaircut.com.np', value);
  }
});

test('absolute URLs use the canonical host', () => {
  assert.equal(absoluteUrl('/'), `${resolveSiteUrl()}/`);
  assert.match(absoluteUrl('/services/haircut'), /^https:\/\/thehaircut\.com\.np\/services\/haircut$/);
});

test('private app areas are recognised', () => {
  for (const path of ['/admin', '/admin/billing', '/dashboard/admin/website/seo', '/api/public/rewards', '/login', '/cashier/credit']) assert.ok(isPrivatePath(path), path);
  for (const path of ['/', '/services', '/services/haircut', '/book-appointment', '/contact']) assert.ok(!isPrivatePath(path), path);
});
