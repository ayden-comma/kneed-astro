const PLACES_KEY = 'AIzaSyB6Dv_E_XEjozZqi_Tenk4AepcpYWHNUas';

export function bindPlacesAutocomplete(
  input: HTMLInputElement,
  list: HTMLUListElement,
  includedPrimaryTypes: string[],
): void {
  let timer: ReturnType<typeof setTimeout>;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { list.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY },
          body: JSON.stringify({ input: q, includedRegionCodes: ['au'], includedPrimaryTypes }),
        });
        const data = await res.json() as { suggestions?: { placePrediction?: { text?: { text?: string } } }[] };
        const preds = data.suggestions ?? [];
        list.innerHTML = '';
        if (!preds.length) { list.style.display = 'none'; return; }
        preds.slice(0, 5).forEach(s => {
          const text = s.placePrediction?.text?.text || '';
          const li = document.createElement('li');
          li.textContent   = text;
          li.style.cssText = 'padding:0.5rem 0.75rem; cursor:pointer; color:var(--parchment); font-size:0.875rem;';
          li.onmouseenter  = () => { li.style.background = 'rgba(255,255,255,0.06)'; };
          li.onmouseleave  = () => { li.style.background = ''; };
          li.onclick       = () => { input.value = text; list.style.display = 'none'; };
          list.appendChild(li);
        });
        list.style.display = 'block';
      } catch (_) { list.style.display = 'none'; }
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target as Node) && !list.contains(e.target as Node)) {
      list.style.display = 'none';
    }
  });
}
