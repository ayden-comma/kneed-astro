import { supabase } from '../lib/supabase';

function getSettledSession() {
  return new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        subscription.unsubscribe();
        resolve(session);
      }
    });
  });
}

async function checkAdmin() {
  const session = await getSettledSession();

  if (!session) {
    window.location.href = '/auth/login?next=' + encodeURIComponent(window.location.pathname);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    window.location.href = '/';
    return;
  }

  const content = document.getElementById('admin-content');
  const loading = document.getElementById('admin-loading');
  if (content) content.style.display = '';
  if (loading) loading.style.display = 'none';
}

checkAdmin();
