import { supabase } from '../lib/supabase';

async function checkAdmin() {
  const { data: { session } } = await supabase.auth.getSession();

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
