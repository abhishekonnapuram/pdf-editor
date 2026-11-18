// Translate PDF on the device, keeping the layout. Text is grouped into paragraphs, translated (the
// browser's built-in on-device translator when it has one, otherwise small offline models), removed from
// the page, and the translation is drawn into the same place at the same size. Pictures, tables and
// colours stay untouched. The translation is also saved as Word and plain text.
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { readBytes, pdfBlob, stem, openPdfjs, renderPage, loadPdfLib, canvasToBlob, blobToBytes } from '../lib/core.js';
import { removeTextInRects } from '../lib/contentedit.js';
import { loadFont, fontStack } from '../lib/fonts.js';

const PDF = '.pdf,application/pdf';
// [code, name, opus-mt code (if there is a direct English model), 3-letter code for the multilingual model, Noto font]
export const LANGS = [
  ['en', 'English', 'en', 'eng', 'Noto Sans'], ['hi', 'Hindi', 'hi', 'hin', 'Noto Sans Devanagari'], ['te', 'Telugu', null, 'tel', 'Noto Sans Telugu'],
  ['ta', 'Tamil', null, 'tam', 'Noto Sans Tamil'], ['kn', 'Kannada', null, 'kan', 'Noto Sans Kannada'], ['ml', 'Malayalam', null, 'mal', 'Noto Sans Malayalam'],
  ['mr', 'Marathi', null, 'mar', 'Noto Sans Devanagari'], ['bn', 'Bengali', null, 'ben', 'Noto Sans Bengali'], ['gu', 'Gujarati', null, 'guj', 'Noto Sans Gujarati'],
  ['pa', 'Punjabi', null, 'pan', 'Noto Sans Gurmukhi'], ['ur', 'Urdu', null, 'urd', 'Noto Naskh Arabic'], ['es', 'Spanish', 'es', 'spa', 'Noto Sans'],
  ['fr', 'French', 'fr', 'fra', 'Noto Sans'], ['de', 'German', 'de', 'deu', 'Noto Sans'], ['it', 'Italian', 'it', 'ita', 'Noto Sans'],
  ['pt', 'Portuguese', null, 'por', 'Noto Sans'], ['nl', 'Dutch', 'nl', 'nld', 'Noto Sans'], ['ru', 'Russian', 'ru', 'rus', 'Noto Sans'],
  ['uk', 'Ukrainian', 'uk', 'ukr', 'Noto Sans'], ['pl', 'Polish', null, 'pol', 'Noto Sans'], ['cs', 'Czech', 'cs', 'ces', 'Noto Sans'],
  ['ro', 'Romanian', 'ro', 'ron', 'Noto Sans'], ['hu', 'Hungarian', 'hu', 'hun', 'Noto Sans'], ['sv', 'Swedish', 'sv', 'swe', 'Noto Sans'],
  ['da', 'Danish', 'da', 'dan', 'Noto Sans'], ['fi', 'Finnish', 'fi', 'fin', 'Noto Sans'], ['tr', 'Turkish', null, 'tur', 'Noto Sans'],
  ['id', 'Indonesian', 'id', 'ind', 'Noto Sans'], ['vi', 'Vietnamese', 'vi', 'vie', 'Noto Sans'], ['ar', 'Arabic', 'ar', 'ara', 'Noto Sans Arabic'],
  ['zh', 'Chinese', 'zh', 'cmn_Hans', 'Noto Sans SC'], ['ja', 'Japanese', 'jap', 'jpn', 'Noto Sans JP'], ['ko', 'Korean', null, 'kor', 'Noto Sans KR'],
  ['th', 'Thai', null, 'tha', 'Noto Sans Thai']
];
const L = Object.fromEntries(LANGS.map((l) => [l[0], l]));
// Direct "<lang>-en" models that exist (others use the multilingual one).
const TO_EN = new Set(['fr', 'es', 'zh', 'de', 'ru', 'ar', 'ko', 'nl', 'it', 'pl', 'cs', 'fi', 'sv', 'da', 'tr', 'id', 'hi', 'th', 'vi', 'uk', 'hu', 'ja']);
const RTL = new Set(['ar', 'ur']);

