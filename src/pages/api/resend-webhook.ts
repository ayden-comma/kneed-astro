import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

// event.type → email_events.event_type. Unmapped types are acknowledged (200) but not stored.
const TYPE_MAP: Record<string, string> = {
  'email.clicked':     'clicked',
  'email.sent':        'sent',
  'email.delivered':   'delivered',
  'email.bounced':     'bounced',
  'email.complained':  'complained',
};

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Constant-time compare of two equal-length base64 strings.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacBase64(keyBytes: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

export const POST: APIRoute = async ({ request }) => {
  const text = (s: string, status: number) => new Response(s, { status, headers: { 'Content-Type': 'text/plain' } });

  // 1. Raw body BEFORE any JSON parse (signature is over the exact bytes).
  const rawBody = await request.text();

  // 2. Svix headers.
  const svixId        = request.headers.get('svix-id') ?? '';
  const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
  const svixSignature = request.headers.get('svix-signature') ?? '';
  if (!svixId || !svixTimestamp || !svixSignature) return text('Missing signature headers', 400);

  // Replay guard: reject if timestamp is >5 minutes from now.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return text('Timestamp out of tolerance', 400);

  // 3. Verify signature.
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return text('Server configuration error', 500);
  }
  const secretB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let expectedSig: string;
  try {
    expectedSig = await hmacBase64(base64ToBytes(secretB64), `${svixId}.${svixTimestamp}.${rawBody}`);
  } catch (e) {
    console.error('[resend-webhook] signature computation failed:', e instanceof Error ? e.message : String(e));
    return text('Bad signature secret', 400);
  }
  // Header is a space-separated list of "v1,<sig>" entries; valid if any matches.
  const provided = svixSignature.split(' ').map(part => part.split(',')[1] ?? '').filter(Boolean);
  const ok = provided.some(sig => timingSafeEqual(sig, expectedSig));
  if (!ok) return text('Invalid signature', 401);

  // 4. Parse payload.
  let payload: { type?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return text('Malformed JSON', 400);
  }

  const eventType = payload.type ? TYPE_MAP[payload.type] : undefined;
  if (!eventType) return text('Ignored', 200); // acknowledge unmapped event types without storing

  const data = payload.data ?? {};
  // Resend webhook delivers tags as an OBJECT/map (e.g. { bakery_id: "...", type: "episode" }),
  // NOT an array of {name,value} — verified against Resend's email.clicked payload docs.
  const tags = (data.tags ?? {}) as Record<string, unknown>;
  const bakeryId = typeof tags.bakery_id === 'string' ? tags.bakery_id : null;

  const row = {
    svix_id:         svixId,
    resend_email_id: data.email_id ?? null,
    event_type:      eventType,
    recipient:       (Array.isArray(data.to) ? (data.to[0] ?? '') : '').toLowerCase(),
    bakery_id:       bakeryId,
    clicked_url:     data.click?.link ?? null,
    event_at:        data.created_at ?? null,
    raw:             payload,
  };

  try {
    const svc = createClient(import.meta.env.PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY);
    // Idempotent on svix_id: INSERT ... ON CONFLICT (svix_id) DO NOTHING.
    const { error } = await svc
      .from('email_events')
      .upsert([row], { onConflict: 'svix_id', ignoreDuplicates: true });
    if (error) {
      console.error('[resend-webhook] insert failed:', error.message);
      return text('Insert failed', 500); // 5xx → Resend will retry
    }
  } catch (e) {
    console.error('[resend-webhook] threw:', e instanceof Error ? e.message : String(e));
    return text('Internal error', 500);
  }

  return text('OK', 200);
};
