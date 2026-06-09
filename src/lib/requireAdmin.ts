import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

type AdminResult =
  | { ok: true; user: { id: string; email?: string } }
  | { ok: false; status: 401 | 403 };

export async function requireAdmin(request: Request): Promise<AdminResult> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { ok: false, status: 401 };

  const anonClient = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL as string,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) return { ok: false, status: 401 };

  const serviceClient = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL as string,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // TEMP DEBUG
  console.error('[requireAdmin] userId:', user.id, 'profile:', JSON.stringify(profile), 'profileErr:', JSON.stringify(profileError));

  if (!profile || (profile as { role: string }).role !== 'admin') {
    return { ok: false, status: 403 };
  }

  return { ok: true, user };
}