// ---------- translators ----------
// Some browsers expose the built-in AI APIs but never answer (or need a fresh click to download a model);
// give them a deadline and fall back instead of hanging.
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

async function makeTranslator(src, tgt, onStatus) {
  // 1. The browser's own on-device translator (Chrome / Edge).
  if (typeof self !== 'undefined' && 'Translator' in self) {
    try {
      const av = await within(self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt }), 6000);
      if (av && av !== 'unavailable') {
        const t = await within(self.Translator.create({ sourceLanguage: src, targetLanguage: tgt, monitor(m) { m.addEventListener('downloadprogress', (e) => { onStatus(`downloading the browser's ${L[src][1]} → ${L[tgt][1]} model ${Math.round((e.loaded || 0) * 100)}%`); }); } }), av === 'available' ? 15000 : 120000);
        // A quick test, so a translator that can't actually translate falls back too.
        await within(t.translate('Hello'), 15000);
        return { engine: 'your browser\'s built-in translator', translate: (s) => within(t.translate(s), 60000) };
      }
    } catch (e) { console.warn('built-in translator not usable, using offline models', e); }
  }
  // 2. Small offline models (Opus-MT), via English when needed.
  const { pipeline } = await (await import('../lib/ai.js')).transformers();
  const load = (id) => pipeline('translation', id, { dtype: 'q8', progress_callback: (p) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) onStatus(`downloading the translation model ${Math.round(p.progress || 0)}% (once)`); } });
  const steps = [];
  if (src !== 'en') steps.push({ model: await load(`Xenova/opus-mt-${TO_EN.has(src) ? (src === 'ja' ? 'jap' : src) : 'mul'}-en`), prefix: '' });
  if (tgt !== 'en') {
    const direct = L[tgt][2];
    steps.push({ model: await load(`Xenova/opus-mt-en-${direct || 'mul'}`), prefix: direct ? '' : `>>${L[tgt][3]}<< ` });
  }
  return {
    engine: 'offline translation models (Opus-MT)' + (steps.some((x) => x.prefix) ? '; this language uses the multilingual model, so quality is basic' : ''),
    async translate(text) {
      let t = text;
      for (const st of steps) {
        // These small models skip text when given several sentences at once, so translate one sentence at a time.
        const chunks = (t.match(/[^.!?。！？।]+[.!?。！？।]*\s*/g) || [t]).map((x) => x.trim()).filter(Boolean);
        const outs = [];
        for (const c of chunks) outs.push((await st.model(st.prefix + c, { max_new_tokens: 512 }))[0].translation_text);
        t = outs.join(' ');
      }
      return t;
    }
  };
}
async function detectLanguage(sample) {
  if (typeof self === 'undefined' || !('LanguageDetector' in self)) return null;
  try { const d = await within(self.LanguageDetector.create(), 8000); const [best] = await within(d.detect(sample), 8000); return best?.confidence > 0.5 ? best.detectedLanguage : null; } catch { return null; }
}

