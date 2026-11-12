// Tool catalogue. Implementations are code-split and loaded when a tool is opened.
export const CATEGORIES = [
  ['all', 'All'],
  ['ai', 'AI tools'],
  ['design', 'Design Studio'],
  ['image', 'Image tools'],
  ['photo', 'Creative apps'],
  ['workflows', 'Workflows'],
  ['organize', 'Organize PDF'],
  ['optimize', 'Optimize PDF'],
  ['convert', 'Convert PDF'],
  ['edit', 'Edit PDF'],
  ['security', 'PDF Security'],
  ['intel', 'PDF Intelligence']
];

export const CAT_COLOR = {
  organize: 'var(--c-organize)', optimize: 'var(--c-optimize)', convert: 'var(--c-convert)',
  edit: 'var(--c-edit)', ai: 'var(--c-ai)', security: 'var(--c-security)', intel: 'var(--c-intel)', workflows: 'var(--c-flow)', design: 'var(--c-design)', image: 'var(--c-image)', photo: 'var(--c-photo)'
};

const mods = {
  simple: () => import('./simple.js'),
  convert: () => import('./convert.js'),
  smart: () => import('./smart.js'),
  editor: () => import('./editor.js'),
  pages: () => import('./pages.js'),
  extra: () => import('./extra.js'),
  design: () => import('./design.js'),
  fonts: () => import('./fonts.js'),
  crafts: () => import('./crafts.js'),
  pagetools: () => import('./pagetools.js'),
  pdfa: () => import('./pdfa.js'),
  translate: () => import('./translate.js'),
  images: () => import('./images.js'),
  imagestudio: () => import('./imagestudio.js'),
  aitools: () => import('./aitools.js'),
  assistant: () => import('./assistant.js')
};

const T = (id, name, desc, cat, icon, mod, extra = {}) => ({ id, name, desc, cat, icon, mod, ...extra });

