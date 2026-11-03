// Editing the content of raster images: find text with OCR, erase it (content-aware fill),
// and draw replacement text that matches the original size, colour, weight and width.
import { loadImage } from './core.js';

export const FONT_CSS = {
  sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace'
};
// Distance from the top of a 1.2 line box to the baseline, in ems (matches how the browser lays text out).
export const ASC = { sans: 0.945, serif: 0.9375, mono: 0.866 };

const workers = new Map();
async function worker(langs, onStatus) {
  if (!workers.has(langs)) {
    workers.set(langs, (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(langs, 1, { logger: (m) => m.status && onStatus?.(m.status + (m.progress ? ` ${Math.round(m.progress * 100)}%` : '')) });
    })());
  }
  return workers.get(langs);
}

export async function srcToCanvas(src) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

const measure = document.createElement('canvas').getContext('2d');
export function textWidth(t) {
  measure.font = fontString(t, t.size);
  const lines = t.text.split('\n');
  return Math.max(...lines.map((l) => measure.measureText(l).width + (t.ls || 0) * Math.max(0, [...l].length - 1)));
}
export const fontString = (t, size) => `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : ''}${size}px ${FONT_CSS[t.font || 'sans']}`;

/**
 * OCR an image. Returns lines in image pixels with the style of each line already estimated:
 * [{text, bbox:{x0,y0,x1,y1}, baseline, size, color, bold, italic, font, ls, conf}]
 */
export async function findText(src, langs = 'eng', onStatus) {
  const c = await srcToCanvas(src);
  // Small images OCR much better when enlarged.
  let up = Math.max(1, Math.min(3, 1800 / Math.max(c.width, c.height)));
  if (up < 1.05) up = 1;
  let input = c;
  if (up > 1) {
    input = document.createElement('canvas');
    input.width = Math.round(c.width * up); input.height = Math.round(c.height * up);
    const g = input.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, input.width, input.height);
  }
  const w = await worker(langs, onStatus);
  onStatus?.('reading text');
  const { data } = await w.recognize(input, {}, { blocks: true, text: true });
  const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  const full = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const out = [];
  const s = (v) => v / up;
  for (const ln of lines) {
    // Keep only real words: shapes and noise often come back as low-confidence symbols.
    let words = (ln.words || []).filter((wd) => wd.text?.trim() && (/[\p{L}\p{N}]/u.test(wd.text) ? wd.confidence >= 15 : wd.confidence >= 70));
    if (!words.length) continue;
    // Words far taller than the rest are photo blobs or graphics, not part of this line.
    const hts = words.map((wd) => wd.bbox.y1 - wd.bbox.y0).sort((a, b) => a - b);
    const medH = hts[hts.length >> 1];
    words = words.filter((wd) => wd.bbox.y1 - wd.bbox.y0 <= medH * 1.7).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    // OCR often joins text across columns (or with noise in a picture next to it) into one line.
    // Split wherever the gap between words is much wider than a normal word space.
    const clusters = [];
    for (const wd of words) {
      const cur = clusters[clusters.length - 1];
      if (cur && wd.bbox.x0 - cur[cur.length - 1].bbox.x1 <= medH * 1.6) cur.push(wd); else clusters.push([wd]);
    }
    for (const cl of clusters) {
      const conf = cl.reduce((a, wd) => a + wd.confidence, 0) / cl.length;
      const letters = cl.map((wd) => wd.text).join('').replace(/[^\p{L}\p{N}]/gu, '').length;
      if (conf < 45 || (letters <= 3 && conf < 75 && clusters.length > 1)) continue;
      const line = buildLine(cl, ln, s, full, c.width, c.height);
      if (line) { line.conf = conf; out.push(line); }
    }
  }
  return out;
}