// ---------- paragraphs ----------
function paragraphsOf(items, styles, names = {}) {
  const runs = items.filter((it) => it.str.trim()).map((it) => {
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    return { str: it.str, x: e, y: f, w: it.width, size, upright: Math.abs(b) < 0.01 * Math.abs(a), font: names[it.fontName] || it.fontName, family: styles[it.fontName]?.fontFamily || '' };
  }).filter((r) => r.upright && r.size > 1);
  // Lines: runs on the same baseline.
  runs.sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const r of runs) {
    const ln = lines.find((l) => Math.abs(l.y - r.y) < r.size * 0.35 && r.x >= l.x1 - r.size * 0.5 && r.x - l.x1 < r.size * 2.5);
    if (ln) { ln.text += (r.x - ln.x1 > r.size * 0.15 && !ln.text.endsWith(' ') ? ' ' : '') + r.str; ln.x1 = Math.max(ln.x1, r.x + r.w); ln.size = Math.max(ln.size, r.size); }
    else lines.push({ text: r.str, x0: r.x, x1: r.x + r.w, y: r.y, size: r.size, font: r.font, family: r.family });
  }
  lines.sort((p, q) => q.y - p.y || p.x0 - q.x0);
  // Paragraphs: following lines of the same size, close below, starting near the same left edge.
  const paras = [];
  for (const ln of lines) {
    const p = paras.find((q) => {
      const last = q.lines[q.lines.length - 1];
      return Math.abs(last.size - ln.size) < ln.size * 0.15 && last.y - ln.y > 0 && last.y - ln.y < ln.size * 1.9 && Math.abs(last.x0 - ln.x0) < ln.size * 3 && ln.x0 < q.x1 && ln.x1 > q.x0 - ln.size;
    });
    if (p) { p.lines.push(ln); p.x0 = Math.min(p.x0, ln.x0); p.x1 = Math.max(p.x1, ln.x1); }
    else paras.push({ lines: [ln], x0: ln.x0, x1: ln.x1, size: ln.size, font: ln.font, family: ln.family });
  }
  for (const p of paras) {
    p.text = p.lines.map((l) => l.text.trim()).join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
    p.top = p.lines[0].y + p.size * 0.85;
    p.bottom = p.lines[p.lines.length - 1].y - p.size * 0.3;
    p.lead = p.lines.length > 1 ? (p.lines[0].y - p.lines[p.lines.length - 1].y) / (p.lines.length - 1) : p.size * 1.2;
  }
  return paras.filter((p) => /[\p{L}]/u.test(p.text));
}

// Draw a translated paragraph into a transparent picture (the browser shapes every script correctly).
function paragraphImage(text, p, lang, color, bold, scale = 3) {
  const fam = fontStack(L[lang][4]);
  const width = Math.max(20, p.x1 - p.x0), height = Math.max(p.top - p.bottom, p.size * 1.3);
  const m = document.createElement('canvas').getContext('2d');
  let size = p.size, lines = [];
  const wrap = (sz) => {
    m.font = `${bold ? 700 : 400} ${sz}px ${fam}`;
    const words = /^(zh|ja|th)$/.test(lang) ? [...text] : text.split(/\s+/);
    const joiner = /^(zh|ja|th)$/.test(lang) ? '' : ' ';
    const out = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + joiner + w : w; if (m.measureText(t).width > width && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out;
  };
  // Same size as the original if it fits (allowing a little extra room), otherwise a bit smaller.
  for (let k = 0; k < 9; k++) {
    lines = wrap(size);
    const lead = Math.max(size * 1.15, p.lead * (size / p.size));
    if (lines.length * lead <= height * 1.25 + p.size * 0.3 || size < p.size * 0.62) break;
    size *= 0.93;
  }
  const lead = Math.max(size * 1.15, p.lead * (size / p.size));
  const h = Math.max(height, lines.length * lead + size * 0.3);
  const c = document.createElement('canvas');
  c.width = Math.ceil(width * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.font = `${bold ? 700 : 400} ${size}px ${fam}`;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  if (RTL.has(lang)) { g.direction = 'rtl'; g.textAlign = 'right'; }
  lines.forEach((ln, i) => g.fillText(ln, RTL.has(lang) ? width : 0, size * 0.88 + i * lead));
  return { canvas: c, width, height: h };
}

// Text colour and background around a box, sampled from the rendered page.
function sampleBox(cv, k, x0, top, x1, bottom, pageH) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  const X = Math.max(0, Math.floor(x0 * k)), Y = Math.max(0, Math.floor((pageH - top) * k));
  const W = Math.max(1, Math.min(cv.width - X, Math.ceil((x1 - x0) * k))), H = Math.max(1, Math.min(cv.height - Y, Math.ceil((top - bottom) * k)));
  const d = g.getImageData(X, Y, W, H).data;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 16) { const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); counts.set(key, (counts.get(key) || 0) + 1); }
  let bk = 0xfff, best = -1; for (const [kk, v] of counts) if (v > best) { best = v; bk = kk; }
  const bg = [((bk >> 8) & 15) * 17, ((bk >> 4) & 15) * 17, (bk & 15) * 17];
  let far = -1, fg = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]); if (dist > far) { far = dist; fg = [d[i], d[i + 1], d[i + 2]]; } }
  const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { bg, fg: far < 80 ? '#111111' : hex(fg) };
}

