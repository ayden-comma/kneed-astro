// Sign-out without a GET side effect.
//
// /auth/logout used to sign you out the moment it loaded, so anything that
// loaded that address (a link from another site, a bookmark, a preloaded
// page) logged you out. Now the "Sign out" links carry data-signout and are
// handled here on click; the /auth/logout page itself only signs out when its
// button is pressed.

import { supabase } from './supabase';

export async function signOutAndLeave(to = '/'): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* sign out locally regardless */ }
  window.location.href = to;
}

/** Register once per document. Capture phase, so it runs before ClientRouter's link handling. */
export function bindSignOutLinks(): void {
  const w = window as unknown as { __kneedSignOutBound?: boolean };
  if (w.__kneedSignOutBound) return;
  w.__kneedSignOutBound = true;
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-signout]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    void signOutAndLeave();
  }, true);
}
