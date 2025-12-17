/**
 * (Bloodawn)
 * File: MangaPark-Image-Fallback.user.js
 * Purpose: Faster MangaPark image recovery by swapping CDN subdomains early + watchdog for hanging loads.
 */

// ==UserScript==
// @name         MangaPark Image Fallback (Fast + Watchdog)
// @namespace    https://github.com/Blood-Dawn/mangapark-fast-image-fallback
// @version      4.0.0
// @description  Pre-swap flaky CDN hosts, retry on error, and watchdog hangs so pages load without clicking.
// @author       Bloodawn
// @license      MIT
// @supportURL   https://github.com/Blood-Dawn/mangapark-fast-image-fallback/issues
// @homepageURL  https://github.com/Blood-Dawn/mangapark-fast-image-fallback
// @updateURL    https://raw.githubusercontent.com/Blood-Dawn/mangapark-fast-image-fallback/main/dist/MangaPark-Image-Fallback.meta.js
// @downloadURL  https://raw.githubusercontent.com/Blood-Dawn/mangapark-fast-image-fallback/main/dist/MangaPark-Image-Fallback.user.js
// @include      https://mangapark.*/*
// @include      https://*.mangapark.*/*
// @include      https://comicpark.*/*
// @include      https://*.comicpark.*/*
// @include      https://readpark.*/*
// @include      https://*.readpark.*/*
// @include      https://parkmanga.*/*
// @include      https://*.parkmanga.*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Tuneables
  const PREF_KEY = 'mp_pref_server';
  const BAD_SERVERS = new Set(['s02']);               // add more if you notice patterns
  const FALLBACK_SERVERS = ['s01','s03','s04','s05','s06','s07','s08','s09','s10','s00','s02'];
  const MAX_TRIES = 8;                                 // per image
  const RETRY_DELAY_MS = 80;                           // quick re-try
  const WATCHDOG_MS = 900;                             // kill “hang” earlier (no clicking needed)
  const QUIET = true;                                  // set false for console logs

  const log = (...a) => { if (!QUIET) console.log('[mp-fix]', ...a); };

  const isServerLabel = (label) => /^[a-zA-Z]\d{2}$/.test(label);

  const getPref = () => sessionStorage.getItem(PREF_KEY);
  const setPref = (s) => sessionStorage.setItem(PREF_KEY, s);

  function safeURL(urlStr) {
    try { return new URL(urlStr); } catch { return null; }
  }

  function getServerLabel(urlStr) {
    const u = safeURL(urlStr);
    if (!u) return null;
    return u.hostname.split('.')[0] || null;
  }

  function swapServer(urlStr, nextServer) {
    const u = safeURL(urlStr);
    if (!u) return null;
    const parts = u.hostname.split('.');
    if (!parts.length || !isServerLabel(parts[0])) return null;
    parts[0] = nextServer;
    u.hostname = parts.join('.');
    return u.toString();
  }

  function bestOriginal(img) {
    // Favor the first failing URL we observed
    if (img.dataset.mpOriginal) return img.dataset.mpOriginal;
    const u = img.currentSrc || img.src || '';
    img.dataset.mpOriginal = u;
    return u;
  }

  function primeImg(img) {
    // Reduce lazy delays where possible
    try { img.loading = 'eager'; } catch {}
    try { img.decoding = 'async'; } catch {}
    try { img.fetchPriority = 'high'; } catch {}

    // Avoid srcset fighting our rewrites
    if (img.getAttribute('srcset')) img.removeAttribute('srcset');

    // Common lazy attributes
    const ds =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-lazy-src');

    if (ds && (!img.getAttribute('src') || img.getAttribute('src') === location.href)) {
      img.setAttribute('src', ds);
    }
  }

  function buildCandidates(originalUrl) {
    const out = [];
    const pref = getPref();
    const origLabel = getServerLabel(originalUrl);

    // 1) preferred (learned) first
    if (pref && pref !== origLabel) out.push(pref);

    // 2) then fallbacks
    for (const s of FALLBACK_SERVERS) {
      if (s !== origLabel && !out.includes(s)) out.push(s);
    }

    return out;
  }

  function markLoaded(img) {
    // Learn working server from final loaded URL
    const u = img.currentSrc || img.src;
    const label = getServerLabel(u);
    if (label && isServerLabel(label)) {
      setPref(label);
      log('learned', label);
    }

    // Cleanup per-image state
    delete img.dataset.mpBusy;
    delete img.dataset.mpTry;
    delete img.dataset.mpWatchdog;
    // keep mpOriginal (helps for later reflows)
  }

  function isBrokenOrStuck(img) {
    // broken if complete but no pixels, or still not complete after watchdog
    // naturalWidth==0 is a common “broken image” indicator. :contentReference[oaicite:1]{index=1}
    if (!img.complete) return true;
    if (img.complete && img.naturalWidth === 0) return true;
    return false;
  }

  function hardAbort(img) {
    // cancel current request quickly, then we can reassign
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  }

  function retry(img) {
    if (img.dataset.mpBusy === '1') return;
    img.dataset.mpBusy = '1';

    const originalUrl = bestOriginal(img);
    const candidates = buildCandidates(originalUrl);

    let tries = parseInt(img.dataset.mpTry || '0', 10);
    if (Number.isNaN(tries)) tries = 0;

    if (tries >= MAX_TRIES) {
      delete img.dataset.mpBusy;
      return;
    }

    const current = img.currentSrc || img.src;
    const nextServer = candidates[tries] || null;

    img.dataset.mpTry = String(tries + 1);

    let nextUrl = null;
    if (nextServer) nextUrl = swapServer(originalUrl, nextServer);

    if (!nextUrl || nextUrl === current) {
      delete img.dataset.mpBusy;
      return;
    }

    log('retry', tries + 1, '->', nextServer);

    setTimeout(() => {
      img.src = nextUrl;
      delete img.dataset.mpBusy;
    }, RETRY_DELAY_MS);
  }

  function quickSwapIfBad(img) {
    const u = img.currentSrc || img.src;
    const label = getServerLabel(u);
    if (!label || !BAD_SERVERS.has(label)) return;

    const pref = getPref() || 's01';
    const swapped = swapServer(u, pref);
    if (swapped) {
      log('pre-swap', label, '->', pref);
      img.src = swapped;
    }
  }

  function startWatchdog(img) {
    if (img.dataset.mpWatchdog === '1') return;
    img.dataset.mpWatchdog = '1';

    setTimeout(() => {
      if (!isBrokenOrStuck(img)) return;

      // kick it before the browser waits forever
      log('watchdog kick');
      const cur = img.currentSrc || img.src;
      hardAbort(img);
      img.src = cur;

      retry(img);
    }, WATCHDOG_MS);
  }

  function attach(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.mpAttached === '1') return;
    img.dataset.mpAttached = '1';

    primeImg(img);
    bestOriginal(img);
    quickSwapIfBad(img);
    startWatchdog(img);

    img.addEventListener('error', () => retry(img), { passive: true });
    img.addEventListener('load', () => markLoaded(img), { passive: true });

    // If it already exists but is broken
    if (img.complete && img.naturalWidth === 0) retry(img);
  }

  // Initial scan as soon as possible
  const scan = (root) => {
    if (!root) return;
    if (root.tagName === 'IMG') attach(root);
    root.querySelectorAll?.('img')?.forEach(attach);
  };

  // Observe added nodes + src changes (lazy loaders)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n && n.nodeType === 1) scan(n);
        }
      } else if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG') {
        const img = m.target;
        primeImg(img);
        bestOriginal(img);
        quickSwapIfBad(img);
        startWatchdog(img);
      }
    }
  });

  const start = () => {
    scan(document.documentElement);
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'data-original', 'data-lazy-src']
    });
  };

  // document-start can still be “not truly first” in some cases, but we start ASAP anyway. :contentReference[oaicite:2]{index=2}
  if (document.readyState === 'loading') {
    start();
  } else {
    start();
  }
})();
