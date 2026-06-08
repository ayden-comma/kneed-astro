import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function cloudinarySign(params: Record<string, string>, apiSecret: string): Promise<string> {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const message = sorted + apiSecret;
  const encoded = new TextEncoder().encode(message);
  const hashBuf = await crypto.subtle.digest('SHA-1', encoded);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // ── Auth ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL as string,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse form ───────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const entry = formData.get('image');
  if (!entry || !(entry instanceof File)) return json({ error: 'No image file provided' }, 400);

  // ── Validate ─────────────────────────────────────────────────
  if (!entry.type.startsWith('image/')) return json({ error: 'Only image files are allowed' }, 400);
  if (entry.size > MAX_BYTES) return json({ error: 'File too large (max 10 MB)' }, 400);

  // ── Upload via Cloudinary REST API ───────────────────────────
  const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey    = import.meta.env.CLOUDINARY_API_KEY as string;
  const apiSecret = import.meta.env.CLOUDINARY_API_SECRET as string;

  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signParams = { folder: 'kneed', timestamp };
    const signature  = await cloudinarySign(signParams, apiSecret);

    const body = new FormData();
    body.append('file', entry);
    body.append('api_key', apiKey);
    body.append('timestamp', timestamp);
    body.append('folder', 'kneed');
    body.append('signature', signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body },
    );

    if (!res.ok) {
      const err = await res.text();
      return json({ error: `Cloudinary error: ${err}` }, 502);
    }

    const data = await res.json() as { secure_url: string };
    return json({ url: data.secure_url }, 200);
  } catch {
    return json({ error: 'Upload failed' }, 500);
  }
};
