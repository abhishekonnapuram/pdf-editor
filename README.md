# EditSupreme – Your Complete PDF Editing Solution

Live at https://editsupreme.com. An installable web app (PWA) with 33 PDF tools. Every file is processed on the user's own device: nothing is uploaded, and after the first visit it works offline. One codebase runs in any modern browser on Windows, macOS, Linux, Android, iPhone and iPad, and can be installed like a native app.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. To test the production build (including offline mode and the install button):

```bash
npm run fetch-crafts
```

```bash
npm run build
```

```bash
npm run preview
```

## Tools

| Group | Tools |
| --- | --- |
| Organize | Merge, Split (ranges / every page / every N / extract), Remove pages, Extract pages, Rotate, Organize (reorder, rotate, delete, duplicate, blank pages, combine files) |
| Optimize | Compress (3 levels, before/after size), Repair, OCR (12 languages incl. Hindi, Telugu, Tamil, Kannada, Marathi) |
| Convert | PDF ↔ Word, PDF ↔ PowerPoint, PDF ↔ Excel/CSV, PDF ↔ JPG/PNG/WEBP, HTML → PDF, PDF → PDF/A-2b (archive, optional searchable text), PDF → Markdown, PDF → Text, Scan to PDF (camera) |
| Edit | Edit PDF, Edit PDF images, Watermark, Page numbers, Crop, PDF Forms |
| Security | Sign, Protect (AES-256 + permissions), Unlock, Redact |
| Intelligence | Compare (text + visual), AI Summarizer (Chrome/Edge built-in on-device AI, key-sentence fallback), Translate PDF (30+ languages, layout kept; built-in browser translator or offline Opus-MT models) |
| Workflows | Chain steps (merge → rotate → watermark → number → compress → protect), save and reuse |

### Improvements over the usual PDF editor

- **Edit existing text**: click any line in the PDF to change its wording, font, size or colour (font, colour and letter spacing are matched automatically). On save the original glyphs are removed from the page's content, so the old words can't be found by search or copy; the rest of the line stays exactly in place.
- **Edit the words inside images and scans**: the "Edit text inside images & scans" tool reads the text in a picture or scanned page (OCR, 12 languages), you click a line and retype it. The old letters are erased with content-aware fill (the background is rebuilt), and the new text matches the original size, colour, weight and width. It can be saved as sharp, searchable PDF text or merged into the image.
- **Erase area / add text inside an image**: remove objects or marks from a picture, or write new text into it.
- **All Google Fonts everywhere**: the full Google Fonts catalogue (1,800+ families, via Fontsource) in a searchable picker with live previews, in Design Studio, Edit PDF (text and text inside images), Watermark and Page numbers. Fonts are embedded in the PDFs (subset to the characters used).
- **Font Finder**: identify the font in any picture (logo, poster, screenshot): click a line or drag a box, and get the closest Google fonts with a match score, a link and CSS. The same matching gives Image to layers, Screenshot to template, Image to editable and Recreate in HD the closest Google font for each text style.
- **Creative apps** (Photo Studio = PhotoCraft, plus VectorCraft, LightCraft, FilmCraft, EffectCraft, SoundCraft and PdfCraft): the open-source Craft apps by Storyteller (MIT / Apache-2.0), hosted from their official web builds, unmodified, in `public/<app>/` and shown inside the site. They are too big for Git: run `npm run fetch-crafts` before `npm run build` (versions are pinned in `scripts/fetch-crafts.mjs`; raise a version there and run it again to update). Each folder keeps its LICENSE, NOTICE and .htaccess. The offline service worker never answers these folders with the EditSupreme page.
- **Screenshot to template**: a screenshot or snapshot of any design is rebuilt at 2–4× resolution as editable layers (text redrawn sharp in the matched Google fonts, shapes as vectors, photos and graphics enlarged with AI) and opens in Design Studio.
- **Design Studio** (for digital marketers): a design editor for social posts, stories, ads, YouTube thumbnails and banners, LinkedIn/Facebook covers, posters, flyers, business cards and slides.
  - 21 ready sizes plus custom sizes, and 8 starter templates (sale post, quote, event poster, YouTube thumbnail, story, hiring post, webinar banner, business card).
  - 20 Google Fonts; text presets and styles (outline, shadow, script, headline); line spacing; rotation; align to page; to front/back; lock; layers panel.
  - Elements: shapes (square, rounded, circle, outline, triangle, diamond, hexagon, star, heart, blob, line, arrow), 28 recolourable icons, QR codes.
  - Photos: upload, free stock photos (Wikimedia Commons and Openverse with no key; Pexels, Pixabay and Unsplash with your own free API key, kept on the device), photo frames (clipping masks), filters, crop, replace. Backgrounds: colours, gradients or a picture.
  - Icon library: 200,000+ free icons from open-source sets (Material, Tabler, Lucide, Phosphor, Font Awesome, emoji and more, via Iconify), recolourable.
  - Grouping: Shift+click or drag a box to select several items, Ctrl+G to group, Ctrl+Shift+G to ungroup; groups nest; click selects a group, double-click (or Ctrl+click) selects the item inside to edit it on its own. The Layers panel is a tree: drag rows up and down to reorder, or onto a group to put them inside.
  - Brand kit: brand colours, heading/body fonts and logo, kept on the device.
  - Magic resize to any other size; download PNG/JPG (1×–3×), print PDF or PDF with editable text; save/open project files; the latest design is autosaved on the device.
