/**
 * Hafz Quran Mushaf Page Mapper & Reader Engine (Phase 5)
 *
 * Responsibilities:
 *   - Map (juz xx, page yy [01-20]) and (surah_name, ayat aa-bb) to the 604-page Madani Mushaf
 *   - Load and cache Quran page Uthmani verses for offline reading while listening
 *   - Format Eastern Arabic-Indic verse markers and highlight active Ayat ranges
 */

import { pad2 } from './parser.js';

export const QURAN_CACHE_KEY = 'hafz_quran_pages_v1';

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Lookup table for common Surahs (particularly Juz 1, Juz 29, Juz 30) with their
 * starting Madani Mushaf page and Arabic title.
 */
export const SURAH_INDEX = Object.freeze({
  'al-fatihah': { number: 1, arabic: 'سُورَةُ ٱلْفَاتِحَةِ', display: 'Al-Fatihah', startPage: 1 },
  'al-baqarah': { number: 2, arabic: 'سُورَةُ ٱلْبَقَرَةِ', display: 'Al-Baqarah', startPage: 2 },
  'ali-imran': { number: 3, arabic: 'سُورَةُ آلِ عِمْرَانَ', display: "Ali 'Imran", startPage: 50 },
  'al-kahf': { number: 18, arabic: 'سُورَةُ ٱلْكَهْفِ', display: 'Al-Kahf', startPage: 293 },
  'ya-sin': { number: 36, arabic: 'سُورَةُ يسٓ', display: 'Ya-Sin', startPage: 440 },
  'ar-rahman': { number: 55, arabic: 'سُورَةُ ٱلرَّحْمَـٰنِ', display: 'Ar-Rahman', startPage: 531 },
  'al-waqiah': { number: 56, arabic: 'سُورَةُ ٱلْوَاقِعَةِ', display: "Al-Waqi'ah", startPage: 534 },
  'al-mulk': { number: 67, arabic: 'سُورَةُ ٱلْمُلْكِ', display: 'Al-Mulk', startPage: 562 },
  'al-qalam': { number: 68, arabic: 'سُورَةُ ٱلْقَلَمِ', display: 'Al-Qalam', startPage: 564 },
  'al-haqqah': { number: 69, arabic: 'سُورَةُ ٱلْحَآقَّةِ', display: 'Al-Haqqah', startPage: 566 },
  'al-maarij': { number: 70, arabic: 'سُورَةُ ٱلْمَعَارِجِ', display: "Al-Ma'arij", startPage: 568 },
  nuh: { number: 71, arabic: 'سُورَةُ نُوحٍ', display: 'Nuh', startPage: 570 },
  'al-jinn': { number: 72, arabic: 'سُورَةُ ٱلْجِنِّ', display: 'Al-Jinn', startPage: 572 },
  'al-muzzammil': { number: 73, arabic: 'سُورَةُ ٱلْمُزَّمِّلِ', display: 'Al-Muzzammil', startPage: 574 },
  'al-muddaththir': { number: 74, arabic: 'سُورَةُ ٱلْمُدَّثِّرِ', display: 'Al-Muddaththir', startPage: 575 },
  'al-qiyamah': { number: 75, arabic: 'سُورَةُ ٱلْقِيَامَةِ', display: 'Al-Qiyamah', startPage: 577 },
  'al-insan': { number: 76, arabic: 'سُورَةُ ٱلْإِنسَانِ', display: 'Al-Insan', startPage: 578 },
  'al-mursalat': { number: 77, arabic: 'سُورَةُ ٱلْمُرْسَلَاتِ', display: 'Al-Mursalat', startPage: 580 },
  'an-naba': { number: 78, arabic: 'سُورَةُ ٱلنَّبَإِ', display: 'An-Naba', startPage: 582 },
  'an-naziat': { number: 79, arabic: 'سُورَةُ ٱلنَّازِعَاتِ', display: "An-Nazi'at", startPage: 583 },
  abasa: { number: 80, arabic: 'سُورَةُ عَبَسَ', display: "'Abasa", startPage: 585 },
  'at-takwir': { number: 81, arabic: 'سُورَةُ ٱلتَّكْوِيرِ', display: 'At-Takwir', startPage: 586 },
  'al-infitar': { number: 82, arabic: 'سُورَةُ ٱلْإِنفِطَارِ', display: 'Al-Infitar', startPage: 587 },
  'al-mutaffifin': { number: 83, arabic: 'سُورَةُ ٱلْمُطَفِّفِينَ', display: 'Al-Mutaffifin', startPage: 587 },
  'al-inshiqaq': { number: 84, arabic: 'سُورَةُ ٱلْإِنشِقَاقِ', display: 'Al-Inshiqaq', startPage: 589 },
  'al-buruj': { number: 85, arabic: 'سُورَةُ ٱلْبُرُوجِ', display: 'Al-Buruj', startPage: 590 },
  'at-tariq': { number: 86, arabic: 'سُورَةُ ٱلطَّارِقِ', display: 'At-Tariq', startPage: 591 },
  'al-ala': { number: 87, arabic: 'سُورَةُ ٱلْأَعْلَىٰ', display: "Al-A'la", startPage: 591 },
  'al-ghashiyah': { number: 88, arabic: 'سُورَةُ ٱلْغَاشِيَةِ', display: 'Al-Ghashiyah', startPage: 592 },
  'al-fajr': { number: 89, arabic: 'سُورَةُ ٱلْفَجْرِ', display: 'Al-Fajr', startPage: 593 },
  'al-balad': { number: 90, arabic: 'سُورَةُ ٱلْبَلَدِ', display: 'Al-Balad', startPage: 594 },
  'ash-shams': { number: 91, arabic: 'سُورَةُ ٱلشَّمْسِ', display: 'Ash-Shams', startPage: 595 },
  'al-layl': { number: 92, arabic: 'سُورَةُ ٱللَّيْلِ', display: 'Al-Layl', startPage: 595 },
  'ad-duha': { number: 93, arabic: 'سُورَةُ ٱلضُّحَىٰ', display: 'Ad-Duha', startPage: 596 },
  'ash-sharh': { number: 94, arabic: 'سُورَةُ ٱلشَّرْحِ', display: 'Ash-Sharh', startPage: 596 },
  'at-tin': { number: 95, arabic: 'سُورَةُ ٱلتِّينِ', display: 'At-Tin', startPage: 597 },
  'al-alaq': { number: 96, arabic: 'سُورَةُ ٱلْعَلَقِ', display: "Al-'Alaq", startPage: 597 },
  'al-qadr': { number: 97, arabic: 'سُورَةُ ٱلْقَدْرِ', display: 'Al-Qadr', startPage: 598 },
  'al-bayyinah': { number: 98, arabic: 'سُورَةُ ٱلْبَيِّنَةِ', display: 'Al-Bayyinah', startPage: 598 },
  'az-zalzalah': { number: 99, arabic: 'سُورَةُ ٱلزَّلْزَلَةِ', display: 'Az-Zalzalah', startPage: 599 },
  'al-adiyat': { number: 100, arabic: 'سُورَةُ ٱلْعَادِيَاتِ', display: "Al-'Adiyat", startPage: 599 },
  'al-qariah': { number: 101, arabic: 'سُورَةُ ٱلْقَارِعَةِ', display: "Al-Qari'ah", startPage: 600 },
  'at-takathur': { number: 102, arabic: 'سُورَةُ ٱلتَّكَاثُرِ', display: 'At-Takathur', startPage: 600 },
  'al-asr': { number: 103, arabic: 'سُورَةُ ٱلْعَصْرِ', display: "Al-'Asr", startPage: 601 },
  'al-humazah': { number: 104, arabic: 'سُورَةُ ٱلْهُمَزَةِ', display: 'Al-Humazah', startPage: 601 },
  'al-fil': { number: 105, arabic: 'سُورَةُ ٱلْفِيلِ', display: 'Al-Fil', startPage: 601 },
  quraysh: { number: 106, arabic: 'سُورَةُ قُرَيْشٍ', display: 'Quraysh', startPage: 602 },
  'al-maun': { number: 107, arabic: 'سُورَةُ ٱلْمَاعُونِ', display: "Al-Ma'un", startPage: 602 },
  'al-kawthar': { number: 108, arabic: 'سُورَةُ ٱلْكَوْثَرِ', display: 'Al-Kawthar', startPage: 602 },
  'al-kafirun': { number: 109, arabic: 'سُورَةُ ٱلْكَافِرُونَ', display: 'Al-Kafirun', startPage: 603 },
  'an-nasr': { number: 110, arabic: 'سُورَةُ ٱلنَّصْرِ', display: 'An-Nasr', startPage: 603 },
  'al-masad': { number: 111, arabic: 'سُورَةُ ٱلْمَسَدِ', display: 'Al-Masad', startPage: 603 },
  'al-ikhlas': { number: 112, arabic: 'سُورَةُ ٱلْإِخْلَاصِ', display: 'Al-Ikhlas', startPage: 604 },
  'al-falaq': { number: 113, arabic: 'سُورَةُ ٱلْفَلَقِ', display: 'Al-Falaq', startPage: 604 },
  'an-nas': { number: 114, arabic: 'سُورَةُ ٱلنَّاسِ', display: 'An-Nas', startPage: 604 }
});

