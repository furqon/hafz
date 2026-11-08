/**
 * Hafz Audio Player & Playlist Engine (Phase 2)
 *
 * Responsibilities:
 *   - Core playback controls: play, pause, stop, next, prev, seek
 *   - Playlist filtering: All Tracks, by Juz (xx), or by Surah (surah_name)
 *   - Repeat modes: 'once' (play playlist in order once), 'one' (repeat single track), 'all' (loop playlist)
 *   - Persistence of last played track, active filter, and repeat mode in localStorage
 *   - Mobile lock-screen & background audio via navigator.mediaSession
 */

import { pad2 } from './parser.js';

export const STORAGE_KEY = 'hafz_player_state_v1';

export const REPEAT_MODES = Object.freeze({
  ONCE: 'once',
  ONE: 'one',
  ALL: 'all'
});

const REPEAT_ORDER = [REPEAT_MODES.ONCE, REPEAT_MODES.ONE, REPEAT_MODES.ALL];

export const REPEAT_LABELS = Object.freeze({
  [REPEAT_MODES.ONCE]: 'Play Once',
  [REPEAT_MODES.ONE]: 'Repeat 1',
  [REPEAT_MODES.ALL]: 'Repeat All'
});

/**
 * Formats seconds as MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${pad2(mins)}:${pad2(secs)}`;
}

/**
 * Returns the next repeat mode in cycle: once -> one -> all -> once.
 * @param {string} currentMode
 * @returns {string}
 */
export function getNextRepeatMode(currentMode) {
  const idx = REPEAT_ORDER.indexOf(currentMode);
  if (idx === -1) return REPEAT_MODES.ONCE;
  return REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length];
}

/**
 * Extracts available filter options from a list of tracks.
 * Groups by All Tracks, Juz numbers, and Surah names.
 *
 * @param {Array<object>} tracks
 * @returns {Array<{ key: string, label: string, count: number, group: string }>}
 */
export function getAvailableFilters(tracks = []) {
  const filters = [
    {
      key: 'all',
      label: `All Tracks (${tracks.length})`,
      count: tracks.length,
      group: 'all'
    }
  ];

  const juzCounts = new Map();
  const surahMap = new Map();

  for (const track of tracks) {
    if (track.isParsed && Number.isInteger(track.juz)) {
      juzCounts.set(track.juz, (juzCounts.get(track.juz) || 0) + 1);
    }
    if (track.surahName) {
      const existing = surahMap.get(track.surahName);
      if (existing) {
        existing.count += 1;
      } else {
        surahMap.set(track.surahName, {
          display: track.surahDisplay || track.surahName,
          count: 1
        });
      }
    }
  }

  const sortedJuz = Array.from(juzCounts.keys()).sort((a, b) => a - b);
  for (const juz of sortedJuz) {
    const count = juzCounts.get(juz);
    filters.push({
      key: `juz:${juz}`,
      label: `Juz ${pad2(juz)} (${count})`,
      count,
      group: 'juz'
    });
  }

  for (const [surahName, info] of surahMap.entries()) {
    filters.push({
      key: `surah:${surahName}`,
      label: `${info.display} (${info.count})`,
      count: info.count,
      group: 'surah'
    });
  }

  return filters;
}

/**
 * Filters tracks according to a filterKey ('all', 'juz:<n>', or 'surah:<slug>').
 *
 * @param {Array<object>} tracks
 * @param {string} [filterKey='all']
 * @returns {Array<object>}
 */
export function filterTracks(tracks = [], filterKey = 'all') {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  if (!filterKey || filterKey === 'all') return tracks;

  if (filterKey.startsWith('juz:')) {
    const targetJuz = Number.parseInt(filterKey.slice(4), 10);
    return tracks.filter((t) => t.juz === targetJuz);
  }

  if (filterKey.startsWith('surah:')) {
    const targetSurah = filterKey.slice(6).toLowerCase();
    return tracks.filter((t) => t.surahName === targetSurah);
  }

  return tracks;
}

/**
 * Loads persisted player preferences from storage.
 * @param {Storage} [storage=globalThis.localStorage]
 * @returns {{ trackId: string|null, filterKey: string, repeatMode: string }}
 */
export function loadPersistedState(storage = globalThis.localStorage) {
  const defaults = {
    trackId: null,
    filterKey: 'all',
    repeatMode: REPEAT_MODES.ALL
  };

  if (!storage || typeof storage.getItem !== 'function') {
    return defaults;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const repeatMode = REPEAT_ORDER.includes(parsed?.repeatMode)
      ? parsed.repeatMode
      : defaults.repeatMode;
    const filterKey =
      typeof parsed?.filterKey === 'string' && parsed.filterKey.trim()
        ? parsed.filterKey
        : defaults.filterKey;
    const trackId = typeof parsed?.trackId === 'string' ? parsed.trackId : null;

    return { trackId, filterKey, repeatMode };
  } catch {
    return defaults;
  }
}

