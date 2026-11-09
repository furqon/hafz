import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackFilename } from '../src/parser.js';
import {
  computeMushafPage,
  loadQuranPageForTrack,
  QURAN_CACHE_KEY,
  toArabicIndicDigits
} from '../src/quran.js';

describe('Quran Mushaf Page Mapper & Reader Engine (Phase 5)', () => {
  it('converts numbers to Eastern Arabic-Indic digits', () => {
    assert.equal(toArabicIndicDigits(1), '١');
    assert.equal(toArabicIndicDigits(12), '١٢');
    assert.equal(toArabicIndicDigits(30), '٣٠');
  });

  it('maps (juz xx, page yy) and surah_name to 604-page Madani Mushaf page numbers', () => {
    // Juz 1 edge cases: Al-Fatihah -> Page 1, Al-Baqarah page 01 -> Page 2
    assert.equal(
      computeMushafPage(parseTrackFilename('juz 01 01 al-fatihah 01-07.m4a')),
      1
    );
    assert.equal(
      computeMushafPage(parseTrackFilename('juz 01 01 al-baqarah 01-05.m4a')),
      2
    );

    // Juz 29 Page 01 -> Mushaf Page 562 (Al-Mulk)
    assert.equal(
      computeMushafPage(parseTrackFilename('juz 29 01 al-mulk 01-12.m4a')),
      562
    );

    // Juz 30 Page 01 -> Mushaf Page 582 (An-Naba), Page 02 -> 583 (An-Naziat)
    assert.equal(
      computeMushafPage(parseTrackFilename('juz 30 01 an-naba 01-30.m4a')),
      582
    );
    assert.equal(
      computeMushafPage(parseTrackFilename('juz 30 02 an-naziat 01-20.m4a')),
      583
    );

    // Fallback by surahName when juz/pageInJuz are absent
    assert.equal(computeMushafPage({ surahName: 'al-ikhlas' }), 604);
  });

  it('loads Uthmani verses for a track, highlights the active Ayat range, and caches offline', async () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    };

    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        pages: {
          562: {
            mushafPage: 562,
            juz: 29,
            pageInJuz: 1,
            surahNumber: 67,
            surahName: 'al-mulk',
            surahDisplay: 'Al-Mulk',
            surahArabic: 'سُورَةُ ٱلْمُلْكِ',
            bismillah: true,
            verses: [
              { ayah: 1, text: 'تَبَـٰرَكَ ٱلَّذِى بِيَدِهِ ٱلْمُلْكُ' },
              { ayah: 2, text: 'ٱلَّذِى خَلَقَ ٱلْمَوْتَ وَٱلْحَيَوٰةَ' },
              { ayah: 3, text: 'ٱلَّذِى خَلَقَ سَبْعَ سَمَـٰوَٰتٍ طِبَاقًا' }
            ]
          }
        }
      })
    });

    const track = parseTrackFilename('juz 29 01 al-mulk 01-02.m4a');
    const pageData = await loadQuranPageForTrack(track, {
      quranDataUrl: 'http://localhost/public/quran/pages.json',
      fetchImpl: mockFetch,
      storage
    });

    assert.equal(pageData.mushafPage, 562);
    assert.equal(pageData.headerLabel, 'Mushaf Page 562');
    assert.equal(pageData.verses.length, 3);
    assert.equal(pageData.verses[0].isHighlighted, true);
    assert.equal(pageData.verses[1].isHighlighted, true);
    assert.equal(pageData.verses[2].isHighlighted, false);
    assert.equal(pageData.verses[0].arabicNumber, '١');

    // Verify page 562 was persisted into offline localStorage cache
    const cached = JSON.parse(storage.getItem(QURAN_CACHE_KEY));
    assert.ok(cached['562']);

    // Verify offline load succeeds from storage even if fetch fails
    const offlineFetch = async () => {
      throw new Error('Offline');
    };
    const offlinePage = await loadQuranPageForTrack(track, {
      quranDataUrl: 'http://localhost/public/quran/pages.json',
      fetchImpl: offlineFetch,
      storage
    });
    assert.equal(offlinePage.mushafPage, 562);
    assert.equal(offlinePage.verses.length, 3);
  });
});
