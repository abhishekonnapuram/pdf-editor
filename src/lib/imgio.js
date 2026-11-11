// Reading and writing pictures for the image tools, on the device.
// Reads JPG, PNG, WEBP, AVIF, BMP, ICO, GIF (every frame), SVG, TIFF (every page), PSD, HEIC/HEIF and camera RAW
// (the full-size preview every RAW file carries). Writes JPG, PNG (lossless or reduced colours), WEBP, GIF
// (animated) and SVG.
import { stem, loadImage } from './core.js';

export const RAW_EXT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'erf', 'kdc', 'mrw', 'raw', 'rwl', 'iiq', 'mos'];
export const IMG_ACCEPT = 'image/*,.jpg,.jpeg,.jfif,.png,.webp,.avif,.gif,.bmp,.ico,.svg,.tif,.tiff,.heic,.heif,.psd,' + RAW_EXT.map((e) => '.' + e).join(',');
export const JPG_ACCEPT = 'image/jpeg,.jpg,.jpeg,.jfif,image/*';

export const extOf = (n) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
const tick = () => new Promise((r) => setTimeout(r, 0));

export function kindOf(file) {
  const e = extOf(file.name), t = file.type || '';
  if (e === 'gif' || t === 'image/gif') return 'gif';
  if (e === 'svg' || t === 'image/svg+xml') return 'svg';
  if (e === 'tif' || e === 'tiff' || t === 'image/tiff') return 'tiff';
  if (e === 'psd' || /photoshop/.test(t)) return 'psd';
  if (e === 'heic' || e === 'heif' || /heic|heif/.test(t)) return 'heic';
  if (RAW_EXT.includes(e)) return 'raw';
  if (e === 'png' || t === 'image/png') return 'png';
  if (e === 'webp' || t === 'image/webp') return 'webp';
  if (/^(jpe?g|jfif)$/.test(e) || t === 'image/jpeg') return 'jpg';
  return 'other';
}

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
export function copyCanvas(src) { const c = newCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }

async function blobCanvas(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => null);
  if (bmp) { const c = newCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close(); return c; }
  const url = URL.createObjectURL(blob);
  try { const im = await loadImage(url); const c = newCanvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); return c; }
  finally { URL.revokeObjectURL(url); }
}

// ---------- SVG ----------
const UNIT = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, em: 16, ex: 8 };
function svgLen(v) {
  const m = String(v || '').trim().match(/^([\d.]+)\s*(px|pt|pc|in|cm|mm|em|ex)?$/);
  return m ? +m[1] * UNIT[m[2] || 'px'] : 0;
}
export function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('This SVG file could not be read.');
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let w = svgLen(root.getAttribute('width')), h = svgLen(root.getAttribute('height'));
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  if (!w && !h && hasVb) { w = vb[2]; h = vb[3]; }
  else if (!w && h && hasVb) w = h * vb[2] / vb[3];
  else if (w && !h && hasVb) h = w * vb[3] / vb[2];
  if (!w || !h) { w = 1024; h = 1024; }
  return { doc, root, w, h, vb: hasVb ? vb : [0, 0, w, h] };
}
export const svgString = (doc) => new XMLSerializer().serializeToString(doc);