/**
 * Converts a positive integer into Eastern Arabic-Indic numerals (e.g. 12 -> "١٢").
 * @param {number} num
 * @returns {string}
 */
export function toArabicIndicDigits(num) {
  if (!Number.isInteger(num) || num < 0) return '';
  return String(num)
    .split('')
    .map((d) => ARABIC_DIGITS[Number(d)] ?? d)
    .join('');
}

/**
 * Computes the 604-page Madani Mushaf page number from a track's Juz, Page-in-Juz, and Surah name.
 *
 * Standard formula:
 *   mushafPage = (juz - 1) * 20 + pageInJuz + 1
 * With edge-case adjustments:
 *   - Juz 1 Al-Fatihah -> Page 1
 *   - Clamped to [1, 604]
 *   - Fallback to SURAH_INDEX[surahName].startPage when juz/pageInJuz are absent
 *
 * @param {object} track
 * @returns {number|null} Mushaf page (1..604) or null
 */
export function computeMushafPage(track) {
  if (!track || typeof track !== 'object') return null;

  const surahSlug = String(track.surahName || '').toLowerCase();
  const surahInfo = SURAH_INDEX[surahSlug] || null;

  if (Number.isInteger(track.juz) && track.juz >= 1 && track.juz <= 30) {
    const pageOffset =
      Number.isInteger(track.pageInJuz) && track.pageInJuz >= 1 ? track.pageInJuz : 1;

    // Edge case: Surah Al-Fatihah at the opening of Juz 1 is on Mushaf Page 1
    if (track.juz === 1 && surahSlug === 'al-fatihah' && pageOffset === 1) {
      return 1;
    }

    const rawPage = (track.juz - 1) * 20 + pageOffset + 1;
    return Math.min(604, Math.max(1, rawPage));
  }

  if (surahInfo) {
    return surahInfo.startPage;
  }

  return null;
}

