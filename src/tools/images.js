// Image tools: compress, resize, convert, upscale, remove background, watermark, rotate, HTML to image.
// The interactive ones (crop, photo editor, meme generator, blur face) are in imagestudio.js.
import { stem, fmtSize } from '../lib/core.js';
import {
  IMG_ACCEPT, JPG_ACCEPT, readPicture, savePicture, keepFormat, mapFrames, encode, encodeGif, newCanvas, ctx2d,
  resizeCanvas, rotateCanvas, cropCanvas, fitToSize, minifySvg, svgResize, svgRotate, svgBlob, flatten, hasAlpha
} from '../lib/imgio.js';

const pct = (a, b) => Math.round((1 - b / a) * 100);
const sumNote = (before, after) => after < before
  ? `Total: ${fmtSize(before)} → ${fmtSize(after)} (${pct(before, after)}% smaller).`
  : `Total: ${fmtSize(before)} → ${fmtSize(after)}.`;

async function eachPicture(files, ctx, fn) {
  const outputs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress((i + 0.1) / files.length, `Opening ${files[i].name}…`);
    const pic = await readPicture(files[i]);
    ctx.progress((i + 0.4) / files.length, `Working on ${files[i].name}…`);
    outputs.push(...await fn(pic, i));
  }
  return outputs;
}

