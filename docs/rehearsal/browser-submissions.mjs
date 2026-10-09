// Browser checks for the Submissions admin screen (see README). Needs the local site + rehearsal DB.
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8788';
const secret = fs.readFileSync('/home/claude/rehearsal/jwt.secret', 'utf8').trim();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = c => { const u = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(c); return u + '.' + crypto.createHmac('sha256', secret).update(u).digest('base64url'); };
const ADMIN = '00000000-0000-0000-0000-00000000aaaa';
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = JSON.stringify({ access_token: jwt({ role: 'authenticated', sub: ADMIN, exp }), refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
  user: { id: ADMIN, aud: 'authenticated', role: 'authenticated', email: 'ayden@example.com', app_metadata: {}, user_metadata: {} } });
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, d ?? ''); } };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.addCookies([{ name: 'kneed_unlocked', value: 'ok-2026', url: BASE }]);
await ctx.addInitScript(v => { try { localStorage.setItem('sb-127-auth-token', v); } catch {} }, session);
const p = await ctx.newPage();
p.on('pageerror', e => console.log('    [pageerror]', e.message));
p.on('dialog', d => d.accept());   // the confirm() prompts on status changes / delete
const names = async () => p.locator('.sub-card .sub-card-name').allTextContents();

await p.goto(BASE + '/admin/submissions', { waitUntil: 'networkidle' });
await p.waitForSelector('.sub-card', { timeout: 8000 }).catch(() => {});
ok('opens on Pending by default', (await p.locator('#status-filter').inputValue()) === 'pending');
ok('shows the 3 pending, newest first', JSON.stringify(await names()) === JSON.stringify(['Crumb Theory', 'Oven Lane', 'Loaf & Co']), await names());
const opts = await p.locator('#status-filter option').allTextContents();
ok('counts in the dropdown', opts.join('|') === 'Pending (3)|Shortlisted (1)|Rejected (1)|All statuses (5)', opts.join('|'));
const dbName = (await import('node:child_process')).execSync(`psql -h /tmp -p 5433 -U postgres -d kneed -tAc "select display_name from profiles where id='00000000-0000-0000-0000-00000000bbbb'"`).toString().trim();
const loafBy = await p.locator('.sub-card', { hasText: 'Loaf & Co' }).locator('.sub-card-by').textContent();
ok('signed-in submitter shows their display name (was always Anonymous)', !!loafBy && !/Anonymous/.test(loafBy) && loafBy.startsWith(dbName), loafBy);

await p.fill('#sub-search', 'fitz');
ok('search by suburb', JSON.stringify(await names()) === '["Crumb Theory"]', await names());
await p.fill('#sub-search', 'nothing-like-this');
ok('no-match message', (await p.locator('.admin-empty').textContent())?.includes('Nothing matches'));
await p.fill('#sub-search', '');

await p.locator('.sub-card', { hasText: 'Crumb Theory' }).locator('button[data-act="shortlisted"]').click();
await p.waitForTimeout(600);
ok('shortlist moves it out of Pending', !(await names()).includes('Crumb Theory'), await names());
ok('counts update', (await p.locator('#status-filter option').allTextContents())[1] === 'Shortlisted (2)');
await p.selectOption('#status-filter', 'shortlisted');
await p.locator('.sub-card', { hasText: 'Crumb Theory' }).locator('button[data-act="pending"]').click();
await p.waitForTimeout(600);
ok('"Back to pending" works (was impossible before)', !(await names()).includes('Crumb Theory'));
await p.selectOption('#status-filter', 'pending');
ok('...and it is pending again', (await names()).includes('Crumb Theory'));

// Contact stamps contacted_at (the mailto link itself is blocked from navigating in the test)
await p.route('mailto:*', r => r.abort());
await p.evaluate(() => { document.querySelectorAll('a[href^="mailto:"]').forEach(a => a.addEventListener('click', e => e.preventDefault())); });
await p.locator('.sub-card', { hasText: 'Crumb Theory' }).locator('[data-contact]').click();
await p.waitForTimeout(800);
const crumbBy = await p.locator('.sub-card', { hasText: 'Crumb Theory' }).locator('.sub-card-by').textContent();
ok('Contact records "Contacted <date>"', /Contacted/.test(crumbBy ?? ''), crumbBy);

// CSV: formula neutralised
await p.locator('.sub-card', { hasText: 'Oven Lane' }).locator('.sub-select-cb').check();
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-csv')]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
ok('CSV exports the selected row', csv.includes('Oven Lane'));
ok('formula in CSV is neutralised with a leading quote', csv.includes(`"'=HYPERLINK(`), csv.split('\n')[1]);

await p.locator('.sub-card', { hasText: 'Oven Lane' }).locator('button[data-act="delete"]').click();
await p.waitForTimeout(600);
ok('delete removes the card', !(await names()).includes('Oven Lane'));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('.sub-card', { timeout: 8000 }).catch(() => {});
ok('after reload: delete and contacted stamp persisted', !(await names()).includes('Oven Lane') && /Contacted/.test(await p.locator('.sub-card', { hasText: 'Crumb Theory' }).locator('.sub-card-by').textContent() ?? ''));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
