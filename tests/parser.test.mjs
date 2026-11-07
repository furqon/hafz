import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSupportedAudioFile,
  parseTrackFilename,
  sortTracks
} from '../src/parser.js';

describe('Filename Parser & Metadata Extractor', () => {
  it('parses standard m4a filename matching juz xx yy surah_name aa-bb.m4a', () => {
    const track = parseTrackFilename(
      'juz 30 01 an-naba 01-30.m4a',
      '/audio/juz%2030%2001%20an-naba%2001-30.m4a'
    );

    assert.ok(track);
    assert.equal(track.filename, 'juz 30 01 an-naba 01-30.m4a');
    assert.equal(track.url, '/audio/juz%2030%2001%20an-naba%2001-30.m4a');
    assert.equal(track.juz, 30);
    assert.equal(track.pageInJuz, 1);
    assert.equal(track.surahName, 'an-naba');
    assert.equal(track.surahDisplay, 'An-Naba');
    assert.equal(track.ayatStart, 1);
    assert.equal(track.ayatEnd, 30);
    assert.equal(track.ext, 'm4a');
    assert.equal(track.isParsed, true);
    assert.equal(track.title, 'An-Naba (01–30)');
    assert.equal(track.subtitle, 'Juz 30 • Page 01');
  });

  it('handles multi-word surah names, underscores, and case-insensitive MP3/M4A extensions', () => {
    const spaceSurah = parseTrackFilename('juz 01 02 al baqarah 06-16.m4a');
    assert.ok(spaceSurah);
    assert.equal(spaceSurah.juz, 1);
    assert.equal(spaceSurah.pageInJuz, 2);
    assert.equal(spaceSurah.surahName, 'al-baqarah');
    assert.equal(spaceSurah.surahDisplay, 'Al Baqarah');
    assert.equal(spaceSurah.ayatStart, 6);
    assert.equal(spaceSurah.ayatEnd, 16);
    assert.equal(spaceSurah.ext, 'm4a');

    const underscoreMp3 = parseTrackFilename('JUZ_29_20_Al_Mursalat_01-50.MP3');
    assert.ok(underscoreMp3);
    assert.equal(underscoreMp3.juz, 29);
    assert.equal(underscoreMp3.pageInJuz, 20);
    assert.equal(underscoreMp3.surahName, 'al-mursalat');
    assert.equal(underscoreMp3.surahDisplay, 'Al Mursalat');
    assert.equal(underscoreMp3.ayatStart, 1);
    assert.equal(underscoreMp3.ayatEnd, 50);
    assert.equal(underscoreMp3.ext, 'mp3');
  });

  it('strips directory paths before parsing', () => {
    const track = parseTrackFilename('recordings/kids/juz 30 05 al-infitar 01-19.m4a');
    assert.ok(track);
    assert.equal(track.filename, 'juz 30 05 al-infitar 01-19.m4a');
    assert.equal(track.juz, 30);
    assert.equal(track.pageInJuz, 5);
    assert.equal(track.surahName, 'al-infitar');
  });

  it('provides graceful fallback metadata when filename does not match strict pattern', () => {
    const fallback = parseTrackFilename('morning-practice-al-fatihah.m4a', 'blob:123');
    assert.ok(fallback);
    assert.equal(fallback.isParsed, false);
    assert.equal(fallback.juz, null);
    assert.equal(fallback.pageInJuz, null);
    assert.equal(fallback.ayatStart, null);
    assert.equal(fallback.ayatEnd, null);
    assert.equal(fallback.ext, 'm4a');
    assert.equal(fallback.title, 'morning-practice-al-fatihah');
    assert.equal(fallback.subtitle, 'Audio Recording');
  });

  it('rejects unsupported file extensions and hidden dotfiles', () => {
    assert.equal(isSupportedAudioFile('.DS_Store'), false);
    assert.equal(isSupportedAudioFile('._juz 30 01 an-naba 01-30.m4a'), false);
    assert.equal(isSupportedAudioFile('readme.txt'), false);
    assert.equal(parseTrackFilename('.DS_Store'), null);
    assert.equal(parseTrackFilename('notes.pdf'), null);
  });

  it('sorts tracks naturally by juz -> pageInJuz -> ayatStart and places fallbacks last', () => {
    const raw = [
      parseTrackFilename('custom_recording.m4a'),
      parseTrackFilename('juz 30 02 an-naziat 01-15.m4a'),
      parseTrackFilename('juz 29 01 al-mulk 01-12.m4a'),
      parseTrackFilename('juz 30 01 an-naba 31-40.m4a'),
      parseTrackFilename('juz 30 01 an-naba 01-30.m4a')
    ];

    const sorted = sortTracks(raw);
    assert.deepEqual(
      sorted.map((t) => t.filename),
      [
        'juz 29 01 al-mulk 01-12.m4a',
        'juz 30 01 an-naba 01-30.m4a',
        'juz 30 01 an-naba 31-40.m4a',
        'juz 30 02 an-naziat 01-15.m4a',
        'custom_recording.m4a'
      ]
    );
  });
});
