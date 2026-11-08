/**
 * Hafz Application Entry Point (Phase 2: Audio Player & Playlist Engine)
 */

import {
  loadStaticTracks,
  loadTracksFromFileList,
  mergeAndSortTracks
} from './loader.js';
import { createPlayerController } from './player.js';

export function createAppUI(doc = globalThis.document, options = {}) {
  const els = {
    trackList: doc.getElementById('track-list'),
    trackCountBadge: doc.getElementById('track-count-badge'),
    repeatBadge: doc.getElementById('repeat-badge'),
    loadingBadge: doc.getElementById('loading-badge'),
    currentTitle: doc.getElementById('current-title'),
    currentSubtitle: doc.getElementById('current-subtitle'),
    seekSlider: doc.getElementById('seek-slider'),
    currentTime: doc.getElementById('current-time'),
    totalDuration: doc.getElementById('total-duration'),
    playlistFilter: doc.getElementById('playlist-filter'),
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

    for (const track of filteredTracks) {
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
        statusEl.textContent = isPlaying ? 'Playing' : 'Selected';
        btn.appendChild(statusEl);
      }

      btn.addEventListener('click', () => {
        if (track.id === player.getSnapshot().currentTrackId) {
          player.togglePlay();
        } else {
          player.selectTrack(track.id, { autoplay: true });
        }
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
    }

    if (els.currentTime) {
      els.currentTime.textContent = formattedCurrentTime;
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
  }

  const player = createPlayerController({
    ...options,
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

    const staticTracks = await loadStaticTracks(
      options.manifestUrl,
      options.baseAudioPath,
      options.fetchImpl
    );
    player.setTracks(staticTracks);
    return player;
  }

  return { player, els, init };
}

if (typeof document !== 'undefined') {
  const app = createAppUI(document);
  app.init();
  if (typeof window !== 'undefined') {
    window.__hafzPlayer = app.player;
  }
}
