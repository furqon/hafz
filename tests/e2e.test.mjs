import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { auditAppShellSize } from '../scripts/audit-size.mjs';
import { handleAppRequest } from '../scripts/dev-server.mjs';
import { generateTracksManifest } from '../scripts/generate-tracks.mjs';
import { loadStaticTracks } from '../src/loader.js';
import { createAppUI } from '../src/main.js';
import {
  createMockAudioElement,
  createPlayerController,
  REPEAT_MODES
} from '../src/player.js';
import '../sw.js';

/**
 * Dispatches an HTTP request directly through `handleAppRequest` and returns
 * a Fetch-compatible Response object with status, headers, text(), json(), and arrayBuffer().
 */
async function appFetch(url, options = {}) {
  const parsedUrl = new URL(url, 'http://localhost');
  const stream = new PassThrough();
  const chunks = [];
  let status = 200;
  const rawHeaders = new Map();

  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  const res = Object.assign(stream, {
    writeHead(code, headers = {}) {
      status = code;
      for (const [k, v] of Object.entries(headers)) {
        rawHeaders.set(k.toLowerCase(), String(v));
      }
    }
  });

  const finished = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  await handleAppRequest(
    {
      url: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {}
    },
    res
  );

  await finished;
  const bodyBuffer = Buffer.concat(chunks);

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => rawHeaders.get(String(name).toLowerCase()) ?? null
    },
    clone() {
      return this;
    },
    text: async () => bodyBuffer.toString('utf8'),
    json: async () => JSON.parse(bodyBuffer.toString('utf8')),
    arrayBuffer: async () =>
      bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength)
  };
}

/**
 * Lightweight DOM mock for E2E UI testing of `createAppUI`.
 */
