// Split a flat picture (a poster, resume, social post, slide screenshot…) into separate layers:
// a background colour, solid shapes (panels, bars, lines, circles), photos, small graphics/icons, and
// editable text. Everything runs on the device.
import { rebuildPage, matchLineFonts } from './rebuild.js';
import { findPictures } from './imagetext.js';

const dist3 = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Returns {W, H, bg: {color}|{canvas}, shapes, pictures, graphics, lines}
 *   shapes:   [{kind:'rect'|'ellipse', x0,y0,x1,y1, color}]  (largest first, i.e. back to front)
 *   pictures: [{x0,y0,x1,y1, shape, canvas}]                  (photos, cut from the original)
 *   graphics: [{x0,y0,x1,y1, canvas}]                         (icons, logos, marks; transparent PNG)
 *   lines:    text lines from rebuildPage (with weight runs)
 * All coordinates are in pixels of the original image.
 */
export async function analyseLayers(canvas, { langs = 'eng', onStatus, withText = true, matchFonts = true } = {}) {
  const W = canvas.width, H = canvas.height;
  onStatus?.('reading text');
  let lines = [], clean = canvas;
  if (withText) {
    const r = await rebuildPage(canvas, { langs, onStatus });
    lines = r.lines;
    clean = r.bg; // the picture with the text erased
  }
  onStatus?.('finding photos');
  const pics = findPictures(clean, lines.map((l) => l.bbox));
  onStatus?.('finding shapes');
  const { bgColor, shapes, flatBg } = findShapes(clean, pics);

  // What the layers explain so far: background colour, shapes and photos.
  const explained = document.createElement('canvas');
  explained.width = W; explained.height = H;
  const eg = explained.getContext('2d');
  if (flatBg) { eg.fillStyle = hex(bgColor); eg.fillRect(0, 0, W, H); } else eg.drawImage(clean, 0, 0);
  for (const s of shapes) paintShape(eg, s, 1);
  const pictures = pics.map((p) => {
    const c = crop(canvas, p);
    paintPicture(eg, p, c, 1);
    return { ...p, canvas: c };
  });

  // Second reading pass for text the first one missed (typically light text on coloured panels):
  // read a copy where everything the layers don't explain is black on white, whatever its colours.
  if (withText) {
    onStatus?.('reading text on coloured areas');
    const r2 = await rebuildPage(clean, { langs, onStatus, ocrCanvas: contrastCopy(clean, explained, shapes) });
    const overlaps = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
    const extra = r2.lines.filter((l) => !lines.some((o) => overlaps(o.bbox, l.bbox)));
    if (extra.length) { clean = r2.bg; lines.push(...extra); }
  }

  // The closest Google font for each text style.
  if (withText && matchFonts && lines.length) await matchLineFonts(canvas, lines, onStatus);

  // Everything else that differs (icons, logos, decorations) becomes graphic layers.
  onStatus?.('separating graphics');
  const graphics = flatBg ? findGraphics(clean, explained, shapes) : [];
  let bg;
  if (flatBg) bg = { color: hex(bgColor) };
  else {
    // Busy or gradient background: keep it as a picture, with the photos taken out of it.
    const { eraseRegion } = await import('./imagetext.js');
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(clean, 0, 0);
    if (pics.length) eraseRegion(c, pics, 'all');
    bg = { canvas: c };
  }
  return { W, H, bg, shapes, pictures, graphics, lines };
}