const formatOpt = (def = 'same') => ({ key: 'format', label: 'Save as', type: 'seg', default: def, options: [['same', 'Same format'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']] });
const outFormat = (pic, o) => (o.format && o.format !== 'same') ? o.format : keepFormat(pic);

// "50 KB", "1.5 MB" -> bytes
const KB = (v, unit = 'kb') => Math.round(+v * (unit === 'mb' ? 1024 * 1024 : 1024));
const sizeUnitOpt = (showIf) => ({ key: 'unitKB', label: 'Unit', type: 'seg', default: 'kb', options: [['kb', 'KB'], ['mb', 'MB']], showIf });

// Save the first frame under a size limit; explains in the note when it had to be smaller or could not fit.
async function saveUnder(pic, canvas, fmt, maxBytes, notes, { suffix = '', allowShrink = true } = {}) {
  if (fmt === 'gif' || fmt === 'svg') fmt = hasAlpha(canvas) ? 'png' : 'jpg';
  const r = await fitToSize(canvas, fmt, maxBytes, { allowShrink });
  const what = `${pic.name}: ${fmtSize(r.blob.size)}, ${r.width} × ${r.height} px`;
  if (!r.fits) notes.push(`${what}. Could not get under ${fmtSize(maxBytes)}; this is the smallest it can go${allowShrink ? '' : ' at this size in pixels. Try JPG or smaller dimensions'}.`);
  else if (r.width !== canvas.width) notes.push(`${what} (made smaller to fit under ${fmtSize(maxBytes)}).`);
  else notes.push(`${what}${fmt === 'jpg' || fmt === 'webp' ? `, quality ${Math.round(r.quality * 100)}%` : ''}.`);
  return [{ name: `${stem(pic.name)}${suffix}.${fmt}`, blob: r.blob }];
}

// ---------- watermark drawing (shared with the GIF frames) ----------
async function drawWatermark(c, o, mark) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.save();
  g.globalAlpha = o.opacity / 100;
  let mw, mh, paint;
  if (o.kind === 'image' && mark) {
    mw = W * o.scale / 100; mh = mw * mark.height / mark.width;
    paint = () => g.drawImage(mark, -mw / 2, -mh / 2, mw, mh);
  } else {
    const px = Math.max(8, Math.min(W, H) * o.size / 100);
    const fam = o.gfont ? `"${o.gfont}", ` : '';
    g.font = `${o.bold ? 'bold ' : ''}${px}px ${fam}Arial, Helvetica, sans-serif`;
    const lines = String(o.text || '').split('\n');
    mw = Math.max(...lines.map((l) => g.measureText(l).width)); mh = px * 1.2 * lines.length;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.color;
    paint = () => lines.forEach((l, k) => g.fillText(l, 0, (k - (lines.length - 1) / 2) * px * 1.2));
  }
  const rot = (+o.rotation || 0) * Math.PI / 180;
  if (o.mosaic) {
    const stepX = mw * 1.8 + W * 0.04, stepY = mh * 2.4 + H * 0.04;
    for (let y = -H; y < H * 2; y += stepY) for (let x = -W + ((y / stepY) % 2 ? stepX / 2 : 0); x < W * 2; x += stepX) {
      g.save(); g.translate(x, y); g.rotate(rot); paint(); g.restore();
    }
  } else {
    const m = Math.min(W, H) * 0.04;
    const p = o.position;
    const x = p[1] === 'l' ? m + mw / 2 : p[1] === 'r' ? W - m - mw / 2 : W / 2;
    const y = p[0] === 't' ? m + mh / 2 : p[0] === 'b' ? H - m - mh / 2 : H / 2;
    g.translate(x, y); g.rotate(rot); paint();
  }
  g.restore();
  return c;
}

// ---------- background removal (on-device AI) ----------
// Both run on the CPU (WebAssembly): reliable on every device; the GPU path can hang on some graphics drivers.
const BG_MODELS = {
  best: { id: 'onnx-community/ormbg-ONNX', dtype: 'uint8' }, // Apache-2.0, 44 MB, any subject
  people: { id: 'Xenova/modnet', dtype: 'uint8' } // Apache-2.0, 7 MB, portraits
};
const segmenters = new Map();
async function getSegmenter(kind, onStatus) {
  if (!segmenters.has(kind)) {
    segmenters.set(kind, (async () => {
      const { pipeline } = await (await import('../lib/ai.js')).transformers();
      const m = BG_MODELS[kind];
      return pipeline('background-removal', m.id, { device: 'wasm', dtype: m.dtype, progress_callback: (pr) => { if (pr.status === 'progress' && pr.file?.endsWith('.onnx')) onStatus(`Downloading the AI model ${Math.round(pr.progress || 0)}% (only the first time)`); } });
    })());
    segmenters.get(kind).catch(() => segmenters.delete(kind));
  }
  return segmenters.get(kind);
}

/** Alpha mask (canvas, white = keep) for a picture. Simple mode: flood-fill the plain colour touching the edges. */
export async function cutoutMask(canvas, mode, onStatus) {
  const W = canvas.width, H = canvas.height;
  if (mode === 'simple') return solidBackgroundMask(canvas);
  const seg = await getSegmenter(mode, onStatus);
  onStatus('Finding the subject…');
  const { RawImage } = await (await import('../lib/ai.js')).transformers();
  const raw = RawImage.fromCanvas ? await RawImage.fromCanvas(canvas) : await RawImage.fromURL(canvas.toDataURL('image/png'));
  const [out] = await seg(raw);
  const res = out.toCanvas();
  const m = newCanvas(W, H), mg = ctx2d(m);
  mg.drawImage(res, 0, 0, W, H);
  return m;
}

function solidBackgroundMask(canvas) {
  const W = canvas.width, H = canvas.height;
  const d = ctx2d(canvas).getImageData(0, 0, W, H).data;
  // The background colour is the most common colour along the border.
  const counts = new Map();
  const at = (x, y) => (y * W + x) * 4;
  const key = (i) => ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const k = key(at(x, y)); counts.set(k, (counts.get(k) || 0) + 1); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const k = key(at(x, y)); counts.set(k, (counts.get(k) || 0) + 1); }
  let bk = 0, bn = -1;
  for (const [k, n] of counts) if (n > bn) { bn = n; bk = k; }
  let r = 0, gg = 0, b = 0, n = 0;
  const sample = (i) => { if (key(i) === bk) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } };
  for (let x = 0; x < W; x++) { sample(at(x, 0)); sample(at(x, H - 1)); }
  r /= n; gg /= n; b /= n;
  const dist = (i) => Math.hypot(d[i] - r, d[i + 1] - gg, d[i + 2] - b);
  const TOL = 38, SOFT = 22;
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => { const p = y * W + x; if (!bg[p] && dist(p * 4) < TOL) { bg[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p / W) | 0;
    if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
  }
  const m = newCanvas(W, H), mg = ctx2d(m), md = mg.createImageData(W, H);
  for (let p = 0; p < W * H; p++) {
    let a = 255;
    if (bg[p]) a = 0;
    else {
      // Soft edge: pixels next to the background fade by how close their colour is to it.
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W])) a = Math.max(0, Math.min(255, (dist(p * 4) - TOL + SOFT) / SOFT * 255));
    }
    md.data[p * 4] = md.data[p * 4 + 1] = md.data[p * 4 + 2] = 255; md.data[p * 4 + 3] = a;
  }
  mg.putImageData(md, 0, 0);
  return m;
}