function createMockDocument() {
  const elementsById = new Map();
  const metaColorScheme = {
    name: 'color-scheme',
    content: 'light dark',
    setAttribute(k, v) {
      if (k === 'content') this.content = String(v);
    }
  };

  function createElement(tag) {
    const listeners = new Map();
    const attrs = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      value: '',
      hidden: false,
      dataset: {},
      children: [],
      style: {
        props: new Map(),
        setProperty(k, v) {
          this.props.set(k, v);
        }
      },
      set innerHTML(val) {
        if (val === '') this.children = [];
      },
      get innerHTML() {
        return '';
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      append(...nodes) {
        this.children.push(...nodes);
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.get(k) ?? null;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(type, eventObj = {}) {
        for (const fn of listeners.get(type) || []) {
          fn({ target: this, ...eventObj });
        }
      },
      click() {
        this.dispatchEvent('click');
      }
    };
    return el;
  }

  const ids = [
    'ipod-screen',
    'track-list',
    'track-count-badge',
    'repeat-badge',
    'loading-badge',
    'current-title',
    'current-subtitle',
    'current-ayat',
    'seek-slider',
    'current-time',
    'remaining-time',
    'total-duration',
    'playlist-filter',
    'btn-menu',
    'btn-theme',
    'btn-repeat',
    'btn-prev',
    'btn-play',
    'btn-next',
    'btn-stop',
    'folder-input',
    'files-input'
  ];

  for (const id of ids) {
    const el = createElement('div');
    el.id = id;
    elementsById.set(id, el);
  }

  return {
    metaColorScheme,
    createElement,
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (sel) => (sel === 'meta[name="color-scheme"]' ? metaColorScheme : null)
  };
}

describe('End-to-End (E2E) Server & Player Integration', () => {
  before(async () => {
    await generateTracksManifest();
  });

  it('serves index.html with all Phase 2, 3 & 4 iPod UI controls, PWA tags, and accessible markup', async () => {
    const res = await appFetch('http://localhost/');
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /meta name="color-scheme" content="light dark"/);
    assert.match(html, /meta name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
    assert.match(html, /link rel="manifest" href="\.\/manifest\.webmanifest"/);
    assert.match(html, /link rel="apple-touch-icon" href="\.\/public\/icons\/apple-touch-icon\.png"/);
    assert.match(html, /id="ipod-screen"[^>]*data-view="now-playing"/);
    assert.match(html, /class="click-wheel"/);
    assert.match(html, /id="btn-menu"/);
    assert.match(html, /id="btn-theme"/);
    assert.match(html, /id="seek-slider"/);
    assert.match(html, /id="playlist-filter"/);
    assert.match(html, /id="btn-play"/);
    assert.match(html, /id="btn-prev"/);
    assert.match(html, /id="btn-next"/);
    assert.match(html, /id="btn-repeat"/);
    assert.match(html, /id="btn-stop"/);
    assert.match(html, /id="track-list"[^>]*role="list"/);
  });

  it('serves valid PWA manifest.webmanifest, icons (192, 512, maskable, apple-touch-icon), and sw.js', async () => {
    const manifestRes = await appFetch('http://localhost/manifest.webmanifest');
    assert.equal(manifestRes.status, 200);
    assert.match(manifestRes.headers.get('content-type') || '', /application\/manifest\+json/);

    const manifest = await manifestRes.json();
    assert.equal(manifest.short_name, 'Hafz');
    assert.equal(manifest.display, 'standalone');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);

    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, 'http://localhost/').href;
      const iconRes = await appFetch(iconUrl);
      assert.equal(iconRes.status, 200, `Expected 200 for icon ${icon.src}`);
      const buf = await iconRes.arrayBuffer();
      assert.ok(buf.byteLength > 100);
    }

    const appleIconRes = await appFetch('http://localhost/public/icons/apple-touch-icon.png');
    assert.equal(appleIconRes.status, 200);

    const swRes = await appFetch('http://localhost/sw.js');
    assert.equal(swRes.status, 200);
    assert.match(swRes.headers.get('content-type') || '', /text\/javascript/);
  });

  it('verifies Service Worker caching strategies (NetworkFirst, CacheFirst, StaleWhileRevalidate) and offline fallback', async () => {
    const sw = globalThis.__hafzSW;
    assert.ok(sw);
    assert.ok(sw.APP_SHELL_URLS.includes('./index.html'));
    assert.ok(sw.APP_SHELL_URLS.includes('./manifest.webmanifest'));

    const cacheBoxes = new Map();
    const origCaches = globalThis.caches;
    const origFetch = globalThis.fetch;

    let isOffline = false;
    globalThis.caches = {
      async open(name) {
        if (!cacheBoxes.has(name)) cacheBoxes.set(name, new Map());
        const box = cacheBoxes.get(name);
        return {
          async match(req) {
            const key = typeof req === 'string' ? req : req.url;
            return box.get(key) || null;
          },
          async put(req, res) {
            const key = typeof req === 'string' ? req : req.url;
            box.set(key, res);
          },
          async keys() {
            return Array.from(box.keys());
          },
          async delete(key) {
            box.delete(key);
          }
        };
      }
    };

    globalThis.fetch = async (req) => {
      if (isOffline) throw new Error('Network offline');
      const url = typeof req === 'string' ? req : req.url;
      return appFetch(url);
    };

    try {
      // 1. NetworkFirst caches index.html when online and serves cached copy when offline
      const onlineHtml = await sw.networkFirst({ url: 'http://localhost/index.html' }, sw.SHELL_CACHE);
      assert.equal(onlineHtml.status, 200);

      isOffline = true;
      const offlineHtml = await sw.networkFirst({ url: 'http://localhost/index.html' }, sw.SHELL_CACHE);
      assert.equal(offlineHtml.status, 200);
      assert.match(await offlineHtml.text(), /Hafz/);

      // 2. CacheFirst caches static asset online and serves from cache when offline
      isOffline = false;
      const onlineCss = await sw.cacheFirst({ url: 'http://localhost/styles/main.css' }, sw.SHELL_CACHE);
      assert.equal(onlineCss.status, 200);

      isOffline = true;
      const cachedCss = await sw.cacheFirst({ url: 'http://localhost/styles/main.css' }, sw.SHELL_CACHE);
      assert.equal(cachedCss.status, 200);
    } finally {
      globalThis.caches = origCaches;
      globalThis.fetch = origFetch;
    }
  });

  it('passes Phase 4.3 app shell size audit (< 50 KB gzipped)', async () => {
    const audit = await auditAppShellSize();
    assert.equal(audit.withinBudget, true);
    assert.ok(audit.totalGzipBytes < 50 * 1024);
  });

  it('streams .m4a audio files with HTTP 206 Partial Content Range support', async () => {
    const manifestRes = await appFetch('http://localhost/public/audio/tracks.json');
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.ok(manifest.count >= 3);

    const firstTrackUrl = new URL(manifest.tracks[0].url, 'http://localhost/').href;
    const rangeRes = await appFetch(firstTrackUrl, {
      headers: { Range: 'bytes=0-127' }
    });

    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(rangeRes.headers.get('content-type'), 'audio/mp4');
    assert.match(rangeRes.headers.get('content-range') || '', /^bytes 0-127\/\d+$/);

    const buf = await rangeRes.arrayBuffer();
    assert.equal(buf.byteLength, 128);
  });

  it('completes full E2E user journey: fetch manifest -> filter -> play -> seek -> repeat -> reload persistence', async () => {
    const tracks = await loadStaticTracks(
      'http://localhost/public/audio/tracks.json',
      'http://localhost/public/audio/',
      appFetch
    );
    assert.equal(tracks.length, 3);
    assert.equal(tracks[0].juz, 29);
    assert.equal(tracks[1].juz, 30);
    assert.equal(tracks[1].pageInJuz, 1);
    assert.equal(tracks[2].juz, 30);
    assert.equal(tracks[2].pageInJuz, 2);

    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };

    const audio = createMockAudioElement();
    const player = createPlayerController({ audio, storage, mediaSession: null });
    player.setTracks(tracks);

    // Filter to Juz 30
    player.setFilter('juz:30');
    assert.equal(player.getSnapshot().filteredTracks.length, 2);
    assert.equal(player.getSnapshot().currentTrack.surahName, 'an-naba');

    // Start playback and scrub to 50%
    await player.play();
    assert.equal(player.getSnapshot().isPlaying, true);
    player.seekByPercent(50);
    assert.equal(player.getSnapshot().progressPercent, 50);

    // Advance to next track in Juz 30 (An-Naziat)
    await player.next();
    assert.equal(player.getSnapshot().currentTrack.surahName, 'an-naziat');

    // Cycle repeat mode from ALL -> ONCE -> ONE
    assert.equal(player.getSnapshot().repeatMode, REPEAT_MODES.ALL);
    player.cycleRepeatMode();
    assert.equal(player.getSnapshot().repeatMode, REPEAT_MODES.ONCE);
    player.cycleRepeatMode();
    assert.equal(player.getSnapshot().repeatMode, REPEAT_MODES.ONE);

    // Simulate browser reload with persisted localStorage state
    const reloadedPlayer = createPlayerController({
      audio: createMockAudioElement(),
      storage,
      mediaSession: null
    });
    reloadedPlayer.setTracks(tracks);

    const snap = reloadedPlayer.getSnapshot();
    assert.equal(snap.filterKey, 'juz:30');
    assert.equal(snap.currentTrack.surahName, 'an-naziat');
    assert.equal(snap.repeatMode, REPEAT_MODES.ONE);
  });

  it('drives the full Phase 3 & 4 iPod DOM UI end-to-end: Click-Wheel, Menu/Browser toggle, Service Worker registration, and Theme toggle', async () => {
    const doc = createMockDocument();
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };

    let registeredSwUrl = null;
    const mockNavigator = {
      serviceWorker: {
        async register(url) {
          registeredSwUrl = url;
          return { scope: './' };
        }
      }
    };

    const app = createAppUI(doc, {
      audio: createMockAudioElement(),
      storage,
      mediaSession: null,
      navigator: mockNavigator,
      manifestUrl: 'http://localhost/public/audio/tracks.json',
      baseAudioPath: 'http://localhost/public/audio/',
      fetchImpl: appFetch
    });

    await app.init();

    assert.equal(registeredSwUrl, './sw.js');
    assert.equal(app.els.trackCountBadge.textContent, '3 tracks');
    assert.equal(app.els.currentTitle.textContent, 'Al-Mulk (01–12)');
    assert.equal(app.els.currentSubtitle.textContent, 'Juz 29 • Page 01');
    assert.equal(app.els.currentAyat.textContent, 'Surah Al-Mulk • Ayat 01–12');
    assert.equal(app.getScreenView(), 'now-playing');

    // Toggle to Track Browser screen via Click-Wheel MENU button
    app.els.btnMenu.click();
    assert.equal(app.getScreenView(), 'browser');
    assert.equal(app.els.ipodScreen.getAttribute('data-view'), 'browser');
    assert.equal(app.els.btnMenu.getAttribute('aria-expanded'), 'true');

    // Verify grouped Juz headers in track list (2 Juz headers + 3 track items = 5 children)
    assert.equal(app.els.trackList.children.length, 5);
    assert.equal(app.els.trackList.children[0].className, 'track-group-header');
    assert.equal(app.els.trackList.children[0].textContent, 'Juz 29');
    assert.equal(app.els.trackList.children[2].className, 'track-group-header');
    assert.equal(app.els.trackList.children[2].textContent, 'Juz 30');

    // Click the second track (An-Naba in Juz 30) in the browser list -> plays and switches back to Now Playing
    const secondTrackBtn = app.els.trackList.children[3].children[0];
    secondTrackBtn.click();
    assert.equal(app.getScreenView(), 'now-playing');
    assert.equal(app.els.currentTitle.textContent, 'An-Naba (01–30)');
    assert.equal(app.els.btnPlay.textContent, 'Pause');

    // Scrub seek slider to 25% (30s of 120s -> remaining -01:30)
    app.els.seekSlider.value = '25';
    app.els.seekSlider.dispatchEvent('input');
    assert.equal(app.els.currentTime.textContent, '00:30');
    assert.equal(app.els.remainingTime.textContent, '-01:30');

    // Toggle theme (default system in headless is 'dark' -> toggles to 'light', then back to system default)
    app.els.btnTheme.click();
    assert.equal(doc.metaColorScheme.content, 'light');
    assert.equal(storage.getItem('color-scheme'), 'light');

    app.els.btnTheme.click();
    assert.equal(doc.metaColorScheme.content, 'light dark');
    assert.equal(storage.getItem('color-scheme'), null);
  });
});
