/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  ALL MAP CODE LIVES HERE — DO NOT add map init anywhere else  ⚠️    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                          ║
 * ║  Two map surfaces, each with its own init/destroy pair:                 ║
 * ║                                                                          ║
 * ║    initMainMap / destroyMainMap      →  /map                            ║
 * ║    initBakeryMap / destroyBakeryMap  →  /bakeries/[slug]                ║
 * ║                                                                          ║
 * ║  Lifecycle wiring in each page's <script> (module, runs once):          ║
 * ║                                                                          ║
 * ║    document.addEventListener('astro:before-swap', destroyXxx);          ║
 * ║    document.addEventListener('astro:page-load', () => {                 ║
 * ║      if (document.getElementById('container-id')) initXxx();            ║
 * ║    });                                                                   ║
 * ║                                                                          ║
 * ║  Module scripts run once per session. The persistent listeners handle   ║
 * ║  every subsequent SPA navigation — no registerPageInit needed.          ║
 * ║                                                                          ║
 * ║  Data is passed via <script type="application/json"> tags in each page, ║
 * ║  never via define:vars (which bakes data into the script text and        ║
 * ║  prevents code sharing between pages).                                  ║
 * ║                                                                          ║
 * ║  Leaflet 1.9.4 — do not upgrade without testing z-index behaviour.      ║
 * ║                                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ──────────────────────────────────────────────────────────────────────────
// SHARED: Leaflet loader
// ──────────────────────────────────────────────────────────────────────────
//
// Lazy-loads Leaflet CSS + JS from CDN. Safe to call from multiple surfaces —
// the id guards prevent duplicate tags; window.L guards prevent double-init.
// Version pinned at 1.9.4 — do not upgrade without testing z-index.

function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  if (!document.getElementById('leaflet-css')) {
    var css = document.createElement('link');
    css.id  = 'leaflet-css'; css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
  }
  var existing = document.getElementById('leaflet-js');
  if (existing) {
    if (window.L) { cb(); return; }
    existing.addEventListener('load', function() { if (window.L) cb(); });
    return;
  }
  var js = document.createElement('script');
  js.id   = 'leaflet-js';
  js.src  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  js.onload = function() { cb(); };
  document.head.appendChild(js);
}


// ──────────────────────────────────────────────────────────────────────────
// MAIN MAP  (/map)
// ──────────────────────────────────────────────────────────────────────────
//
// DATA MODEL
//   BAKERIES — one entry per unique bakery. Drives the sidebar and popup.
//   PINS     — one entry per map marker. Each pin has a bakeryIdx that
//              points back into BAKERIES. _mainMarkers[] is indexed the
//              same way as PINS.
//
// Data is read from <script type="application/json" id="kneed-map-data">
// in map.astro. Never from define:vars.

var _map          = null;
var _popup        = null;
var _mainMarkers  = [];
var _activeLL     = null;
var _bakeries     = null;
var _pins         = null;

function makeMarkerIcon(active) {
  var size   = active ? 16 : 12;
  var half   = size / 2;
  var bg     = active ? '#f2ede6' : '#c8833a';
  var border = active ? '#c8833a' : 'rgba(242,237,230,0.85)';
  var shadow = active
    ? '0 0 0 3px rgba(200,131,58,0.25), 0 2px 12px rgba(0,0,0,0.5)'
    : '0 2px 8px rgba(0,0,0,0.45)';
  return L.divIcon({
    className: '',
    html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:' + bg + ';border:2px solid ' + border + ';'
        + 'box-shadow:' + shadow + ';'
        + 'transition:width 0.2s,height 0.2s,background 0.2s,box-shadow 0.2s;'
        + 'cursor:pointer;"></div>',
    iconSize:   [size, size],
    iconAnchor: [half, half],
  });
}