export async function svgToCanvas(text, w, h) {
  const s = parseSvg(text);
  w = Math.round(w || s.w); h = Math.round(h || s.h);
  s.root.setAttribute('width', w); s.root.setAttribute('height', h);
  if (!s.root.getAttribute('viewBox')) s.root.setAttribute('viewBox', s.vb.join(' '));
  const url = URL.createObjectURL(new Blob([svgString(s.doc)], { type: 'image/svg+xml' }));
  try {
    const im = await loadImage(url);
    const c = newCanvas(w, h);
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/** Shrink an SVG's code: comments, editor metadata, empty groups, extra spaces and long decimals. */
export function minifySvg(text) {
  const s = parseSvg(text);
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 8) { c.remove(); continue; }
      if (c.nodeType === 3) { if (!c.textContent.trim() && !/^(text|tspan|style)$/i.test(n.nodeName)) c.remove(); continue; }
      if (c.nodeType !== 1) continue;
      const nm = c.nodeName.toLowerCase();
      if (/^(metadata|sodipodi:namedview|inkscape:.*|title|desc)$/.test(nm)) { c.remove(); continue; }
      for (const a of [...c.attributes]) {
        if (/^(inkscape|sodipodi|sketch|serif|xmlns:(inkscape|sodipodi|sketch|serif|dc|cc|rdf))[:]?/.test(a.name) || a.name === 'data-name') c.removeAttribute(a.name);
        else if (/^(d|points|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|viewBox)$/.test(a.name)) c.setAttribute(a.name, a.value.replace(/(\d*\.\d{3})\d+/g, '$1').replace(/\s+/g, ' ').trim());
      }
      walk(c);
      if (nm === 'g' && !c.childNodes.length && !c.attributes.length) c.remove();
    }
  };
  for (const a of [...s.root.attributes]) if (/^xmlns:(inkscape|sodipodi|sketch|serif|dc|cc|rdf)$/.test(a.name)) s.root.removeAttribute(a.name);
  walk(s.root);
  return svgString(s.doc).replace(/>\s+</g, '><');
}

// ---------- RAW: the full-size JPEG preview inside the file ----------
function jpegSize(b, p) {
  // Walks the JPEG markers from the SOI at p to the first frame header.
  let i = p + 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xda || len < 2) return null;
    i += 2 + len;
  }
  return null;
}
async function rawPreview(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  let best = null;
  for (let i = 0; i < b.length - 4; i++) {
    if (b[i] !== 0xff || b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue;
    const s = jpegSize(b, i);
    if (s && s.w > 64 && (!best || s.w * s.h > best.w * best.h)) best = { ...s, at: i };
  }
  if (!best) throw new Error(`${file.name}: no preview picture was found inside this RAW file.`);
  return blobCanvas(new Blob([b.subarray(best.at)], { type: 'image/jpeg' }));
}

// ---------- GIF ----------
async function gifFrames(file) {
  const gm = await import('gifuct-js');
  const { parseGIF, decompressFrames } = gm.parseGIF ? gm : gm.default;
  const gif = parseGIF(await file.arrayBuffer());
  const list = decompressFrames(gif, true);
  const W = gif.lsd.width, H = gif.lsd.height;
  const full = newCanvas(W, H), g = ctx2d(full);
  const frames = [];
  for (const f of list.slice(0, 800)) {
    const { width, height, top, left } = f.dims;
    const before = f.disposalType === 3 ? g.getImageData(0, 0, W, H) : null;
    const p = newCanvas(width, height);
    p.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0);
    g.drawImage(p, left, top);
    frames.push({ canvas: copyCanvas(full), delay: f.delay || 100 });
    if (f.disposalType === 2) g.clearRect(left, top, width, height);
    else if (before) g.putImageData(before, 0, 0);
  }
  return frames;
}

/**
 * Read a picture. Returns { name, kind, size, frames: [{canvas, delay}], svg? } where frames holds every
 * GIF frame or TIFF page (one entry for other files).
 */