- **Image to layers**: split a flat design, poster, social post or screenshot into separate layers, like a design tool's "magic layers": background colour, solid shapes (panels, bars, lines, circles), photos (round ones keep their shape), graphics/icons (transparent cut-outs) and editable text (big headings included, bold per word). Move, edit, hide, lock, reorder or delete any layer, add new ones, then export a PNG at the original size and a PDF with real text.
- **Recreate in HD**: rebuild a picture at 2×, 3× or 4×. Text, the background and solid shapes are redrawn perfectly sharp at the new size; photos and graphics are enlarged with an on-device AI model (ESRGAN via TensorFlow.js, about 1 MB, served from `public/models`). "AI only" mode enlarges everything with the model, for photos.
- **Image to editable**: turn a resume or document picture (JPG/PNG) or an image-only PDF into an editable PDF and a Word file that look the same. Every line is read, erased from the picture and put back as real text at the same place, size, colour and weight (bold is detected per word); photos, lines and shapes stay untouched in the background. In Word each line is its own positioned text box. Marks the reader missed (a dot, an icon) stay in the picture rather than disappearing, and text found inside photos is ignored.
- **Find pictures inside an image**: on a page that is one big picture (e.g. a resume exported as an image), "Find pictures" detects the photos (round or rectangular) so they can be selected, replaced, moved or deleted; the background behind them is rebuilt.
- **Clipping masks (picture frames)**: show any image inside a shape (square, rounded, circle/oval, triangle, diamond, hexagon, star, heart, blob) with zoom, position and an optional border, or turn a drawn rectangle/ellipse into a frame with "Fill with picture". Saved as a real PDF clipping path, so the picture keeps full quality.
- **Edit existing images**: move, resize, crop, rotate, flip, replace or delete images already in the PDF, and adjust brightness, contrast, saturation, hue, blur, black & white, sepia or invert. Also: remove white background, save the image. Edited images replace the original in the file instead of being layered on top.
- Shapes, arrows, freehand drawing, highlighter, white-out, undo/redo, keyboard shortcuts, touch and stylus support.
- Signatures: draw, type (4 handwriting styles) or upload (background removed automatically), remembered on the device.
- Redact: search and redact, one-click e-mails and phone numbers. Redacted pages are flattened so the text is really gone.
- Forms: auto-detects blank lines (`____`) and boxes (`☐`) and turns them into fillable fields.
- OCR keeps the original page quality and lays an invisible, searchable text layer on top.
- Any result can go straight into another tool.

### Known limits

- Real removal of edited text needs the font's character widths. For rare fonts that don't provide them (Type 3 fonts, some CJK encodings, text inside form objects), the original is hidden under a background-coloured box instead; Redact PDF always removes text permanently.
- Text-in-image editing works best on clean backgrounds (flat colours, gradients, scans). On busy photos the rebuilt background can look smoothed. The OCR engine can't tell serif from sans, so pick the font in the panel if it matters.
- Word/Excel/HTML → PDF produce image-based pages; choose **Print to PDF** in those tools to keep text selectable. Only `.docx` / `.pptx` (not old `.doc` / `.ppt`).
- PowerPoint → PDF rebuilds text, pictures and colours; charts, SmartArt and effects are simplified.
- **PDF to PDF/A** renders pages as images (plus an optional OCR text layer), so the original vector text is replaced by that text layer; check files with a validator such as veraPDF if you must prove compliance. **Translate PDF** draws the translation as images (so every script shapes correctly) and adds a Word/TXT copy for editable text; offline models give basic quality for some languages. Requesting signatures from other people still needs a server.
- OCR downloads its engine and language data from a CDN the first time (then cached for offline use).

## Hosting

`npm run build` creates a static site in `dist/`. Upload that folder to any static host: Netlify, Vercel, Cloudflare Pages, GitHub Pages, Firebase Hosting, or your own server. It must be served over HTTPS for install/offline/camera to work. All paths are relative, so it also works from a sub-folder.

## Store apps (later)

The same build can be wrapped as store apps without rewriting:

- **Android / iOS**: [Capacitor](https://capacitorjs.com) (`npx cap add android`, `npx cap add ios`, with `webDir: "dist"`), or a Trusted Web Activity for the Play Store.
- **Windows / macOS / Linux**: [Tauri](https://tauri.app) or Electron pointing at `dist/`; or publish the PWA to the Microsoft Store with PWABuilder.

## Code layout

- `src/main.js`: app shell, home page, tool page flow, install button, "open with" handling
- `src/lib/`: shared PDF helpers (`core.js`), UI helpers (`ui.js`), icons, image extraction
- `src/tools/registry.js`: the tool catalogue
- `src/tools/simple.js`: batch tools (merge, split, compress, rotate, watermark, numbers, images, protect, unlock, repair)
- `src/tools/convert.js`: format conversions
- `src/tools/editor.js`: the page editor (Edit, Sign, Redact, Edit images, Forms designer)
- `src/tools/pages.js`: Organize, Crop, Compare, Scan
- `src/tools/smart.js`: OCR and Summarizer
- `src/tools/extra.js`: Forms, Workflows, server-only tools

Built with pdf.js, pdf-lib (@cantoo fork with encryption), tesseract.js, docx, pptxgenjs, SheetJS, mammoth, html2canvas and Vite.
