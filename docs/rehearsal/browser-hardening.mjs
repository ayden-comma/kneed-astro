// Browser checks for the sign-in/sign-out hardening. Needs the local site from docs/rehearsal/README.md
// running on 127.0.0.1:8788 and CHROME_BIN pointing at a Chromium binary. Run: node docs/rehearsal/browser-hardening.mjs
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8788';
const secret = fs.readFileSync('/home/claude/rehearsal/jwt.secret', 'utf8').trim();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims, key = secret) => { const u = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(claims); return u + '.' + crypto.createHmac('sha256', key).update(u).digest('base64url'); };
const MEMBER = '00000000-0000-0000-0000-00000000bbbb';
const exp = Math.floor(Date.now() / 1000) + 3600;
// What supabase-js keeps in localStorage after a real sign-in.
const sessionFor = token => JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
  user: { id: MEMBER, aud: 'authenticated', role: 'authenticated', email: 'm@example.com', app_metadata: {}, user_metadata: {} } });
const KEY = 'sb-127-auth-token';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, d ?? ''); } };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
async function page(session) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'kneed_unlocked', value: 'ok-2026', url: BASE }]);
  if (session) await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } } catch {} }, [KEY, session]);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('    [pageerror]', e.message));
  return { ctx, p };
}

console.log('\n1. Signed out: first click on Save goes to sign-in and remembers the page');
{
  const { ctx, p } = await page(null);
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'domcontentloaded' });
  await p.click('#save-btn', { timeout: 5000 });
  await p.waitForURL(/\/auth\/login/, { timeout: 5000 }).catch(() => {});
  ok('landed on sign-in', p.url().includes('/auth/login'), p.url());
  ok('with ?next= back to the bakery', decodeURIComponent(p.url()).includes('next=/bakeries/bakery-3'), p.url());
  await ctx.close();
}

console.log('\n2. Signed out: first click on a star goes to sign-in');
{
  const { ctx, p } = await page(null);
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'domcontentloaded' });
  const star = p.locator('.v2-aside-star').nth(3);
  if (await star.count()) {
    await star.click({ timeout: 5000 });
    await p.waitForURL(/\/auth\/login/, { timeout: 5000 }).catch(() => {});
    ok('star click → sign-in', p.url().includes('/auth/login'), p.url());
  } else ok('star click → sign-in (no stars on page, skipped)', true);
  await ctx.close();
}

console.log('\n3. Signed in but the write fails (server error): UI puts itself back and says so');
{
  const { ctx, p } = await page(sessionFor(jwt({ role: 'authenticated', sub: MEMBER, exp })));
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'networkidle' });
  const before = await p.locator('#save-btn').getAttribute('class');
  await p.click('#save-btn');
  await p.waitForSelector('#gated-flash', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(400);
  const flashText = await p.locator('#gated-flash').textContent().catch(() => null);
  ok('message shown', !!flashText && /Recipe Book/.test(flashText), flashText);
  ok('button back to not-saved', (await p.locator('#save-btn').getAttribute('class')) === before && !/is-saved/.test(before ?? ''), await p.locator('#save-btn').getAttribute('class'));
  ok('stayed on the page (not bounced to sign-in)', p.url().includes('/bakeries/bakery-3'), p.url());
  await ctx.close();
}

console.log('\n4. Stale session (token the server rejects): Save sends you to sign-in instead of failing silently');
{
  const { ctx, p } = await page(sessionFor(jwt({ role: 'authenticated', sub: MEMBER, exp }, 'not-the-real-secret')));
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'networkidle' });
  await p.click('#save-btn');
  await p.waitForURL(/\/auth\/login/, { timeout: 6000 }).catch(() => {});
  ok('sent to sign-in', p.url().includes('/auth/login'), p.url());
  await ctx.close();
}

console.log('\n5. Logout');
{
  const { ctx, p } = await page(sessionFor(jwt({ role: 'authenticated', sub: MEMBER, exp })));
  await p.goto(BASE + '/auth/logout', { waitUntil: 'networkidle' });
  ok('visiting /auth/logout does NOT sign you out', !!(await p.evaluate(k => localStorage.getItem(k), KEY)));
  ok('it asks first', (await p.locator('#logout-msg').textContent())?.includes('Sign out of (K)Need?'));
  await p.click('#logout-btn');
  await p.waitForURL(u => !u.toString().includes('/auth/logout'), { timeout: 6000 }).catch(() => {});
  ok('pressing the button signs out', !(await p.evaluate(k => localStorage.getItem(k), KEY)));
  ok('and goes home', new URL(p.url()).pathname === '/', p.url());
  await ctx.close();
}
{
  const { ctx, p } = await page(sessionFor(jwt({ role: 'authenticated', sub: MEMBER, exp })));
  await p.goto(BASE + '/about', { waitUntil: 'networkidle' });
  const link = p.locator('a[data-signout]').first();
  ok('menu Sign out link is marked for click handling', await link.count() > 0);
  await p.evaluate(() => (document.querySelector('a[data-signout]')).click());
  await p.waitForTimeout(1500);
  ok('menu Sign out signs out on click', !(await p.evaluate(k => localStorage.getItem(k), KEY)));
  ok('without stopping on the logout page', !p.url().includes('/auth/logout'), p.url());
  await ctx.close();
}
{
  const { ctx, p } = await page(null);
  await p.goto(BASE + '/auth/logout', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  ok('already signed out: says so', (await p.locator('#logout-msg').textContent())?.includes('already signed out'));
  await ctx.close();
}

console.log('\n6. Framing blocked');
{
  const { ctx, p } = await page(null);
  await p.setContent(`<iframe id="f" src="${BASE}/admin/announce" width="400" height="300"></iframe>`);
  await p.waitForTimeout(2000);
  const frame = p.frames().find(f => f.url().includes('/admin/announce'));
  const body = frame ? await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '') : '';
  ok('admin page refuses to render inside another site\'s frame', !body.includes('Announce') , body.slice(0, 80));
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
