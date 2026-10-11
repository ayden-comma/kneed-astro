// Browser checks for watch analytics, with a stand-in YouTube player (see README).
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8788';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, d === undefined ? '' : JSON.stringify(d)); } };

// Stand-in for https://www.youtube.com/iframe_api: a 100 s film played at 20x.
const FAKE_YT = `
  window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
    Player: function (el, opts) {
      var start = Date.now(), ended = false, self = this;
      window.__ytAttachedTo = el.getAttribute('src');
      this.getDuration = function () { return 100; };
      this.getCurrentTime = function () { return Math.min(100, (Date.now() - start) / 1000 * 20); };
      setTimeout(function () { opts.events.onStateChange({ data: 1 }); }, 50);
      var iv = setInterval(function () { if (!ended && self.getCurrentTime() >= 100) { ended = true; clearInterval(iv); opts.events.onStateChange({ data: 0 }); } }, 100);
    } };
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();`;

async function run({ consent, closeEarlyMs }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'kneed_unlocked', value: 'ok-2026', url: BASE }]);
  await ctx.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_YT }));
  await ctx.route('https://www.youtube.com/embed/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>player</body></html>' }));
  if (consent) await ctx.addInitScript(() => { window.__events = []; window.gtag = function () { window.__events.push(Array.from(arguments)); }; });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'networkidle' });
  await p.click('#v2-watch-btn');
  await p.waitForTimeout(closeEarlyMs ?? 7000);
  if (closeEarlyMs) await p.click('#v2-modal-close', { timeout: 3000 });
  await p.waitForTimeout(300);
  const out = { src: await p.locator('#v2-modal-iframe').getAttribute('src').catch(() => null), attached: await p.evaluate(() => window.__ytAttachedTo ?? null),
                events: await p.evaluate(() => (window.__events || []).filter(e => e[0] === 'event').map(e => ({ n: e[1], ...e[2] }))), errors };
  await browser.close();
  return out;
}

console.log('\n1. Visitor accepted analytics, watches to the end');
let r = await run({ consent: true });
const names = r.events.map(e => e.n + (e.n === 'film_progress' ? ':' + e.percent : ''));
ok('player embed allows the API and names our origin', /enablejsapi=1/.test(r.attached ?? '') && /origin=http%3A%2F%2F127\.0\.0\.1%3A8788/.test(r.attached ?? ''), r.attached);
ok('events in order: play, 25, 50, 75, complete', JSON.stringify(names) === JSON.stringify(['film_play', 'film_progress:25', 'film_progress:50', 'film_progress:75', 'film_complete']), names);
const e0 = r.events[0] ?? {};
ok('events carry film, episode and page', e0.film_title === 'Bakery 3' && e0.film_id === 'abc123XYZ' && e0.episode_number === 3 && e0.slug === 'bakery-3' && e0.content_kind === 'bakery', e0);
ok('each milestone sent once only', new Set(names).size === names.length);
ok('no page errors', r.errors.length === 0, r.errors);

console.log('\n2. Visitor accepted analytics, closes the film at about half way');
r = await run({ consent: true, closeEarlyMs: 2700 });
const n2 = r.events.map(e => e.n + (e.percent !== undefined ? ':' + e.percent : ''));
const close = r.events.find(e => e.n === 'film_close');
ok('closing part-way: play first, close last, no complete', n2[0] === 'film_play:0' && n2[n2.length - 1].startsWith('film_close') && !n2.some(x => x.startsWith('film_complete')), n2);
ok('close records how far they got (between 25% and 75%)', close && close.percent >= 25 && close.percent < 75, close);
ok('only milestones they actually reached were sent', r.events.filter(e => e.n === 'film_progress').every(e => e.percent <= close.percent), n2);
ok('closing stops the player', r.src === '' || r.src === null, r.src);

console.log('\n3. Visitor declined analytics (no gtag)');
r = await run({ consent: false, closeEarlyMs: 2000 });
ok('film still opens and plays', /enablejsapi=1/.test(r.attached ?? ''));
ok('nothing recorded', r.events.length === 0, r.events);
ok('no page errors', r.errors.length === 0, r.errors);

console.log('\n4. YouTube API blocked (e.g. ad blocker)');
{
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'kneed_unlocked', value: 'ok-2026', url: BASE }]);
  await ctx.route('https://www.youtube.com/iframe_api', r => r.abort());
  await ctx.route('https://www.youtube.com/embed/**', r => r.fulfill({ contentType: 'text/html', body: 'player' }));
  await ctx.addInitScript(() => { window.__events = []; window.gtag = function () { window.__events.push(Array.from(arguments)); }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/bakeries/bakery-3', { waitUntil: 'networkidle' });
  await p.click('#v2-watch-btn'); await p.waitForTimeout(1500);
  ok('film still opens', /youtube\.com\/embed\/abc123XYZ/.test(await p.locator('#v2-modal-iframe').getAttribute('src') ?? ''));
  ok('modal visible', await p.locator('#v2-modal-overlay.active').count() === 1);
  ok('no page errors', errs.length === 0, errs);
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
