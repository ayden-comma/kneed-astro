// @ts-nocheck: standalone rehearsal script, run with tsx; not part of the site build.
// End-to-end rehearsal: the real src/lib/cmsDraft.ts + previewToken.ts + real supabase-js
// against a replica of the live schema with both migrations applied.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { handleCmsAction, withDraft, getDraft, HttpError } from '../../src/lib/cmsDraft.ts';
import { signPreview, verifyPreview } from '../../src/lib/previewToken.ts';

const proxy = http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: 3011, path: req.url!.replace(/^\/rest\/v1/, ''), method: req.method, headers: req.headers },
    r => { res.writeHead(r.statusCode!, r.headers); r.pipe(res); });
  req.pipe(up);
});
// Reuse a proxy already listening on 3012 (e.g. the one serving the local site).
await new Promise<void>(r => { proxy.once('error', () => r()); proxy.listen(3012, r); });

const secret = fs.readFileSync('/home/claude/rehearsal/jwt.secret', 'utf8').trim();
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims: object) => {
  const u = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ exp: 4102444800, ...claims });
  return u + '.' + crypto.createHmac('sha256', secret).update(u).digest('base64url');
};
const client = (claims: object) => createClient('http://127.0.0.1:3012', jwt(claims), { auth: { persistSession: false } });
const db     = client({ role: 'service_role' });
const anon   = client({ role: 'anon' });
const member = client({ role: 'authenticated', sub: '00000000-0000-0000-0000-00000000bbbb' });
const admin  = client({ role: 'authenticated', sub: '00000000-0000-0000-0000-00000000aaaa' });

const B = { db, table: 'bakeries_cms' as const, userEmail: 'ayden@commafilms.com.au' };
const A = { db, table: 'articles_cms' as const, userEmail: 'ayden@commafilms.com.au' };
let pass = 0, fail = 0;
const ok = (name: string, cond: unknown, detail?: unknown) => {
  if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
};
const row = async (t: string, slug: string) => (await db.from(t).select('*').eq('slug', slug).single()).data as any;
const rowById = async (t: string, id: string) => (await db.from(t).select('*').eq('id', id).single()).data as any;
const locs = async (key: string, slug: string) => ((await db.from('locations').select('label').eq(key, slug).order('sort_order')).data ?? []).map((l: any) => l.label);
const revs = async (t: string, id: string) => (await handleCmsAction({ ...B, table: t as any }, { action: 'revisions', id })).revisions as any[];
const draftOf = async (t: any, id: string) => (await getDraft(db, t, id))?.payload ?? null;
const editorPayload = (r: any, over: Record<string, unknown> = {}) => ({
  name: r.name, slug: r.slug, category: r.category, hero_title: r.hero_title, body: r.body, episode_number: r.episode_number, ...over,
});

console.log('\n0. Who can see what (lockdown migration)');
const count = async (c: any, t: string) => ((await c.from(t).select('id')).data ?? []).length;
ok('stranger sees 4 published bakeries only', await count(anon, 'bakeries_cms') === 4, await count(anon, 'bakeries_cms'));
ok('signed-in member also sees 4 only', await count(member, 'bakeries_cms') === 4, await count(member, 'bakeries_cms'));
ok('admin sees all 8', await count(admin, 'bakeries_cms') === 8, await count(admin, 'bakeries_cms'));
ok('stranger sees only published bakeries\' map pins (4 bakeries + 1 extra shop + 1 article = 6)', await count(anon, 'locations') === 6, await count(anon, 'locations'));
ok('admin sees all 10 pins', await count(admin, 'locations') === 10, await count(admin, 'locations'));
ok('stranger cannot read drafts table', !!(await anon.from('cms_drafts').select('*')).error);
ok('admin cannot read drafts table directly either (API only)', !!(await admin.from('cms_drafts').select('*')).error);
ok('member cannot read history', !!(await member.from('cms_revisions').select('*')).error);
const w1 = await member.from('bakeries_cms').update({ hero_title: 'hacked' }).eq('slug', 'bakery-3').select();
ok('member cannot edit a bakery', !!w1.error || (w1.data ?? []).length === 0, w1.error?.message);
const w2 = await admin.from('bakeries_cms').update({ hero_title: 'hacked' }).eq('slug', 'bakery-3').select();
ok('even admin cannot edit directly (API only)', !!w2.error || (w2.data ?? []).length === 0, w2.error?.message);
const w3 = await member.from('locations').delete().eq('bakery_slug', 'bakery-1').select();
ok('member cannot delete map pins', !!w3.error || (w3.data ?? []).length === 0, w3.error?.message);
ok('pins intact after those attempts', (await locs('bakery_slug', 'bakery-1')).length === 2);