export async function readPicture(file) {
  const kind = kindOf(file);
  const base = { name: file.name, kind, size: file.size, file };
  try {
    if (kind === 'gif') return { ...base, frames: await gifFrames(file) };
    if (kind === 'svg') { const svg = await file.text(); return { ...base, svg, frames: [{ canvas: await svgToCanvas(svg) }] }; }
    if (kind === 'tiff') {
      const um = await import('utif'); const UTIF = um.default || um;
      const buf = await file.arrayBuffer();
      const ifds = UTIF.decode(buf).filter((d) => !(d.t254 && d.t254[0] & 1));
      const frames = [];
      for (const d of ifds) {
        UTIF.decodeImage(buf, d);
        if (!d.width || !d.height) continue;
        const c = newCanvas(d.width, d.height);
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(d).buffer), d.width, d.height), 0, 0);
        frames.push({ canvas: c });
      }
      if (!frames.length) throw new Error('no pages');
      return { ...base, frames };
    }
    if (kind === 'psd') {
      const am = await import('ag-psd');
      const readPsd = am.readPsd || am.default.readPsd;
      const psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true });
      if (!psd.canvas) throw new Error('This PSD was saved without a combined picture ("Maximize compatibility" off in Photoshop).');
      return { ...base, frames: [{ canvas: copyCanvas(psd.canvas) }] };
    }
    if (kind === 'raw') {
      const c = await blobCanvas(file).catch(() => null);
      return { ...base, frames: [{ canvas: c || await rawPreview(file) }] };
    }
    if (kind === 'heic') {
      let c = await blobCanvas(file).catch(() => null); // Safari reads HEIC itself
      if (!c) {
        const heic2any = (await import('heic2any')).default;
        let out = await heic2any({ blob: file, toType: 'image/png' });
        if (Array.isArray(out)) out = out[0];
        c = await blobCanvas(out);
      }
      return { ...base, frames: [{ canvas: c }] };
    }
    return { ...base, frames: [{ canvas: await blobCanvas(file) }] };
  } catch (e) {
    console.error(e);
    throw new Error(`${file.name} could not be opened${e.message && !/^(no pages|The source image)/.test(e.message) ? ': ' + e.message : '.'}`);
  }
}

// ---------- writing ----------
export const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

export function flatten(canvas, bg = '#ffffff') {
  const c = newCanvas(canvas.width, canvas.height), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(canvas, 0, 0);
  return c;
}
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error('The picture is too big for this browser to save. Make it smaller first.')), type, q));

export function hasAlpha(canvas) {
  const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true;
  return false;
}

/** Save one canvas. fmt jpg|png|webp|gif. opts: quality (0–1), bg (for JPG), colors (PNG/GIF palette size; 0 = lossless PNG). */
export async function encode(canvas, fmt, { quality = 0.92, bg = '#ffffff', colors = 0 } = {}) {
  if (fmt === 'jpg') return toBlob(flatten(canvas, bg), 'image/jpeg', quality);
  if (fmt === 'webp') {
    const b = await toBlob(canvas, 'image/webp', quality);
    if (b.type !== 'image/webp') throw new Error('This browser cannot save WEBP pictures. Choose JPG or PNG.');
    return b;
  }
  if (fmt === 'gif') return encodeGif([{ canvas }], { colors: colors || 256 });
  if (fmt === 'png' && colors) {
    const pm = await import('upng-js'); const UPNG = pm.default || pm;
    const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    return new Blob([UPNG.encode([d.buffer.slice(0)], canvas.width, canvas.height, colors)], { type: 'image/png' });
  }
  return toBlob(canvas, 'image/png');
}

/** Animated (or still) GIF from frames [{canvas, delay(ms)}]; all frames must be the same size. */
export async function encodeGif(frames, { colors = 256, loop = 0, onProgress } = {}) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const enc = GIFEncoder();
  const W = frames[0].canvas.width, H = frames[0].canvas.height;
  for (let i = 0; i < frames.length; i++) {
    let c = frames[i].canvas;
    if (c.width !== W || c.height !== H) { const t = newCanvas(W, H); t.getContext('2d').drawImage(c, 0, 0, W, H); c = t; }
    const data = ctx2d(c).getImageData(0, 0, W, H).data;
    const alpha = hasAlpha(c);
    const format = alpha ? 'rgba4444' : 'rgb565';
    const palette = quantize(data, Math.max(2, Math.min(256, colors)), { format, oneBitAlpha: alpha });
    const index = applyPalette(data, palette, format);
    const ti = alpha ? palette.findIndex((p) => p[3] === 0) : -1;
    enc.writeFrame(index, W, H, { palette, delay: frames[i].delay ?? 100, repeat: loop, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: alpha ? 2 : -1 });
    onProgress?.((i + 1) / frames.length);
    if (i % 3 === 2) await tick();
  }
  enc.finish();
  return new Blob([enc.bytes()], { type: 'image/gif' });
}