export const TOOLS = [
  T('assistant', 'AI Assistant', 'Type or say what you want ("compress this PDF under 1 MB", "remove the background and make it white, then resize to 600 x 600") and it runs the right tools on your files.', 'ai', 'mic', 'assistant', { tag: 'New' }),
  T('passport-photo', 'Passport photo', 'Passport, visa and ID photos for India, USA, UK, Schengen, Canada and more: AI finds your face, replaces the background and sizes your head to the rules, with a print sheet.', 'ai', 'passport', 'aitools', { tag: 'New' }),
  T('audio-to-text', 'Audio to text', 'Turn speech in audio and video files into text or subtitles (SRT, VTT) in 20+ languages, with Whisper AI on your device.', 'ai', 'wave', 'aitools', { tag: 'New' }),
  T('chat-pdf', 'Chat with PDF', 'Ask questions about a PDF by typing or speaking, and get the answer with the page it comes from.', 'ai', 'chat', 'aitools', { tag: 'New' }),
  T('creative-apps', 'Creative apps', 'Full creative apps in your browser: photo editing, vector art, RAW photo developing, video editing, motion graphics, audio and PDFs.', 'photo', 'grid', 'crafts', { tag: 'New' }),
  T('photo-studio', 'Photo Studio', 'PhotoCraft, the full photo editor: layers, masks, adjustment layers, filters, layer styles, type, vectors, brushes and PSD files.', 'photo', 'image', 'crafts', { tag: 'New' }),
  T('vectorcraft', 'VectorCraft', 'Vector art in your browser: logos, illustrations and icons with paths, shapes, gradients and type.', 'photo', 'pen', 'crafts', { tag: 'New' }),
  T('lightcraft', 'LightCraft', 'Non-destructive photo developing: RAW and JPG editing, exposure, colour, curves and presets.', 'photo', 'filter', 'crafts', { tag: 'New' }),
  T('filmcraft', 'FilmCraft', 'Video editor with a multi-track timeline: cut, trim, titles, transitions and audio.', 'photo', 'scan', 'crafts', { tag: 'New' }),
  T('effectcraft', 'EffectCraft', 'Motion graphics and compositing: animated text, shapes, keyframes and effects.', 'photo', 'ai', 'crafts', { tag: 'New' }),
  T('soundcraft', 'SoundCraft', 'Audio workstation (DAW): record, arrange, mix and edit music, voice-overs and podcasts.', 'photo', 'workflow', 'crafts', { tag: 'New' }),
  T('pdfcraft', 'PdfCraft', 'A full PDF reader and editor app: read, annotate, edit and search PDFs.', 'photo', 'page', 'crafts', { tag: 'New' }),
  T('design-studio', 'Design Studio', 'Create social posts, ads, YouTube thumbnails, banners, posters and business cards with templates, fonts, icons, brand kit and one-click resize.', 'design', 'stamp', 'design', { tag: 'New' }),
  T('compress-image', 'Compress image', 'Make JPG, PNG, WEBP, SVG and GIF files smaller while keeping them sharp.', 'image', 'compress', 'images'),
  T('resize-image', 'Resize image', 'Set the size in pixels or by percentage for many JPG, PNG, WEBP, SVG and GIF images at once.', 'image', 'resize', 'images'),
  T('crop-image', 'Crop image', 'Crop JPG, PNG or GIF images with a visual editor or exact pixels, in common shapes like 1:1 and 16:9.', 'image', 'crop', 'imagestudio'),
  T('convert-to-jpg', 'Convert to JPG', 'Turn PNG, GIF, TIFF, PSD, SVG, WEBP, HEIC or camera RAW pictures into JPG, many at once.', 'image', 'jpg', 'images'),
  T('convert-from-jpg', 'Convert from JPG', 'Turn JPG pictures into PNG, WEBP or GIF, or put several JPGs together into an animated GIF.', 'image', 'image', 'images'),
  T('photo-editor', 'Photo editor', 'Add text, stickers, frames and effects to your photos.', 'image', 'edit', 'imagestudio'),
  T('upscale-image', 'Upscale image', 'Enlarge JPG and PNG pictures 2× or 4× with on-device AI that adds detail instead of blur.', 'image', 'upscale', 'images', { tag: 'New' }),
  T('remove-background', 'Remove background', 'Cut out people, products and objects from their background automatically, with on-device AI.', 'image', 'cutout', 'images', { tag: 'New' }),
  T('watermark-image', 'Watermark image', 'Stamp text or a logo over your images, with font, transparency, rotation and position, or as a mosaic.', 'image', 'stamp', 'images'),
  T('meme-generator', 'Meme generator', 'Make a meme from your own picture: top and bottom text, captions, any font.', 'image', 'smile', 'imagestudio'),
  T('rotate-image', 'Rotate image', 'Turn pictures to any angle by dragging with your mouse or finger, or by 90°; mirror and flip too.', 'image', 'rotate', 'imagestudio'),
  T('html-to-image', 'HTML to image', 'Turn a web page or HTML into a JPG, PNG or SVG picture.', 'image', 'html', 'images'),
  T('blur-face', 'Blur face', 'Blur faces in photos automatically, and hide licence plates or other private details.', 'image', 'face', 'imagestudio', { tag: 'New' }),
  T('merge', 'Merge PDF', 'Combine PDFs in the order you want. Drag to reorder before merging.', 'organize', 'merge', 'simple'),
  T('split', 'Split PDF', 'Split by ranges, every N pages, or pull out just the pages you need.', 'organize', 'split', 'simple'),
  T('compress', 'Compress PDF', 'Shrink file size with a choice of quality levels and a before/after size report.', 'optimize', 'compress', 'simple'),
  T('pdf-to-word', 'PDF to Word', 'Turn PDF text, headings and images into an editable DOCX document.', 'convert', 'word', 'convert'),
  T('pdf-to-ppt', 'PDF to PowerPoint', 'Turn each PDF page into a PPTX slide, with the page text in the notes.', 'convert', 'ppt', 'convert'),
  T('pdf-to-excel', 'PDF to Excel', 'Pull tables and text rows straight into an XLSX spreadsheet.', 'convert', 'excel', 'convert'),
  T('word-to-pdf', 'Word to PDF', 'Convert DOCX documents to PDF.', 'convert', 'word', 'convert'),
  T('ppt-to-pdf', 'PowerPoint to PDF', 'Convert PPTX slides (text and pictures) to PDF.', 'convert', 'ppt', 'convert'),
  T('excel-to-pdf', 'Excel to PDF', 'Convert XLSX/CSV spreadsheets to readable PDF pages.', 'convert', 'excel', 'convert'),
  T('edit', 'Edit PDF', 'Edit existing text, images and even the words inside pictures and scans. Add text, images, shapes and drawings.', 'edit', 'edit', 'editor', { tag: 'Improved' }),
  T('pdf-to-jpg', 'PDF to JPG', 'Save every page as JPG/PNG, or extract all embedded images.', 'convert', 'jpg', 'simple'),
  T('jpg-to-pdf', 'JPG to PDF', 'Turn images into a PDF, with page size, orientation and margins.', 'convert', 'image', 'simple'),
  T('sign', 'Sign PDF', 'Draw, type or upload your signature and place it, with initials and date.', 'security', 'sign', 'editor'),
  T('watermark', 'Watermark', 'Stamp text or an image over pages, with font, opacity, rotation and position.', 'edit', 'stamp', 'simple'),
  T('rotate', 'Rotate PDF', 'Rotate all, odd, even or chosen pages of many PDFs at once.', 'organize', 'rotate', 'simple'),
  T('html-to-pdf', 'HTML to PDF', 'Convert an HTML file or pasted HTML into a PDF.', 'convert', 'html', 'convert'),
  T('unlock', 'Unlock PDF', 'Remove the password from a PDF you have the password for.', 'security', 'unlock', 'simple'),
  T('protect', 'Protect PDF', 'Encrypt with AES-256 and choose what readers may print, copy or change.', 'security', 'lock', 'simple'),
  T('remove-pages', 'Remove pages', 'Delete pages from a PDF: click the pages to remove, or type page numbers.', 'organize', 'trash', 'pagetools'),
  T('extract-pages', 'Extract pages', 'Take pages out of a PDF into a new file, or save each page as its own PDF.', 'organize', 'split', 'pagetools'),
  T('organize', 'Organize PDF', 'Reorder, rotate, delete, duplicate pages, add blank pages or pages from other PDFs.', 'organize', 'organize', 'pages'),
  T('pdf-to-pdfa', 'PDF to PDF/A', 'Convert to PDF/A-2b for long-term archiving, with an optional searchable text layer.', 'convert', 'archive', 'pdfa'),
  T('repair', 'Repair PDF', 'Rebuild a damaged PDF and recover as many pages as possible.', 'optimize', 'repair', 'simple'),
  T('page-numbers', 'Page numbers', 'Add page numbers with position, format, start number and font settings.', 'edit', 'numbers', 'simple'),
  T('scan', 'Scan to PDF', 'Use your camera to capture documents, clean them up and save as PDF.', 'convert', 'scan', 'pages'),
  T('ocr', 'OCR PDF', 'Make scanned PDFs searchable and selectable, in 12 languages.', 'optimize', 'ocr', 'smart'),
  T('compare', 'Compare PDF', 'See two versions side by side, with text changes and visual differences highlighted.', 'intel', 'compare', 'pages'),
  T('redact', 'Redact PDF', 'Black out text and areas, or search and redact. Redacted content is truly removed.', 'security', 'redact', 'editor'),
  T('crop', 'Crop PDF', 'Draw a crop box and apply it to one page or the whole document.', 'edit', 'crop', 'pages'),
  T('forms', 'PDF Forms', 'Fill existing forms, auto-detect blank lines, or add text fields and checkboxes.', 'edit', 'form', 'extra'),
  T('summarize', 'AI Summarizer', 'Get key points and a short summary of any PDF, written by the on-device AI built into Chrome and Edge.', 'intel', 'ai', 'smart'),
  T('translate', 'Translate PDF', 'Translate a PDF into 30+ languages (Hindi, Telugu, Tamil, Spanish, Arabic, Chinese…) keeping its layout, on your device.', 'intel', 'translate', 'translate'),
  T('pdf-to-md', 'PDF to Markdown', 'Turn PDFs into Markdown with headings, lists and links preserved.', 'convert', 'markdown', 'convert'),
  T('pdf-to-text', 'PDF to Text', 'Extract all text from a PDF into a plain .txt file.', 'convert', 'text', 'convert', { tag: 'Extra' }),
  T('font-finder', 'Font Finder', 'Identify the font in any picture: upload a logo, poster or screenshot and get the closest Google fonts, free to use.', 'design', 'text', 'fonts', { tag: 'New' }),
  T('screenshot-to-template', 'Screenshot to template', 'Upload a screenshot or snapshot of any design: it is rebuilt in high resolution as an editable template (layers, matched fonts) that opens in Design Studio.', 'design', 'scan', 'smart', { tag: 'New' }),
  T('image-to-layers', 'Image to layers', 'Split any photo, design or poster into layers with free on-device AI: click any object or person to cut it out, the background is filled in behind it, and text, shapes and graphics become editable too.', 'design', 'organize', 'smart', { tag: 'New' }),
  T('image-hd', 'Recreate in HD', 'Recreate a picture at 2×, 3× or 4× resolution: text and shapes redrawn razor-sharp, photos enlarged with on-device AI.', 'design', 'image', 'smart', { tag: 'New' }),
  T('image-to-editable','Image to editable', 'Turn a resume or document picture (or scanned PDF) into an editable PDF and Word file that looks exactly the same.', 'convert', 'ocr', 'smart', { tag: 'New' }),
  T('edit-images','Edit PDF images', 'Change the words inside pictures and scanned pages, erase parts of images, replace, crop or recolour them.', 'edit', 'imgedit', 'editor', { tag: 'Extra' }),
  T('workflow', 'Create a workflow', 'Chain tools together (rotate, watermark, number, compress, protect…) and reuse them anytime.', 'workflows', 'workflow', 'extra')
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

export async function loadTool(t) {
  const m = await mods[t.mod]();
  const impl = m.tools[t.id];
  if (!impl) throw new Error('Tool not implemented: ' + t.id);
  return impl;
}
