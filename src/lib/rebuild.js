// Turn a picture of a document (a resume photo or screenshot, a scan, an image-only PDF page) into an
// editable document that looks the same: the text is read, erased from the picture, and put back as
// real text at the same place, size, colour and weight. Photos, lines and shapes stay in the background.
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setCharacterSpacing } from '@cantoo/pdf-lib';
import { findText, findPictures, eraseRegion } from './imagetext.js';
import { canvasToBlob, blobToBytes, hexToRgb01 } from './core.js';

const STD = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique]
};
const WORD_FONT = { sans: 'Arial', serif: 'Times New Roman', mono: 'Courier New' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Read and clean one page picture. Lines the reader isn't sure about, or that use characters the
 * built-in fonts can't show, are left in the picture untouched so the page still looks right.
 * Returns {bg: canvas without the converted text, lines, kept: number of lines left as pixels}.
 */
export async function rebuildPage(canvas, { langs = 'eng', minConf = 55, fontOverride = '', onStatus } = {}) {
  // Text "found" inside photos is noise; keep photos exactly as they are.
  const pics = findPictures(canvas);
  const inPicture = (b) => pics.some((p) => {
    const ix = Math.max(0, Math.min(b.x1, p.x1) - Math.max(b.x0, p.x0)), iy = Math.max(0, Math.min(b.y1, p.y1) - Math.max(b.y0, p.y0));
    return ix * iy > (b.x1 - b.x0) * (b.y1 - b.y0) * 0.4;
  });
  const lines = (await findText(canvas.toDataURL('image/png'), langs, onStatus)).filter((l) => !inPicture(l.bbox));
  const probe = await PDFDocument.create();
  const probeFonts = {};
  const pf = async (family, bold, italic) => { const key = STD[family][(bold ? 1 : 0) + (italic ? 2 : 0)]; return (probeFonts[key] ||= await probe.embedFont(key)); };
  const helv = await pf('sans', false, false);
  const ok = [], kept = [];
  for (const l0 of lines) {
    let encodable = true;
    try { helv.encodeText(l0.text); } catch { encodable = false; }
    if (!(encodable && l0.conf >= minConf && l0.text.trim())) { kept.push(l0); continue; }
    const l = fontOverride ? { ...l0, font: fontOverride } : l0;
    l.segs = await segments(l, pf);
    ok.push(l);
  }
  const bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  bg.getContext('2d').drawImage(canvas, 0, 0);
  onStatus?.('rebuilding the background');
  if (ok.length) eraseRegion(bg, ok.map((l) => l.bbox), 'ink', textMask(canvas.width, canvas.height, ok));
  return { bg, lines: ok, kept: kept.length };
}

// Pixels the rebuilt text will cover (grown a little). Only these are erased, so anything the reader
// missed (a dot, an accent, a symbol) stays in the picture instead of disappearing.
function textMask(W, H, lines) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = g.strokeStyle = '#000';
  g.lineJoin = 'round';
  for (const l of lines) {
    for (const sg of l.segs) {
      g.font = `${l.italic ? 'italic ' : ''}${sg.bold ? '700 ' : ''}${l.size}px ${CSS[l.font || 'sans']}`;
      const n = [...sg.text].length;
      g.letterSpacing = '0px';
      const ls = n > 1 ? clamp((sg.x1 - sg.x0 - g.measureText(sg.text).width) / (n - 1), -0.08 * l.size, 0.8 * l.size) : 0;
      g.letterSpacing = ls + 'px';
      g.lineWidth = Math.max(3, l.size * 0.22);
      g.fillText(sg.text, sg.x0, l.baseline);
      g.strokeText(sg.text, sg.x0, l.baseline);
    }
  }
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 20 ? 1 : 0;
  return m;
}

// Split a line into runs of the same weight, each placed at its own position. The weight of a run is
// decided by which font (regular or bold) reproduces its measured width best, which is more reliable
// than stroke thickness for small or light-on-dark text.
async function segments(l, pf) {
  const family = l.font || 'sans';
  const words = l.words?.length ? l.words : [{ text: l.text, x0: l.bbox.x0, x1: l.bbox.x1, bold: l.bold }];
  const reg = await pf(family, false, l.italic), bld = await pf(family, true, l.italic);
  const groups = [];
  for (const w of words) {
    const g = groups[groups.length - 1];
    if (g && g.bold === w.bold) { g.text += ' ' + w.text; g.x1 = w.x1; } else groups.push({ ...w });
  }
  for (const g of groups) {
    if ([...g.text].length < 4) continue;
    const t = g.x1 - g.x0, wr = reg.widthOfTextAtSize(g.text, l.size), wb = bld.widthOfTextAtSize(g.text, l.size);
    // Only trust the width when bold and regular really differ in width (not for most capitals).
    if (wb / wr < 1.06) continue;
    g.bold = Math.abs(Math.log(wb / t)) < Math.abs(Math.log(wr / t));
  }
  const out = [];
  for (const g of groups) {
    const last = out[out.length - 1];
    if (last && last.bold === g.bold) { last.text += ' ' + g.text; last.x1 = g.x1; } else out.push({ text: g.text, x0: g.x0, x1: g.x1, bold: g.bold });
  }
  return out;
}