export function paintShape(g, s, k) {
  g.fillStyle = s.color;
  if (s.kind === 'ellipse') {
    g.beginPath();
    g.ellipse(((s.x0 + s.x1) / 2) * k, ((s.y0 + s.y1) / 2) * k, ((s.x1 - s.x0) / 2) * k, ((s.y1 - s.y0) / 2) * k, 0, 0, Math.PI * 2);
    g.fill();
  } else g.fillRect(s.x0 * k, s.y0 * k, (s.x1 - s.x0) * k, (s.y1 - s.y0) * k);
}
export function paintPicture(g, p, c, k) {
  g.save();
  if (p.shape === 'ellipse') {
    g.beginPath();
    g.ellipse(((p.x0 + p.x1) / 2) * k, ((p.y0 + p.y1) / 2) * k, ((p.x1 - p.x0) / 2) * k, ((p.y1 - p.y0) / 2) * k, 0, 0, Math.PI * 2);
    g.clip();
  }
  g.drawImage(c, p.x0 * k, p.y0 * k, (p.x1 - p.x0) * k, (p.y1 - p.y0) * k);
  g.restore();
}

// Pixels along the edges of the shapes (alpha > 0), where the original's soft edge differs from a crisp redraw.
function rimMask(W, H, shapes) {
  const rim = document.createElement('canvas');
  rim.width = W; rim.height = H;
  const rg = rim.getContext('2d', { willReadFrequently: true });
  rg.strokeStyle = '#000'; rg.lineWidth = Math.max(3, Math.max(W, H) / 400);
  for (const sh of shapes) {
    rg.beginPath();
    if (sh.kind === 'ellipse') rg.ellipse((sh.x0 + sh.x1) / 2, (sh.y0 + sh.y1) / 2, (sh.x1 - sh.x0) / 2, (sh.y1 - sh.y0) / 2, 0, 0, Math.PI * 2);
    else rg.rect(sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0);
    rg.stroke();
  }
  return rg.getImageData(0, 0, W, H).data;
}

// Dark wherever `a` differs from `b` (the background and shapes the layers already explain), white elsewhere.
function contrastCopy(a, b, shapes = []) {
  const W = a.width, H = a.height;
  const rim = rimMask(W, H, shapes);
  const da = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const db = b.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const out = g.createImageData(W, H);
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    const v = rim[i + 3] > 0 ? 255 : 255 - Math.min(255, d * 1.3);
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

function crop(canvas, b) {
  const x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), w = Math.max(1, Math.ceil(b.x1) - x0), h = Math.max(1, Math.ceil(b.y1) - y0);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
  return c;
}

