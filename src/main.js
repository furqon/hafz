/**
 * Hafz Application Entry Point (Phase 1: Core Architecture & Track Loader)
 */

import {
  loadStaticTracks,
  loadTracksFromFileList,
  mergeAndSortTracks
} from './loader.js';

const state = {
  tracks: [],
  selectedTrackId: null
};

const els = {
  trackList: document.getElementById('track-list'),
  trackCountBadge: document.getElementById('track-count-badge'),
  currentTitle: document.getElementById('current-title'),
  currentSubtitle: document.getElementById('current-subtitle'),
  folderInput: document.getElementById('folder-input'),
  filesInput: document.getElementById('files-input')
};

function renderTrackList() {
  if (!els.trackList) return;

  const count = state.tracks.length;
  if (els.trackCountBadge) {
    els.trackCountBadge.textContent = `${count} ${count === 1 ? 'track' : 'tracks'}`;
  }

  els.trackList.innerHTML = '';

  if (count === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'track-empty';
    emptyItem.textContent =
      'No audio tracks loaded yet. Tap "Load Folder" or place .m4a files in public/audio/.';
    els.trackList.appendChild(emptyItem);
    return;
  }

  for (const track of state.tracks) {
    const li = document.createElement('li');
    li.className = `track-item${track.id === state.selectedTrackId ? ' active' : ''}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(track.id === state.selectedTrackId));

    const info = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'track-item-title';
    titleEl.textContent = track.title;

    const metaEl = document.createElement('div');
    metaEl.className = 'track-item-meta';
    metaEl.textContent = track.subtitle;

    info.append(titleEl, metaEl);
    li.appendChild(info);

    li.addEventListener('click', () => selectTrack(track.id));
    els.trackList.appendChild(li);
  }
}

function selectTrack(trackId) {
  state.selectedTrackId = trackId;
  const active = state.tracks.find((t) => t.id === trackId);
  if (active) {
    if (els.currentTitle) els.currentTitle.textContent = active.title;
    if (els.currentSubtitle) els.currentSubtitle.textContent = active.subtitle;
  }
  renderTrackList();
}

function handleLocalFileSelection(fileList, replaceLocal = false) {
  const loaded = loadTracksFromFileList(fileList, { revokePrevious: replaceLocal });
  if (loaded.length === 0) return;

  const staticOnly = replaceLocal
    ? state.tracks.filter((t) => t.source === 'static')
    : state.tracks;

  state.tracks = mergeAndSortTracks(staticOnly, loaded);
  if (!state.selectedTrackId && state.tracks.length > 0) {
    selectTrack(state.tracks[0].id);
  } else {
    renderTrackList();
  }
}

async function init() {
  const staticTracks = await loadStaticTracks();
  state.tracks = staticTracks;

  if (state.tracks.length > 0) {
    selectTrack(state.tracks[0].id);
  } else {
    renderTrackList();
  }

  els.folderInput?.addEventListener('change', (e) => {
    handleLocalFileSelection(e.target.files, true);
  });

  els.filesInput?.addEventListener('change', (e) => {
    handleLocalFileSelection(e.target.files, false);
  });
}

init();