// Shrink a box to the pixels that actually differ from the background around it.
function tighten(d, W, H, b) {
  const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0)), x1 = Math.min(W - 1, Math.ceil(b.x1)), y1 = Math.min(H - 1, Math.ceil(b.y1));
  const bg = sideSampler(d, W, H, x0, y0, x1, y1);
  const cols = new Uint32Array(x1 - x0 + 1), rows = new Uint32Array(y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = (y * W + x) * 4, e = bg(x, y);
    if (Math.abs(d[q] - e[0]) + Math.abs(d[q + 1] - e[1]) + Math.abs(d[q + 2] - e[2]) > 80) { cols[x - x0]++; rows[y - y0]++; }
  }
  let l = 0, r = cols.length - 1, t = 0, bt = rows.length - 1;
  while (l < r && !cols[l]) l++;
  while (r > l && !cols[r]) r--;
  while (t < bt && !rows[t]) t++;
  while (bt > t && !rows[bt]) bt--;
  if (r - l < 3 || bt - t < 3) return b;
  return { x0: x0 + l, y0: y0 + t, x1: x0 + r + 1, y1: y0 + bt + 1 };
}

function buildLine(words, ln, s, full, W, H) {
  {
    const text = words.map((wd) => wd.text.trim()).join(' ');
    let bbox = {
      x0: s(Math.min(...words.map((wd) => wd.bbox.x0))), y0: s(Math.min(...words.map((wd) => wd.bbox.y0))),
      x1: s(Math.max(...words.map((wd) => wd.bbox.x1))), y1: s(Math.max(...words.map((wd) => wd.bbox.y1)))
    };
    if (bbox.x1 - bbox.x0 < 4 || bbox.y1 - bbox.y0 < 4) return null;
    bbox = tighten(full, W, H, bbox);
    // Baseline and size from this cluster's own words (OCR's line baseline can belong to another column):
    // the bottom of words without descenders is the baseline; the top of words with capitals/ascenders
    // is the cap height. Brackets and bars reach beyond both, so they're left out.
    // Letter boxes are used when OCR gives them, so "Royal Degree" still finds its baseline from R, o, a, l…
    const med = (v) => { const a = v.slice().sort((p, q) => p - q); return a[a.length >> 1]; };
    const odd = /[gjpqyQ,;()|\[\]{}@$\/]/;
    const syms = words.flatMap((wd) => (wd.symbols?.length ? wd.symbols : [wd]));
    const flat = syms.filter((sy) => sy.text && !odd.test(sy.text) && /[\p{L}\p{N}]/u.test(sy.text) && !/^[.\-'"]+$/.test(sy.text));
    const capped = flat.filter((sy) => /[A-Z0-9bdfhklt]/.test(sy.text) || /[^\x00-\x7f]/.test(sy.text));
    let bl = flat.length ? s(med(flat.map((wd) => wd.bbox.y1))) : ln.baseline?.has_baseline ? s((ln.baseline.y0 + ln.baseline.y1) / 2) : bbox.y1 - (/[gjpqy,;]/.test(text) ? (bbox.y1 - bbox.y0) * 0.22 : 0);
    if (!flat.length && Math.abs(bl - bbox.y1) > (bbox.y1 - bbox.y0) * 0.4) bl = bbox.y1;
    const baseline = Math.min(bbox.y1, Math.max(bbox.y0 + 2, bl));
    const tall = capped.length > 0 || (!flat.length && (/[A-Z0-9bdfhklt!?'"()\/\[\]{}|#%&@$]/.test(text) || /[^\x00-\x7f]/.test(text)));
    const top = capped.length ? s(med(capped.map((wd) => wd.bbox.y0))) : flat.length ? s(med(flat.map((wd) => wd.bbox.y0))) : bbox.y0;
    const size = Math.max(4, (baseline - top) / (tall ? 0.72 : 0.53));
    const serifVotes = words.filter((wd) => wd.is_serif).length, monoVotes = words.filter((wd) => wd.is_monospace).length;
    const font = monoVotes > words.length / 2 ? 'mono' : serifVotes > words.length / 2 ? 'serif' : 'sans';
    const style = inkStyle(full, W, H, bbox, size);
    const italic = words.filter((wd) => wd.is_italic).length > words.length / 2;
    // Each word's own box and weight, for lines that mix bold and regular (e.g. "FIRSTNAME Lastname").
    const wordList = words.map((wd) => {
      const wb = tighten(full, W, H, { x0: s(wd.bbox.x0), y0: bbox.y0, x1: s(wd.bbox.x1), y1: bbox.y1 });
      const ws = inkStyle(full, W, H, wb, size);
      return { text: wd.text.trim(), x0: wb.x0, x1: wb.x1, bold: ws.bold, weight: ws.weight, color: ws.color };
    });
    const line = { text, bbox, baseline, size, color: style.color, bold: style.bold, italic, font, conf: ln.confidence, words: wordList };
    line.ls = 0;
    const natural = textWidth({ ...line, ls: 0 });
    const target = bbox.x1 - bbox.x0;
    const n = [...text].length;
    if (n > 1) line.ls = Math.max(-0.12 * size, Math.min(0.25 * size, (target - natural) / (n - 1)));
    return line;
  }
}

// Robust background estimate for a box: the median colour of each side just outside it
// (so neighbouring letters poking into the ring don't count), blended across the box.
function sideSampler(d, W, H, x0, y0, x1, y1) {
  const px = (x, y) => { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); const q = (y * W + x) * 4; return [d[q], d[q + 1], d[q + 2]]; };
  const median = (list) => [0, 1, 2].map((k) => { const v = list.map((c) => c[k]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const row = (y) => { const out = []; for (let x = x0; x <= x1; x += Math.max(1, ((x1 - x0) / 200) | 0)) out.push(px(x, y)); return median(out); };
  const col = (x) => { const out = []; for (let y = y0; y <= y1; y++) out.push(px(x, y)); return median(out); };
  const T = row(y0 - 2), B = row(y1 + 2), L = col(x0 - 2), R = col(x1 + 2);
  return (x, y) => {
    const fx = (x - x0) / Math.max(1, x1 - x0), fy = (y - y0) / Math.max(1, y1 - y0);
    return [0, 1, 2].map((k) => ((L[k] * (1 - fx) + R[k] * fx) + (T[k] * (1 - fy) + B[k] * fy)) / 2);
  };
}

// True when the ring of pixels around a box is a plain colour or a smooth gradient
// (judged against the side-median estimate, so stray letters poking in don't count).
function isFlat(d, W, H, x0, y0, x1, y1) {
  const bg = sideSampler(d, W, H, x0, y0, x1, y1);
  let n = 0, near = 0;
  const test = (x, y, ex, ey) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const q = (y * W + x) * 4, e = bg(ex, ey);
    n++;
    if (Math.abs(d[q] - e[0]) + Math.abs(d[q + 1] - e[1]) + Math.abs(d[q + 2] - e[2]) < 36) near++;
  };
  const step = Math.max(1, ((x1 - x0) / 300) | 0);
  for (let k = 2; k <= 4; k++) {
    for (let x = x0; x <= x1; x += step) { test(x, y0 - k, x, y0); test(x, y1 + k, x, y1); }
    for (let y = y0; y <= y1; y++) { test(x0 - k, y, x0, y); test(x1 + k, y, x1, y); }
  }
  return n > 0 && near / n >= 0.9;
}

// Pixels just outside an ellipse, for judging and picking the colour around round pictures.
function ellipseRing(d, W, H, cx, cy, rx, ry) {
  const out = [];
  const n = Math.max(48, Math.round((rx + ry) * 2));
  for (const grow of [3, 5]) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (rx + grow)), y = Math.round(cy + Math.sin(a) * (ry + grow));
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const q = (y * W + x) * 4;
    out.push([d[q], d[q + 1], d[q + 2]]);
  }
  return out;
}
function ellipseRingColor(d, W, H, cx, cy, rx, ry) {
  const ring = ellipseRing(d, W, H, cx, cy, rx, ry);
  return [0, 1, 2].map((k) => { const v = ring.map((c) => c[k]).sort((a, b) => a - b); return v[v.length >> 1]; });
}
function isFlatEllipse(d, W, H, cx, cy, rx, ry) {
  const ring = ellipseRing(d, W, H, cx, cy, rx, ry);
  if (!ring.length) return false;
  const m = ellipseRingColor(d, W, H, cx, cy, rx, ry);
  const near = ring.filter((c) => Math.abs(c[0] - m[0]) + Math.abs(c[1] - m[1]) + Math.abs(c[2] - m[2]) < 40).length;
  return near / ring.length >= 0.85;
}

/**
 * Find photos and pictures inside a raster image (e.g. the portrait on a resume saved as one big picture).
 * Text and flat graphics are ignored: a picture is a large area with many different colours and tones.
 * `skip` is a list of text boxes (image pixels) to leave out. Returns [{x0,y0,x1,y1, shape:'rect'|'ellipse'}].
 */
export function findPictures(canvas, skip = []) {
  const W = canvas.width, H = canvas.height;
  const k = Math.min(1, 640 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k));
  const small = document.createElement('canvas');
  small.width = w; small.height = hh;
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.drawImage(canvas, 0, 0, w, hh);
  const d = sg.getImageData(0, 0, w, hh).data;
  const L = new Float32Array(w * hh);
  for (let i = 0; i < w * hh; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // Busy pixels: the brightness varies within a small window.
  const busy = new Uint8Array(w * hh);
  const R = 2;
  for (let y = R; y < hh - R; y++) for (let x = R; x < w - R; x++) {
    let s = 0, s2 = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const v = L[(y + dy) * w + x + dx]; s += v; s2 += v * v; }
    const n = (2 * R + 1) ** 2, varc = s2 / n - (s / n) ** 2;
    if (varc > 60) busy[y * w + x] = 1;
  }
  for (const b of skip) {
    for (let y = Math.max(0, Math.floor(b.y0 * k) - 1); y <= Math.min(hh - 1, Math.ceil(b.y1 * k) + 1); y++)
      busy.fill(0, y * w + Math.max(0, Math.floor(b.x0 * k) - 1), y * w + Math.min(w, Math.ceil(b.x1 * k) + 2));
  }
  // Close small gaps (flat patches inside a photo) so one picture becomes one region.
  const grow = (m, r, on) => {
    let cur = m;
    for (let pass = 0; pass < r; pass++) {
      const nx = cur.slice();
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i] === on) continue;
        if ((x > 0 && cur[i - 1] === on) || (x < w - 1 && cur[i + 1] === on) || (y > 0 && cur[i - w] === on) || (y < hh - 1 && cur[i + w] === on)) nx[i] = on;
      }
      cur = nx;
    }
    return cur;
  };
  const closed = grow(grow(busy, 3, 1), 3, 0);
  // Connected regions.
  const label = new Int32Array(w * hh).fill(-1);
  const found = [];
  for (let i = 0; i < w * hh; i++) {
    if (!closed[i] || label[i] >= 0) continue;
    const id = found.length;
    const stack = [i];
    label[i] = id;
    let x0 = w, y0 = hh, x1 = 0, y1 = 0, area = 0;
    const bins = new Map();
    while (stack.length) {
      const j = stack.pop();
      const x = j % w, y = (j / w) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const key = ((d[j * 4] >> 4) << 8) | ((d[j * 4 + 1] >> 4) << 4) | (d[j * 4 + 2] >> 4);
      bins.set(key, (bins.get(key) || 0) + 1);
      for (const n of [j - 1, j + 1, j - w, j + w]) {
        if (n < 0 || n >= w * hh || label[n] >= 0 || !closed[n]) continue;
        if ((n === j - 1 && x === 0) || (n === j + 1 && x === w - 1)) continue;
        label[n] = id; stack.push(n);
      }
    }
    found.push({ x0, y0, x1, y1, area, bins });
  }
  const minSide = Math.min(w, hh) * 0.06;
  const out = [];
  for (const r of found) {
    const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1;
    if (bw < minSide || bh < minSide || r.area < w * hh * 0.004) continue;
    // Photos use many colours; text blocks and flat drawings use a handful.
    const colours = [...r.bins.values()].filter((v) => v >= r.area * 0.002).length;
    if (colours < 40) continue;
    const fill = r.area / (bw * bh);
    if (fill < 0.55) continue;
    const ellipse = fill < 0.88 && Math.abs(bw - bh) / Math.max(bw, bh) < 0.35 && cornerEmpty(closed, w, r);
    const pad = 1;
    const box = { x0: Math.max(0, (r.x0 - pad) / k), y0: Math.max(0, (r.y0 - pad) / k), x1: Math.min(W, (r.x1 + 1 + pad) / k), y1: Math.min(H, (r.y1 + 1 + pad) / k), shape: ellipse ? 'ellipse' : 'rect' };
    out.push(refinePicture(canvas, box));
  }
  return out.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
}
// Shrink a detected picture past any plain border or frame (e.g. a white ring around a round photo),
// working at full resolution: an outline is "plain" when nearly all of its pixels share one colour.
function refinePicture(canvas, b) {
  const W = canvas.width, H = canvas.height;
  const x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), x1 = Math.ceil(b.x1), y1 = Math.ceil(b.y1);
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const bw = x1 - x0, bh = y1 - y0;
  const px = (x, y) => { x = Math.max(0, Math.min(bw - 1, Math.round(x))); y = Math.max(0, Math.min(bh - 1, Math.round(y))); const q = (y * bw + x) * 4; return [d[q], d[q + 1], d[q + 2]]; };
  const plain = (pts) => {
    if (pts.length < 8) return false;
    const m = [0, 1, 2].map((c) => { const v = pts.map((p) => p[c]).sort((a, b2) => a - b2); return v[v.length >> 1]; });
    return pts.filter((p) => Math.abs(p[0] - m[0]) + Math.abs(p[1] - m[1]) + Math.abs(p[2] - m[2]) < 45).length / pts.length > 0.92;
  };
  const maxIn = Math.min(bw, bh) * 0.3;
  // How far in the plain border goes: a few blended outlines between two plain colours don't end it;
  // five non-plain outlines in a row mean the picture has started.
  const depth = (plainAt) => { let last = -1, miss = 0; for (let s = 0; s < maxIn && miss < 5; s++) { if (plainAt(s)) { last = s; miss = 0; } else miss++; } return last + 1; };
  if (b.shape === 'ellipse') {
    const cx = bw / 2, cy = bh / 2;
    const ringAt = (s) => { const out = []; const n = Math.max(64, Math.round(bw + bh)); for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push(px(cx + Math.cos(a) * (bw / 2 - s), cy + Math.sin(a) * (bh / 2 - s))); } return out; };
    // Skip the ring(s) of plain colour, keeping one pixel of overlap for the anti-aliased edge.
    const shrink = Math.max(0, depth((s) => plain(ringAt(s))) - 1);
    return { x0: x0 + shrink, y0: y0 + shrink, x1: x1 - shrink, y1: y1 - shrink, shape: 'ellipse' };
  }
  const col = (x) => Array.from({ length: Math.ceil(bh / 2) }, (_, k) => px(x, k * 2));
  const row = (y) => Array.from({ length: Math.ceil(bw / 2) }, (_, k) => px(k * 2, y));
  const l = depth((s) => plain(col(s))), r = depth((s) => plain(col(bw - 1 - s)));
  const t = depth((s) => plain(row(s))), bt = depth((s) => plain(row(bh - 1 - s)));
  return { x0: x0 + Math.max(0, l - 1), y0: y0 + Math.max(0, t - 1), x1: x1 - Math.max(0, r - 1), y1: y1 - Math.max(0, bt - 1), shape: 'rect' };
}

