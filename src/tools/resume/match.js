// "Match a design": looks at a picture of a resume the visitor likes and sets up the closest EditSupreme
// template with the same kind of layout, colour, fonts and photo. (For an exact copy of a one-off
// layout, the Screenshot to template tool rebuilds any picture as an editable page.)
import { readPicture, newCanvas } from '../../lib/imgio.js';
import { TEMPLATES, templateOf, RFONTS } from './model.js';

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

/** Layout facts about the picture, measured on a smaller copy. */
function measure(src) {
  // Big enough that thin dividers and small coloured text survive the shrinking.
  const W = Math.min(700, src.width), H = Math.round(W * src.height / src.width);
  const c = newCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  // Paper colour: the brightest of the four corner areas (photos of paper are rarely pure white).
  const avgCol = (x0, x1, y0, y1) => {
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = Math.round(y0); y < y1; y += 2) for (let x = Math.round(x0); x < x1; x += 2) { const p = at(x, y); r += p[0]; gg += p[1]; b += p[2]; n++; }
    return [r / n, gg / n, b / n];
  };
  const paper = [avgCol(W * 0.9, W - 1, H * 0.9, H - 1), avgCol(0, W * 0.1, H * 0.9, H - 1), avgCol(W * 0.9, W - 1, 0, H * 0.05)].sort((p, q) => lum(...q) - lum(...p))[0];
  const off = (p, d = 10) => Math.abs(p[0] - paper[0]) > d || Math.abs(p[1] - paper[1]) > d || Math.abs(p[2] - paper[2]) > d;
  // Sidebars: strips that are filled (not paper) down most of the page.
  const strip = (x0, x1) => {
    let filled = 0, n = 0;
    for (let y = Math.round(H * 0.25); y < H * 0.95; y += 3) {
      let f = 0, m = 0;
      for (let x = Math.round(x0); x < x1; x += 2) { if (off(at(x, y), 7)) f++; m++; }
      if (f / m > 0.85) filled++;
      n++;
    }
    return filled / n;
  };
  const leftFill = strip(2, W * 0.2), rightFill = strip(W * 0.8, W - 2);
  const leftCol = avgCol(2, W * 0.2, H * 0.3, H * 0.9), rightCol = avgCol(W * 0.8, W - 2, H * 0.3, H * 0.9);
  const rowFill = (y, x0 = W * 0.25, x1 = W * 0.95) => { let f = 0, n = 0; for (let x = Math.round(x0); x < x1; x += 3) { if (off(at(x, y), 25)) f++; n++; } return f / n; };
  // Header band: the top rows filled across the page (rows with white text in them are only partly filled).
  let band = 0, filledRows = 0;
  for (let y = 0; y < H * 0.35; y++) {
    if (rowFill(y) > 0.55) { filledRows++; if (filledRows >= (y + 1) * 0.8) band = y; }
    else if (filledRows < (y + 1) * 0.5) break;
  }
  // Boxed headings: separate filled bars across the page below the header.
  // (Thin lines under headings are not boxes: a box is several rows tall.)
  let boxes = 0, run = 0;
  const minBox = Math.max(4, H * 0.012);
  for (let y = Math.max(band + 8, Math.round(H * 0.12)); y < H * 0.95; y++) {
    if (rowFill(y, W * 0.12, W * 0.88) > 0.8) run++;
    else { if (run >= minBox) boxes++; run = 0; }
  }
  // Coloured ink: a saturated colour used all over the page (headings, titles), not one patch like a photo.
  const buckets = new Map();
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const p = at(x, y);
    if (sat(...p) < 0.28 || lum(...p) > 235 || lum(...p) < 25) continue;
    const k = p.map((v) => v >> 4).join(',');
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0, rows: new Set() };
    e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; e.rows.add(y >> 4);
    buckets.set(k, e);
  }
  let accent = null, best = 0;
  for (const e of buckets.values()) {
    const L = lum(e.r / e.n, e.g / e.n, e.b / e.n);
    // Spread over many rows of the page counts most; very light tints (chip and sidebar fills) count for little.
    const score = Math.sqrt(e.n) * e.rows.size * (0.4 + sat(e.r / e.n, e.g / e.n, e.b / e.n)) * (L > 200 ? 0.08 : L > 170 ? 0.5 : 1);
    if (score > best) { best = score; accent = e; }
  }
  // Small coloured text spreads over many shades, so a colour seen on many rows needs fewer pixels.
  const minN = W * H / 4 * 0.0008;
  const accentHex = accent && accent.rows.size >= 4 && (accent.n > minN || (accent.rows.size >= 8 && accent.n > minN * 0.4)) ? hex(accent.r / accent.n, accent.g / accent.n, accent.b / accent.n) : null;
  // Ink in each column of pixels down the middle of the page.
  const y0 = Math.round(H * 0.3), y1 = Math.round(H * 0.9);
  const ink = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let d = 0, n = 0;
    for (let y = y0; y < y1; y += 2) { if (off(at(x, y), 40)) d++; n++; }
    ink[x] = d / n;
  }
  // Two columns without a filled sidebar: a thin vertical rule, or a clear gap that runs down the page.
  let midRule = 0, gutter = false;
  for (let x = Math.round(W * 0.45); x < W * 0.8; x++) {
    midRule = Math.max(midRule, ink[x]);
    let run = 0;
    while (x + run < W * 0.85 && ink[x + run] < 0.004) run++;
    if (run >= W * 0.02) {
      const avg = (a, b) => { let s = 0; for (let i = Math.round(a); i < b; i++) s += ink[i]; return s / Math.max(1, b - a); };
      if (avg(W * 0.08, x) > 0.03 && avg(x + run, W * 0.95) > 0.03) gutter = true;
      x += run;
    }
  }
  // Timeline: a thin coloured line running down the left part of the page, with clear space on both sides.
  let rail = false;
  for (let x = Math.round(W * 0.1); x < W * 0.32 && !rail; x++) {
    let d = 0, n = 0;
    for (let y = y0; y < y1; y += 2) { const p = at(x, y); if (off(p, 25) && sat(...p) > 0.12) d++; n++; }
    const sideL = ink[x - 4] ?? 1, sideR = ink[x + 4] ?? 1;
    if (d / n > 0.3 && sideL < d / n * 0.5 && sideR < d / n * 0.5) rail = true;
  }
  return { leftFill, rightFill, leftCol, rightCol, band: band / H, boxes, accentHex, midRule, gutter, rail };
}

