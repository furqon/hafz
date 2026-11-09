/**
 * Hafz Application Entry Point (Phase 5: Quran Mushaf Page Display & Reader)
 */

import {
  loadStaticTracks,
  loadTracksFromFileList,
  mergeAndSortTracks
} from './loader.js';
import { pad2 } from './parser.js';
import { createPlayerController, formatTime } from './player.js';
import { loadQuranPageForTrack } from './quran.js';

/**
 * Registers the PWA Service Worker when supported by the browser.
 * @param {Navigator} [nav=globalThis.navigator]
 * @param {string} [swUrl='./sw.js']
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker(nav = globalThis.navigator, swUrl = './sw.js') {
  if (!nav || !('serviceWorker' in nav) || typeof nav.serviceWorker?.register !== 'function') {
    return null;
  }
  try {
    const reg = await nav.serviceWorker.register(swUrl);
    reg?.update?.();
    return reg;
  } catch {
    return null;
  }
}

export function createAppUI(doc = globalThis.document, options = {}) {
  const storage = options.storage !== undefined ? options.storage : globalThis.localStorage;

  const els = {
    ipodScreen: doc.getElementById('ipod-screen'),
    viewNowPlaying: doc.getElementById('view-now-playing'),
    viewBrowser: doc.getElementById('view-browser'),
    viewQuran: doc.getElementById('view-quran'),
    trackList: doc.getElementById('track-list'),
    trackCountBadge: doc.getElementById('track-count-badge'),
    repeatBadge: doc.getElementById('repeat-badge'),
    loadingBadge: doc.getElementById('loading-badge'),
    currentTitle: doc.getElementById('current-title'),
    currentSubtitle: doc.getElementById('current-subtitle'),
    currentAyat: doc.getElementById('current-ayat'),
    seekSlider: doc.getElementById('seek-slider'),
    currentTime: doc.getElementById('current-time'),
    remainingTime: doc.getElementById('remaining-time'),
    totalDuration: doc.getElementById('total-duration'),
    playlistFilter: doc.getElementById('playlist-filter'),
    btnQuran: doc.getElementById('btn-quran'),
    btnQuranClose: doc.getElementById('btn-quran-close'),
    quranPageBadge: doc.getElementById('quran-page-badge'),
    quranMetaBadge: doc.getElementById('quran-meta-badge'),
    quranSurahArabic: doc.getElementById('quran-surah-arabic'),
    quranVerses: doc.getElementById('quran-verses'),
    btnMenu: doc.getElementById('btn-menu'),
    btnTheme: doc.getElementById('btn-theme'),
    btnRepeat: doc.getElementById('btn-repeat'),
    btnPrev: doc.getElementById('btn-prev'),
    btnPlay: doc.getElementById('btn-play'),
    btnNext: doc.getElementById('btn-next'),
    btnStop: doc.getElementById('btn-stop'),
    folderInput: doc.getElementById('folder-input'),
    filesInput: doc.getElementById('files-input')
  };

  const supportsAccentColor =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('accent-color', '#38bdf8');

  let lastFilterSignature = '';
  let lastQuranTrackId = null;
  let currentQuranPageData = null;
  let screenView = 'now-playing';

  function setInertState(element, isInert) {
    if (!element) return;
    element.inert = isInert;
    if (isInert) {
      element.setAttribute?.('inert', '');
    } else {
      element.removeAttribute?.('inert');
    }
  }

  function setScreenView(view) {
    if (view === 'browser' || view === 'quran') {
      screenView = view;
    } else {
      screenView = 'now-playing';
    }

    if (els.ipodScreen) {
      els.ipodScreen.setAttribute('data-view', screenView);
      els.ipodScreen.dataset.view = screenView;
    }

    setInertState(els.viewNowPlaying, screenView !== 'now-playing');
    setInertState(els.viewBrowser, screenView !== 'browser');
    setInertState(els.viewQuran, screenView !== 'quran');

    if (els.btnMenu) {
      const isBrowser = screenView === 'browser';
      els.btnMenu.setAttribute('aria-expanded', String(isBrowser));
      els.btnMenu.textContent = screenView === 'now-playing' ? 'MENU' : 'NOW';
    }

    if (els.btnQuran) {
      els.btnQuran.setAttribute('aria-pressed', String(screenView === 'quran'));
    }

    return screenView;
  }

  function toggleScreenView() {
    return setScreenView(screenView === 'now-playing' ? 'browser' : 'now-playing');
  }

  function toggleQuranView() {
    return setScreenView(screenView === 'quran' ? 'now-playing' : 'quran');
  }

  function renderQuranPage(pageData) {
    currentQuranPageData = pageData;
    if (!pageData) return;

    if (els.quranPageBadge) {
      els.quranPageBadge.textContent = pageData.headerLabel;
    }
    if (els.quranMetaBadge) {
      els.quranMetaBadge.textContent = `${pageData.juzPageLabel} • ${pageData.ayatRangeLabel}`;
    }
    if (els.quranSurahArabic) {
      els.quranSurahArabic.textContent = pageData.surahArabic || 'ٱلْقُرْآنُ ٱلْكَرِيمُ';
    }

    if (!els.quranVerses) return;
    els.quranVerses.innerHTML = '';

    if (pageData.bismillah) {
      const bismillahEl = doc.createElement('div');
      bismillahEl.className = 'quran-bismillah';
      bismillahEl.textContent = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
      els.quranVerses.appendChild(bismillahEl);
    }

    if (Array.isArray(pageData.verses) && pageData.verses.length > 0) {
      for (const verse of pageData.verses) {
        const span = doc.createElement('span');
        span.className = `quran-verse${verse.isHighlighted ? ' highlighted' : ''}`;
        span.dataset.ayah = String(verse.ayah);
        span.textContent = `${verse.text} `;

        const marker = doc.createElement('span');
        marker.className = 'quran-verse-marker';
        marker.textContent = `﴿${verse.arabicNumber}﴾ `;

        span.appendChild(marker);
        els.quranVerses.appendChild(span);
      }
    } else {
      const fallbackNote = doc.createElement('p');
      fallbackNote.className = 'quran-fallback-note';
      fallbackNote.textContent = `${pageData.headerLabel} — ${pageData.surahDisplay} (${pageData.ayatRangeLabel})`;
      els.quranVerses.appendChild(fallbackNote);
    }
  }

  async function syncQuranPageForTrack(track) {
    if (!track) {
      lastQuranTrackId = null;
      currentQuranPageData = null;
      return null;
    }

    lastQuranTrackId = track.id;
    const pageData = await loadQuranPageForTrack(track, {
      quranDataUrl: options.quranDataUrl,
      fetchImpl: options.fetchImpl,
      allowRemoteFetch: options.allowRemoteFetch ?? !options.fetchImpl,
      storage
    });
    if (lastQuranTrackId === track.id) {
      renderQuranPage(pageData);
    }
    return pageData;
  }

  function getSystemScheme() {
    if (typeof globalThis.matchMedia === 'function') {
      return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }

  function getStoredScheme() {
    try {
      const val = storage?.getItem?.('color-scheme');
      return val === 'light' || val === 'dark' ? val : null;
    } catch {
      return null;
    }
  }

  function getRenderedScheme() {
    return getStoredScheme() || getSystemScheme();
  }

  function applyMetaScheme(contentValue) {
    const meta = doc.querySelector?.('meta[name="color-scheme"]');
    if (meta) {
      meta.content = contentValue;
      meta.setAttribute?.('content', contentValue);
    }
    if (els.btnTheme) {
      const active = getRenderedScheme();
      els.btnTheme.textContent = active === 'dark' ? '☾ Dark' : '☀ Light';
      els.btnTheme.setAttribute(
        'aria-label',
        active === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      );
    }
  }

  function toggleTheme() {
    const currentRendered = getRenderedScheme();
    const target = currentRendered === 'dark' ? 'light' : 'dark';
    const systemScheme = getSystemScheme();

    try {
      if (target === systemScheme) {
        storage?.removeItem?.('color-scheme');
        applyMetaScheme('light dark');
      } else {
        storage?.setItem?.('color-scheme', target);
        applyMetaScheme(target);
      }
    } catch {
      applyMetaScheme(target);
    }
    return target;
  }

  function updateSliderFallbackProgress(percent) {
    if (!els.seekSlider) return;
    if (!supportsAccentColor) {
      els.seekSlider.style?.setProperty?.('--progress', `${percent}%`);
    }
  }

  function renderFilterOptions(availableFilters, activeFilterKey) {
    if (!els.playlistFilter) return;

    const signature = availableFilters.map((f) => `${f.key}:${f.count}`).join('|');
    if (signature !== lastFilterSignature) {
      lastFilterSignature = signature;
      els.playlistFilter.innerHTML = '';

      for (const filter of availableFilters) {
        const opt = doc.createElement('option');
        opt.value = filter.key;
        opt.textContent = filter.label;
        els.playlistFilter.appendChild(opt);
      }
    }

    if (els.playlistFilter.value !== activeFilterKey) {
      els.playlistFilter.value = activeFilterKey;
    }
  }

  function renderTrackList(snapshot) {
    if (!els.trackList) return;

    const { filteredTracks, currentTrackId, isPlaying } = snapshot;
    const count = filteredTracks.length;

    if (els.trackCountBadge) {
      els.trackCountBadge.textContent = `${count} ${count === 1 ? 'track' : 'tracks'}`;
    }

    els.trackList.innerHTML = '';

    if (count === 0) {
      const emptyItem = doc.createElement('li');
      emptyItem.className = 'track-empty';
      emptyItem.textContent =
        'No audio tracks loaded yet. Tap "Load Folder" or place .m4a files in public/audio/.';
      els.trackList.appendChild(emptyItem);
      return;
    }

    let lastGroupKey = null;

    for (const track of filteredTracks) {
      const groupKey = track.isParsed ? `Juz ${pad2(track.juz)}` : 'Other Recordings';
      if (groupKey !== lastGroupKey) {
        lastGroupKey = groupKey;
        const headerLi = doc.createElement('li');
        headerLi.className = 'track-group-header';
        headerLi.setAttribute('role', 'presentation');
        headerLi.textContent = groupKey;
        els.trackList.appendChild(headerLi);
      }

      const isActive = track.id === currentTrackId;
      const li = doc.createElement('li');
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `track-item-btn${isActive ? ' active' : ''}`;
      btn.dataset.trackId = track.id;
      btn.setAttribute('aria-current', isActive ? 'true' : 'false');

      const info = doc.createElement('div');
      const titleEl = doc.createElement('div');
      titleEl.className = 'track-item-title';
      titleEl.textContent = track.title;

      const metaEl = doc.createElement('div');
      metaEl.className = 'track-item-meta';
      metaEl.textContent = track.subtitle;

      info.append(titleEl, metaEl);
      btn.appendChild(info);

      if (isActive) {
        const statusEl = doc.createElement('span');
        statusEl.className = 'track-playing-indicator';
        statusEl.textContent = isPlaying ? '▶ Playing' : '⏸ Selected';
        btn.appendChild(statusEl);
      }

      btn.addEventListener('click', () => {
        if (track.id === player.getSnapshot().currentTrackId) {
          player.togglePlay();
        } else {
          player.selectTrack(track.id, { autoplay: true });
        }
        setScreenView('now-playing');
      });

      li.appendChild(btn);
      els.trackList.appendChild(li);
    }
  }

  function renderPlayerState(snapshot) {
    const {
      currentTrack,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      progressPercent,
      formattedCurrentTime,
      formattedDuration,
      repeatLabel,
      availableFilters,
      filterKey
    } = snapshot;

    if (els.currentTitle) {
      els.currentTitle.textContent = currentTrack ? currentTrack.title : 'Ready to Listen';
    }
    if (els.currentSubtitle) {
      els.currentSubtitle.textContent = currentTrack
        ? currentTrack.subtitle
        : 'Drop or load Quran recordings';
    }
    if (els.currentAyat) {
      if (!currentTrack) {
        els.currentAyat.textContent = 'Select a track to begin';
      } else if (currentTrack.isParsed) {
        els.currentAyat.textContent = `Surah ${currentTrack.surahDisplay} • Ayat ${pad2(currentTrack.ayatStart)}–${pad2(currentTrack.ayatEnd)}`;
      } else {
        els.currentAyat.textContent = currentTrack.filename;
      }
    }

    if (els.loadingBadge) {
      els.loadingBadge.hidden = !isLoading;
    }

    if (els.repeatBadge) {
      els.repeatBadge.textContent = repeatLabel;
    }

    if (els.btnRepeat) {
      els.btnRepeat.textContent = repeatLabel;
      els.btnRepeat.setAttribute('aria-label', `Repeat Mode: ${repeatLabel}`);
    }

    if (els.btnPlay) {
      els.btnPlay.textContent = isPlaying ? 'Pause' : 'Play';
      els.btnPlay.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      els.btnPlay.setAttribute('data-playing', String(isPlaying));
    }

    if (els.currentTime) {
      els.currentTime.textContent = formattedCurrentTime;
    }
    if (els.remainingTime) {
      const rem = duration > 0 ? Math.max(0, duration - currentTime) : 0;
      els.remainingTime.textContent = `-${formatTime(rem)}`;
    }
    if (els.totalDuration) {
      els.totalDuration.textContent = formattedDuration;
    }

    if (els.seekSlider) {
      const pct = Number.isFinite(progressPercent) ? progressPercent : 0;
      els.seekSlider.value = String(pct.toFixed(1));
      updateSliderFallbackProgress(pct);
    }

    renderFilterOptions(availableFilters, filterKey);
    renderTrackList(snapshot);

    if (currentTrack?.id !== lastQuranTrackId) {
      syncQuranPageForTrack(currentTrack);
    }
  }

  const player = createPlayerController({
    ...options,
    storage,
    onChange: renderPlayerState
  });

  function handleLocalFileSelection(fileList, replaceLocal = false) {
    const loaded = loadTracksFromFileList(fileList, { revokePrevious: replaceLocal });
    if (loaded.length === 0) return;

    const existing = player.getSnapshot().allTracks;
    const staticOnly = replaceLocal
      ? existing.filter((t) => t.source === 'static')
      : existing;

    const merged = mergeAndSortTracks(staticOnly, loaded);
    player.setTracks(merged);
  }

  async function init() {
    applyMetaScheme(getStoredScheme() ?? 'light dark');
    setScreenView('now-playing');

    els.btnMenu?.addEventListener('click', () => toggleScreenView());
    els.btnQuran?.addEventListener('click', () => toggleQuranView());
    els.btnQuranClose?.addEventListener('click', () => setScreenView('now-playing'));
    els.btnTheme?.addEventListener('click', () => toggleTheme());
    els.btnPlay?.addEventListener('click', () => player.togglePlay());
    els.btnPrev?.addEventListener('click', () => player.prev());
    els.btnNext?.addEventListener('click', () => player.next({ fromEnded: false }));
    els.btnStop?.addEventListener('click', () => player.stop());
    els.btnRepeat?.addEventListener('click', () => player.cycleRepeatMode());

    els.playlistFilter?.addEventListener('change', (e) => {
      player.setFilter(e.target.value);
    });

    els.seekSlider?.addEventListener('input', (e) => {
      const pct = Number.parseFloat(e.target.value);
      updateSliderFallbackProgress(pct);
      player.seekByPercent(pct);
    });

    els.folderInput?.addEventListener('change', (e) => {
      handleLocalFileSelection(e.target.files, true);
    });

    els.filesInput?.addEventListener('change', (e) => {
      handleLocalFileSelection(e.target.files, false);
    });

    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('storage', (e) => {
        if (e.key === 'color-scheme') {
          applyMetaScheme(e.newValue ?? 'light dark');
        }
      });
    }

    const staticTracks = await loadStaticTracks(
      options.manifestUrl,
      options.baseAudioPath,
      options.fetchImpl
    );
    player.setTracks(staticTracks);
    await syncQuranPageForTrack(player.getSnapshot().currentTrack);
    await registerServiceWorker(options.navigator);
    return player;
  }

  return {
    player,
    els,
    init,
    setScreenView,
    toggleScreenView,
    toggleQuranView,
    toggleTheme,
    syncQuranPageForTrack,
    getScreenView: () => screenView,
    getCurrentQuranPage: () => currentQuranPageData
  };
}

if (typeof document !== 'undefined') {
  const app = createAppUI(document);
  app.init();
  if (typeof window !== 'undefined') {
    window.__hafzPlayer = app.player;
    window.__hafzApp = app;
  }
}