/**
 * Saves player preferences to storage.
 * @param {{ trackId: string|null, filterKey: string, repeatMode: string }} state
 * @param {Storage} [storage=globalThis.localStorage]
 */
export function savePersistedState(state, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trackId: state.trackId ?? null,
        filterKey: state.filterKey || 'all',
        repeatMode: state.repeatMode || REPEAT_MODES.ALL
      })
    );
  } catch {
    // Ignore quota or private browsing storage errors
  }
}

/**
 * Creates the core playback & playlist controller.
 *
 * @param {object} [options]
 * @param {HTMLAudioElement} [options.audio]
 * @param {Storage} [options.storage]
 * @param {MediaSession} [options.mediaSession]
 * @param {typeof MediaMetadata} [options.MediaMetadataClass]
 * @param {(snapshot: object) => void} [options.onChange]
 */
export function createPlayerController(options = {}) {
  const audio =
    options.audio ||
    (typeof Audio !== 'undefined' ? new Audio() : createMockAudioElement());
  const storage = options.storage !== undefined ? options.storage : globalThis.localStorage;
  const mediaSession =
    options.mediaSession !== undefined
      ? options.mediaSession
      : globalThis.navigator?.mediaSession;
  const MediaMetadataClass =
    options.MediaMetadataClass !== undefined
      ? options.MediaMetadataClass
      : globalThis.MediaMetadata;
  const listeners = new Set();
  if (typeof options.onChange === 'function') {
    listeners.add(options.onChange);
  }

  audio.preload = 'metadata';

  const persisted = loadPersistedState(storage);

  const state = {
    allTracks: [],
    filteredTracks: [],
    filterKey: persisted.filterKey,
    currentTrackId: persisted.trackId,
    repeatMode: persisted.repeatMode,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    error: null
  };

  function getCurrentTrack() {
    return (
      state.filteredTracks.find((t) => t.id === state.currentTrackId) ||
      state.allTracks.find((t) => t.id === state.currentTrackId) ||
      null
    );
  }

  function getSnapshot() {
    const currentTrack = getCurrentTrack();
    const currentIndex = state.filteredTracks.findIndex(
      (t) => t.id === state.currentTrackId
    );
    const progressPercent =
      state.duration > 0
        ? Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100))
        : 0;

    return {
      ...state,
      currentTrack,
      currentIndex,
      progressPercent,
      formattedCurrentTime: formatTime(state.currentTime),
      formattedDuration: formatTime(state.duration),
      repeatLabel: REPEAT_LABELS[state.repeatMode] || REPEAT_LABELS[REPEAT_MODES.ALL],
      availableFilters: getAvailableFilters(state.allTracks)
    };
  }

  function notify() {
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function persist() {
    savePersistedState(
      {
        trackId: state.currentTrackId,
        filterKey: state.filterKey,
        repeatMode: state.repeatMode
      },
      storage
    );
  }

  function updateMediaSessionMetadata() {
    if (!mediaSession) return;
    const track = getCurrentTrack();
    if (!track) {
      mediaSession.metadata = null;
      return;
    }

    const metadataInit = {
      title: track.title,
      artist: track.isParsed ? `Surah ${track.surahDisplay}` : 'Hafz Recitation',
      album: track.subtitle
    };

    try {
      mediaSession.metadata =
        typeof MediaMetadataClass === 'function'
          ? new MediaMetadataClass(metadataInit)
          : metadataInit;
    } catch {
      mediaSession.metadata = metadataInit;
    }
  }

  function updateMediaSessionPlaybackState() {
    if (!mediaSession) return;
    try {
      mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignore unsupported playbackState assignments
    }
  }

  function updateMediaSessionPosition() {
    if (!mediaSession || typeof mediaSession.setPositionState !== 'function') return;
    if (!Number.isFinite(state.duration) || state.duration <= 0) return;

    try {
      mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(state.duration, Math.max(0, state.currentTime))
      });
    } catch {
      // Ignore position state errors on browsers with partial support
    }
  }

  function registerMediaSessionHandlers() {
    if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return;

    const handlers = {
      play: () => play(),
      pause: () => pause(),
      stop: () => stop(),
      previoustrack: () => prev(),
      nexttrack: () => next({ fromEnded: false }),
      seekto: (details) => {
        if (details && Number.isFinite(details.seekTime)) {
          seek(details.seekTime);
        }
      }
    };

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers do not support all actions (e.g., 'stop')
      }
    }
  }

  function syncAudioSource(track) {
    if (!track) {
      audio.removeAttribute?.('src');
      audio.src = '';
      state.currentTime = 0;
      state.duration = 0;
      state.isLoading = false;
      return;
    }

    if (audio.src !== track.url) {
      state.isLoading = true;
      state.currentTime = 0;
      state.duration = 0;
      state.error = null;
      audio.src = track.url;
      audio.load?.();
    }
  }

  async function play() {
    if (state.filteredTracks.length === 0) return false;

    let track = getCurrentTrack();
    if (!track) {
      track = state.filteredTracks[0];
      state.currentTrackId = track.id;
      persist();
    }

    syncAudioSource(track);
    updateMediaSessionMetadata();

    try {
      state.error = null;
      const playPromise = audio.play();
      state.isPlaying = true;
      updateMediaSessionPlaybackState();
      notify();

      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      state.isLoading = false;
      notify();
      return true;
    } catch (err) {
      state.isPlaying = false;
      state.isLoading = false;
      state.error = err?.message || 'Unable to play audio track';
      updateMediaSessionPlaybackState();
      notify();
      return false;
    }
  }

  function pause() {
    audio.pause?.();
    state.isPlaying = false;
    state.isLoading = false;
    updateMediaSessionPlaybackState();
    notify();
  }

  function stop() {
    audio.pause?.();
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore if audio is not ready
    }
    state.isPlaying = false;
    state.isLoading = false;
    state.currentTime = 0;
    if (mediaSession) {
      try {
        mediaSession.playbackState = 'none';
      } catch {
        // Ignore
      }
    }
    notify();
  }

  async function togglePlay() {
    if (state.isPlaying) {
      pause();
      return false;
    }
    return play();
  }

  async function selectTrack(trackId, { autoplay = false } = {}) {
    const track =
      state.filteredTracks.find((t) => t.id === trackId) ||
      state.allTracks.find((t) => t.id === trackId);
    if (!track) return false;

    const isSameTrack = state.currentTrackId === track.id && audio.src === track.url;
    state.currentTrackId = track.id;
    persist();

    if (!isSameTrack) {
      syncAudioSource(track);
    }
    updateMediaSessionMetadata();

    if (autoplay) {
      return play();
    }

    state.isPlaying = false;
    notify();
    return true;
  }

  async function next({ fromEnded = false } = {}) {
    const list = state.filteredTracks;
    if (list.length === 0) return false;

    if (fromEnded && state.repeatMode === REPEAT_MODES.ONE) {
      seek(0);
      return play();
    }

    const currentIdx = list.findIndex((t) => t.id === state.currentTrackId);
    const isLast = currentIdx === -1 || currentIdx >= list.length - 1;

    if (isLast) {
      if (fromEnded && state.repeatMode === REPEAT_MODES.ONCE) {
        stop();
        return false;
      }
      // Wrap around to the first track in the ordered playlist
      const firstTrack = list[0];
      const shouldPlay = state.isPlaying || fromEnded;
      return selectTrack(firstTrack.id, { autoplay: shouldPlay });
    }

    const nextTrack = list[currentIdx + 1];
    const shouldPlay = state.isPlaying || fromEnded;
    return selectTrack(nextTrack.id, { autoplay: shouldPlay });
  }

  async function prev() {
    const list = state.filteredTracks;
    if (list.length === 0) return false;

    if (state.currentTime > 3) {
      seek(0);
      return state.isPlaying ? play() : true;
    }

    const currentIdx = list.findIndex((t) => t.id === state.currentTrackId);
    const prevIdx = currentIdx <= 0 ? list.length - 1 : currentIdx - 1;
    const prevTrack = list[prevIdx];
    return selectTrack(prevTrack.id, { autoplay: state.isPlaying });
  }

  function seek(timeSeconds) {
    if (!Number.isFinite(timeSeconds)) return;
    const maxTime = state.duration > 0 ? state.duration : Math.max(0, timeSeconds);
    const clamped = Math.min(maxTime, Math.max(0, timeSeconds));
    try {
      audio.currentTime = clamped;
    } catch {
      // Ignore if media not loaded yet
    }
    state.currentTime = clamped;
    updateMediaSessionPosition();
    notify();
  }

  function seekByPercent(percent) {
    if (!Number.isFinite(percent) || state.duration <= 0) return;
    const clampedPct = Math.min(100, Math.max(0, percent));
    seek((clampedPct / 100) * state.duration);
  }

  function setFilter(filterKey = 'all') {
    state.filterKey = filterKey || 'all';
    state.filteredTracks = filterTracks(state.allTracks, state.filterKey);

    if (
      state.filteredTracks.length > 0 &&
      !state.filteredTracks.some((t) => t.id === state.currentTrackId)
    ) {
      const wasPlaying = state.isPlaying;
      const firstTrack = state.filteredTracks[0];
      state.currentTrackId = firstTrack.id;
      syncAudioSource(firstTrack);
      updateMediaSessionMetadata();
      if (wasPlaying) {
        play();
      }
    }

    persist();
    notify();
  }

  function setRepeatMode(mode) {
    if (!REPEAT_ORDER.includes(mode)) return state.repeatMode;
    state.repeatMode = mode;
    persist();
    notify();
    return state.repeatMode;
  }

  function cycleRepeatMode() {
    return setRepeatMode(getNextRepeatMode(state.repeatMode));
  }

  function setTracks(tracks = []) {
    state.allTracks = Array.isArray(tracks) ? tracks : [];
    let filtered = filterTracks(state.allTracks, state.filterKey);

    // If persisted filter matches nothing in the current track list, reset to 'all'
    if (filtered.length === 0 && state.allTracks.length > 0 && state.filterKey !== 'all') {
      state.filterKey = 'all';
      filtered = state.allTracks;
    }
    state.filteredTracks = filtered;

    if (state.filteredTracks.length > 0) {
      const hasCurrent = state.filteredTracks.some((t) => t.id === state.currentTrackId);
      if (!hasCurrent) {
        state.currentTrackId = state.filteredTracks[0].id;
      }
      const active = getCurrentTrack();
      syncAudioSource(active);
      updateMediaSessionMetadata();
    } else {
      state.currentTrackId = null;
      syncAudioSource(null);
      updateMediaSessionMetadata();
    }

    persist();
    notify();
  }

  function subscribe(listener) {
    if (typeof listener === 'function') {
      listeners.add(listener);
      listener(getSnapshot());
    }
    return () => listeners.delete(listener);
  }

  // Wire up HTMLAudioElement events
  audio.addEventListener?.('loadstart', () => {
    state.isLoading = true;
    notify();
  });

  audio.addEventListener?.('waiting', () => {
    state.isLoading = true;
    notify();
  });

  audio.addEventListener?.('loadedmetadata', () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    state.isLoading = false;
    updateMediaSessionPosition();
    notify();
  });

  audio.addEventListener?.('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      state.duration = audio.duration;
      updateMediaSessionPosition();
      notify();
    }
  });

  audio.addEventListener?.('canplay', () => {
    state.isLoading = false;
    notify();
  });

  audio.addEventListener?.('playing', () => {
    state.isLoading = false;
    state.isPlaying = true;
    updateMediaSessionPlaybackState();
    notify();
  });

  audio.addEventListener?.('pause', () => {
    if (!audio.ended) {
      state.isPlaying = false;
      updateMediaSessionPlaybackState();
      notify();
    }
  });

  audio.addEventListener?.('timeupdate', () => {
    state.currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      state.duration = audio.duration;
    }
    updateMediaSessionPosition();
    notify();
  });

  audio.addEventListener?.('ended', () => {
    next({ fromEnded: true });
  });

  audio.addEventListener?.('error', () => {
    state.isLoading = false;
    state.isPlaying = false;
    state.error = 'Failed to load or play audio file';
    notify();
  });

  registerMediaSessionHandlers();

  return {
    audio,
    getSnapshot,
    subscribe,
    setTracks,
    selectTrack,
    play,
    pause,
    stop,
    togglePlay,
    next,
    prev,
    seek,
    seekByPercent,
    setFilter,
    setRepeatMode,
    cycleRepeatMode
  };
}

/**
 * Minimal fallback mock Audio element for headless/unit test environments.
 */
export function createMockAudioElement() {
  const handlers = new Map();
  return {
    src: '',
    currentTime: 0,
    duration: 120,
    paused: true,
    ended: false,
    preload: 'metadata',
    playbackRate: 1,
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn);
    },
    dispatchEvent(type, detail = {}) {
      for (const fn of handlers.get(type) || []) {
        fn(detail);
      }
    },
    removeAttribute(attr) {
      if (attr === 'src') this.src = '';
    },
    load() {
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplay');
    },
    async play() {
      this.paused = false;
      this.dispatchEvent('playing');
    },
    pause() {
      this.paused = true;
      this.dispatchEvent('pause');
    }
  };
}
