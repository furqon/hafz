#!/usr/bin/env node
/**
 * Scans `public/audio/` for `.m4a` and `.mp3` recordings and writes
 * a sorted `public/audio/tracks.json` manifest.
 */

import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSupportedAudioFile, parseTrackFilename, sortTracks } from '../src/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_AUDIO_DIR = join(ROOT_DIR, 'public', 'audio');

/**
 * Scans an audio directory and generates `tracks.json`.
 * @param {string} [audioDir=DEFAULT_AUDIO_DIR]
 * @returns {Promise<Array<object>>}
 */
export async function generateTracksManifest(audioDir = DEFAULT_AUDIO_DIR) {
  await mkdir(audioDir, { recursive: true });
  const entries = await readdir(audioDir, { withFileTypes: true });

  const tracks = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isSupportedAudioFile(entry.name)) continue;

    const url = `./public/audio/${encodeURIComponent(entry.name)}`;
    const parsed = parseTrackFilename(entry.name, url);
    if (parsed) {
      tracks.push(parsed);
    }
  }

  const sorted = sortTracks(tracks);
  const manifestPath = join(audioDir, 'tracks.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    count: sorted.length,
    tracks: sorted
  };

  await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return sorted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tracks = await generateTracksManifest();
  console.log(`Generated public/audio/tracks.json with ${tracks.length} track(s).`);
}