/** The format a tool keeps when it doesn't convert: GIF stays GIF, SVG stays SVG, others become JPG/PNG. */
export function keepFormat(pic) {
  if (['jpg', 'png', 'webp', 'gif'].includes(pic.kind)) return pic.kind;
  if (pic.kind === 'svg') return 'png';
  if (pic.kind === 'heic' || pic.kind === 'raw') return 'jpg';
  return hasAlpha(pic.frames[0].canvas) ? 'png' : (pic.kind === 'tiff' || pic.kind === 'psd' ? 'png' : 'jpg');
}

/**
 * Save a picture after a change: frames → one file (animated GIF kept animated; TIFF pages become one file each).
 * Returns [{name, blob}].
 */
export async function savePicture(pic, frames, fmt, opts = {}, suffix = '') {
  const s = stem(pic.name) + suffix;
  if (fmt === 'gif') return [{ name: `${s}.gif`, blob: frames.length > 1 ? await encodeGif(frames, opts) : await encode(frames[0].canvas, 'gif', opts) }];
  if (frames.length === 1) return [{ name: `${s}.${fmt}`, blob: await encode(frames[0].canvas, fmt, opts) }];
  const out = [];
  for (let i = 0; i < frames.length; i++) out.push({ name: `${s}-${pic.kind === 'tiff' ? 'page' : 'frame'}-${String(i + 1).padStart(3, '0')}.${fmt}`, blob: await encode(frames[i].canvas, fmt, opts) });
  return out;
}

export const mapFrames = async (frames, fn) => {
  const out = [];
  for (let i = 0; i < frames.length; i++) { out.push({ ...frames[i], canvas: await fn(frames[i].canvas, i) }); if (i % 5 === 4) await tick(); }
  return out;
};

/**
 * Save one picture so the file is at most `maxBytes` (for forms that say "under 50 KB").
 * JPG/WEBP: finds the best quality that fits; PNG/GIF: fewer colours. If even that is too big,
 * the picture is made smaller step by step (only when allowShrink is true).
 * Returns { blob, quality, width, height, fits }.
 */
export async function fitToSize(canvas, fmt, maxBytes, { bg = '#ffffff', allowShrink = true } = {}) {
  let c = canvas, best = null;
  for (let round = 0; round < 12; round++) {
    let fit = null, smallest = null;
    if (fmt === 'jpg' || fmt === 'webp') {
      const top = await encode(c, fmt, { quality: 0.95, bg });
      if (top.size <= maxBytes) fit = { blob: top, quality: 0.95 };
      else {
        let lo = 0.05, hi = 0.95;
        for (let i = 0; i < 8; i++) {
          const q = (lo + hi) / 2, b = await encode(c, fmt, { quality: q, bg });
          if (b.size <= maxBytes) { fit = { blob: b, quality: q }; lo = q; } else hi = q;
          if (!smallest || b.size < smallest.blob.size) smallest = { blob: b, quality: q };
        }
        // Below ~30% quality photos get blocky; prefer a slightly smaller picture instead.
        if (fit && fit.quality < 0.3 && allowShrink && round < 11) { smallest = fit; fit = null; }
      }
    } else {
      for (const colors of fmt === 'gif' ? [256, 128, 64, 32, 16] : [0, 256, 128, 64, 32, 16]) {
        const b = await encode(c, fmt, { colors, bg });
        if (!smallest || b.size < smallest.blob.size) smallest = { blob: b, quality: colors };
        if (b.size <= maxBytes) { fit = { blob: b, quality: colors }; break; }
      }
    }
    if (fit) return { ...fit, width: c.width, height: c.height, fits: true };
    if (!best || smallest.blob.size < best.blob.size) best = { ...smallest, width: c.width, height: c.height };
    if (!allowShrink || c.width < 16 || c.height < 16) break;
    const k = Math.max(0.5, Math.min(0.92, Math.sqrt(maxBytes / smallest.blob.size) * 0.97));
    c = resizeCanvas(canvas, c.width * k, c.height * k);
  }
  return { ...best, fits: false };
}