console.log('\n1. Edit a PUBLISHED bakery and Save Draft');
let b1 = await row('bakeries_cms', 'bakery-1');
const before = { hero: b1.hero_title, updated: b1.updated_at };
let r: any = await handleCmsAction(B, { action: 'save', id: b1.id, payload: editorPayload(b1, { hero_title: 'NEW HERO' }), locations: [{ label: 'Only shop' }] });
let after = await rowById('bakeries_cms', b1.id);
ok('response says draft', r.mode === 'draft', r);
ok('still published', after.published === true);
ok('live row completely untouched (hero + updated_at)', after.hero_title === before.hero && after.updated_at === before.updated, [after.hero_title, after.updated_at, before.updated]);
ok('draft stored privately', (await draftOf('bakeries_cms', b1.id))?.hero_title === 'NEW HERO');
ok('live map pins unchanged', JSON.stringify(await locs('bakery_slug', 'bakery-1')) === '["Shop 1","Second shop"]');
ok('public sees the live version', (await anon.from('bakeries_cms').select('hero_title').eq('slug', 'bakery-1').single()).data?.hero_title === before.hero);
const ed = await handleCmsAction(B, { action: 'get', id: b1.id });
ok('editor "get" returns the draft and its pins', ed.draft?.payload?.hero_title === 'NEW HERO' && ed.locations?.[0]?.label === 'Only shop');
ok('withDraft overlays it (preview render)', withDraft(ed.row, ed.draft?.payload).hero_title === 'NEW HERO');
const pend = (await handleCmsAction(B, { action: 'pending' })).pending as any[];
ok('"Changes pending" list has exactly this bakery', pend.length === 1 && pend[0].record_id === b1.id, pend);

console.log('\n2. Publish from the list badge (no payload: uses the stored draft)');
await handleCmsAction(B, { action: 'publish', id: b1.id });
after = await rowById('bakeries_cms', b1.id);
ok('live hero now NEW HERO', after.hero_title === 'NEW HERO');
ok('draft cleared', (await draftOf('bakeries_cms', b1.id)) === null);
ok('published_at kept', new Date(after.published_at).getTime() === new Date(b1.published_at).getTime());
ok('pins now from draft', JSON.stringify(await locs('bakery_slug', 'bakery-1')) === '["Only shop"]');
let h = await revs('bakeries_cms', b1.id);
ok('history: baseline + this publish', h.length === 2, h.length);
ok('recorded who published', h[0].published_by === 'ayden@commafilms.com.au');

console.log('\n3. Restore the baseline');
const baseline = h.find(x => x.note === 'Baseline at migration');
await handleCmsAction(B, { action: 'revert', id: b1.id, revision_id: baseline.id });
after = await rowById('bakeries_cms', b1.id);
ok('restore lands in draft, live untouched', after.hero_title === 'NEW HERO' && (await draftOf('bakeries_cms', b1.id))?.hero_title === 'Hero 1');
await handleCmsAction(B, { action: 'publish', id: b1.id });
after = await rowById('bakeries_cms', b1.id);
ok('after publish, back to Hero 1 with both shops', after.hero_title === 'Hero 1' && (await locs('bakery_slug', 'bakery-1')).length === 2);

