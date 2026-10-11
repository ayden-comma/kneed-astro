// Watch analytics for (K)Need films (backlog F5): which films get watched, and how far.
//
// The Watch Now players announce themselves with two DOM events:
//   kneed:film-open  { iframe, videoId, title, episode, slug, kind }
//   kneed:film-close
// This module listens, attaches YouTube's official IFrame Player API to that
// iframe, and sends GA4 events:
//   film_play       first time playback starts
//   film_progress   at 25 / 50 / 75 % (param percent), each once per opening
//   film_complete   when the film ends (or reaches 95%, since many people stop at the credits)
//   film_close      when the player is closed, with how far they got (param percent)
// Params on every event: film_title, film_id, episode_number, slug, content_kind,
// percent, seconds, duration.
//
// Consent: GA4 (window.gtag) only exists after the visitor accepts analytics
// (src/lib/consent.ts). If it doesn't exist, nothing is recorded or queued. Playback
// never depends on any of this: if the API fails to load, the film still plays.
//
// Names are deliberately not GA4's built-in video_* events, so they can never be
// double-counted with GA4's automatic "video engagement" measurement.

type FilmMeta = { videoId: string; title: string; episode: number | null; slug: string; kind: 'bakery' | 'article' };
type OpenDetail = FilmMeta & { iframe: HTMLIFrameElement };

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    gtag?: (...args: unknown[]) => void;
    __kneedFilmBound?: boolean;
  }
}

const MILESTONES = [25, 50, 75];
const COMPLETE_AT = 95;

/** Pure milestone logic, kept separate so it can be tested without YouTube. */
export function createWatchState() {
  const sent = new Set<string>();
  let maxPercent = 0;
  return {
    /** Feed the current position; returns the events to send, each at most once. */
    update(seconds: number, duration: number, ended = false): Array<{ name: string; percent: number }> {
      if (!(duration > 0)) return [];
      const pct = ended ? 100 : Math.min(100, Math.floor((seconds / duration) * 100));
      maxPercent = Math.max(maxPercent, pct);
      const out: Array<{ name: string; percent: number }> = [];
      for (const m of MILESTONES) {
        if (maxPercent >= m && !sent.has('p' + m)) { sent.add('p' + m); out.push({ name: 'film_progress', percent: m }); }
      }
      if ((ended || maxPercent >= COMPLETE_AT) && !sent.has('complete')) { sent.add('complete'); out.push({ name: 'film_complete', percent: maxPercent }); }
      return out;
    },
    started(): boolean { if (sent.has('play')) return false; sent.add('play'); return true; },
    maxPercent: () => maxPercent,
  };
}

function send(name: string, meta: FilmMeta, extra: Record<string, unknown>) {
  if (typeof window.gtag !== 'function') return;   // no consent, no tracking
  window.gtag('event', name, {
    film_title: meta.title, film_id: meta.videoId, episode_number: meta.episode ?? undefined,
    slug: meta.slug, content_kind: meta.kind, ...extra,
  });
}

let apiPromise: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube API failed to load')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

let current: { meta: FilmMeta; player: any; timer: number | undefined; state: ReturnType<typeof createWatchState>; duration: number } | null = null;

function stop(reason: 'close' | 'replace') {
  if (!current) return;
  window.clearInterval(current.timer);
  if (reason === 'close' && current.state.maxPercent() > 0) {
    send('film_close', current.meta, { percent: current.state.maxPercent(), duration: Math.round(current.duration) });
  }
  current = null;
}

async function start(d: OpenDetail) {
  stop('replace');
  const meta: FilmMeta = { videoId: d.videoId, title: d.title, episode: d.episode, slug: d.slug, kind: d.kind };
  const state = createWatchState();
  const session = { meta, player: null as any, timer: undefined as number | undefined, state, duration: 0 };
  current = session;

  let YT: any;
  try { YT = await loadApi(); } catch { return; }       // film keeps playing; we just don't measure
  if (current !== session) return;                      // closed before the API arrived

  const tick = () => {
    try {
      const dur = session.player.getDuration?.() ?? 0;
      const t = session.player.getCurrentTime?.() ?? 0;
      session.duration = dur;
      for (const ev of state.update(t, dur)) send(ev.name, meta, { percent: ev.percent, seconds: Math.round(t), duration: Math.round(dur) });
    } catch { /* player gone */ }
  };

  session.player = new YT.Player(d.iframe, {
    events: {
      onStateChange: (e: { data: number }) => {
        if (current !== session) return;
        if (e.data === YT.PlayerState.PLAYING) {
          if (state.started()) send('film_play', meta, { percent: 0, seconds: 0, duration: Math.round(session.player.getDuration?.() ?? 0) });
          window.clearInterval(session.timer);
          session.timer = window.setInterval(tick, 1000);
        } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) {
          window.clearInterval(session.timer);
          tick();
        } else if (e.data === YT.PlayerState.ENDED) {
          window.clearInterval(session.timer);
          const dur = session.player.getDuration?.() ?? session.duration;
          for (const ev of state.update(dur, dur, true)) send(ev.name, meta, { percent: ev.percent, seconds: Math.round(dur), duration: Math.round(dur) });
        }
      },
    },
  });
}

export function bindFilmAnalytics() {
  if (window.__kneedFilmBound) return;
  window.__kneedFilmBound = true;
  document.addEventListener('kneed:film-open', (e) => { void start((e as CustomEvent<OpenDetail>).detail); });
  document.addEventListener('kneed:film-close', () => stop('close'));
}