function fillPopup(bakery, addr, latlng) {
  document.getElementById('map-popup-img').src = bakery.thumbnail;
  document.getElementById('map-popup-img').alt = bakery.name;
  document.getElementById('map-popup-cat').textContent  = bakery.category;
  document.getElementById('map-popup-name').textContent = bakery.name;

  var addrEl   = document.getElementById('map-popup-addr');
  addrEl.innerHTML = '';
  var addrLink = document.createElement('a');
  addrLink.href        = (bakery.name && latlng)
    ? 'https://www.google.com/maps/search/' + encodeURIComponent(bakery.name) + '/@' + latlng.lat + ',' + latlng.lng + ',17z'
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  addrLink.target      = '_blank';
  addrLink.rel         = 'noopener noreferrer';
  addrLink.textContent = addr;
  addrLink.className   = 'map-popup-addr-link';
  addrEl.appendChild(addrLink);

  var hoursRow = document.getElementById('map-popup-hours-row');
  var hoursEl  = document.getElementById('map-popup-hours');
  if (bakery.hours) {
    hoursEl.textContent    = bakery.hours;
    hoursRow.style.display = '';
  } else {
    hoursRow.style.display = 'none';
  }

  var actions = document.getElementById('map-popup-actions');
  actions.innerHTML = '';

  var watchBtn = document.createElement('a');
  watchBtn.className   = 'map-popup-btn map-popup-btn-primary';
  watchBtn.textContent = 'Watch Story';
  if (bakery.slug) {
    watchBtn.href = '/bakeries/' + bakery.slug;
  } else {
    watchBtn.style.opacity       = '0.4';
    watchBtn.style.pointerEvents = 'none';
  }
  actions.appendChild(watchBtn);

  var webBtn = document.createElement('a');
  webBtn.className   = 'map-popup-btn map-popup-btn-ghost';
  webBtn.textContent = 'Website';
  if (bakery.website) {
    webBtn.href   = bakery.website.startsWith('http') ? bakery.website : 'https://' + bakery.website;
    webBtn.target = '_blank';
    webBtn.rel    = 'noopener noreferrer';
  } else {
    webBtn.style.opacity       = '0.4';
    webBtn.style.pointerEvents = 'none';
  }
  actions.appendChild(webBtn);
}

function positionPopup(latlng) {
  var pt    = _map.latLngToContainerPoint(latlng);
  var mapEl = document.getElementById('kneed-map');
  var mapW  = mapEl.offsetWidth;
  var mapH  = mapEl.offsetHeight;
  var popW  = _popup.offsetWidth  || 300;
  var popH  = _popup.offsetHeight || 280;
  var gap   = 14;
  var half  = 7;

  var left, origin;
  if (pt.x + half + gap + popW < mapW - 8) {
    left = pt.x + half + gap; origin = 'left center';
  } else {
    left = pt.x - half - gap - popW; origin = 'right center';
  }
  left = Math.max(8, Math.min(left, mapW - popW - 8));

  var top = Math.round(pt.y - popH / 2);
  top = Math.max(8, Math.min(top, mapH - popH - 8));

  _popup.style.left            = left + 'px';
  _popup.style.top             = top  + 'px';
  _popup.style.transformOrigin = origin;
}

function showMainPopup(bakery, addr, latlng) {
  fillPopup(bakery, addr, latlng);
  _activeLL = latlng;
  positionPopup(latlng);
  _popup.classList.add('visible');
}

function hideMainPopup() {
  _popup.classList.remove('visible');
  _activeLL = null;
}

function onMainMapMove() {
  if (!_activeLL || !_popup.classList.contains('visible')) return;
  positionPopup(_activeLL);
}

function selectBakery(bakeryIdx, addr, latlng) {
  _mainMarkers.forEach(function(m, pinIdx) {
    var isSelected = _pins[pinIdx].bakeryIdx === bakeryIdx;
    m.setIcon(makeMarkerIcon(isSelected));
    m.setOpacity(isSelected ? 1 : 0.50);
  });
  document.querySelectorAll('.map-bakery-item').forEach(function(el, i) {
    el.classList.toggle('active', i === bakeryIdx);
  });
  var activeItem = document.querySelector('.map-bakery-item[data-index="' + bakeryIdx + '"]');
  if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showMainPopup(_bakeries[bakeryIdx], addr, latlng);
}

function clearMainSelection() {
  _mainMarkers.forEach(function(m) { m.setIcon(makeMarkerIcon(false)); m.setOpacity(1); });
  _activeLL = null;
  document.querySelectorAll('.map-bakery-item').forEach(function(el) {
    el.classList.remove('active');
  });
}