console.log('\n4. Discard, unpublish, stale-draft');
await handleCmsAction(B, { action: 'save', id: b1.id, payload: editorPayload(after, { hero_title: 'OOPS' }), locations: [] });
await handleCmsAction(B, { action: 'discard', id: b1.id });
ok('discard: draft gone, live and pins untouched', (await draftOf('bakeries_cms', b1.id)) === null && (await rowById('bakeries_cms', b1.id)).hero_title === 'Hero 1' && (await locs('bakery_slug', 'bakery-1')).length === 2);
await handleCmsAction(B, { action: 'save', id: b1.id, payload: editorPayload(after, { hero_title: 'PENDING' }) });
await handleCmsAction(B, { action: 'unpublish', id: b1.id });
ok('unpublish: offline, draft kept', (await rowById('bakeries_cms', b1.id)).published === false && (await draftOf('bakeries_cms', b1.id))?.hero_title === 'PENDING');
ok('unpublished bakery vanishes for strangers, pins too', !(await anon.from('bakeries_cms').select('id').eq('slug', 'bakery-1').maybeSingle()).data && ((await anon.from('locations').select('id').eq('bakery_slug', 'bakery-1')).data ?? []).length === 0);
await handleCmsAction(B, { action: 'save', id: b1.id, payload: editorPayload(after, { hero_title: 'DIRECT' }), locations: [{ label: 'Shop 1' }] });
ok('save on unpublished writes row and clears stale draft', (await rowById('bakeries_cms', b1.id)).hero_title === 'DIRECT' && (await draftOf('bakeries_cms', b1.id)) === null);

console.log('\n5. Never-published bakery, slug change, new bakery');
const b5 = await row('bakeries_cms', 'bakery-5');
r = await handleCmsAction(B, { action: 'save', id: b5.id, payload: editorPayload(b5, { hero_title: 'B5 v1' }), locations: [{ label: 'B5 shop' }] });
ok('unpublished save is direct', r.mode === 'direct');
await handleCmsAction(B, { action: 'publish', id: b5.id, payload: editorPayload(b5, { hero_title: 'B5 live' }), locations: [{ label: 'B5 shop' }] });
const b5a = await rowById('bakeries_cms', b5.id);
ok('first publish sets published_at, records history', b5a.published && !!b5a.published_at && (await revs('bakeries_cms', b5.id)).length === 1);
ok('newly published bakery visible to strangers', !!(await anon.from('bakeries_cms').select('id').eq('slug', 'bakery-5').maybeSingle()).data);
const b2 = await row('bakeries_cms', 'bakery-2');
await handleCmsAction(B, { action: 'save', id: b2.id, payload: editorPayload(b2, { slug: 'bakery-two' }), locations: [{ label: 'Shop 2' }] });
ok('old URL live while slug change is drafted', !!(await anon.from('bakeries_cms').select('id').eq('slug', 'bakery-2').maybeSingle()).data);
await handleCmsAction(B, { action: 'publish', id: b2.id });
ok('slug change: new URL live, pins moved, none orphaned', !!(await row('bakeries_cms', 'bakery-two')) && JSON.stringify(await locs('bakery_slug', 'bakery-two')) === '["Shop 2"]' && (await locs('bakery_slug', 'bakery-2')).length === 0);
r = await handleCmsAction(B, { action: 'insert', payload: { name: 'Fresh', slug: 'fresh', category: 'Pastry', published: true }, locations: [{ label: 'Fresh shop' }] });
ok('insert ignores client published:true', (await rowById('bakeries_cms', r.id)).published === false);
await handleCmsAction(B, { action: 'save', id: r.id, payload: { name: 'Fresh', slug: 'fresh', category: 'Pastry' } });
await handleCmsAction(B, { action: 'delete', id: r.id });
ok('delete removes the row', !(await db.from('bakeries_cms').select('id').eq('id', r.id).maybeSingle()).data);

console.log('\n6. Guard rails');
const art = await row('articles_cms', 'article-one');
const artRev = (await revs('articles_cms', art.id))[0];
try { await handleCmsAction(B, { action: 'revert', id: b2.id, revision_id: artRev.id }); ok('cross-item restore rejected', false); }
catch (e) { ok('cross-item restore rejected', e instanceof HttpError && e.status === 400); }
try { await handleCmsAction(B, { action: 'save', payload: {} }); ok('missing id rejected', false); }
catch (e) { ok('missing id rejected', e instanceof HttpError && e.status === 400); }
try { await handleCmsAction(B, { action: 'nope' }); ok('unknown action rejected', false); }
catch (e) { ok('unknown action rejected', e instanceof HttpError && e.status === 400); }

console.log('\n7. Articles');
await handleCmsAction(A, { action: 'save', id: art.id, payload: { title: 'Draft title', slug: art.slug, body: art.body }, locations: [{ label: 'Article spot' }] });
let aa = await rowById('articles_cms', art.id);
ok('article draft leaves live row (and list order) untouched', aa.title === art.title && aa.updated_at === art.updated_at);
await handleCmsAction(A, { action: 'publish', id: art.id });
aa = await rowById('articles_cms', art.id);
ok('article publish applies draft, pins kept', aa.title === 'Draft title' && (await draftOf('articles_cms', art.id)) === null && JSON.stringify(await locs('article_slug', art.slug)) === '["Article spot"]');