// ---------- solid shapes ----------
// Flood-fill regions of (nearly) one colour on a reduced copy. The biggest region touching the edge is the
// background; other big regions that are rectangles or ovals become shape layers.
function findShapes(canvas, pics) {
  const W = canvas.width, H = canvas.height;
  const k = Math.min(1, 900 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const sc = document.createElement('canvas');
  sc.width = w; sc.height = h;
  const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingEnabled = false;
  sg.drawImage(canvas, 0, 0, w, h);
  const d = sg.getImageData(0, 0, w, h).data;
  const blocked = new Uint8Array(w * h);
  for (const p of pics) for (let y = Math.max(0, Math.floor(p.y0 * k)); y < Math.min(h, Math.ceil(p.y1 * k)); y++) blocked.fill(1, y * w + Math.max(0, Math.floor(p.x0 * k)), y * w + Math.min(w, Math.ceil(p.x1 * k)));
  const label = new Int32Array(w * h).fill(-1);
  const regions = [];
  const TOL = 28;
  for (let i = 0; i < w * h; i++) {
    if (label[i] >= 0 || blocked[i]) continue;
    const seed = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    const id = regions.length;
    const stack = [i];
    label[i] = id;
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, edge = false;
    const sum = [0, 0, 0];
    while (stack.length) {
      const j = stack.pop();
      const x = j % w, y = (j / w) | 0;
      area++;
      sum[0] += d[j * 4]; sum[1] += d[j * 4 + 1]; sum[2] += d[j * 4 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0) push(j - 1); if (x < w - 1) push(j + 1); if (y > 0) push(j - w); if (y < h - 1) push(j + w);
    }
    function push(n) { if (label[n] < 0 && !blocked[n] && dist3(d, n * 4, seed) < TOL) { label[n] = id; stack.push(n); } }
    regions.push({ id, area, x0, y0, x1, y1, edge, color: sum.map((v) => v / area) });
  }
  const bgReg = regions.filter((r) => r.edge).sort((a, b) => b.area - a.area)[0];
  const flatBg = !!bgReg && bgReg.area > w * h * 0.25;
  const shapes = [];
  if (flatBg) {
    for (const r of regions) {
      if (r === bgReg) continue;
      const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1;
      // Divider lines are long; short thin slivers are the anti-aliased edges of letters or icons.
      const thin = Math.min(bw, bh) <= 4 && (bw >= w * 0.1 || bh >= h * 0.1) && r.area >= Math.max(bw, bh) * 0.8;
      if (!thin && (r.area < w * h * 0.0015 || bw < 8 || bh < 8)) continue;
      // A rectangle owns almost all of its outline (text and photos sit inside it, not on its edge).
      let own = 0, n = 0;
      const ins = (x, y) => { n++; if (label[y * w + x] === r.id) own++; };
      const iy0 = Math.min(r.y1, r.y0 + (bh > 2 ? 1 : 0)), iy1 = Math.max(r.y0, r.y1 - (bh > 2 ? 1 : 0)), ix0 = Math.min(r.x1, r.x0 + (bw > 2 ? 1 : 0)), ix1 = Math.max(r.x0, r.x1 - (bw > 2 ? 1 : 0));
      for (let x = ix0; x <= ix1; x++) { ins(x, iy0); ins(x, iy1); }
      for (let y = iy0; y <= iy1; y++) { ins(ix0, y); ins(ix1, y); }
      const fill = r.area / (bw * bh);
      let kind = null;
      if (own / n > 0.85 && fill > 0.45) kind = 'rect';
      else if (fill > 0.68 && fill < 0.86 && Math.abs(bw - bh) / Math.max(bw, bh) < 0.6) {
        // An oval owns the middle of each side and none of the corners.
        const at = (x, y) => label[Math.round(y) * w + Math.round(x)] === r.id;
        const mids = [at((r.x0 + r.x1) / 2, r.y0 + 1), at((r.x0 + r.x1) / 2, r.y1 - 1), at(r.x0 + 1, (r.y0 + r.y1) / 2), at(r.x1 - 1, (r.y0 + r.y1) / 2)].filter(Boolean).length;
        const corners = [at(r.x0, r.y0), at(r.x1, r.y0), at(r.x0, r.y1), at(r.x1, r.y1)].filter(Boolean).length;
        if (mids >= 3 && corners === 0) kind = 'ellipse';
      }
      if (!kind) continue;
      // Snap to the full-resolution edges (the reduced copy is up to 1/k pixels off).
      shapes.push({ kind, x0: r.x0 / k, y0: r.y0 / k, x1: (r.x1 + 1) / k, y1: (r.y1 + 1) / k, color: hex(r.color), area: r.area });
    }
    shapes.sort((a, b) => b.area - a.area);
    snapShapes(canvas, shapes);
  }
  return { bgColor: bgReg ? bgReg.color : [255, 255, 255], shapes, flatBg };
}

// Move each shape edge to where the colour actually changes at full resolution.
function snapShapes(canvas, shapes) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  for (const s of shapes) {
    if (s.kind !== 'rect') continue;
    const c = [parseInt(s.color.slice(1, 3), 16), parseInt(s.color.slice(3, 5), 16), parseInt(s.color.slice(5, 7), 16)];
    const pad = Math.ceil(Math.max(W, H) / 900) + 2;
    const x0 = Math.max(0, Math.floor(s.x0 - pad)), y0 = Math.max(0, Math.floor(s.y0 - pad)), x1 = Math.min(W, Math.ceil(s.x1 + pad)), y1 = Math.min(H, Math.ceil(s.y1 + pad));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < 2 || bh < 2) continue;
    const d = g.getImageData(x0, y0, bw, bh).data;
    const colFrac = (x) => { let n = 0, m = 0; for (let y = 0; y < bh; y += Math.max(1, (bh / 60) | 0)) { m++; if (dist3(d, (y * bw + x) * 4, c) < 40) n++; } return n / m; };
    const rowFrac = (y) => { let n = 0, m = 0; for (let x = 0; x < bw; x += Math.max(1, (bw / 60) | 0)) { m++; if (dist3(d, (y * bw + x) * 4, c) < 40) n++; } return n / m; };
    const mid = (x0 + x1) / 2 - x0, midY = (y0 + y1) / 2 - y0;
    let l = 0; while (l < mid && colFrac(l) < 0.5) l++;
    let r = bw - 1; while (r > mid && colFrac(r) < 0.5) r--;
    let t = 0; while (t < midY && rowFrac(t) < 0.5) t++;
    let b = bh - 1; while (b > midY && rowFrac(b) < 0.5) b--;
    if (r > l && b > t) { s.x0 = x0 + l; s.x1 = x0 + r + 1; s.y0 = y0 + t; s.y1 = y0 + b + 1; }
  }
}

