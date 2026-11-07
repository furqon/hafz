# Hafz — Implementation Tasks

A lightweight, sleek, iPod-inspired Quran recitation audio player PWA for kids. Designed to play `.m4a` (and `.mp3`) recordings organized by Juz, page, Surah, and Ayat range, working seamlessly in the browser and installable on Android and iOS devices.

---

## Technical Direction

- **Stack**: Vanilla HTML5, modern CSS, and Vanilla JS/TS (or lightweight Vite bundle) — zero heavy runtime dependencies to keep the app small, fast, and lite.
- **Platform**: Progressive Web App (PWA) with `manifest.webmanifest` and Service Worker for "Add to Home Screen" installation on Android & iOS and offline caching.
- **Audio Engine**: HTML5 `<audio>` API + Media Session API (for lock-screen controls and background playback on mobile).
- **File Naming Convention**:
  `juz <xx> <yy> <surah_name> <aa>-<bb>.m4a`
  - `xx`: Juz number (e.g., `01`–`30`)
  - `yy`: Page number within the Juz (`01`–`20`)
  - `surah_name`: Name of the Surah (e.g., `al-baqarah`, `an-naba`)
  - `aa-bb`: Ayat range from `aa` to `bb` (e.g., `01-15`)
  - Extension: `.m4a` (and `.mp3`)

---

## Phase 1: Project Setup & Core Architecture

- [x] **1.1 Initialize Project Structure**
  - [x] Set up minimal project layout (`index.html`, `styles/`, `src/`, `public/audio/`, `public/icons/`).
  - [x] Configure lightweight build/dev tooling (or zero-build static ES modules) for fast local development and tiny bundle size.
- [x] **1.2 Filename Parser & Metadata Extractor**
  - [x] Implement parser for pattern `juz xx yy surah_name aa-bb.(m4a|mp3)` (case-insensitive, tolerant of spaces/hyphens/underscores in `surah_name`).
  - [x] Extract structured metadata: `{ filename, url, juz, pageInJuz, surahName, ayatStart, ayatEnd, ext }`.
  - [x] Provide graceful fallback metadata using the raw filename if a file does not strictly match the pattern.
  - [x] Write unit tests covering valid filenames, multi-word Surah names, `.m4a`/`.mp3` extensions, and fallback cases.
- [x] **1.3 Audio Folder & Track Loader**
  - [x] Support loading bundled/hosted recordings from a static `audio/` folder via an auto-generated `tracks.json` manifest script (scan `audio/` folder and generate index).
  - [x] Support loading a local folder directly in the browser/device via `<input type="file" webkitdirectory multiple>` / File Picker so new Mac recordings can be dropped in and opened anytime.
  - [x] Sort tracks naturally by `juz` -> `pageInJuz` -> `ayatStart`.

---

## Phase 2: Audio Player & Playlist Engine

- [ ] **2.1 Core Playback Controller**
  - [ ] Play, pause, stop, next track, previous track, and seek/scrub progress bar.
  - [ ] Support `.m4a` (AAC/ALAC) and `.mp3` playback via native HTML5 `<audio>`.
  - [ ] Display current playback time, total duration, and loading/buffering state.
- [ ] **2.2 Playlist & Repeat Modes**
  - [ ] Filter/group playlist by **All Tracks**, **Juz (`xx`)**, or **Surah (`surah_name`)**.
  - [ ] Implement repeat modes for memorization (muraja'ah):
    - **Play Once**: Stop after current track or playlist ends.
    - **Repeat Track (1)**: Loop the selected file continuously.
    - **Repeat Playlist / Order (All)**: Play selected tracks in sequence and loop back to the first track.
  - [ ] Persist last played track, active filter, and repeat mode in `localStorage`.
- [ ] **2.3 Mobile Background Audio & Media Session**
  - [ ] Integrate `navigator.mediaSession` metadata (Surah name, Juz & Page, Ayat range) and action handlers (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`) for iOS and Android lock screens.

---

## Phase 3: Sleek iPod-Inspired UI/UX

- [ ] **3.1 iPod-Style Layout & Visual Design**
  - [ ] Design a clean, distraction-free, pocket-sized player frame centered on desktop and full-screen on mobile.
  - [ ] **Top Screen Display**:
    - Now Playing card showing Surah name, `Juz xx • Page yy`, and `Ayat aa–bb`.
    - Clean progress bar with elapsed/remaining timestamps and repeat-mode badge.
    - Compact track list / browser view toggleable on the screen.
  - [ ] **Bottom Tactile Controls (Click-Wheel / Minimal Button Pad)**:
    - Intuitive large touch targets for Kids: `Menu / List`, `Prev`, `Play / Pause` (center), `Next`, and `Repeat Mode`.
- [ ] **3.2 Track Selection & Browsing UX**
  - [ ] Smooth screen navigation between **Now Playing** and **Track List** (grouped by Juz & Page).
  - [ ] Visual indicator for the currently playing track.
  - [ ] Quick "Load Folder / Files" button for importing local `.m4a`/`.mp3` files.
- [ ] **3.3 Responsive & Kid-Friendly Polish**
  - [ ] High-contrast, readable typography and smooth micro-animations.
  - [ ] Dark/Light sleek metallic or minimal theme options.
  - [ ] Prevent accidental page zoom/scroll bounce on mobile touchscreens.

---

## Phase 4: PWA & Cross-Platform Installability (Browser, Android, iPhone)

- [ ] **4.1 Web App Manifest & iOS Meta Tags**
  - [ ] Create `manifest.webmanifest` with app name (`Hafz`), standalone display mode, theme colors, and app icons (`192x192`, `512x512`, maskable).
  - [ ] Add Apple-specific PWA tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`).
- [ ] **4.2 Service Worker & Offline Support**
  - [ ] Register a lightweight Service Worker to cache app shell (`index.html`, CSS, JS, icons) and configured audio files for offline playback.
- [ ] **4.3 Size & Performance Audit**
  - [ ] Ensure total app shell (HTML + CSS + JS) stays under ~50 KB gzipped.
  - [ ] Verify instant startup and smooth 60fps UI transitions on mobile Safari (iOS) and Chrome (Android).

---

## Phase 5: Quran Mushaf Page Display (Later / Phase 2 Feature)

- [ ] **5.1 Juz & Page to Mushaf Page Mapping**
  - [ ] Map `(juz xx, page yy [01-20])` and `(surah_name, ayat aa-bb)` to the standard 604-page Madani Mushaf page number (`1`–`604`).
    - Standard formula: `mushafPage = (juz - 1) * 20 + pageInJuz + 1` (with edge-case adjustments for Juz 1 & Juz 30).
- [ ] **5.2 Split / Toggleable Quran Reader View**
  - [ ] Add a "Read Quran Page" toggle on the player screen while audio is playing.
  - [ ] Render the corresponding Quran page (high-DPI Mushaf page image or clean Uthmani text for Ayat `aa`–`bb`).
  - [ ] Auto-advance the displayed Quran page when the playlist advances to the next recording.
  - [ ] Cache viewed Quran pages offline for repeat listening/reading sessions.
