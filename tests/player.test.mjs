import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManifestEntries } from '../src/loader.js';
import {
  createMockAudioElement,
  createPlayerController,
  filterTracks,
  formatTime,
  getAvailableFilters,
  REPEAT_MODES,
  STORAGE_KEY
} from '../src/player.js';

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    clear: () => map.clear()
  };
}

function createMockMediaSession() {
  const actions = {};
  const positions = [];
  return {
    metadata: null,
    playbackState: 'none',
    actions,
    positions,
    setActionHandler(action, fn) {
      actions[action] = fn;
    },
    setPositionState(pos) {
      positions.push(pos);
    }
  };
}

const SAMPLE_TRACKS = normalizeManifestEntries([
  'juz 29 01 al-mulk 01-12.m4a',
  'juz 30 01 an-naba 01-30.m4a',
  'juz 30 02 an-naziat 01-20.m4a'
]);

describe('Audio Player & Playlist Engine (Phase 2)', () => {
  it('formats playback time as MM:SS', () => {
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(65.8), '01:05');
    assert.equal(formatTime(-5), '00:00');
    assert.equal(formatTime(Number.NaN), '00:00');
  });

  it('extracts available filters and filters by All, Juz, and Surah', () => {
    const filters = getAvailableFilters(SAMPLE_TRACKS);
    const keys = filters.map((f) => f.key);
    assert.deepEqual(keys, [
      'all',
      'juz:29',
      'juz:30',
      'surah:al-mulk',
      'surah:an-naba',
      'surah:an-naziat'
    ]);

    assert.equal(filterTracks(SAMPLE_TRACKS, 'all').length, 3);
    assert.equal(filterTracks(SAMPLE_TRACKS, 'juz:30').length, 2);
    assert.equal(filterTracks(SAMPLE_TRACKS, 'surah:al-mulk').length, 1);
  });

  it('controls playback: play, pause, stop, seek, next, and prev', async () => {
    const audio = createMockAudioElement();
    const storage = createMockStorage();
    const player = createPlayerController({ audio, storage, mediaSession: null });

    player.setTracks(SAMPLE_TRACKS);
    assert.equal(player.getSnapshot().currentTrack.surahName, 'al-mulk');

    await player.play();
    assert.equal(player.getSnapshot().isPlaying, true);

    player.seek(45);
    assert.equal(player.getSnapshot().currentTime, 45);
    assert.equal(player.getSnapshot().formattedCurrentTime, '00:45');

    // When currentTime > 3s, prev() restarts current track at 0s
    await player.prev();
    assert.equal(player.getSnapshot().currentTime, 0);
    assert.equal(player.getSnapshot().currentTrack.surahName, 'al-mulk');

    // When currentTime <= 3s, prev() wraps to last track
    await player.prev();
    assert.equal(player.getSnapshot().currentTrack.surahName, 'an-naziat');

    // next() wraps around to first track
    await player.next();
    assert.equal(player.getSnapshot().currentTrack.surahName, 'al-mulk');

    player.pause();
    assert.equal(player.getSnapshot().isPlaying, false);

    player.seekByPercent(50);
    assert.equal(player.getSnapshot().currentTime, 60);

    player.stop();
    assert.equal(player.getSnapshot().isPlaying, false);
    assert.equal(player.getSnapshot().currentTime, 0);
  });

  it('handles repeat modes (one, all, once) on track ended event', async () => {
    const audio = createMockAudioElement();
    const storage = createMockStorage();
    const player = createPlayerController({ audio, storage, mediaSession: null });
    player.setTracks(SAMPLE_TRACKS);

    // 1. Repeat ONE: stays on same track and replays from 0
    player.setRepeatMode(REPEAT_MODES.ONE);
    await player.selectTrack(SAMPLE_TRACKS[0].id, { autoplay: true });
    player.seek(90);
    audio.dispatchEvent('ended');
    assert.equal(player.getSnapshot().currentTrackId, SAMPLE_TRACKS[0].id);
    assert.equal(player.getSnapshot().currentTime, 0);
    assert.equal(player.getSnapshot().isPlaying, true);

    // 2. Repeat ALL: wraps from last track back to first track
    player.setRepeatMode(REPEAT_MODES.ALL);
    await player.selectTrack(SAMPLE_TRACKS[2].id, { autoplay: true });
    audio.dispatchEvent('ended');
    assert.equal(player.getSnapshot().currentTrackId, SAMPLE_TRACKS[0].id);
    assert.equal(player.getSnapshot().isPlaying, true);

    // 3. Repeat ONCE: stops when last track in playlist ends
    player.setRepeatMode(REPEAT_MODES.ONCE);
    await player.selectTrack(SAMPLE_TRACKS[2].id, { autoplay: true });
    audio.dispatchEvent('ended');
    assert.equal(player.getSnapshot().isPlaying, false);
    assert.equal(player.getSnapshot().currentTime, 0);
  });

  it('persists and restores trackId, filterKey, and repeatMode in localStorage', () => {
    const storage = createMockStorage();
    const player1 = createPlayerController({
      audio: createMockAudioElement(),
      storage,
      mediaSession: null
    });

    player1.setTracks(SAMPLE_TRACKS);
    player1.setFilter('juz:30');
    player1.selectTrack(SAMPLE_TRACKS[2].id);
    player1.setRepeatMode(REPEAT_MODES.ONE);

    const rawSaved = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(rawSaved.filterKey, 'juz:30');
    assert.equal(rawSaved.trackId, SAMPLE_TRACKS[2].id);
    assert.equal(rawSaved.repeatMode, REPEAT_MODES.ONE);

    const player2 = createPlayerController({
      audio: createMockAudioElement(),
      storage,
      mediaSession: null
    });
    player2.setTracks(SAMPLE_TRACKS);

    const snap = player2.getSnapshot();
    assert.equal(snap.filterKey, 'juz:30');
    assert.equal(snap.filteredTracks.length, 2);
    assert.equal(snap.currentTrackId, SAMPLE_TRACKS[2].id);
    assert.equal(snap.repeatMode, REPEAT_MODES.ONE);
  });

  it('updates navigator.mediaSession metadata and responds to lock-screen actions', async () => {
    const audio = createMockAudioElement();
    const mediaSession = createMockMediaSession();
    const player = createPlayerController({
      audio,
      storage: createMockStorage(),
      mediaSession,
      MediaMetadataClass: class {
        constructor(init) {
          Object.assign(this, init);
        }
      }
    });

    player.setTracks(SAMPLE_TRACKS);
    assert.equal(mediaSession.metadata.title, 'Al-Mulk (01–12)');
    assert.equal(mediaSession.metadata.album, 'Juz 29 • Page 01');

    await mediaSession.actions.play();
    assert.equal(player.getSnapshot().isPlaying, true);
    assert.equal(mediaSession.playbackState, 'playing');

    await mediaSession.actions.nexttrack();
    assert.equal(player.getSnapshot().currentTrack.surahName, 'an-naba');

    mediaSession.actions.seekto({ seekTime: 33 });
    assert.equal(player.getSnapshot().currentTime, 33);

    mediaSession.actions.pause();
    assert.equal(player.getSnapshot().isPlaying, false);
    assert.equal(mediaSession.playbackState, 'paused');
  });
});
