// Helpers for signed-in-only actions (save, rate, comment, vote, delete).
//
// Two problems these fix:
//  1. The session used to be read once at page load and reused at click time.
//     If you'd signed out in another tab, or the session had lapsed, the click
//     wrote nothing and said nothing. Now every action checks the session at the
//     moment of the click and sends you to sign in (and back) if it's gone.
//  2. Write errors were swallowed. Now the UI is put back the way it was and a
//     short message says it didn't work.

import { supabase } from './supabase';

/** The signed-in user's id right now, or null. Refreshes an expired token if it can. */
export async function liveUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Sign-in URL that brings you back to this exact spot afterwards. */
export function loginHref(): string {
  const here = window.location.pathname + window.location.search + window.location.hash;
  return '/auth/login?next=' + encodeURIComponent(here);
}

export function goToLogin(): void {
  window.location.href = loginHref();
}

type WriteError = { code?: string; message?: string; status?: number } | null | undefined;

/** True when a failed write was refused because of who you are, not what you sent. */
export function isAuthError(err: WriteError): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  if (code === '42501' || code.startsWith('PGRST3')) return true; // RLS refusal, JWT problems
  if (err.status === 401 || err.status === 403) return true;
  return /jwt|not authenticated|permission denied|row-level security/i.test(err.message ?? '');
}

/**
 * Handle a failed signed-in write. Auth problems send you to sign in; anything
 * else shows `message` briefly. Returns true if there was an error, so callers
 * can `if (reportWriteError(error, '…')) { undo; return; }`.
 */
export function reportWriteError(err: WriteError, message: string): boolean {
  if (!err) return false;
  console.error('[gated] write failed:', err);
  if (isAuthError(err)) { goToLogin(); return true; }
  flash(message);
  return true;
}

let flashTimer: number | undefined;
/** A small, polite notice at the bottom of the screen. */
export function flash(message: string): void {
  let el = document.getElementById('gated-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gated-flash';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:1.5rem', 'transform:translateX(-50%)', 'z-index:10000',
      'max-width:min(28rem,calc(100vw - 2rem))', 'padding:0.7rem 1.1rem', 'border-radius:0.6rem',
      'background:var(--surface-2,#1e1a16)', 'color:var(--parchment,#f2ede6)',
      'border:1px solid var(--border-md,rgba(242,237,230,0.15))', 'box-shadow:0 12px 32px rgba(0,0,0,0.45)',
      'font:300 0.85rem/1.45 var(--font-body,system-ui,sans-serif)', 'text-align:center',
      'transition:opacity 0.2s ease', 'opacity:0',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => { el!.style.opacity = '1'; });
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { el!.style.opacity = '0'; }, 4000);
}

/**
 * Run `init` once per rendered page. Pages using Astro's ClientRouter fire
 * `astro:page-load` on the first load as well as on every navigation, so a
 * script that also calls init() directly runs twice and binds every handler
 * twice (one star click → two ratings). Marking the page's root element makes
 * a second call for the same DOM a no-op, while a fresh page after navigation
 * (new DOM, no mark) initialises normally.
 */
export function oncePerPage(key: string, root: Element | null, init: () => void | Promise<void>): void {
  if (!root) return;
  const attr = 'data-init-' + key;
  if (root.hasAttribute(attr)) return;
  root.setAttribute(attr, '1');
  void init();
}
