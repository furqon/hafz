import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { handleAppRequest } from '../scripts/dev-server.mjs';
import { generateTracksManifest } from '../scripts/generate-tracks.mjs';
import { loadStaticTracks } from '../src/loader.js';
import { createAppUI } from '../src/main.js';
import {
  createMockAudioElement,
  createPlayerController,
  REPEAT_MODES
} from '../src/player.js';

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
    'track-list',
    'track-count-badge',
    'repeat-badge',
    'loading-badge',
    'current-title',
    'current-subtitle',
    'seek-slider',
    'current-time',
    'total-duration',
    'playlist-filter',
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
    createElement,
    getElementById: (id) => elementsById.get(id) || null
  };
}

describe('End-to-End (E2E) Server & Player Integration', () => {
  before(async () => {
    await generateTracksManifest();
  });

  it('serves index.html with all Phase 2 player controls and accessible markup', async () => {
    const res = await appFetch('http://localhost/');
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /id="seek-slider"/);
    assert.match(html, /id="playlist-filter"/);
    assert.match(html, /id="btn-play"/);
    assert.match(html, /id="btn-prev"/);
    assert.match(html, /id="btn-next"/);
    assert.match(html, /id="btn-repeat"/);
    assert.match(html, /id="btn-stop"/);
    assert.match(html, /id="track-list"[^>]*role="list"/);
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
      setItem: (k, v) => store.set(k, String(v))
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

  it('drives the full DOM UI end-to-end via createAppUI button clicks, filter changes, and slider input', async () => {
    const doc = createMockDocument();
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    };

    const app = createAppUI(doc, {
      audio: createMockAudioElement(),
      storage,
      mediaSession: null,
      manifestUrl: 'http://localhost/public/audio/tracks.json',
      baseAudioPath: 'http://localhost/public/audio/',
      fetchImpl: appFetch
    });

    await app.init();

    assert.equal(app.els.trackCountBadge.textContent, '3 tracks');
    assert.equal(app.els.currentTitle.textContent, 'Al-Mulk (01–12)');
    assert.equal(app.els.btnPlay.textContent, 'Play');

    // Click Play button
    app.els.btnPlay.click();
    assert.equal(app.els.btnPlay.textContent, 'Pause');

    // Click Next button
    app.els.btnNext.click();
    assert.equal(app.els.currentTitle.textContent, 'An-Naba (01–30)');

    // Scrub seek slider to 25%
    app.els.seekSlider.value = '25';
    app.els.seekSlider.dispatchEvent('input');
    assert.equal(app.els.currentTime.textContent, '00:30');

    // Change filter dropdown to juz:30
    app.els.playlistFilter.value = 'juz:30';
    app.els.playlistFilter.dispatchEvent('change');
    assert.equal(app.els.trackCountBadge.textContent, '2 tracks');

    // Click Repeat button to cycle mode
    app.els.btnRepeat.click();
    assert.equal(app.els.repeatBadge.textContent, 'Play Once');
  });
});