/** High-quality resize (steps down by halves for big reductions, so photos stay sharp without jagged edges). */
export function resizeCanvas(src, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const t = newCanvas(cur.width / 2, cur.height / 2), g = t.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, t.width, t.height);
    cur = t;
  }
  const c = newCanvas(w, h), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, w, h);
  return c;
}

export function rotateCanvas(src, angle, flip = 'none') {
  const q = ((angle % 360) + 360) % 360;
  const side = q === 90 || q === 270;
  const c = newCanvas(side ? src.height : src.width, side ? src.width : src.height), g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  if (flip === 'h') g.scale(-1, 1);
  if (flip === 'v') g.scale(1, -1);
  g.rotate(q * Math.PI / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function cropCanvas(src, x, y, w, h) {
  const c = newCanvas(w, h);
  c.getContext('2d').drawImage(src, Math.round(x), Math.round(y), c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// ---------- SVG kept as SVG ----------
const wrapChildren = (s, transform) => {
  const g = s.doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', transform);
  for (const n of [...s.root.childNodes]) if (!(n.nodeType === 1 && /^(defs|style)$/i.test(n.nodeName))) g.append(n);
  s.root.append(g);
};
export function svgResize(text, w, h) {
  const s = parseSvg(text);
  if (!s.root.getAttribute('viewBox')) s.root.setAttribute('viewBox', s.vb.join(' '));
  if (Math.abs(w / h - s.w / s.h) > 0.01) s.root.setAttribute('preserveAspectRatio', 'none');
  s.root.setAttribute('width', Math.round(w)); s.root.setAttribute('height', Math.round(h));
  return svgString(s.doc);
}
export function svgCrop(text, x, y, w, h) {
  const s = parseSvg(text);
  const kx = s.vb[2] / s.w, ky = s.vb[3] / s.h;
  s.root.setAttribute('viewBox', [s.vb[0] + x * kx, s.vb[1] + y * ky, w * kx, h * ky].map((v) => +v.toFixed(3)).join(' '));
  s.root.setAttribute('width', Math.round(w)); s.root.setAttribute('height', Math.round(h));
  return svgString(s.doc);
}
export function svgRotate(text, angle, flip = 'none') {
  const s = parseSvg(text);
  const [vx, vy, vw, vh] = s.vb;
  const q = ((angle % 360) + 360) % 360, side = q === 90 || q === 270;
  const NW = side ? vh : vw, NH = side ? vw : vh;
  const t = { 0: '', 90: `translate(${vh} 0) rotate(90)`, 180: `translate(${vw} ${vh}) rotate(180)`, 270: `translate(0 ${vw}) rotate(270)` }[q] || '';
  const f = flip === 'h' ? `translate(${NW} 0) scale(-1 1) ` : flip === 'v' ? `translate(0 ${NH}) scale(1 -1) ` : '';
  wrapChildren(s, `${f}${t} translate(${-vx} ${-vy})`.trim());
  s.root.setAttribute('viewBox', `0 0 ${NW} ${NH}`);
  s.root.setAttribute('width', Math.round(side ? s.h : s.w)); s.root.setAttribute('height', Math.round(side ? s.w : s.h));
  return svgString(s.doc);
}
export const svgBlob = (text) => new Blob([text], { type: 'image/svg+xml' });