// Round pictures leave the four corners of their box empty.
function cornerEmpty(m, w, r) {
  const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1, s = Math.max(1, Math.round(Math.min(bw, bh) * 0.12));
  let on = 0, n = 0;
  for (const [cx, cy] of [[r.x0, r.y0], [r.x1 - s + 1, r.y0], [r.x0, r.y1 - s + 1], [r.x1 - s + 1, r.y1 - s + 1]])
    for (let y = cy; y < cy + s; y++) for (let x = cx; x < cx + s; x++) { n++; on += m[y * w + x]; }
  return on / n < 0.25;
}

function inkStyle(d, W, H, b, size) {
  const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0)), x1 = Math.min(W - 1, Math.ceil(b.x1)), y1 = Math.min(H - 1, Math.ceil(b.y1));
  const bg = sideSampler(d, W, H, x0, y0, x1, y1);
  const inks = [];
  const runs = [];
  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = x0; x <= x1 + 1; x++) {
      let ink = false;
      if (x <= x1) {
        const q = (y * W + x) * 4, e = bg(x, y);
        const dist = Math.abs(d[q] - e[0]) + Math.abs(d[q + 1] - e[1]) + Math.abs(d[q + 2] - e[2]);
        if (dist > 90) { ink = true; inks.push([dist, d[q], d[q + 1], d[q + 2]]); }
      }
      if (ink) run++; else if (run) { runs.push(run); run = 0; }
    }
  }
  if (!inks.length) return { color: '#000000', bold: false };
  inks.sort((a, b2) => b2[0] - a[0]);
  const top = inks.slice(0, Math.max(1, Math.round(inks.length * 0.35)));
  const avg = [1, 2, 3].map((k) => Math.round(top.reduce((s, v) => s + v[k], 0) / top.length));
  // Stroke thickness relative to the font size: regular stems are ~0.09em, bold ~0.16em.
  // Vertical stems are the shorter horizontal runs, so look below the median.
  runs.sort((a, b2) => a - b2);
  const stroke = runs[Math.floor(runs.length * 0.4)] || 1;
  const weight = (stroke - 0.6) / size;
  // Light text on a dark background looks heavier than it is (its anti-aliased edge counts as ink).
  const e0 = bg((x0 + x1) >> 1, (y0 + y1) >> 1);
  const lightOnDark = avg[0] + avg[1] + avg[2] > e0[0] + e0[1] + e0[2] + 150;
  const bold = weight > (lightOnDark ? 0.166 : 0.126);
  return { color: '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join(''), bold, weight, lightOnDark };
}