/** pages: [{bg, lines, width, height}] where width/height are the page size in points. */
export async function buildEditablePdf(pages, title = '') {
  const doc = await PDFDocument.create();
  const fonts = {};
  const font = async (l) => { const key = STD[l.font || 'sans'][(l.bold ? 1 : 0) + (l.italic ? 2 : 0)]; return (fonts[key] ||= await doc.embedFont(key)); };
  for (const pg of pages) {
    const page = doc.addPage([pg.width, pg.height]);
    const k = pg.width / pg.bg.width;
    const jpg = await doc.embedJpg(await blobToBytes(await canvasToBlob(pg.bg, 'image/jpeg', 0.92)));
    page.drawImage(jpg, { x: 0, y: 0, width: pg.width, height: pg.height });
    for (const l of pg.lines) {
      const size = l.size * k;
      for (const sg of l.segs) {
        const f = await font({ ...l, bold: sg.bold });
        // Letter spacing that makes the text exactly as wide as it was in the picture.
        const n = [...sg.text].length;
        const target = (sg.x1 - sg.x0) * k;
        const ls = n > 1 ? clamp((target - f.widthOfTextAtSize(sg.text, size)) / (n - 1), -0.08 * size, 0.8 * size) : 0;
        page.pushOperators(pushGraphicsState(), setCharacterSpacing(ls));
        page.drawText(sg.text, { x: sg.x0 * k, y: pg.height - l.baseline * k, size, font: f, color: rgb(...hexToRgb01(l.color)) });
        page.pushOperators(popGraphicsState());
      }
    }
  }
  doc.setTitle(title);
  doc.setCreator('Pagewise');
  return doc.save();
}

/** The same pages as a Word document: the cleaned picture sits behind the text, each line in its own positioned frame. */
export async function buildEditableDocx(pages) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, FrameAnchorType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, HeightRule, LineRuleType } = await import('docx');
  const tw = (pt) => Math.round(pt * 20);
  const sections = [];
  for (const pg of pages) {
    const k = pg.width / pg.bg.width;
    const data = await blobToBytes(await canvasToBlob(pg.bg, 'image/jpeg', 0.92));
    const children = [new Paragraph({
      spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
      children: [new ImageRun({
        type: 'jpg', data,
        transformation: { width: (pg.width * 96) / 72, height: (pg.height * 96) / 72 },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE }
        }
      })]
    })];
    for (const l of pg.lines) {
      const size = l.size * k;
      const top = l.baseline * k - size * 0.93;
      // One frame per line keeps the line editable as a whole; runs inside it carry the weights,
      // with the gap between runs rebuilt as one space stretched to the right width.
      const runs = [];
      let x = l.segs[0].x0 * k;
      for (const [j, sg] of l.segs.entries()) {
        const n = [...sg.text].length;
        const w = (sg.x1 - sg.x0) * k;
        const natural = measure({ ...l, bold: sg.bold, text: sg.text }, size);
        const ls = n > 1 ? clamp((w - natural) / (n - 1), -0.08 * size, 0.8 * size) : 0;
        if (j) {
          const gap = sg.x0 * k - x, sp = measure({ ...l, bold: false, text: ' ' }, size);
          runs.push(new TextRun({ text: ' ', font: WORD_FONT[l.font || 'sans'], size: Math.round(size * 2), characterSpacing: tw(clamp(gap - sp, -sp * 0.5, size * 4)) }));
        }
        runs.push(new TextRun({ text: sg.text, font: WORD_FONT[l.font || 'sans'], size: Math.max(2, Math.round(size * 2)), bold: sg.bold, italics: l.italic, color: l.color.replace('#', ''), characterSpacing: tw(ls) }));
        x = sg.x1 * k;
      }
      const w = (l.bbox.x1 - l.bbox.x0) * k;
      children.push(new Paragraph({
        frame: {
          type: 'absolute', position: { x: tw(l.segs[0].x0 * k), y: tw(Math.max(0, top)) },
          width: tw(Math.min(pg.width - l.segs[0].x0 * k, w * 1.25 + size)), height: tw(size * 1.2),
          anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE }, rule: HeightRule.AUTO
        },
        spacing: { before: 0, after: 0, line: tw(size * 1.2), lineRule: LineRuleType.EXACT },
        children: runs
      }));
    }
    sections.push({ properties: { page: { size: { width: tw(pg.width), height: tw(pg.height) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 } } }, children });
  }
  return Packer.toBlob(new Document({ creator: 'Pagewise', sections }));
}

const mctx = document.createElement('canvas').getContext('2d');
const CSS = { sans: 'Arial, Helvetica, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
function measure(l, size) {
  mctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? '700 ' : ''}${size}px ${CSS[l.font || 'sans']}`;
  return mctx.measureText(l.text).width;
}
