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
npm run build
```

```bash
npm run preview
```

## Tools

| Group | Tools |
| --- | --- |
| Organize | Merge, Split (ranges / every page / every N / extract), Rotate, Organize (reorder, rotate, delete, duplicate, blank pages, combine files) |
| Optimize | Compress (3 levels, before/after size), Repair, OCR (12 languages incl. Hindi, Telugu, Tamil, Kannada, Marathi) |
| Convert | PDF ↔ Word, PDF ↔ PowerPoint, PDF ↔ Excel/CSV, PDF ↔ JPG/PNG/WEBP, HTML → PDF, PDF → Markdown, PDF → Text, Scan to PDF (camera) |
| Edit | Edit PDF, Edit PDF images, Watermark, Page numbers, Crop, PDF Forms |
| Security | Sign, Protect (AES-256 + permissions), Unlock, Redact |
| Intelligence | Compare (text + visual), Summarizer (on-device) |
| Workflows | Chain steps (merge → rotate → watermark → number → compress → protect), save and reuse |

### Improvements over the usual PDF editor

- **Edit existing text**: click any line in the PDF to change its wording, font, size or colour (font, colour and letter spacing are matched automatically). On save the original glyphs are removed from the page's content, so the old words can't be found by search or copy; the rest of the line stays exactly in place.
- **Edit the words inside images and scans**: the "Edit text inside images & scans" tool reads the text in a picture or scanned page (OCR, 12 languages), you click a line and retype it. The old letters are erased with content-aware fill (the background is rebuilt), and the new text matches the original size, colour, weight and width. It can be saved as sharp, searchable PDF text or merged into the image.
- **Erase area / add text inside an image**: remove objects or marks from a picture, or write new text into it.
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
- **PDF to PDF/A** and **Translate PDF** need a server (Ghostscript/veraPDF and a translation API); they show an explanation page for now. Requesting signatures from other people also needs a server.
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
