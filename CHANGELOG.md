# Changelog

All notable changes to EditSupreme, newest first. Versions follow `package.json`
(major.minor.patch: a new minor version adds tools or features, a patch fixes or tweaks).

## [1.4.0] – 2026-11-18

### Added
- **AI video ad maker** (`/ai-video-ad-maker/`): turns your photos and clips plus a short brief into a video ad.
  - Copies the colours, mood and pace of reference ads you upload (images or videos), not their pictures or words.
  - Writes a hook-first script with on-device AI (or a quick built-in writer).
  - Picks a matching font pair and builds an editable storyboard: text, timing, layout, motion, transitions, logo and music.
  - Optional AI voice-over, with music that ducks under the voice.
  - Exports MP4 (WebM in browsers that cannot record MP4) in 9:16, 1:1, 4:5 or 16:9.
  - **Finish in FilmCraft** opens the ad, clips and music in the FilmCraft video editor through its file bridge.
- **Font pairing** (`/font-pairing/`): 50 hand-picked Google font pairs, filtered by design need.
  - Try any pair live on your own picture or a stock photo, and drag the text into place.
  - Pairs and colours are suggested from the picture, with automatic black or white text.
  - Make your own pairs from all Google fonts, keep favourites, and export PNG or CSS.
- **AI Writer** (`/ai-writer/`): ad copy, captions with hashtags, product descriptions, video scripts, headlines, YouTube titles, emails, bios and rewrites.
- **AI Voice-over** (`/ai-voice-over/`): text to speech with 13 US and UK voices (Kokoro, on device), download as MP3 or WAV.
- **AI Smart crop** (`/smart-crop-social-media-sizes/`): one photo cropped for 11 social sizes, keeping faces or the main subject in frame, download as ZIP.
- **Resume builder:**
  - 16 colour schemes (accent, sidebar or header colour, and text colour), plus separate colour pickers with automatic contrast.
  - 18 resume font pairs, and the full Google Fonts picker for text and headings.
  - A scheme or font pair you choose is kept when you switch templates.
- Shared libraries:
  - `src/lib/pairs.js`: font pairs, palettes, image palette and mood.
  - `src/lib/llm.js` and `src/lib/llm.worker.js`: on-device text AI.
  - `src/lib/tts.js`: on-device voice.

### Changed
- On-device text AI uses the browser's built-in model (Chrome / Edge) when it has one. Otherwise:
  - It runs Qwen2.5 0.5B in a Web Worker, so the page never freezes.
  - It uses only full-precision builds, because the 16-bit build produced garbage on some graphics chips.
  - Each setup must pass a small self-test before it is used.
- The voice model chunk is no longer precached by the service worker; it loads only when a voice tool is used.

### Fixed
- `h()` now fills a `<textarea>` from its `value` (it was left empty).

## [1.3.0] – 2026-11-18

### Added
- **Resume builder** rebuilt as a full editor (`/resume-builder/`).
  - **Import an old resume** from a PDF, Word file or photo, with optional browser AI clean-up.
  - **Match a design** from a picture: layout, colour, fonts and photo style.
  - 12 original templates and a live preview.
  - Drag to reorder; hide, rename and add custom sections.
  - Several saved resumes, undo / redo, and fit to one page.
  - A checker with spelling and job-description keyword match.
  - Download as PDF, Word or ATS-friendly text.

### Fixed
- Deleting a resume no longer brings it back when an edit was still waiting to be saved.

## [1.2.0] – 2026-11-17

### Added
- A real page for every tool (`/merge-pdf/` …), with:
  - its own title, description, how-to steps, FAQs and structured data;
  - `sitemap.xml` and `robots.txt`.
- About, Contact, Privacy Policy and Terms of Use pages.
- New tools:
  - exam photo & signature, ID card print, QR code generator, image to text;
  - MP4 to MP3, collage maker, GST invoice generator, resume builder.
- Image to PDF page. JPG to PDF accepts HEIC, TIFF, SVG and PSD. Smarter tool search.

### Changed
- Site files are addressed from the top of the domain, so tool pages work in folders.

## [1.1.1] – 2026-11-13

### Added
- Google tag on every page.

## [1.1.0] – 2026-11-12

### Added
- **Image to layers:** cut out any object with on-device AI and fill in behind it.
- **AI tools:** voice assistant, passport photo, audio to text, chat with PDF.
- Design Studio layers and an easier tool finder.
- "Back to editing" from the result screen; earlier tool pages are kept when chaining tools.

## [1.0.0] – 2026-11-11

### Added
- **EditSupreme brand:** logo, favicon and brand colours.
- **Tools and apps:**
  - Design Studio, plus the creative apps (PhotoCraft, VectorCraft, LightCraft, FilmCraft, EffectCraft, SoundCraft, PdfCraft).
  - Image tools, free stock photos, size targets and previews.
  - Remove pages, Extract pages, PDF/A, Translate PDF and the AI Summarizer.
- **Site:**
  - Google fonts and AI design tools.
  - Dark mode and a fresh look.
  - Automatic deployment to editsupreme.com on every push to `main`.

## [0.1.0] – 2026-11-03

### Added
- First release as "Pagewise": an installable PDF tools web app.
