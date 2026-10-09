// Signed preview links.
//
// A preview URL used to be `?preview=true`, which anyone could type to see
// unpublished pages. Now an admin asks the CMS API for a link, and the API
// returns `?draft=<token>`: the record id plus an expiry, HMAC-signed on the
// server. The page renders the draft only if the signature checks out, then
// reads with the service role. Without a valid token the page behaves exactly
// like the public page (404 for anything unpublished).
//
// The parameter is `draft`, not `preview`: `?preview=` belongs to the pre-launch
// gate's share links (src/middleware.ts), and the two must not be confused.
//
// The signing key is derived from SUPABASE_SERVICE_ROLE_KEY with a fixed
// label, so no new secret has to be configured. Rotating the service key
// invalidates every outstanding preview link, which is the right behaviour.

import type { CmsTable } from './cmsDraft';

const LABEL = 'kneed-preview-v1';
const TTL_SECONDS = 60 * 60 * 24; // a day: long enough to share a link with a collaborator

type Claims = { t: CmsTable; id: string; exp: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(LABEL + ':' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signPreview(secret: string, table: CmsTable, id: string, now = Date.now()): Promise<string> {
  const claims: Claims = { t: table, id, exp: Math.floor(now / 1000) + TTL_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return body + '.' + b64url(sig);
}

/** Returns the claims if the token is genuine, unexpired and for this table; otherwise null. */
export async function verifyPreview(secret: string | undefined, token: string | null, table: CmsTable, now = Date.now()): Promise<Claims | null> {
  if (!secret || !token || token.length > 1024) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Claims;
    if (claims.t !== table || typeof claims.id !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}