// ---------- graphics (icons, logos, marks) ----------
function findGraphics(clean, explained, shapes = []) {
  const W = clean.width, H = clean.height;
  // The soft (anti-aliased) rim of each shape differs a little from the crisp redraw; it isn't a graphic.
  const rimD = rimMask(W, H, shapes);
  const a = clean.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const b = explained.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  // Pixels the other layers don't explain.
  const k = Math.min(1, 900 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const small = new Uint8Array(w * h);
  const full = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (rimD[i + 3] > 0) continue;
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) {
      full[y * W + x] = 1;
      small[Math.min(h - 1, (y * k) | 0) * w + Math.min(w - 1, (x * k) | 0)] = 1;
    }
  }
  // Group nearby marks into one graphic (an icon's pieces stay together).
  const grown = small.slice();
  for (let pass = 0; pass < 2; pass++) {
    const src = grown.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) grown[i] = 1;
    }
  }
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (!grown[i] || label[i] >= 0) continue;
    const id = comps.length, stack = [i];
    label[i] = id;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j / w) | 0;
      if (small[j]) area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (n >= 0 && grown[n] && label[n] < 0) { label[n] = id; stack.push(n); }
    }
    comps.push({ id, x0, y0, x1, y1, area });
  }
  // Tiny specks are leftovers from JPEG noise or anti-aliasing, not graphics.
  const keep = comps.filter((c) => c.area >= 6).sort((p, q) => q.area - p.area).slice(0, 80);
  const out = [];
  for (const c of keep) {
    const gx0 = Math.max(0, Math.floor(c.x0 / k) - 2), gy0 = Math.max(0, Math.floor(c.y0 / k) - 2);
    const gx1 = Math.min(W, Math.ceil((c.x1 + 1) / k) + 2), gy1 = Math.min(H, Math.ceil((c.y1 + 1) / k) + 2);
    const gw = gx1 - gx0, gh = gy1 - gy0;
    const cv = document.createElement('canvas');
    cv.width = gw; cv.height = gh;
    const g = cv.getContext('2d');
    const img = g.createImageData(gw, gh);
    let any = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const X = gx0 + x, Y = gy0 + y;
      if (label[Math.min(h - 1, (Y * k) | 0) * w + Math.min(w - 1, (X * k) | 0)] !== c.id) continue;
      // Include a 1px halo around each mark so anti-aliased edges come along.
      let on = full[Y * W + X];
      if (!on) for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) { const xx = X + dx, yy = Y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && full[yy * W + xx]) on = 1; }
      if (!on) continue;
      const i = (Y * W + X) * 4, o = (y * gw + x) * 4;
      img.data[o] = a[i]; img.data[o + 1] = a[i + 1]; img.data[o + 2] = a[i + 2]; img.data[o + 3] = 255;
      any++;
    }
    if (!any) continue;
    g.putImageData(img, 0, 0);
    out.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1, canvas: cv });
  }
  return out;
}
