// @ts-nocheck: rehearsal script. Phase "before": production as it is. Phase "after": with security-fixes.sql.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const phase = process.argv[2];
const secret = fs.readFileSync('/home/claude/rehearsal/jwt.secret', 'utf8').trim();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = c => { const u = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ exp: 4102444800, ...c }); return u + '.' + crypto.createHmac('sha256', secret).update(u).digest('base64url'); };
const mk = c => createClient('http://127.0.0.1:3012', jwt(c), { auth: { persistSession: false } });
const MEMBER = '00000000-0000-0000-0000-00000000bbbb';
const member = mk({ role: 'authenticated', sub: MEMBER });
const svc = mk({ role: 'service_role' });
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, d === undefined ? '' : JSON.stringify(d)); } };
const roleOf = async () => (await svc.from('profiles').select('role').eq('id', MEMBER).single()).data?.role;
await svc.from('profiles').update({ role: 'member', deleted_at: null }).eq('id', MEMBER);
await svc.from('comments').delete().eq('user_id', MEMBER);

if (phase === 'before') {
  console.log('\nBEFORE the fix (production today)');
  const r = await member.from('profiles').update({ role: 'admin' }).eq('id', MEMBER).select('role');
  ok('EXPLOIT REPRODUCED: a member can make themselves admin', (await roleOf()) === 'admin', r.error?.message);
  await svc.from('profiles').update({ role: 'member' }).eq('id', MEMBER);
  const big = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'x'.repeat(200000) });
  ok('a 200,000-character comment is accepted', !big.error, big.error?.message);
  let n = 0; for (let i = 0; i < 15; i++) { const { error } = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'spam ' + i }); if (!error) n++; }
  ok('15 comments in a row all accepted (no limit)', n === 15, n);
} else {
  console.log('\nAFTER the fix');
  const r = await member.from('profiles').update({ role: 'admin' }).eq('id', MEMBER).select('role');
  ok('member can NOT make themselves admin', (await roleOf()) === 'member' && !!r.error, r.error?.message);
  const r2 = await member.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', MEMBER);
  ok('member can NOT set the deletion marker', !!r2.error);
  const edit = await member.from('profiles').update({ display_name: 'New Name', username: 'newname', bio: 'hi', demographics_consent: true,
    demographics_consent_at: new Date().toISOString(), date_of_birth: '1990-01-01', gender: 'x', location: 'Melbourne' }).eq('id', MEMBER).select('display_name');
  ok('the real profile-edit payload still saves', !edit.error && edit.data?.[0]?.display_name === 'New Name', edit.error?.message);
  const np = await member.from('profiles').update({ newsletter_prompted_at: new Date().toISOString() }).eq('id', MEMBER);
  ok('newsletter prompt timestamp still saves', !np.error, np.error?.message);
  const adm = await svc.from('profiles').update({ role: 'admin' }).eq('id', MEMBER);
  ok('admin API (service role) can still change roles', !adm.error && (await roleOf()) === 'admin', adm.error?.message);
  await svc.from('profiles').update({ role: 'member' }).eq('id', MEMBER);
  const del = await svc.from('profiles').update({ deleted_at: new Date().toISOString(), display_name: 'Bread enthusiast' }).eq('id', MEMBER);
  ok('admin API can still anonymise a deleted member', !del.error, del.error?.message);
  await svc.from('profiles').update({ deleted_at: null }).eq('id', MEMBER);
  const big = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'x'.repeat(2001) });
  ok('2,001-character comment rejected', !!big.error);
  const blank = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: '   ' });
  ok('blank comment rejected', !!blank.error);
  const okc = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'y'.repeat(2000) });
  ok('2,000-character comment accepted', !okc.error, okc.error?.message);
  let n = 1, lastErr = null; for (let i = 0; i < 14; i++) { const { error } = await member.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'hello ' + i }); if (!error) n++; else lastErr = error; }
  ok('rate limit: 10 per hour accepted, the rest refused', n === 10, n);
  ok('refusal carries the rate_limited marker the site looks for', /rate_limited/.test(lastErr?.message ?? ''), lastErr?.message);
  const svcC = await svc.from('comments').insert({ user_id: MEMBER, bakery_slug: 'bakery-3', content: 'from admin tooling' });
  ok('service role is not rate limited', !svcC.error, svcC.error?.message);
  const tr = await (await import('node:child_process')).execSync(`psql -h /tmp -p 5433 -U postgres -d kneed -tAc "select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE'"`).toString().trim();
  ok('no TRUNCATE left for the public roles', tr === '0', tr);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
