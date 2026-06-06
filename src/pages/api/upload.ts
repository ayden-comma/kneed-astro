import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import cloudinary from '../../lib/cloudinary';

export const prerender = false;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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

  // ── Upload ───────────────────────────────────────────────────
  try {
    const buffer = Buffer.from(await entry.arrayBuffer());

    const secureUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'kneed', resource_type: 'image', transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }] },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });

    return json({ url: secureUrl }, 200);
  } catch {
    return json({ error: 'Upload failed' }, 500);
  }
};