/**
 * Reads cached Quran pages from storage.
 * @param {Storage} [storage=globalThis.localStorage]
 * @returns {Record<string, object>}
 */
export function readCachedQuranPages(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') return {};
  try {
    const raw = storage.getItem(QURAN_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Writes a Quran page object into the offline storage cache.
 * @param {number|string} mushafPage
 * @param {object} pageData
 * @param {Storage} [storage=globalThis.localStorage]
 */
export function writeCachedQuranPage(
  mushafPage,
  pageData,
  storage = globalThis.localStorage
) {
  if (!storage || typeof storage.setItem !== 'function' || !mushafPage || !pageData) return;
  try {
    const existing = readCachedQuranPages(storage);
    existing[String(mushafPage)] = pageData;
    storage.setItem(QURAN_CACHE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage quota errors
  }
}

let inMemoryPagesBundle = null;

/**
 * Loads the static Quran pages bundle (`./public/quran/pages.json`).
 * @param {string} [quranDataUrl='./public/quran/pages.json']
 * @param {typeof fetch} [fetchImpl=globalThis.fetch]
 * @returns {Promise<Record<string, object>>}
 */
export async function loadQuranPagesBundle(
  quranDataUrl = './public/quran/pages.json',
  fetchImpl = globalThis.fetch
) {
  if (inMemoryPagesBundle && quranDataUrl === './public/quran/pages.json') {
    return inMemoryPagesBundle;
  }
  if (typeof fetchImpl !== 'function') return {};

  try {
    const res = await fetchImpl(quranDataUrl);
    if (!res.ok) return {};
    const data = await res.json();
    const pages = data?.pages && typeof data.pages === 'object' ? data.pages : {};
    if (quranDataUrl === './public/quran/pages.json') {
      inMemoryPagesBundle = pages;
    }
    return pages;
  } catch {
    return {};
  }
}

/**
 * Resolves the Quran Mushaf page and Uthmani verses for a given track,
 * caching the result in `localStorage` for offline reading.
 *
 * @param {object} track
 * @param {object} [options]
 * @param {string} [options.quranDataUrl='./public/quran/pages.json']
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch]
 * @param {Storage} [options.storage=globalThis.localStorage]
 * @returns {Promise<object|null>}
 */
export async function loadQuranPageForTrack(track, options = {}) {
  if (!track) return null;

  const {
    quranDataUrl = './public/quran/pages.json',
    fetchImpl = globalThis.fetch,
    storage = globalThis.localStorage
  } = options;

  const mushafPage = computeMushafPage(track);
  const surahSlug = String(track.surahName || '').toLowerCase();
  const surahInfo = SURAH_INDEX[surahSlug] || null;

  // 1. Check offline localStorage cache first
  const cachedPages = readCachedQuranPages(storage);
  let basePage = mushafPage ? cachedPages[String(mushafPage)] : null;

  // 2. Load from bundled pages.json if not yet cached
  if (!basePage && mushafPage) {
    const bundle = await loadQuranPagesBundle(quranDataUrl, fetchImpl);
    if (bundle[String(mushafPage)]) {
      basePage = bundle[String(mushafPage)];
      writeCachedQuranPage(mushafPage, basePage, storage);
    }
  }

  // 2b. Optional remote fetch from AlQuran Cloud Uthmani API for unbundled pages (1..604)
  if (!basePage && mushafPage && options.allowRemoteFetch && typeof fetchImpl === 'function') {
    try {
      const apiRes = await fetchImpl(
        `https://api.alquran.cloud/v1/page/${mushafPage}/quran-uthmani`
      );
      if (apiRes.ok) {
        const payload = await apiRes.json();
        const ayahs = payload?.data?.ayahs;
        if (Array.isArray(ayahs) && ayahs.length > 0) {
          const firstAyah = ayahs[0];
          basePage = {
            mushafPage,
            juz: firstAyah?.juz || track.juz || 1,
            pageInJuz: track.pageInJuz || 1,
            surahNumber: firstAyah?.surah?.number || surahInfo?.number || null,
            surahName: surahSlug,
            surahDisplay:
              track.surahDisplay || firstAyah?.surah?.englishName || surahInfo?.display || 'Quran',
            surahArabic: firstAyah?.surah?.name || surahInfo?.arabic || 'ٱلْقُرْآنُ ٱلْكَرِيمُ',
            bismillah: false,
            verses: ayahs.map((a) => ({
              ayah: a.numberInSurah,
              text: a.text
            }))
          };
          writeCachedQuranPage(mushafPage, basePage, storage);
        }
      }
    } catch {
      // Offline or remote API unreachable; fall back to local Mushaf descriptor
    }
  }

  // 3. Fallback synthesized Mushaf Page descriptor when specific verse text is not bundled
  if (!basePage) {
    basePage = {
      mushafPage: mushafPage || 1,
      juz: track.juz || 1,
      pageInJuz: track.pageInJuz || 1,
      surahNumber: surahInfo?.number || null,
      surahName: surahSlug,
      surahDisplay: track.surahDisplay || surahInfo?.display || 'Quran Recitation',
      surahArabic: surahInfo?.arabic || 'ٱلْقُرْآنُ ٱلْكَرِيمُ',
      bismillah: surahInfo?.number !== 1 && surahInfo?.number !== 9,
      verses: []
    };
    if (mushafPage) {
      writeCachedQuranPage(mushafPage, basePage, storage);
    }
  }

  const ayatStart = Number.isInteger(track.ayatStart) ? track.ayatStart : null;
  const ayatEnd = Number.isInteger(track.ayatEnd) ? track.ayatEnd : null;

  const decoratedVerses = (basePage.verses || []).map((v) => {
    const inRange =
      ayatStart !== null && ayatEnd !== null
        ? v.ayah >= ayatStart && v.ayah <= ayatEnd
        : true;
    return {
      ...v,
      arabicNumber: toArabicIndicDigits(v.ayah),
      isHighlighted: inRange
    };
  });

  const headerLabel = mushafPage ? `Mushaf Page ${mushafPage}` : 'Mushaf Reader';
  const juzPageLabel =
    Number.isInteger(track.juz) && Number.isInteger(track.pageInJuz)
      ? `Juz ${pad2(track.juz)} • Page ${pad2(track.pageInJuz)}`
      : track.subtitle || 'Quran Recitation';
  const ayatRangeLabel =
    ayatStart !== null && ayatEnd !== null
      ? `Ayat ${pad2(ayatStart)}–${pad2(ayatEnd)}`
      : 'All Verses';

  return {
    ...basePage,
    mushafPage: basePage.mushafPage || mushafPage,
    headerLabel,
    juzPageLabel,
    ayatRangeLabel,
    verses: decoratedVerses
  };
}
