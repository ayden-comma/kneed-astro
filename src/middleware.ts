import { defineMiddleware } from 'astro:middleware';

const GATE_ENABLED = true; // set false at launch to disable the holding page
const UNLOCK_TOKEN = 'ok-2026';

function holdingPage(wrong: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="robots" content="noindex"/>
  <title>(K)NEED</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@200;300;400&family=Archivo+Narrow:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #0e0c0a; color: #f2ede6; font-family: 'Josefin Sans', 'Arial Narrow', sans-serif; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .gate { display: flex; flex-direction: column; align-items: center; gap: 2.5rem; padding: 2rem; text-align: center; }
    .gate-logo { color: #f2ede6; width: clamp(180px, 42vw, 300px); display: block; }
    .gate-eyebrow { font-family: 'Archivo Narrow', 'Arial Narrow', sans-serif; font-size: 0.6rem; font-weight: 500; letter-spacing: 0.45em; text-transform: uppercase; color: rgba(242,237,230,0.32); }
    .gate-form { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; }
    .gate-error { font-family: 'Archivo Narrow', 'Arial Narrow', sans-serif; font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; color: #c8833a; }
    .gate-input { width: 240px; padding: 0.625rem 1rem; background: rgba(242,237,230,0.05); border: 1px solid rgba(242,237,230,0.15); border-radius: 2px; color: #f2ede6; font-family: 'Josefin Sans', sans-serif; font-size: 0.875rem; letter-spacing: 0.12em; outline: none; text-align: center; transition: border-color 0.2s; }
    .gate-input::placeholder { color: rgba(242,237,230,0.3); letter-spacing: 0.12em; }
    .gate-input:focus { border-color: rgba(242,237,230,0.38); }
    .gate-btn { padding: 0.5rem 2.25rem; background: transparent; border: 1px solid rgba(242,237,230,0.25); color: rgba(242,237,230,0.6); font-family: 'Archivo Narrow', 'Arial Narrow', sans-serif; font-size: 0.6rem; font-weight: 500; letter-spacing: 0.38em; text-transform: uppercase; cursor: pointer; transition: border-color 0.2s, color 0.2s; }
    .gate-btn:hover { border-color: #c8833a; color: #c8833a; }
  </style>
</head>
<body>
  <div class="gate">
    <svg class="gate-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 179.04 38.1" aria-label="(K)NEED">
      <defs><style>.gl{fill:currentColor}</style></defs>
      <g>
        <path class="gl" d="M9.45,13.44c.48-1.74,1.1-3.29,1.86-4.67.76-1.37,1.56-2.5,2.4-3.41l.57.81c-.76.88-1.49,1.97-2.19,3.26-.7,1.29-1.27,2.74-1.69,4.36-.43,1.62-.65,3.38-.65,5.28s.21,3.63.65,5.25c.43,1.62.99,3.07,1.69,4.35.7,1.28,1.43,2.36,2.19,3.24l-.57.81c-.84-.88-1.64-2.01-2.4-3.38-.76-1.37-1.38-2.93-1.86-4.67-.48-1.74-.72-3.62-.72-5.64s.24-3.87.72-5.61Z"/>
        <path class="gl" d="M47.76,24.69c-.48,1.74-1.1,3.29-1.85,4.67-.75,1.37-1.54,2.49-2.38,3.38l-.6-.81c.78-.88,1.52-1.96,2.21-3.24.69-1.28,1.25-2.73,1.68-4.35.43-1.62.65-3.37.65-5.25s-.21-3.66-.65-5.28-.99-3.07-1.68-4.35c-.69-1.28-1.43-2.36-2.21-3.24l.6-.84c.84.9,1.63,2.04,2.38,3.41.75,1.37,1.37,2.92,1.85,4.67.48,1.74.72,3.62.72,5.64s-.24,3.87-.72,5.61Z"/>
      </g>
      <g>
        <path class="gl" d="M81.9,30.11l-16.8-19.65.27-.3.03,19.5h-1.02V8.09h.06l16.89,19.83-.36.06V8.48h.96v21.63h-.03Z"/>
        <path class="gl" d="M97.89,8.48h12.84v.99h-11.82v9.03h10.65v.96h-10.65v9.21h12.24v.99h-13.26V8.48Z"/>
        <path class="gl" d="M125.94,8.48h12.84v.99h-11.82v9.03h10.65v.96h-10.65v9.21h12.24v.99h-13.26V8.48Z"/>
        <path class="gl" d="M153.99,29.66V8.48h5.04c2.02,0,3.75.33,5.19.98,1.44.65,2.6,1.5,3.5,2.55.89,1.05,1.54,2.2,1.96,3.45s.63,2.49.63,3.71c0,1.6-.28,3.04-.84,4.33-.56,1.29-1.32,2.4-2.28,3.31-.96.92-2.05,1.63-3.29,2.12-1.23.49-2.52.74-3.88.74h-6.03ZM155.01,28.67h4.68c1.32,0,2.56-.22,3.72-.66,1.16-.44,2.17-1.07,3.04-1.91.87-.83,1.55-1.83,2.05-3.01.5-1.18.75-2.51.75-3.99,0-1.18-.2-2.34-.6-3.48-.4-1.14-1.02-2.17-1.85-3.11-.83-.93-1.89-1.67-3.18-2.21s-2.82-.81-4.58-.81h-4.05v19.17Z"/>
      </g>
      <g>
        <path class="gl" d="M23.46,18.35l-.06,1.02v-.18l11.04-10.71h1.32l-8.76,8.55,9.9,12.63h-1.29l-9.39-11.97-2.79,2.67.03,9.3h-1.05V8.48h1.05v9.87Z"/>
      </g>
    </svg>
    <div class="gate-eyebrow">Coming Soon</div>
    <form class="gate-form" method="POST" action="/api/unlock">
      ${wrong ? '<div class="gate-error">Incorrect password</div>' : ''}
      <input class="gate-input" type="password" name="pw" placeholder="Password" autofocus autocomplete="current-password"/>
      <button class="gate-btn" type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!GATE_ENABLED) return next();

  const { pathname } = context.url;

  // Always let through: auth flows, API calls, and static assets
  // /auth/ must bypass so the OAuth callback is never intercepted by the gate
  // /api/  must bypass so fetch-based calls don't receive holding-page HTML
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/fonts/')
  ) {
    return next();
  }

  // Unlocked — serve normally
  const token = context.cookies.get('kneed_unlocked')?.value;
  if (token === UNLOCK_TOKEN) return next();

  // Gate: return holding page. 503 + noindex so crawlers (which never hold the
  // cookie) are told "not yet" and never index the Coming Soon page as real content.
  const wrong = context.url.searchParams.get('wrong') === '1';
  return new Response(holdingPage(wrong), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '86400',
      'X-Robots-Tag': 'noindex',
    },
  });
});