export function applyMask(canvas, mask, o) {
  const W = canvas.width, H = canvas.height;
  const cut = newCanvas(W, H), cg = cut.getContext('2d');
  cg.drawImage(canvas, 0, 0);
  // Use the mask's alpha (simple mode) or brightness (AI masks are opaque greys with alpha).
  const md = ctx2d(mask).getImageData(0, 0, W, H).data;
  const id = cg.getImageData(0, 0, W, H);
  for (let i = 0; i < md.length; i += 4) id.data[i + 3] = Math.round(id.data[i + 3] * md[i + 3] / 255);
  cg.putImageData(id, 0, 0);
  if (o.bg === 'transparent') return cut;
  const out = newCanvas(W, H), g = out.getContext('2d');
  if (o.bg === 'color') { g.fillStyle = o.color; g.fillRect(0, 0, W, H); }
  else if (o.bg === 'blur') {
    // Drawn a little larger than the picture so the blur doesn't fade to transparent at the edges.
    const r = Math.max(4, Math.round(Math.max(W, H) / 60)), m = r * 3;
    g.filter = `blur(${r}px)`; g.drawImage(canvas, -m, -m, W + 2 * m, H + 2 * m); g.filter = 'none';
  }
  else if (o.bg === 'image' && o.bgImage) { const s = Math.max(W / o.bgImage.width, H / o.bgImage.height); g.drawImage(o.bgImage, (W - o.bgImage.width * s) / 2, (H - o.bgImage.height * s) / 2, o.bgImage.width * s, o.bgImage.height * s); }
  g.drawImage(cut, 0, 0);
  return out;
}

