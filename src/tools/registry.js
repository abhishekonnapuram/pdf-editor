// Tool catalogue. Implementations are code-split and loaded when a tool is opened.
export const CATEGORIES = [
  ['all', 'All'],
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
  edit: 'var(--c-edit)', security: 'var(--c-security)', intel: 'var(--c-intel)', workflows: 'var(--c-flow)'
};

const mods = {
  simple: () => import('./simple.js'),
  convert: () => import('./convert.js'),
  smart: () => import('./smart.js'),
  editor: () => import('./editor.js'),
  pages: () => import('./pages.js'),
  extra: () => import('./extra.js')
};

const T = (id, name, desc, cat, icon, mod, extra = {}) => ({ id, name, desc, cat, icon, mod, ...extra });

export const TOOLS = [
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
  T('organize', 'Organize PDF', 'Reorder, rotate, delete, duplicate pages, add blank pages or pages from other PDFs.', 'organize', 'organize', 'pages'),
  T('pdf-to-pdfa', 'PDF to PDF/A', 'Archive-grade PDF/A conversion with validation.', 'convert', 'archive', 'extra', { server: true }),
  T('repair', 'Repair PDF', 'Rebuild a damaged PDF and recover as many pages as possible.', 'optimize', 'repair', 'simple'),
  T('page-numbers', 'Page numbers', 'Add page numbers with position, format, start number and font settings.', 'edit', 'numbers', 'simple'),
  T('scan', 'Scan to PDF', 'Use your camera to capture documents, clean them up and save as PDF.', 'convert', 'scan', 'pages'),
  T('ocr', 'OCR PDF', 'Make scanned PDFs searchable and selectable, in 12 languages.', 'optimize', 'ocr', 'smart'),
  T('compare', 'Compare PDF', 'See two versions side by side, with text changes and visual differences highlighted.', 'intel', 'compare', 'pages'),
  T('redact', 'Redact PDF', 'Black out text and areas, or search and redact. Redacted content is truly removed.', 'security', 'redact', 'editor'),
  T('crop', 'Crop PDF', 'Draw a crop box and apply it to one page or the whole document.', 'edit', 'crop', 'pages'),
  T('forms', 'PDF Forms', 'Fill existing forms, auto-detect blank lines, or add text fields and checkboxes.', 'edit', 'form', 'extra'),
  T('summarize', 'Summarizer', 'Get a concise on-device summary and key points from a PDF.', 'intel', 'ai', 'smart'),
  T('translate', 'Translate PDF', 'Translate PDF text while keeping the layout.', 'intel', 'translate', 'extra', { server: true }),
  T('pdf-to-md', 'PDF to Markdown', 'Turn PDFs into Markdown with headings, lists and links preserved.', 'convert', 'markdown', 'convert'),
  T('pdf-to-text', 'PDF to Text', 'Extract all text from a PDF into a plain .txt file.', 'convert', 'text', 'convert', { tag: 'Extra' }),
  T('image-to-editable', 'Image to editable', 'Turn a resume or document picture (or scanned PDF) into an editable PDF and Word file that looks exactly the same.', 'convert', 'ocr', 'smart', { tag: 'New' }),
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