function _doInitMainMap() {
  var container = document.getElementById('kneed-map');
  if (!container || container._leaflet_id) return;
  if (container.offsetHeight === 0) {
    setTimeout(_doInitMainMap, 150);
    return;
  }

  _popup = document.getElementById('map-popup');
  if (!_popup) return;

  _map = L.map('kneed-map', {
    center: [-37.814, 144.970],
    zoom: 12,
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: true,
    touchZoom: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(_map);

  _pins.forEach(function(pin) {
    var marker = L.marker([pin.lat, pin.lng], { icon: makeMarkerIcon(false) }).addTo(_map);
    _mainMarkers.push(marker);
    marker.on('click', function(e) {
      L.DomEvent.stopPropagation(e);
      selectBakery(pin.bakeryIdx, pin.addr, marker.getLatLng());
    });
  });

  document.querySelectorAll('.map-bakery-item').forEach(function(item) {
    item.onclick = function() {
      var bakeryIdx  = parseInt(item.dataset.index, 10);
      var bakeryPins = _pins.filter(function(p) { return p.bakeryIdx === bakeryIdx; });
      if (!bakeryPins.length) return;
      var primaryPin = bakeryPins[0];
      var primaryLL  = L.latLng(primaryPin.lat, primaryPin.lng);
      selectBakery(bakeryIdx, primaryPin.addr, primaryLL);
      if (bakeryPins.length > 1) {
        var bounds = L.latLngBounds(bakeryPins.map(function(p) { return [p.lat, p.lng]; }));
        _map.fitBounds(bounds, { padding: [60, 60], animate: true });
      } else {
        _map.setView(primaryLL, Math.max(_map.getZoom(), 14), { animate: true, duration: 0.5 });
      }
    };
  });

  document.getElementById('map-popup-close').onclick = function() {
    hideMainPopup();
    clearMainSelection();
  };

  _map.on('click', function() {
    hideMainPopup();
    clearMainSelection();
  });

  _map.on('move zoom', onMainMapMove);
  setTimeout(function() { _map.invalidateSize(); }, 200);
}

export function initMainMap() {
  try {
    var container = document.getElementById('kneed-map');
    if (!container) return;

    var dataEl = document.getElementById('kneed-map-data');
    if (!dataEl) return;
    var data = JSON.parse(dataEl.textContent);
    _bakeries = data.BAKERIES;
    _pins     = data.PINS;
    loadLeaflet(_doInitMainMap);
  } catch (e) {
    console.error('[kneed] initMainMap error:', e);
  }
}

export function destroyMainMap() {
  if (_map) {
    var container = null;
    try { container = _map.getContainer(); } catch (e) {}
    try { _map.remove(); } catch (e) {}
    if (container) { try { delete container._leaflet_id; } catch (e) {} }
    _map = null;
  }
  _popup       = null;
  _mainMarkers = [];
  _activeLL    = null;
  _bakeries    = null;
  _pins        = null;
}


// ──────────────────────────────────────────────────────────────────────────
// BAKERY MAP  (/bakeries/[slug])
// ──────────────────────────────────────────────────────────────────────────
//
// Small map on the bakery story page. Reads lat/lng/locations from
// data-* attributes on #bakery-map. Supports single and multi-location.
//
// Address hover → marker highlight:
//   Elements with [data-location-index] get onmouseenter/mouseleave handlers
//   that scale the inner div directly (avoids setIcon() which replaces the
//   element and kills CSS transitions).

var _bakeryMap     = null;
var _bakeryMarkers = [];
var _bakeryRO      = null;
var _bakeryInitGen = 0;

function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _bakeryPopupHtml(name, thumbnail, suburb, addr, hours, lat, lng) {
  var mapsUrl = (name && lat && lng)
    ? 'https://www.google.com/maps/search/' + encodeURIComponent(name) + '/@' + lat + ',' + lng + ',17z'
    : (lat && lng)
      ? 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr || '');
  var pinSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var clockSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  return '<div class="kneed-popup">'
    + (thumbnail ? '<img class="kneed-popup-img" src="' + _escHtml(thumbnail) + '" alt="' + _escHtml(name) + '" loading="lazy">' : '')
    + '<div class="kneed-popup-body">'
    + '<div class="kneed-popup-eyebrow">' + _escHtml(name) + '</div>'
    + (suburb ? '<div class="kneed-popup-suburb">' + _escHtml(suburb) + '</div>' : '')
    + (addr   ? '<div class="kneed-popup-detail">' + pinSvg + '<span>' + _escHtml(addr)  + '</span></div>' : '')
    + (hours  ? '<div class="kneed-popup-detail">' + clockSvg + '<span>' + _escHtml(hours) + '</span></div>' : '')
    + (mapsUrl ? '<div class="kneed-popup-actions"><a class="kneed-popup-maps-btn" href="' + mapsUrl + '" target="_blank" rel="noopener">' + pinSvg + 'OPEN IN MAP</a></div>' : '')
    + '</div>'
    + '</div>';
}

function makeDot(size, primary) {
  var half   = size / 2;
  var bg     = primary ? '#f2ede6' : '#c8833a';
  var border = primary ? '#c8833a' : 'rgba(242,237,230,0.9)';
  return L.divIcon({
    className: '',
    html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:' + bg + ';border:2px solid ' + border + ';'
        + 'box-shadow:0 2px 8px rgba(0,0,0,0.5);transition:transform 0.3s ease;"></div>',
    iconSize:   [size, size],
    iconAnchor: [half, half],
  });
}

function highlightLocation(locIdx) {
  _bakeryMarkers.forEach(function(m, i) {
    var inner = m._icon && m._icon.firstElementChild;
    if (i === locIdx) {
      if (inner) inner.style.transform = 'scale(1.5)';
      m.setOpacity(1);
    } else {
      if (inner) inner.style.transform = '';
      m.setOpacity(0.5);
    }
  });
}

function clearBakeryHighlight() {
  _bakeryMarkers.forEach(function(m) {
    var inner = m._icon && m._icon.firstElementChild;
    if (inner) inner.style.transform = '';
    m.setOpacity(1);
  });
}

function wireAddressHovers() {
  document.querySelectorAll('[data-location-index]').forEach(function(el) {
    var locIdx      = parseInt(el.dataset.locationIndex, 10);
    el.onmouseenter = function() { highlightLocation(locIdx); };
    el.onmouseleave = function() { clearBakeryHighlight(); };
  });
}

function _doBuildBakeryMap(mapEl, lat, lng, multiLocations, genToken, thumbnail) {
  if (genToken !== _bakeryInitGen) return;
  if (mapEl._leaflet_id) return;

  setTimeout(function() {
    if (genToken !== _bakeryInitGen) return;
    requestAnimationFrame(function() {
      if (genToken !== _bakeryInitGen) return;
      if (mapEl._leaflet_id) return;

      var bakeryName = mapEl.dataset.name || '';

      if (multiLocations && multiLocations.length > 1) {
        var bounds = L.latLngBounds(multiLocations.map(function(loc) { return [loc.lat, loc.lng]; }));
        var center = bounds.getCenter();
        _bakeryMap = L.map(mapEl, {
          center: [center.lat, center.lng],
          zoom: 13,
          zoomControl: true,
          attributionControl: false,
          scrollWheelZoom: false,
          dragging: true,
          touchZoom: true,
        });
        _bakeryMap.fitBounds(bounds, { padding: [48, 48] });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(_bakeryMap);
        multiLocations.forEach(function(loc, i) {
          var icon = makeDot(i === 0 ? 16 : 12, i === 0);
          var m = L.marker([loc.lat, loc.lng], { icon: icon });
          m.bindPopup(_bakeryPopupHtml(bakeryName, thumbnail, loc.label || '', loc.addr || '', loc.hours || '', loc.lat, loc.lng), {
            className: 'kneed-leaflet-popup',
            offset: L.point(0, -16),
            autoPan: true,
            autoPanPaddingTopLeft: L.point(20, 20),
            autoPanPaddingBottomRight: L.point(20, 20),
          });
          m.addTo(_bakeryMap);
          _bakeryMarkers.push(m);
        });
      } else {
        if (!lat || !lng) return;
        _bakeryMap = L.map(mapEl, {
          center: [lat, lng],
          zoom: 15,
          zoomControl: true,
          attributionControl: false,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(_bakeryMap);
        var icon = makeDot(12, false);
        var m = L.marker([lat, lng], { icon: icon });
        m.bindPopup(_bakeryPopupHtml(bakeryName, thumbnail, mapEl.dataset.suburb || '', mapEl.dataset.addr || '', mapEl.dataset.hours || '', lat, lng), {
          className: 'kneed-leaflet-popup',
          offset: L.point(0, -16),
          autoPan: true,
          autoPanPaddingTopLeft: L.point(20, 20),
          autoPanPaddingBottomRight: L.point(20, 20),
        });
        m.addTo(_bakeryMap);
        _bakeryMarkers.push(m);
      }

      window.__bakeryMapFocus = function(idx) {
        if (!_bakeryMap || !_bakeryMarkers[idx]) return;
        var marker = _bakeryMarkers[idx];
        var loc = marker.getLatLng();
        var genToken = _bakeryInitGen;
        var popupOffsetLat = loc.lat - (_bakeryMap.getCenter().lat - _bakeryMap.getBounds().getSouth()) * 0.35;
        _bakeryMap.flyTo([popupOffsetLat, loc.lng], 15, { duration: 0.6 });
        _bakeryMap.once('moveend', function() {
          if (genToken !== _bakeryInitGen || !_bakeryMap) return;
          marker.openPopup();
        });
      };

      var stableFrames = 0, lastTop = null, budget = 60;
      function correctOrigin() {
        if (genToken !== _bakeryInitGen || !_bakeryMap) return;
        var r = mapEl.getBoundingClientRect();
        if (lastTop !== null && Math.abs(r.top - lastTop) < 0.5 && Math.abs(r.left - (mapEl._lastLeft || r.left)) < 0.5) {
          stableFrames++;
        } else {
          stableFrames = 0;
        }
        lastTop = r.top;
        mapEl._lastLeft = r.left;
        if (stableFrames >= 3 || budget-- <= 0) {
          _bakeryMap.invalidateSize({ pan: false });
        } else {
          requestAnimationFrame(correctOrigin);
        }
      }
      requestAnimationFrame(correctOrigin);

      wireAddressHovers();

      if (typeof ResizeObserver !== 'undefined') {
        _bakeryRO = new ResizeObserver(function() {
          if (_bakeryMap) _bakeryMap.invalidateSize();
        });
        _bakeryRO.observe(mapEl);
      }
    });
  }, 200);
}

export function initBakeryMap() {
  _bakeryInitGen++;
  var myGen = _bakeryInitGen;
  try {
    var mapEl = document.getElementById('bakery-map');
    if (!mapEl) return;
    var lat  = parseFloat(mapEl.dataset.lat || '0');
    var lng  = parseFloat(mapEl.dataset.lng || '0');
    var thumbnail = mapEl.dataset.thumbnail || '';
    var multiLocations = null;
    try {
      var raw = mapEl.dataset.locations || '';
      if (raw) multiLocations = JSON.parse(raw);
    } catch (e) {}
    loadLeaflet(function() {
      if (myGen !== _bakeryInitGen) return;
      _doBuildBakeryMap(mapEl, lat, lng, multiLocations, myGen, thumbnail);
    });
  } catch (e) {
    console.error('[kneed] initBakeryMap error:', e);
  }
}

export function destroyBakeryMap() {
  _bakeryInitGen++;
  window.__bakeryMapFocus = null;
  if (_bakeryRO) { try { _bakeryRO.disconnect(); } catch (e) {} _bakeryRO = null; }
  if (_bakeryMap) {
    var container = null;
    try { container = _bakeryMap.getContainer(); } catch (e) {}
    try { _bakeryMap.remove(); } catch (e) {}
    if (container) { try { delete container._leaflet_id; } catch (e) {} }
    _bakeryMap = null;
  }
  _bakeryMarkers = [];
}