function trimTransparent(c) {
  const W = c.width, H = c.height, d = ctx2d(c).getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const pad = Math.round(Math.max(W, H) * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const t = newCanvas(x1 - x0 + 1, y1 - y0 + 1);
  t.getContext('2d').drawImage(c, -x0, -y0);
  return t;
}

// ---------- HTML to image ----------
async function renderHtml(html, { width = 1280, full = true, scale = 1 }) {
  const html2canvas = (await import('html2canvas')).default;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  const vh = Math.round(width * 0.625);
  Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: width + 'px', height: vh + 'px', border: '0' });
  document.body.append(frame);
  try {
    frame.srcdoc = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;font:16px/1.5 Arial,sans-serif;color:#111;background:#fff}</style></head><body>${html}</body></html>`;
    await new Promise((r) => { frame.onload = r; });
    const d = frame.contentDocument;
    await Promise.all([...d.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    await d.fonts?.ready;
    const H = full ? Math.min(30000, Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight || 0, 50)) : vh;
    frame.style.height = H + 'px';
    const bg = getComputedStyle(d.body).backgroundColor;
    return await html2canvas(d.documentElement, { scale, backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff', windowWidth: width, windowHeight: H, width, height: H, useCORS: true, logging: false });
  } finally { frame.remove(); }
}

const opacityOpt = { key: 'opacity', label: 'Transparency', type: 'range', min: 5, max: 100, default: 50, unit: '%' };

export const tools = {
  'compress-image': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images', runLabel: 'Compress images',
    options: [
      { key: 'level', label: 'Compression', type: 'seg', default: 'recommended', options: [['low', 'Light'], ['recommended', 'Recommended'], ['extreme', 'Strong'], ['target', 'Exact file size']],
        hint: 'Light keeps the most detail; Strong gives the smallest files. Exact file size: type the size a form asks for, e.g. under 50 KB.' },
      { key: 'target', label: 'Largest file size', type: 'number', default: 100, min: 1, showIf: (v) => v.level === 'target', hint: 'Each picture is saved as close to this size as possible without going over.' },
      sizeUnitOpt((v) => v.level === 'target'),
      { key: 'tfmt', label: 'Save as', type: 'seg', default: 'same', options: [['same', 'Same format'], ['jpg', 'JPG'], ['webp', 'WEBP'], ['png', 'PNG']], showIf: (v) => v.level === 'target' },
      { key: 'max', label: 'Largest side', type: 'select', default: '0', options: [['0', 'Keep the size'], ['3840', '3840 px (4K)'], ['2560', '2560 px'], ['1920', '1920 px (Full HD)'], ['1280', '1280 px'], ['800', '800 px']] }
    ],
    async process(files, o, ctx) {
      const Q = { low: 0.86, recommended: 0.74, extreme: 0.55 }[o.level];
      const COLORS = { low: 0, recommended: 256, extreme: 96 }[o.level];
      const GIFC = { low: 256, recommended: 128, extreme: 48 }[o.level];
      let before = 0, after = 0, kept = 0;
      if (o.level === 'target') {
        const max = KB(o.target, o.unitKB);
        if (!(max > 0)) throw new Error('Enter the largest file size, for example 100 KB.');
        const notes = [];
        const outputs = await eachPicture(files, ctx, async (pic) => {
          let c = pic.frames[0].canvas;
          const lim = +o.max; if (lim) { const k = Math.min(1, lim / Math.max(c.width, c.height)); if (k < 1) c = resizeCanvas(c, c.width * k, c.height * k); }
          let fmt = o.tfmt !== 'same' ? o.tfmt : keepFormat(pic);
          // Already small enough and nothing to change: keep the original file untouched.
          if (pic.size <= max && o.tfmt === 'same' && !lim && ['jpg', 'png', 'webp', 'gif'].includes(pic.kind)) { notes.push(`${pic.name}: already ${fmtSize(pic.size)}, kept as it was.`); return [{ name: pic.name, blob: pic.file }]; }
          return saveUnder(pic, c, fmt, max, notes);
        });
        return { outputs, note: notes.join('\n') };
      }
      const outputs = await eachPicture(files, ctx, async (pic) => {
        before += pic.size;
        let res;
        if (pic.kind === 'svg' && !+o.max) res = [{ name: stem(pic.name) + '.svg', blob: svgBlob(minifySvg(pic.svg)) }];
        else {
          const max = +o.max;
          const frames = !max ? pic.frames : await mapFrames(pic.frames, (c) => { const k = Math.min(1, max / Math.max(c.width, c.height)); return k < 1 ? resizeCanvas(c, c.width * k, c.height * k) : c; });
          let fmt = keepFormat(pic);
          if (pic.kind === 'svg') fmt = 'png';
          res = await savePicture(pic, frames, fmt, { quality: Q, colors: fmt === 'gif' ? GIFC : COLORS });
        }
        // Never hand back a bigger file than the original.
        if (res.length === 1 && res[0].blob.size >= pic.size && res[0].name.split('.').pop() === pic.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg')) {
          res = [{ name: pic.name, blob: pic.file }]; kept++;
        }
        after += res.reduce((s, r) => s + r.blob.size, 0);
        return res;
      });
      return { outputs, note: sumNote(before, after) + (kept ? ` ${kept} file${kept > 1 ? 's were' : ' was'} already as small as possible and kept as ${kept > 1 ? 'they were' : 'it was'}.` : '') };
    }
  },

  'resize-image': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images', runLabel: 'Resize images',
    options: [
      { key: 'mode', label: 'Resize', type: 'seg', default: 'pixels', options: [['pixels', 'Exact size'], ['percent', 'By percentage']] },
      { key: 'unit', label: 'Unit', type: 'seg', default: 'px', options: [['px', 'Pixels'], ['cm', 'cm'], ['mm', 'mm'], ['in', 'Inches']], showIf: (v) => v.mode === 'pixels' },
      { key: 'w', label: 'Width', type: 'number', default: 1080, min: 0, showIf: (v) => v.mode === 'pixels' },
      { key: 'h', label: 'Height', type: 'number', default: '', min: 0, placeholder: 'auto', showIf: (v) => v.mode === 'pixels', hint: 'Leave one of them empty to keep the proportions. Passport photo: 35 × 45 mm.' },
      { key: 'dpi', label: 'Print resolution (DPI)', type: 'number', default: 300, min: 30, max: 1200, showIf: (v) => v.mode === 'pixels' && v.unit !== 'px', hint: '300 DPI is standard for printed photos; some forms ask for 200.' },
      { key: 'fit', label: 'When the shape is different', type: 'select', default: 'fit', showIf: (v) => v.mode === 'pixels' && +v.w && +v.h,
        options: [['fit', 'Fit inside (keep proportions)'], ['fill', 'Crop to fill the exact size'], ['pad', 'Exact size with a background colour'], ['stretch', 'Stretch to the exact size']] },
      { key: 'padColor', label: 'Background colour', type: 'color', default: '#ffffff', showIf: (v) => v.mode === 'pixels' && v.fit === 'pad' && +v.w && +v.h },
      { key: 'noUp', label: 'Do not enlarge smaller images', type: 'checkbox', default: false, showIf: (v) => v.mode === 'pixels' && (v.fit === 'fit' || !(+v.w && +v.h)) },
      { key: 'limit', label: 'Also keep the file under a size', type: 'checkbox', default: false },
      { key: 'target', label: 'Largest file size', type: 'number', default: 50, min: 1, showIf: (v) => v.limit },
      sizeUnitOpt((v) => v.limit),
      { key: 'pct', label: 'Size', type: 'range', min: 5, max: 300, step: 5, default: 50, unit: '%', showIf: (v) => v.mode === 'percent' },
      formatOpt()
    ],
    async process(files, o, ctx) {
      // Older saved settings used a "keep proportions" checkbox.
      const fit = o.fit || (o.ratio === false ? 'stretch' : 'fit');
      const per = { px: 1, in: +o.dpi || 300, cm: (+o.dpi || 300) / 2.54, mm: (+o.dpi || 300) / 25.4 }[o.unit || 'px'];
      const maxBytes = o.limit ? KB(o.target, o.unitKB) : 0;
      if (o.limit && !(maxBytes > 0)) throw new Error('Enter the largest file size, for example 50 KB.');
      const notes = [];
      const outputs = await eachPicture(files, ctx, async (pic) => {
        const W0 = pic.frames[0].canvas.width, H0 = pic.frames[0].canvas.height;
        let w, h, mode = 'scale';
        if (o.mode === 'percent') { w = W0 * o.pct / 100; h = H0 * o.pct / 100; }
        else {
          const tw = (+o.w || 0) * per, th = (+o.h || 0) * per;
          if (!tw && !th) throw new Error('Enter a width or a height.');
          if (!tw) { h = th; w = W0 * th / H0; }
          else if (!th) { w = tw; h = H0 * tw / W0; }
          else if (fit === 'fit') { const k = Math.min(tw / W0, th / H0); w = W0 * k; h = H0 * k; }
          else { w = tw; h = th; mode = fit; }
          if (o.noUp && mode === 'scale' && (w > W0 || h > H0)) { const k = Math.min(W0 / w, H0 / h); w *= k; h *= k; }
        }
        w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
        if (pic.kind === 'svg' && o.format === 'same' && mode !== 'fill' && mode !== 'pad' && !maxBytes) return [{ name: stem(pic.name) + '.svg', blob: svgBlob(svgResize(pic.svg, w, h)) }];
        if (w * h > 120e6) throw new Error(`${pic.name}: ${w} × ${h} px is too big for a browser. Choose a smaller size.`);
        const frames = await mapFrames(pic.frames, (c) => {
          if (mode === 'fill') {
            // Crop the middle to the target shape, then scale.
            const k = Math.max(w / c.width, h / c.height), cw = w / k, ch = h / k;
            return resizeCanvas(cropCanvas(c, (c.width - cw) / 2, (c.height - ch) / 2, Math.round(cw), Math.round(ch)), w, h);
          }
          if (mode === 'pad') {
            const k = Math.min(w / c.width, h / c.height), r = resizeCanvas(c, c.width * k, c.height * k);
            const t = newCanvas(w, h), g = t.getContext('2d');
            g.fillStyle = o.padColor || '#ffffff'; g.fillRect(0, 0, w, h);
            g.drawImage(r, Math.round((w - r.width) / 2), Math.round((h - r.height) / 2));
            return t;
          }
          return resizeCanvas(c, w, h);
        });
        if (maxBytes) return saveUnder(pic, frames[0].canvas, outFormat(pic, o), maxBytes, notes, { allowShrink: false });
        notes.push(`${pic.name}: ${w} × ${h} px${per !== 1 ? ` (${o.w || '–'} × ${o.h || '–'} ${o.unit} at ${o.dpi} DPI)` : ''}.`);
        return savePicture(pic, frames, outFormat(pic, o), { quality: 0.92 });
      });
      return { outputs, note: notes.slice(0, 12).join('\n') };
    }
  },

  'convert-to-jpg': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images (PNG, GIF, TIFF, PSD, SVG, WEBP, HEIC, RAW…)', runLabel: 'Convert to JPG',
    options: (files) => [
      { key: 'quality', label: 'Quality', type: 'range', min: 40, max: 100, default: 92, unit: '%' },
      { key: 'bg', label: 'Background for transparent areas', type: 'color', default: '#ffffff' },
      ...(files.some((f) => /\.gif$/i.test(f.name) || f.type === 'image/gif') ? [{ key: 'gif', label: 'Animated GIFs', type: 'seg', default: 'first', options: [['first', 'First frame'], ['all', 'Every frame']] }] : []),
      ...(files.some((f) => /\.svg$/i.test(f.name)) ? [{ key: 'svgScale', label: 'SVG size', type: 'seg', default: '2', options: [['1', '1×'], ['2', '2×'], ['4', '4×']] }] : [])
    ],
    async process(files, o, ctx) {
      const { svgToCanvas } = await import('../lib/imgio.js');
      return eachPicture(files, ctx, async (pic) => {
        let frames = pic.frames;
        if (pic.kind === 'gif' && o.gif !== 'all') frames = frames.slice(0, 1);
        if (pic.kind === 'svg' && +o.svgScale > 1) { const c = frames[0].canvas; frames = [{ canvas: await svgToCanvas(pic.svg, c.width * o.svgScale, c.height * o.svgScale) }]; }
        return savePicture({ ...pic, kind: pic.kind === 'tiff' ? 'tiff' : 'gif' }, frames, 'jpg', { quality: o.quality / 100, bg: o.bg });
      });
    }
  },

  'convert-from-jpg': {
    accept: JPG_ACCEPT, multiple: true, label: 'Select JPG images', runLabel: 'Convert',
    options: [
      { key: 'to', label: 'Convert to', type: 'seg', default: 'png', options: [['png', 'PNG'], ['gif', 'GIF'], ['anim', 'Animated GIF'], ['webp', 'WEBP']] },
      { key: 'delay', label: 'Time per picture', type: 'range', min: 1, max: 50, default: 8, unit: ' × 0.1 s', showIf: (v) => v.to === 'anim' },
      { key: 'width', label: 'GIF width', type: 'select', default: '800', options: [['320', '320 px'], ['480', '480 px'], ['800', '800 px'], ['1200', '1200 px'], ['0', 'Same as the first picture']], showIf: (v) => v.to === 'anim' },
      { key: 'fit', label: 'Pictures of other shapes', type: 'seg', default: 'contain', options: [['contain', 'Fit (bars)'], ['cover', 'Fill (crop)']], showIf: (v) => v.to === 'anim' },
      { key: 'bg', label: 'Bar colour', type: 'color', default: '#ffffff', showIf: (v) => v.to === 'anim' && v.fit === 'contain' },
      { key: 'loop', label: 'Repeat forever', type: 'checkbox', default: true, showIf: (v) => v.to === 'anim' }
    ],
    async process(files, o, ctx) {
      if (o.to !== 'anim') return eachPicture(files, ctx, async (pic) => savePicture(pic, pic.frames.slice(0, 1), o.to, { quality: 0.92 }));
      if (files.length < 2) throw new Error('Add two or more pictures to make an animated GIF.');
      const pics = [];
      for (let i = 0; i < files.length; i++) { ctx.progress(0.4 * i / files.length, `Opening ${files[i].name}…`); pics.push(await readPicture(files[i])); }
      const first = pics[0].frames[0].canvas;
      const W = +o.width || first.width, H = Math.round(W * first.height / first.width);
      const frames = pics.map((p) => {
        const src = p.frames[0].canvas, c = newCanvas(W, H), g = c.getContext('2d');
        const k = (o.fit === 'cover' ? Math.max : Math.min)(W / src.width, H / src.height);
        g.fillStyle = o.bg; g.fillRect(0, 0, W, H);
        g.imageSmoothingQuality = 'high';
        g.drawImage(resizeCanvas(src, src.width * k, src.height * k), (W - src.width * k) / 2, (H - src.height * k) / 2);
        return { canvas: c, delay: o.delay * 100 };
      });
      ctx.progress(0.5, 'Making the GIF…');
      const blob = await encodeGif(frames, { loop: o.loop ? 0 : -1, onProgress: (f) => ctx.progress(0.5 + 0.5 * f, 'Making the GIF…') });
      return [{ name: 'animation.gif', blob }];
    }
  },

  'upscale-image': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images', runLabel: 'Upscale',
    notice: 'Enlarged with an AI model that runs on your device (about 1 MB, downloaded once). Large pictures can take a minute.',
    options: [
      { key: 'scale', label: 'Enlarge', type: 'seg', default: '2', options: [['2', '2×'], ['4', '4×']] },
      formatOpt('png')
    ],
    async process(files, o, ctx) {
      const { aiUpscale } = await import('../lib/hd.js');
      const s = +o.scale;
      return eachPicture(files, ctx, async (pic, i) => {
        const src = pic.frames[0].canvas;
        if (src.width * src.height * s * s > 64e6) throw new Error(`${pic.name} (${src.width} × ${src.height} px) would be too big at ${s}×. Try 2×, or make it smaller first with Resize image.`);
        // The model works on colour; transparent pictures keep their transparency by enlarging the alpha separately.
        const alpha = hasAlpha(src);
        let big = await aiUpscale(flatten(src, '#ffffff'), s, (f) => ctx.progress((i + 0.4 + 0.55 * f) / files.length, `Enlarging ${pic.name}… ${Math.round(f * 100)}%`));
        if (alpha) {
          const a = resizeCanvas(src, big.width, big.height), ad = ctx2d(a).getImageData(0, 0, a.width, a.height).data;
          const bg = ctx2d(big), id = bg.getImageData(0, 0, big.width, big.height);
          for (let k = 3; k < ad.length; k += 4) id.data[k] = ad[k];
          bg.putImageData(id, 0, 0);
        }
        return savePicture(pic, [{ canvas: big }], outFormat(pic, o) === 'gif' ? 'png' : outFormat(pic, o), { quality: 0.95 }, `-${s}x`);
      });
    }
  },

  'remove-background': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images', runLabel: 'Remove background',
    options: [
      { key: 'model', label: 'What is in the picture', type: 'seg', default: 'best', options: [['best', 'Anything'], ['people', 'People'], ['simple', 'Plain background']],
        hint: 'Anything: products, animals, people and objects (44 MB AI model, downloaded once; about 15 s per picture). People: faster portrait cut-out (7 MB). Plain background: instant, for logos and pictures on one colour.' },
      { key: 'bg', label: 'New background', type: 'seg', default: 'transparent', options: [['transparent', 'None'], ['color', 'Colour'], ['blur', 'Blurred'], ['image', 'Picture']] },
      { key: 'color', label: 'Colour', type: 'color', default: '#ffffff', showIf: (v) => v.bg === 'color' },
      { key: 'bgFile', label: 'Background picture', type: 'file', accept: 'image/*', stock: true, stockHint: 'beach', showIf: (v) => v.bg === 'image' },
      { key: 'trim', label: 'Trim empty edges', type: 'checkbox', default: false, showIf: (v) => v.bg === 'transparent' },
      { key: 'format', label: 'Save as', type: 'seg', default: 'png', options: [['png', 'PNG'], ['webp', 'WEBP'], ['jpg', 'JPG']], hint: 'JPG cannot be transparent: a white background is used.' }
    ],
    async process(files, o, ctx) {
      if (o.bg === 'image') {
        if (!o.bgFile) throw new Error('Choose the background picture.');
        o.bgImage = (await readPicture(o.bgFile)).frames[0].canvas;
      }
      return eachPicture(files, ctx, async (pic, i) => {
        const src = pic.frames[0].canvas;
        // The models work at about 1024 px, so very large photos are cut out at up to 4096 px.
        const k = Math.min(1, 4096 / Math.max(src.width, src.height));
        const c = k < 1 ? resizeCanvas(src, src.width * k, src.height * k) : src;
        const mask = await cutoutMask(c, o.model, (m) => ctx.progress((i + 0.5) / files.length, `${pic.name}: ${m}`));
        let out = applyMask(c, mask, o);
        if (o.bg === 'transparent' && o.trim) out = trimTransparent(out);
        return savePicture(pic, [{ canvas: out }], o.format, { quality: 0.92 }, '-no-bg');
      });
    }
  },

  'watermark-image': {
    accept: IMG_ACCEPT, multiple: true, label: 'Select images', runLabel: 'Add watermark',
    options: [
      { key: 'kind', label: 'Watermark', type: 'seg', default: 'text', options: [['text', 'Text'], ['image', 'Image / logo']] },
      { key: 'text', label: 'Text', type: 'textarea', default: '© Your name', showIf: (v) => v.kind === 'text' },
      { key: 'gfont', label: 'Font', type: 'gfont', default: 'Montserrat', standardLabel: 'Arial', showIf: (v) => v.kind === 'text' },
      { key: 'bold', label: 'Bold', type: 'checkbox', default: true, showIf: (v) => v.kind === 'text' },
      { key: 'size', label: 'Text size', type: 'range', min: 2, max: 30, default: 7, unit: '% of the picture', showIf: (v) => v.kind === 'text' },
      { key: 'color', label: 'Colour', type: 'color', default: '#ffffff', showIf: (v) => v.kind === 'text' },
      { key: 'image', label: 'Image', type: 'file', accept: 'image/*', showIf: (v) => v.kind === 'image' },
      { key: 'scale', label: 'Image width', type: 'range', min: 5, max: 100, default: 25, unit: '%', showIf: (v) => v.kind === 'image' },
      opacityOpt,
      { key: 'rotation', label: 'Rotation', type: 'select', default: '0', options: [['0', 'None'], ['-30', '30° up'], ['30', '30° down'], ['-45', '45° up'], ['45', '45° down'], ['90', '90°']] },
      { key: 'mosaic', label: 'Repeat over the whole picture (mosaic)', type: 'checkbox', default: false },
      { key: 'position', label: 'Position', type: 'position', default: 'br', showIf: (v) => !v.mosaic },
      formatOpt()
    ],
    async process(files, o, ctx) {
      let mark = null;
      if (o.kind === 'image') {
        if (!o.image) throw new Error('Choose the watermark image.');
        mark = (await readPicture(o.image)).frames[0].canvas;
      } else {
        if (!String(o.text).trim()) throw new Error('Type the watermark text.');
        if (o.gfont) { const { loadFont } = await import('../lib/fonts.js'); await loadFont(o.gfont, { bold: o.bold }); await document.fonts.ready; }
      }
      return eachPicture(files, ctx, async (pic) => {
        const frames = await mapFrames(pic.frames, (c) => drawWatermark(copyOf(c), o, mark));
        return savePicture(pic, frames, outFormat(pic, o), { quality: 0.93 }, '-watermarked');
      });
    }
  },

  'html-to-image': {
    accept: '.html,.htm,text/html', multiple: false, label: 'Select an HTML file', optionalFiles: true, runLabel: 'Convert to image',
    optionalHint: 'Upload an .html file, paste HTML on the right, or enter a web address.',
    options: (files) => [
      ...(files.length ? [] : [
        { key: 'src', label: 'Source', type: 'seg', default: 'paste', options: [['paste', 'Paste HTML'], ['url', 'Web address']] },
        { key: 'html', label: 'HTML', type: 'textarea', default: '<h1 style="color:#14213d">Hello!</h1>\n<p>Paste your HTML here.</p>', showIf: (v) => v.src === 'paste' },
        { key: 'url', label: 'Web address', default: 'https://', showIf: (v) => v.src === 'url', hint: 'Many websites block other apps from loading them. If that happens, save the page from your browser (Ctrl+S) and upload the .html file.' }
      ]),
      { key: 'width', label: 'Screen width', type: 'seg', default: '1280', options: [['1920', 'Wide'], ['1280', 'Desktop'], ['768', 'Tablet'], ['390', 'Phone']] },
      { key: 'full', label: 'Whole page (not just the first screen)', type: 'checkbox', default: true },
      { key: 'scale', label: 'Sharpness', type: 'seg', default: '1', options: [['1', 'Normal'], ['2', 'Retina (2×)']] },
      { key: 'format', label: 'Save as', type: 'seg', default: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG'], ['svg', 'SVG']] }
    ],
    async process(files, o, ctx) {
      let html, name = 'page';
      if (files.length) { html = await files[0].text(); name = stem(files[0].name); }
      else if (o.src === 'url') {
        try {
          const r = await fetch(o.url);
          html = `<base href="${o.url.replace(/"/g, '')}">` + await r.text();
          name = new URL(o.url).hostname;
        } catch { throw new Error('That website does not allow loading from other apps. Save the page as HTML (Ctrl+S or Share → Save) and upload the file instead.'); }
      } else html = o.html;
      if (!html?.trim()) throw new Error('There is no HTML to convert.');
      ctx.progress(0.3, 'Drawing the page…');
      const c = await renderHtml(html, { width: +o.width, full: o.full, scale: +o.scale });
      if (o.format === 'svg') {
        const png = c.toDataURL('image/png');
        const w = c.width / +o.scale, hh = c.height / +o.scale;
        return [{ name: name + '.svg', blob: svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><image width="${w}" height="${hh}" href="${png}" xlink:href="${png}"/></svg>`) }];
      }
      return [{ name: `${name}.${o.format}`, blob: await encode(c, o.format, { quality: 0.92 }) }];
    }
  }
};

function copyOf(c) { const t = newCanvas(c.width, c.height); t.getContext('2d').drawImage(c, 0, 0); return t; }