/** The closest template and the accent colour from the layout alone (fast, no text reading). */
export function guessLayout(canvas) {
  const m = measure(canvas);
  const notes = [];
  const dark = (c) => lum(...c) < 170;
  let template = 'classic';
  if (m.leftFill > 0.7) { template = dark(m.leftCol) ? 'modern' : 'creative'; notes.push(`a ${dark(m.leftCol) ? 'dark' : 'light'} sidebar on the left`); }
  else if (m.rightFill > 0.7) { template = 'sidebar-right'; notes.push('a sidebar on the right'); }
  else if (m.band > 0.06) { template = m.boxes >= 3 ? 'bold' : 'executive'; notes.push('a coloured header band' + (m.boxes >= 3 ? ' and boxed headings' : '')); }
  else if (m.midRule > 0.75 || m.gutter) { template = 'twocol'; notes.push('two columns'); }
  else if (m.rail) { template = 'timeline'; notes.push('a timeline'); }
  else if (m.boxes >= 3) { template = 'bold'; notes.push('boxed headings'); }
  else notes.push('a single column');
  let accent = m.accentHex;
  if (!accent && (m.leftFill > 0.7 || m.rightFill > 0.7)) accent = hex(...(m.leftFill > 0.7 ? m.leftCol : m.rightCol));
  if (accent) notes.push('the colour ' + accent);

  return { template, accent, notes };
}

/**
 * Returns { template, accent, font, headFont, photo, notes[], canvas } for the picture.
 * onStatus gets progress text. Reading text and matching fonts takes a few seconds.
 */
export async function matchDesign(file, onStatus = () => {}) {
  onStatus('Looking at the layout…');
  const canvas = file instanceof HTMLCanvasElement ? file : (await readPicture(file)).frames[0].canvas;
  const { template: t0, accent, notes } = guessLayout(canvas);
  let template = t0;

  // Photo
  let photo = 'none';
  try {
    onStatus('Looking for a photo…');
    const { findFaces } = await import('../imagestudio.js');
    const faces = await findFaces(canvas);
    if (faces.length) {
      photo = 'circle';
      const f = faces[0];
      // A square photo has background colour in its corners; a round one leaves the paper colour there.
      const g = canvas.getContext('2d');
      const side = f.w * 1.9, x = Math.max(0, f.x + f.w / 2 - side / 2), y = Math.max(0, f.y + f.h * 0.55 - side / 2);
      const corner = g.getImageData(Math.round(x + 2), Math.round(y + 2), 1, 1).data;
      if (lum(corner[0], corner[1], corner[2]) < 225 && sat(corner[0], corner[1], corner[2]) < 0.5) photo = 'square';
      notes.push('a ' + (photo === 'circle' ? 'round' : 'square') + ' photo');
      if (!['modern', 'creative', 'sidebar-right', 'executive', 'bold'].includes(template)) template = template === 'classic' ? 'classic' : template;
    }
  } catch { /* face finder could not load: no photo setting */ }

  // Fonts: read a few lines and compare their shapes with common resume fonts.
  let font = null, headFont = null, textLines = [];
  try {
    onStatus('Reading the text…');
    const { findText } = await import('../../lib/imagetext.js');
    textLines = await findText(canvas, 'eng', onStatus);
    const { matchFont } = await import('../../lib/fonts.js');
    const sorted = textLines.filter((l) => l.text.replace(/\W/g, '').length >= 4 && l.conf > 60);
    const sizes = sorted.map((l) => l.size).sort((a, b) => a - b);
    const med = sizes[Math.floor(sizes.length / 2)] || 12;
    const bodyS = sorted.filter((l) => Math.abs(l.size - med) < med * 0.15).slice(0, 4);
    const headS = sorted.filter((l) => l.size > med * 1.6).slice(0, 2);
    const sample = (ls) => ls.map((l) => ({ canvas, box: l.bbox, text: l.text }));
    onStatus('Matching the fonts…');
    const pick = (res) => res.map((x) => x.family).find((f) => RFONTS.includes(f)) || null;
    if (bodyS.length) font = pick(await matchFont(sample(bodyS), { candidates: RFONTS, top: 5 }));
    if (headS.length) headFont = pick(await matchFont(sample(headS), { candidates: RFONTS, top: 5 }));
    if (font) notes.push('text like ' + font);
    if (headFont && headFont !== font) notes.push('headings like ' + headFont);
  } catch (e) { console.warn('font match', e); }

  const t = templateOf(template);
  return { template, accent: accent || t.accent, font: font || t.font, headFont: headFont && headFont !== font ? headFont : '', photo, notes, canvas, textLines };
}

export const TEMPLATE_NAMES = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.name]));
