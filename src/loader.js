/**
 * Hafz Audio Folder & Track Loader
 *
 * Supports:
 *   1. Loading bundled/hosted audio tracks via static `tracks.json` manifest
 *   2. Loading local folders or files via `<input type="file" webkitdirectory multiple>`
 *   3. Deduplicating, managing blob URLs, and natural sorting (`juz -> pageInJuz -> ayatStart`)
 */

import { isSupportedAudioFile, parseTrackFilename, sortTracks } from './parser.js';

/** Track active blob URLs so they can be revoked when a new folder is loaded */
const activeObjectUrls = new Set();

/**
 * Encodes a filename safely for a relative URL path.
 * @param {string} baseAudioPath
 * @param {string} filename
 * @returns {string}
 */
export function buildAudioUrl(baseAudioPath, filename) {
  const prefix = baseAudioPath.endsWith('/') ? baseAudioPath : `${baseAudioPath}/`;
  return `${prefix}${encodeURIComponent(filename)}`;
}

/**
 * Normalizes manifest entries (strings or track objects) into sorted track metadata objects.
 * @param {Array<string|object>|{tracks?: Array<string|object>}} manifestData
 * @param {string} [baseAudioPath='./public/audio/']
 * @returns {Array<object>}
 */
export function normalizeManifestEntries(manifestData, baseAudioPath = './public/audio/') {
  const rawList = Array.isArray(manifestData)
    ? manifestData
    : Array.isArray(manifestData?.tracks)
      ? manifestData.tracks
      : [];

  const parsed = [];

  for (const item of rawList) {
    if (typeof item === 'string') {
      const url = buildAudioUrl(baseAudioPath, item);
      const track = parseTrackFilename(item, url);
      if (track) parsed.push({ ...track, source: 'static' });
    } else if (item && typeof item === 'object' && typeof item.filename === 'string') {
      const url = item.url || buildAudioUrl(baseAudioPath, item.filename);
      const track = parseTrackFilename(item.filename, url);
      if (track) parsed.push({ ...track, source: item.source || 'static' });
    }
  }

  return sortTracks(parsed);
}

/**
 * Fetches and parses the static `tracks.json` manifest.
 * Returns an empty array if the manifest is missing or fails to load.
 *
 * @param {string} [manifestUrl='./public/audio/tracks.json']
 * @param {string} [baseAudioPath='./public/audio/']
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 * @returns {Promise<Array<object>>}
 */
export async function loadStaticTracks(
  manifestUrl = './public/audio/tracks.json',
  baseAudioPath = './public/audio/',
  fetchImpl = globalThis.fetch
) {
  if (typeof fetchImpl !== 'function') return [];

  try {
    const response = await fetchImpl(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    return normalizeManifestEntries(data, baseAudioPath);
  } catch {
    return [];
  }
}

/**
 * Revokes all tracked local Object URLs to avoid memory leaks.
 * @param {{ revokeObjectURL?: (url: string) => void }} [urlApi=globalThis.URL]
 */
export function revokeLocalTrackUrls(urlApi = globalThis.URL) {
  if (!urlApi || typeof urlApi.revokeObjectURL !== 'function') {
    activeObjectUrls.clear();
    return;
  }
  for (const blobUrl of activeObjectUrls) {
    try {
      urlApi.revokeObjectURL(blobUrl);
    } catch {
      // Ignore revocation errors
    }
  }
  activeObjectUrls.clear();
}

/**
 * Loads tracks from a browser `FileList` or `Array<File>` (e.g., folder picker or multi-file input).
 *
 * @param {FileList|Array<{name: string, webkitRelativePath?: string}>} fileList
 * @param {object} [options]
 * @param {boolean} [options.revokePrevious=true]
 * @param {{ createObjectURL?: (file: any) => string, revokeObjectURL?: (url: string) => void }} [options.urlApi=globalThis.URL]
 * @returns {Array<object>} Sorted array of parsed track objects
 */
export function loadTracksFromFileList(fileList, options = {}) {
  const { revokePrevious = true, urlApi = globalThis.URL } = options;

  if (revokePrevious) {
    revokeLocalTrackUrls(urlApi);
  }

  if (!fileList) return [];
  const files = Array.from(fileList);
  const parsed = [];

  for (const file of files) {
    const name = file?.name || '';
    if (!isSupportedAudioFile(name)) continue;

    const blobUrl =
      urlApi && typeof urlApi.createObjectURL === 'function'
        ? urlApi.createObjectURL(file)
        : name;

    if (blobUrl.startsWith('blob:')) {
      activeObjectUrls.add(blobUrl);
    }

    const track = parseTrackFilename(name, blobUrl);
    if (track) {
      parsed.push({
        ...track,
        source: 'local',
        relativePath: file.webkitRelativePath || name
      });
    }
  }

  return sortTracks(parsed);
}

/**
 * Merges two track lists, deduplicating by `track.id` (newer tracks override older ones),
 * and returns the naturally sorted result.
 *
 * @param {Array<object>} baseTracks
 * @param {Array<object>} incomingTracks
 * @returns {Array<object>}
 */
export function mergeAndSortTracks(baseTracks = [], incomingTracks = []) {
  const map = new Map();
  for (const track of baseTracks) {
    if (track?.id) map.set(track.id, track);
  }
  for (const track of incomingTracks) {
    if (track?.id) map.set(track.id, track);
  }
  return sortTracks(Array.from(map.values()));
}