async function translatePdf(bytes, name, o, progress) {
  const view = await openPdfjs(bytes);
  const n = view.numPages;
  const pages = [];
  let sample = '';
  for (let i = 1; i <= n; i++) {
    const page = await view.getPage(i);
    const tc = await page.getTextContent();
    // Load the page's fonts so their real names (which say "Bold", "Italic"…) can be read.
    await page.getOperatorList();
    const names = {};
    for (const k of Object.keys(tc.styles)) { try { names[k] = page.commonObjs.get(k)?.name || ''; } catch { names[k] = ''; } }
    const paras = paragraphsOf(tc.items, tc.styles, names);
    pages.push({ page, paras });
    if (sample.length < 800) sample += paras.map((p) => p.text).join(' ') + ' ';
  }
  if (!sample.trim()) throw new Error('This PDF has no text to translate (it may be a scan). Run OCR PDF on it first, then translate the result.');
  let src = o.from;
  if (src === 'auto') {
    src = await detectLanguage(sample);
    if (!src || !L[src]) throw new Error('The language could not be detected automatically in this browser. Choose the document\'s language in "From".');
  }
  if (src === o.to) throw new Error(`The document is already in ${L[src][1]}.`);
  progress(0.04, 'Preparing the translator…');
  const tr = await makeTranslator(src, o.to, (m) => progress(0.05, m[0].toUpperCase() + m.slice(1) + '…'));
  await loadFont(L[o.to][4]); await loadFont(L[o.to][4], { bold: true });

  // Translate every paragraph.
  const total = pages.reduce((a, p) => a + p.paras.length, 0);
  let done = 0;
  for (const pg of pages) for (const p of pg.paras) {
    progress(0.08 + (done++ / Math.max(1, total)) * 0.72, `Translating paragraph ${done} of ${total}…`);
    try { p.out = (await tr.translate(p.text)).trim() || p.text; } catch (e) { console.warn(e); p.out = p.text; }
  }

  // Rebuild the pages: copy them, take the original words out, draw the translation in the same place.
  progress(0.82, 'Rebuilding the pages…');
  const srcDoc = await loadPdfLib(bytes);
  const out = await PDFDocument.create();
  const copies = await out.copyPages(srcDoc, srcDoc.getPageIndices());
  copies.forEach((c) => out.addPage(c));
  for (let i = 0; i < n; i++) {
    const { page, paras } = pages[i];
    const vp = page.getViewport({ scale: 1 });
    const k = 1.5;
    const cv = await renderPage(page, k);
    const looks = paras.map((p) => sampleBox(cv, k, p.x0, p.top, p.x1, p.bottom, vp.height));
    try { removeTextInRects(out, i, paras.map((p) => ({ x0: p.x0 - 2, y0: p.bottom - 2, x1: p.x1 + 2, y1: p.top + 2 }))); } catch (e) { console.warn('text removal failed', e); }
    pages[i].looks = looks;
  }
  // Anything that couldn't be removed (unusual fonts) gets covered with its background colour.
  const check = await openPdfjs(await out.save());
  for (let i = 0; i < n; i++) {
    const left = (await (await check.getPage(i + 1)).getTextContent()).items.filter((it) => it.str.trim());
    const pg = out.getPage(i);
    pages[i].paras.forEach((p, j) => {
      const stillThere = left.some((it) => { const [, , , , e, f] = it.transform; return e >= p.x0 - 3 && e <= p.x1 + 3 && f >= p.bottom - 3 && f <= p.top + 3; });
      if (stillThere) { const [r, g, b] = pages[i].looks[j].bg.map((v) => v / 255); pg.drawRectangle({ x: p.x0 - 1.5, y: p.bottom - 1.5, width: p.x1 - p.x0 + 3, height: p.top - p.bottom + 3, color: rgb(r, g, b) }); }
    });
  }
  check.destroy();
  for (let i = 0; i < n; i++) {
    progress(0.86 + (i / n) * 0.1, `Drawing page ${i + 1} of ${n}…`);
    const pg = out.getPage(i);
    for (const [j, p] of pages[i].paras.entries()) {
      const bold = /bold|black|heavy/i.test(p.font + ' ' + p.family);
      const img = paragraphImage(p.out, p, o.to, pages[i].looks[j].fg, bold);
      const png = await out.embedPng(await blobToBytes(await canvasToBlob(img.canvas, 'image/png')));
      pg.drawImage(png, { x: p.x0, y: p.top - img.height, width: img.width, height: img.height });
    }
  }
  out.setTitle(`${stem(name)} (${L[o.to][1]})`);
  out.setLanguage(o.to);
  const pdf = await out.save();

  // The same translation as editable Word and plain text.
  const textOut = pages.map((pg, i) => `--- Page ${i + 1} ---\n\n` + pg.paras.map((p) => p.out).join('\n\n')).join('\n\n');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const kids = [];
  pages.forEach((pg, i) => {
    if (n > 1) kids.push(new Paragraph({ text: `Page ${i + 1}`, heading: HeadingLevel.HEADING_3 }));
    for (const p of pg.paras) kids.push(new Paragraph({ bidirectional: RTL.has(o.to), children: [new TextRun({ text: p.out, font: L[o.to][4], rightToLeft: RTL.has(o.to) })] }));
  });
  const docx = await Packer.toBlob(new Document({ sections: [{ children: kids }] }));
  view.destroy();
  return { pdf, docx, text: textOut, engine: tr.engine, src, total };
}

