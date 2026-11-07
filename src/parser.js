/**
 * Hafz Filename Parser & Track Metadata Extractor
 *
 * Expected naming pattern:
 *   juz <xx> <yy> <surah_name> <aa>-<bb>.(m4a|mp3)
 *
 * Examples:
 *   "juz 30 01 an-naba 01-30.m4a"
 *   "juz 01 02 al baqarah 01-05.m4a"
 *   "Juz_29_15_Al-Insan_01-31.mp3"
 */

const SUPPORTED_EXTENSIONS = new Set(['m4a', 'mp3']);

const TRACK_PATTERN =
  /^juz[\s_-]+(\d{1,2})[\s_-]+(\d{1,2})[\s_-]+(.+?)[\s_-]+(\d{1,3})\s*-\s*(\d{1,3})\.(m4a|mp3)$/i;

/**
 * Extracts the base filename from a path or URL string.
 * @param {string} rawPath
 * @returns {string}
 */
export function getBaseFilename(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  const normalized = rawPath.trim().replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Checks whether a filename has a supported audio extension (.m4a or .mp3).
 * Ignores hidden dotfiles (e.g., .DS_Store, ._file.m4a).
 * @param {string} filename
 * @returns {boolean}
 */
export function isSupportedAudioFile(filename) {
  const base = getBaseFilename(filename);
  if (!base || base.startsWith('.')) return false;
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  const ext = base.slice(dotIndex + 1).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Normalizes a raw Surah name into a canonical slug (e.g. "al-baqarah")
 * and a human-readable display string (e.g. "Al-Baqarah").
 * @param {string} rawSurah
 * @returns {{ surahName: string, surahDisplay: string }}
 */
export function formatSurahName(rawSurah) {
  const cleaned = String(rawSurah || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  const surahName = cleaned.toLowerCase().replace(/\s+/g, '-');

  const surahDisplay = cleaned
    .split(/(\s+|-)/)
    .map((segment) => {
      if (!segment || /^[\s-]+$/.test(segment)) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('');

  return { surahName, surahDisplay };
}

/**
 * Formats a number with leading zero up to 2 digits.
 * @param {number} num
 * @returns {string}
 */
export function pad2(num) {
  return String(num).padStart(2, '0');
}

/**
 * Parses a track filename into structured Quran recitation metadata.
 * Falls back gracefully to the raw filename if the pattern does not match.
 *
 * @param {string} filenameOrPath - Filename or relative path
 * @param {string} [url] - Playable URL or Object URL
 * @returns {object|null} Structured track metadata, or null if unsupported file
 */
export function parseTrackFilename(filenameOrPath, url = '') {
  const filename = getBaseFilename(filenameOrPath);
  if (!isSupportedAudioFile(filename)) {
    return null;
  }

  const resolvedUrl = url || filenameOrPath;
  const match = filename.match(TRACK_PATTERN);

  if (match) {
    const juz = Number.parseInt(match[1], 10);
    const pageInJuz = Number.parseInt(match[2], 10);
    const { surahName, surahDisplay } = formatSurahName(match[3]);
    const ayatStart = Number.parseInt(match[4], 10);
    const ayatEnd = Number.parseInt(match[5], 10);
    const ext = match[6].toLowerCase();

    return {
      id: filename.toLowerCase(),
      filename,
      url: resolvedUrl,
      juz,
      pageInJuz,
      surahName,
      surahDisplay,
      ayatStart,
      ayatEnd,
      ext,
      isParsed: true,
      title: `${surahDisplay} (${pad2(ayatStart)}–${pad2(ayatEnd)})`,
      subtitle: `Juz ${pad2(juz)} • Page ${pad2(pageInJuz)}`
    };
  }

  // Fallback for valid audio files that do not match the strict naming convention
  const dotIndex = filename.lastIndexOf('.');
  const rawStem = filename.slice(0, dotIndex).trim();
  const ext = filename.slice(dotIndex + 1).toLowerCase();

  return {
    id: filename.toLowerCase(),
    filename,
    url: resolvedUrl,
    juz: null,
    pageInJuz: null,
    surahName: rawStem.toLowerCase().replace(/[\s_]+/g, '-'),
    surahDisplay: rawStem,
    ayatStart: null,
    ayatEnd: null,
    ext,
    isParsed: false,
    title: rawStem,
    subtitle: 'Audio Recording'
  };
}

/**
 * Sorts an array of track metadata objects naturally:
 *   1. Parsed tracks before unparsed fallback tracks
 *   2. By `juz` ascending
 *   3. By `pageInJuz` ascending
 *   4. By `ayatStart` ascending
 *   5. By `ayatEnd` ascending
 *   6. By `filename` (natural numeric comparison)
 *
 * @param {Array<object>} tracks
 * @returns {Array<object>} New sorted array
 */
export function sortTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return [...tracks].sort((a, b) => {
    if (a.isParsed !== b.isParsed) {
      return a.isParsed ? -1 : 1;
    }

    if (a.isParsed && b.isParsed) {
      if (a.juz !== b.juz) return a.juz - b.juz;
      if (a.pageInJuz !== b.pageInJuz) return a.pageInJuz - b.pageInJuz;
      if (a.ayatStart !== b.ayatStart) return a.ayatStart - b.ayatStart;
      if (a.ayatEnd !== b.ayatEnd) return a.ayatEnd - b.ayatEnd;
    }

    return a.filename.localeCompare(b.filename, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}
