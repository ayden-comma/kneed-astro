// Admin editor UI for draft / publish / history, shared by Bakeries and Articles.
// Everything here talks to /api/admin-{bakeries,articles}-cms.

type Revision = { id: string; slug: string | null; published_at: string; published_by: string | null; note: string | null };

export type DraftUi = {
  /** Call after loading a row into the form (or with null for a new item). */
  setRow(row: { id: string; slug: string; published: boolean; draft_payload: unknown; draft_updated_at: string | null } | null): void;
  liveSlug(): string | null;
  isPublished(): boolean;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function initDraftUi(opts: {
  endpoint: string;
  authHeaders: () => Promise<HeadersInit>;
  /** Re-open the editor for this id (reloads the form from the database). */
  reload: (id: string) => Promise<void>;
  onMessage: (text: string, kind: 'success' | 'error') => void;
  onChanged: () => void;
}): DraftUi {
  const banner     = document.getElementById('cms-draft-banner') as HTMLElement;
  const bannerText = document.getElementById('cms-draft-banner-text') as HTMLElement;
  const discardBtn = document.getElementById('cms-discard-btn') as HTMLButtonElement;
  const publishBtn = document.getElementById('form-publish-btn') as HTMLButtonElement;
  const unpubBtn   = document.getElementById('form-unpublish-btn') as HTMLButtonElement;
  const historyBtn = document.getElementById('form-history-btn') as HTMLButtonElement;
  const draftBtn   = document.getElementById('form-draft-btn') as HTMLButtonElement;
  const panel      = document.getElementById('cms-history') as HTMLElement;
  const list       = document.getElementById('cms-history-list') as HTMLElement;
  const closeHist  = document.getElementById('cms-history-close') as HTMLButtonElement;

  let current: { id: string; slug: string; published: boolean; hasDraft: boolean } | null = null;

  async function call(body: Record<string, unknown>) {
    const res = await fetch(opts.endpoint, { method: 'POST', headers: await opts.authHeaders(), body: JSON.stringify(body) });
    if (res.status === 401) { window.location.href = '/auth/login'; throw new Error('Session expired'); }
    const json = await res.json().catch(() => ({ error: 'Request failed' })) as any;
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json;
  }

  function render() {
    panel.hidden = true;
    if (!current) {
      banner.hidden = true;
      unpubBtn.style.display = 'none';
      historyBtn.style.display = 'none';
      publishBtn.textContent = 'Publish';
      draftBtn.textContent = 'Save Draft';
      return;
    }
    unpubBtn.style.display = current.published ? '' : 'none';
    historyBtn.style.display = '';
    publishBtn.textContent = current.published ? 'Publish changes' : 'Publish';
    draftBtn.textContent = 'Save Draft';
    if (current.published && current.hasDraft) {
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  discardBtn.addEventListener('click', async () => {
    if (!current) return;
    if (!confirm('Discard unpublished changes? The editor goes back to what is live now.')) return;
    try {
      await call({ action: 'discard', id: current.id });
      opts.onMessage('Draft discarded.', 'success');
      opts.onChanged();
      await opts.reload(current.id);
    } catch (e) { opts.onMessage((e as Error).message, 'error'); }
  });

  unpubBtn.addEventListener('click', async () => {
    if (!current) return;
    if (!confirm('Take this page offline? Visitors will get a 404 until you publish again.')) return;
    try {
      await call({ action: 'unpublish', id: current.id });
      opts.onMessage('Unpublished. The page is offline.', 'success');
      opts.onChanged();
      await opts.reload(current.id);
    } catch (e) { opts.onMessage((e as Error).message, 'error'); }
  });

  historyBtn.addEventListener('click', async () => {
    if (!current) return;
    panel.hidden = false;
    list.innerHTML = '<div class="cms-history-empty">Loading…</div>';
    try {
      const { revisions } = await call({ action: 'revisions', id: current.id }) as { revisions: Revision[] };
      if (!revisions.length) { list.innerHTML = '<div class="cms-history-empty">No published versions yet. One is saved every time you publish.</div>'; return; }
      list.innerHTML = revisions.map((r, i) => `
        <div class="cms-history-row">
          <div>
            <div class="cms-history-when">${esc(fmt(r.published_at))}${i === 0 ? ' <span class="cms-history-live">Live</span>' : ''}</div>
            <div class="cms-history-meta">${esc(r.note ?? (r.published_by ? 'Published by ' + r.published_by : 'Published'))}</div>
          </div>
          <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-rev="${r.id}">${i === 0 && !current!.hasDraft ? 'Current' : 'Restore'}</button>
        </div>`).join('');
      list.querySelectorAll<HTMLButtonElement>('button[data-rev]').forEach(b => {
        if (b.textContent === 'Current') { b.disabled = true; return; }
        b.addEventListener('click', async () => {
          if (!current) return;
          const msg = current.published
            ? 'Load this version into the editor as a draft? The live page will not change until you click Publish changes.'
            : 'Load this version into the editor?';
          if (!confirm(msg)) return;
          try {
            await call({ action: 'revert', id: current.id, revision_id: b.dataset.rev });
            opts.onMessage(current.published ? 'Version restored as a draft. Review it, then Publish changes.' : 'Version restored.', 'success');
            opts.onChanged();
            await opts.reload(current.id);
          } catch (e) { opts.onMessage((e as Error).message, 'error'); }
        });
      });
    } catch (e) {
      list.innerHTML = `<div class="cms-history-empty">${esc((e as Error).message)}</div>`;
    }
  });
  closeHist.addEventListener('click', () => { panel.hidden = true; });

  return {
    setRow(row) {
      current = row ? { id: row.id, slug: row.slug, published: !!row.published, hasDraft: !!row.draft_payload } : null;
      if (row?.draft_updated_at) {
        bannerText.textContent = `Unpublished changes, saved ${fmt(row.draft_updated_at)}. The live page is unchanged until you click Publish changes.`;
      }
      render();
    },
    liveSlug: () => current?.slug ?? null,
    isPublished: () => !!current?.published,
  };
}