console.log('\n8. Signed preview links');
const SK = 'service-key-for-tests';
const tok = await signPreview(SK, 'bakeries_cms', b1.id);
ok('valid token verifies', (await verifyPreview(SK, tok, 'bakeries_cms'))?.id === b1.id);
ok('old-style ?preview=true rejected', (await verifyPreview(SK, 'true', 'bakeries_cms')) === null);
ok('missing token rejected', (await verifyPreview(SK, null, 'bakeries_cms')) === null);
ok('wrong key rejected', (await verifyPreview('other-key', tok, 'bakeries_cms')) === null);
ok('bakery token cannot open an article', (await verifyPreview(SK, tok, 'articles_cms')) === null);
const [body, sig] = tok.split('.');
const forged = Buffer.from(JSON.stringify({ t: 'bakeries_cms', id: b5.id, exp: 4102444800 })).toString('base64url') + '.' + sig;
ok('tampered id rejected', (await verifyPreview(SK, forged, 'bakeries_cms')) === null);
ok('expired token rejected (25h later)', (await verifyPreview(SK, tok, 'bakeries_cms', Date.now() + 25 * 3600e3)) === null);
ok('still valid 23h later', !!(await verifyPreview(SK, tok, 'bakeries_cms', Date.now() + 23 * 3600e3)));
ok('garbage rejected without throwing', (await verifyPreview(SK, '%%%.***', 'bakeries_cms')) === null && (await verifyPreview(SK, body + '.', 'bakeries_cms')) === null);

console.log('\n9. Publish is all or nothing');
const b4 = await row('bakeries_cms', 'bakery-4');
const pinsBefore = await locs('bakery_slug', 'bakery-4');
const revsBefore = (await revs('bakeries_cms', b4.id)).length;
await handleCmsAction(B, { action: 'save', id: b4.id, payload: editorPayload(b4, { hero_title: 'ATOMIC TEST' }), locations: [{ label: 'Bad pin', lat: 'not-a-number' }] });
let threw = false;
try { await handleCmsAction(B, { action: 'publish', id: b4.id }); } catch { threw = true; }
const b4after = await rowById('bakeries_cms', b4.id);
ok('a publish that fails part-way reports the error', threw);
ok('...and the live page is unchanged', b4after.hero_title === b4.hero_title, b4after.hero_title);
ok('...the map pins are unchanged', JSON.stringify(await locs('bakery_slug', 'bakery-4')) === JSON.stringify(pinsBefore));
ok('...the draft is still there to fix', (await draftOf('bakeries_cms', b4.id))?.hero_title === 'ATOMIC TEST');
ok('...and no history entry was written', (await revs('bakeries_cms', b4.id)).length === revsBefore);
await handleCmsAction(B, { action: 'save', id: b4.id, payload: editorPayload(b4, { hero_title: 'ATOMIC TEST' }), locations: [{ label: 'Good pin', lat: -37.8, lng: 144.96 }, { label: 'Zero lng', lat: -37.8, lng: 0 }] });
await handleCmsAction(B, { action: 'publish', id: b4.id });
ok('fixed draft then publishes cleanly', (await rowById('bakeries_cms', b4.id)).hero_title === 'ATOMIC TEST' && JSON.stringify(await locs('bakery_slug', 'bakery-4')) === '["Good pin","Zero lng"]');
const zero = (await db.from('locations').select('lng').eq('bakery_slug', 'bakery-4').eq('label', 'Zero lng').single()).data;
ok('a coordinate of exactly 0 survives (the old code turned it into empty)', Number(zero?.lng) === 0, zero);
let rpcBlocked = false;
try { const r = await member.rpc('cms_publish', { p_table: 'bakeries_cms', p_id: b4.id, p_content: {}, p_locations: [] }); rpcBlocked = !!r.error; } catch { rpcBlocked = true; }
ok('members cannot call the publish function', rpcBlocked);

console.log(`\n${pass} passed, ${fail} failed`);
proxy.close();
process.exit(fail ? 1 : 0);
