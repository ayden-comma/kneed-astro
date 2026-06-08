import type { APIRoute } from 'astro';

export const prerender = false;

const UNLOCK_TOKEN = 'ok-2026';
const PASSWORD = 'commafilms';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const POST: APIRoute = async ({ request }) => {
  let pw = '';
  try {
    const form = await request.formData();
    pw = (form.get('pw') as string) ?? '';
  } catch {
    // malformed body — treat as wrong password
  }

  if (pw === PASSWORD) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `kneed_unlocked=${UNLOCK_TOKEN}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`,
      },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { 'Location': '/?wrong=1' },
  });
};
