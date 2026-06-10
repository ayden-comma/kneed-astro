const CONSENT_KEY = 'kneed-consent';

type ConsentRecord = { value: 'granted' | 'denied'; ts: string };

function getConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentRecord;
  } catch { return null; }
}

function setConsent(value: 'granted' | 'denied'): void {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ value, ts: new Date().toISOString() }));
}

function loadTrackers(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__kneedTrackersLoaded) return;
  w.__kneedTrackersLoaded = true;

  // GA4
  const ga = document.createElement('script');
  ga.async = true;
  ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-G6ZQHC582Q';
  document.head.appendChild(ga);
  w.dataLayer = w.dataLayer || [];
  // Must be a regular function — gtag.js reads Arguments objects, not arrays.
  // Arrow functions and rest-params both produce arrays and are silently ignored.
  // eslint-disable-next-line prefer-rest-params
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', 'G-G6ZQHC582Q');

  // Meta Pixel
  if (!w.fbq) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: any = function(...a: unknown[]) { n.callMethod ? n.callMethod.apply(n, a) : n.queue.push(a); };
    w.fbq = n; if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = document.createElement('script');
    t.async = true; t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const s = document.getElementsByTagName('script')[0];
    s.parentNode!.insertBefore(t, s);
  }
  w.fbq('init', '3290406697805340');
  w.fbq('track', 'PageView');
}

function dismiss(el: HTMLElement): void {
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  setTimeout(() => el.remove(), 240);
}

function injectBannerStyles(): void {
  if (document.getElementById('kneed-consent-styles')) return;
  const style = document.createElement('style');
  style.id = 'kneed-consent-styles';
  style.textContent = `
    .kneed-consent-btn {
      padding: 0.45rem 1.25rem;
      border-radius: var(--r-pill);
      font-family: var(--font-cond);
      font-size: 0.65rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.18s, color 0.18s, border-color 0.18s;
    }
    .kneed-consent-btn--decline {
      border: 1px solid var(--border-md);
      background: transparent;
      color: var(--parchment);
    }
    .kneed-consent-btn--accept {
      border: 1px solid transparent;
      background: var(--parchment);
      color: var(--ink);
    }
    .kneed-consent-btn:hover,
    .kneed-consent-btn:focus-visible {
      background: var(--amber);
      color: #fff;
      border-color: var(--amber);
    }
  `;
  document.head.appendChild(style);
}

function showBannerInternal(): void {
  if (document.getElementById('kneed-consent-banner')) return;

  injectBannerStyles();

  const banner = document.createElement('div');
  banner.id = 'kneed-consent-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.setAttribute('tabindex', '-1');
  banner.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:9999',
    'background:var(--surface-2)',
    'border-top:1px solid var(--border-md)',
    'padding:0.875rem 1.5rem',
    'display:flex', 'align-items:center', 'gap:1.25rem', 'flex-wrap:wrap',
    'justify-content:space-between',
    'font-family:var(--font-body)',
    'transition:opacity 0.24s ease,transform 0.24s ease',
  ].join(';');

  banner.innerHTML = `
    <p style="margin:0;font-size:0.8rem;font-weight:300;color:var(--p-50);line-height:1.55;flex:1;min-width:14rem;max-width:52rem;">
      We use Google Analytics and the Meta Pixel for analytics and advertising.
      <a href="/privacy" style="color:var(--parchment);text-decoration:underline;text-underline-offset:3px;">Learn more in our Privacy Policy</a>.
    </p>
    <div style="display:flex;gap:0.5rem;flex-shrink:0;" role="group" aria-label="Consent options">
      <button id="kneed-consent-decline" class="kneed-consent-btn kneed-consent-btn--decline" type="button">Decline</button>
      <button id="kneed-consent-accept"  class="kneed-consent-btn kneed-consent-btn--accept"  type="button">Accept</button>
    </div>
  `;

  document.body.appendChild(banner);
  banner.focus();

  banner.querySelector<HTMLButtonElement>('#kneed-consent-decline')!.addEventListener('click', () => {
    setConsent('denied');
    dismiss(banner);
  });

  banner.querySelector<HTMLButtonElement>('#kneed-consent-accept')!.addEventListener('click', () => {
    setConsent('granted');
    dismiss(banner);
    loadTrackers();
  });
}

// Module-level flag: skip the first astro:page-load fire (initial page already
// tracked by loadTrackers()). Resets naturally on full-page reloads since the
// module re-executes from scratch.
let _navArmed = false;

function handleNavPageView(): void {
  if (!_navArmed) { _navArmed = true; return; }
  if (window.location.pathname === '/auth/callback') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (!w.__kneedTrackersLoaded) return;
  w.gtag?.('event', 'page_view', { page_location: window.location.href, page_title: document.title });
  w.fbq?.('track', 'PageView');
}

export function initConsent(): void {
  if (window.location.pathname === '/auth/callback') return;
  document.addEventListener('astro:page-load', handleNavPageView);
  const record = getConsent();
  if (!record) { showBannerInternal(); return; }
  if (record.value === 'granted') loadTrackers();
}

export function reopenConsent(): void {
  try { localStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ }
  const existing = document.getElementById('kneed-consent-banner');
  if (existing) existing.remove();
  showBannerInternal();
}