export const tools = {
  translate: {
    accept: PDF, multiple: false, label: 'Select a PDF', runLabel: 'Translate',
    notice: 'Translated on your device; the document is not sent anywhere. Chrome and Edge use their built-in translator. Other browsers download a small translation model the first time (about 110 MB per language pair).',
    options: [
      { key: 'from', label: 'From', type: 'select', default: 'auto', options: [['auto', 'Detect automatically'], ...LANGS.map((l) => [l[0], l[1]])] },
      { key: 'to', label: 'To', type: 'select', default: 'hi', options: LANGS.map((l) => [l[0], l[1]]) }
    ],
    async process([f], o, ctx) {
      const r = await translatePdf(await readBytes(f), f.name, o, (p, m) => ctx.progress(p, m));
      const base = `${stem(f.name)}-${o.to}`;
      return {
        outputs: [
          { name: base + '.pdf', blob: pdfBlob(r.pdf) },
          { name: base + '.docx', blob: r.docx },
          { name: base + '.txt', blob: new Blob([r.text], { type: 'text/plain' }), preview: r.text.slice(0, 3000) }
        ],
        note: `Translated ${r.total} paragraph${r.total === 1 ? '' : 's'} from ${L[r.src][1]} to ${L[o.to][1]} using ${r.engine}. The PDF keeps the original layout, pictures and colours; the Word file has the translated text to edit. Machine translation can make mistakes, so check important documents.`
      };
    }
  }
};
