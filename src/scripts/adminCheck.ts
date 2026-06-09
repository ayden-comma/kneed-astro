import { supabase } from '../lib/supabase';

function getSettledSession() {
  return new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[ADMIN-DEBUG] event:', event, 'hasSession:', !!session);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        subscription.unsubscribe();
        resolve(session);
      }
    });
  });
}

async function checkAdmin() {
  console.log('[ADMIN-DEBUG] checkAdmin fired');

  const eventSession = await getSettledSession();
  console.log('[ADMIN-DEBUG] eventSession hasSession:', !!eventSession);

  let session = eventSession;
  if (!session) {
    const { data: { session: confirmed } } = await supabase.auth.getSession();
    console.log('[ADMIN-DEBUG] confirming getSession hasSession:', !!confirmed);
    session = confirmed;
  }

  if (!session) {
    console.log('[ADMIN-DEBUG] about to redirect to: /auth/login?next=...');
    window.location.href = '/auth/login?next=' + encodeURIComponent(window.location.pathname);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  console.log('[ADMIN-DEBUG] profile role:', (profile as { role: string } | null)?.role);

  if (!profile || profile.role !== 'admin') {
    console.log('[ADMIN-DEBUG] about to redirect to: / (not admin)');
    window.location.href = '/';
    return;
  }

  console.log('[ADMIN-DEBUG] proceeding to show admin content');
  const content = document.getElementById('admin-content');
  const loading = document.getElementById('admin-loading');
  if (content) content.style.display = '';
  if (loading) loading.style.display = 'none';
}

checkAdmin();
