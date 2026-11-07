import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStaticTracks,
  loadTracksFromFileList,
  mergeAndSortTracks,
  normalizeManifestEntries
} from '../src/loader.js';

describe('Audio Folder & Track Loader', () => {
  it('normalizes string and object entries from tracks.json and sorts them', () => {
    const manifest = {
      tracks: [
        'juz 30 02 an-naziat 01-20.m4a',
        { filename: 'juz 30 01 an-naba 01-30.m4a', url: '/custom/an-naba.m4a' },
        '.DS_Store'
      ]
    };

    const tracks = normalizeManifestEntries(manifest, '/audio/');
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].filename, 'juz 30 01 an-naba 01-30.m4a');
    assert.equal(tracks[0].url, '/custom/an-naba.m4a');
    assert.equal(tracks[1].filename, 'juz 30 02 an-naziat 01-20.m4a');
    assert.equal(tracks[1].url, '/audio/juz%2030%2002%20an-naziat%2001-20.m4a');
  });

  it('fetches static tracks via loadStaticTracks and handles errors gracefully', async () => {
    const mockFetchOk = async () => ({
      ok: true,
      json: async () => ['juz 30 01 an-naba 01-30.m4a']
    });

    const tracks = await loadStaticTracks('/tracks.json', '/audio/', mockFetchOk);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].surahName, 'an-naba');

    const mockFetchFail = async () => ({ ok: false });
    const empty = await loadStaticTracks('/tracks.json', '/audio/', mockFetchFail);
    assert.deepEqual(empty, []);
  });

  it('loads tracks from local FileList, creates object URLs, and revokes old ones', () => {
    const revoked = [];
    let counter = 0;
    const mockUrlApi = {
      createObjectURL: () => `blob:mock-${++counter}`,
      revokeObjectURL: (url) => revoked.push(url)
    };

    const firstBatch = [
      { name: 'juz 30 03 abasa 01-42.m4a', webkitRelativePath: 'quran/juz 30 03 abasa 01-42.m4a' },
      { name: '.DS_Store' }
    ];

    const firstLoaded = loadTracksFromFileList(firstBatch, { urlApi: mockUrlApi });
    assert.equal(firstLoaded.length, 1);
    assert.equal(firstLoaded[0].url, 'blob:mock-1');
    assert.equal(firstLoaded[0].source, 'local');

    const secondBatch = [{ name: 'juz 30 01 an-naba 01-30.m4a' }];
    const secondLoaded = loadTracksFromFileList(secondBatch, {
      revokePrevious: true,
      urlApi: mockUrlApi
    });

    assert.deepEqual(revoked, ['blob:mock-1']);
    assert.equal(secondLoaded.length, 1);
    assert.equal(secondLoaded[0].url, 'blob:mock-2');
  });

  it('merges and deduplicates static and local tracks in natural order', () => {
    const base = normalizeManifestEntries(['juz 30 02 an-naziat 01-20.m4a']);
    const incoming = normalizeManifestEntries(['juz 30 01 an-naba 01-30.m4a']);
    const merged = mergeAndSortTracks(base, incoming);

    assert.equal(merged.length, 2);
    assert.equal(merged[0].surahName, 'an-naba');
    assert.equal(merged[1].surahName, 'an-naziat');
  });
});