/**
 * Content-aware erase of one or more boxes (image pixels). mode 'ink' removes only pixels that
 * differ from the surrounding background (letters, lines); mode 'all' rebuilds the whole box.
 * All boxes are masked first and filled together, so neighbouring lines never leak into each other.
 */
export function eraseRegion(canvas, boxes, mode = 'ink', allow = null) {
  // allow (optional, 'ink' mode): a W×H mask; only pixels set in it may be erased.
  if (!Array.isArray(boxes)) boxes = [boxes];
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const mask = new Uint8Array(W * H);
  const flatFills = [];
  let any = false;
  for (const box of boxes) {
    const pad = mode === 'ink' ? Math.max(2, Math.round((box.y1 - box.y0) * 0.12)) : 0;
    const x0 = Math.max(1, Math.floor(box.x0 - pad)), y0 = Math.max(1, Math.floor(box.y0 - pad));
    const x1 = Math.min(W - 2, Math.ceil(box.x1 + pad)), y1 = Math.min(H - 2, Math.ceil(box.y1 + pad));
    if (x1 <= x0 || y1 <= y0) continue;
    any = true;
    const bg = sideSampler(d, W, H, x0, y0, x1, y1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const flat = isFlat(d, W, H, x0, y0, x1, y1);
    if (mode === 'all') {
      // box.shape 'ellipse' erases only the oval inside the box (round photos, badges).
      const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, rx = (box.x1 - box.x0) / 2, ry = (box.y1 - box.y0) / 2;
      const inShape = box.shape === 'ellipse' ? (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 : () => true;
      const ringFlat = box.shape === 'ellipse' ? isFlatEllipse(d, W, H, cx, cy, rx, ry) : flat;
      const fillColor = box.shape === 'ellipse' && ringFlat ? ellipseRingColor(d, W, H, cx, cy, rx, ry) : null;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!inShape(x, y)) continue;
        if (fillColor) flatFills.push([y * W + x, fillColor]);
        else if (ringFlat) flatFills.push([y * W + x, bg(x, y)]);
        else mask[y * W + x] = 1;
      }
      continue;
    }
    const local = new Uint8Array(bw * bh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const q = (y * W + x) * 4, e = bg(x, y);
      if (Math.abs(d[q] - e[0]) + Math.abs(d[q + 1] - e[1]) + Math.abs(d[q + 2] - e[2]) > 55) local[(y - y0) * bw + (x - x0)] = 1;
    }
    // With an allow mask, keep marks that don't touch it at all (a dot or symbol the reader missed);
    // a mark that touches it even partly is a letter of the new text and is erased whole.
    const keep = allow ? new Uint8Array(bw * bh) : null;
    if (allow) {
      const seen = new Uint8Array(bw * bh);
      for (let i = 0; i < local.length; i++) {
        if (!local[i] || seen[i]) continue;
        const comp = [i];
        seen[i] = 1;
        let touches = false;
        for (let t = 0; t < comp.length; t++) {
          const j = comp[t], x = j % bw, y = (j / bw) | 0;
          if (allow[(y + y0) * W + x + x0]) touches = true;
          for (const nb of [x > 0 ? j - 1 : -1, x < bw - 1 ? j + 1 : -1, y > 0 ? j - bw : -1, y < bh - 1 ? j + bw : -1]) {
            if (nb >= 0 && local[nb] && !seen[nb]) { seen[nb] = 1; comp.push(nb); }
          }
        }
        if (!touches) for (const j of comp) { local[j] = 0; keep[j] = 1; }
      }
    }
    // Grow the mask to catch anti-aliased glyph edges and JPEG halos.
    const r = Math.max(1, Math.round(bh * 0.07));
    for (let pass = 0; pass < r; pass++) {
      const copy = local.slice();
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        if (copy[y * bw + x] || (keep && keep[y * bw + x])) continue;
        if ((x > 0 && copy[y * bw + x - 1]) || (x < bw - 1 && copy[y * bw + x + 1]) || (y > 0 && copy[(y - 1) * bw + x]) || (y < bh - 1 && copy[(y + 1) * bw + x])) local[y * bw + x] = 1;
      }
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!local[y * bw + x]) continue;
      // On a plain or gradient background, paint the background colour straight in: no smearing.
      if (flat) flatFills.push([(y + y0) * W + x + x0, bg(x + x0, y + y0)]);
      else mask[(y + y0) * W + x + x0] = 1;
    }
  }
  if (!any) return;
  for (const [i, e] of flatFills) { const q = i * 4; d[q] = e[0]; d[q + 1] = e[1]; d[q + 2] = e[2]; d[q + 3] = 255; mask[i] = 0; }
  // Fill from the outside in: each missing pixel becomes the average of its already-known neighbours.
  const known = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !mask[y * W + x];
  const queued = new Uint8Array(W * H);
  let front = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (known(x - 1, y) || known(x + 1, y) || known(x, y - 1) || known(x, y + 1)) { front.push(i); queued[i] = 1; }
  }
  while (front.length) {
    const fills = [];
    for (const i of front) {
      const x = i % W, y = (i / W) | 0;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !known(x + dx, y + dy)) continue;
        const q = ((y + dy) * W + (x + dx)) * 4, wgt = dx && dy ? 0.7 : 1;
        r += d[q] * wgt; gg += d[q + 1] * wgt; b += d[q + 2] * wgt; n += wgt;
      }
      if (n) fills.push([i, r / n, gg / n, b / n]);
    }
    if (!fills.length) break;
    const next = [];
    for (const [i, r, gg, b] of fills) { const q = i * 4; d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = 255; mask[i] = 0; }
    for (const [i] of fills) {
      const x = i % W, y = (i / W) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !queued[k]) { queued[k] = 1; next.push(k); }
      }
    }
    front = next;
  }
  g.putImageData(img, 0, 0);
}

// Draw image-text items (image pixel units) onto a canvas context.
export function drawTexts(g, texts) {
  for (const t of texts) {
    if (!t.text) continue;
    g.save();
    g.font = fontString(t, t.size);
    g.fillStyle = t.color;
    g.globalAlpha = (t.opacity ?? 100) / 100;
    g.textBaseline = 'alphabetic';
    const boxW = textWidth(t);
    t.text.split('\n').forEach((line, k) => {
      const lw = textWidth({ ...t, text: line });
      let x = t.x + (t.align === 'center' ? (boxW - lw) / 2 : t.align === 'right' ? boxW - lw : 0);
      const y = t.y + t.size * (ASC[t.font || 'sans'] + k * 1.2);
      if (!t.ls) { g.fillText(line, x, y); return; }
      for (const ch of line) { g.fillText(ch, x, y); x += g.measureText(ch).width + t.ls; }
    });
    g.restore();
  }
}
