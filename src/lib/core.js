// Shared PDF helpers: pdf.js for rendering/reading, pdf-lib for writing.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from '@cantoo/pdf-lib';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjsLib, PDFDocument };

export const readBytes = async (file) => new Uint8Array(await file.arrayBuffer());
export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });
export const stem = (name) => name.replace(/\.[^.]+$/, '');
export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);

export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

// pdf.js transfers (detaches) the buffer it is given, so always pass a copy.
export function openPdfjs(bytes, password) {
  return pdfjsLib.getDocument({ data: bytes.slice(), password, isEvalSupported: false }).promise;
}

export async function loadPdfLib(bytes, opts = {}) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, ...opts });
  } catch (e) {
    if (/encrypt|password/i.test(e.message || '')) {
      const err = new Error('This PDF is password-protected. Open it with the Unlock PDF tool first.');
      err.code = 'ENCRYPTED';
      throw err;
    }
    throw e;
  }
}

export async function renderPage(page, scale = 1, canvas = document.createElement('canvas'), rotation) {
  const viewport = page.getViewport({ scale, rotation: rotation ?? page.rotate });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Render the first page of a PDF into a small thumbnail canvas.
export async function pdfThumb(bytes, maxH = 150) {
  const doc = await openPdfjs(bytes);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const c = await renderPage(page, Math.min(2, (maxH * 1.5) / vp.height));
  const n = doc.numPages;
  doc.destroy();
  return { canvas: c, pages: n };
}

export const canvasToBlob = (canvas, type = 'image/png', q = 0.92) =>
  new Promise((res) => canvas.toBlob(res, type, q));

export async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function zipOutputs(outputs, name = 'pagewise.zip') {
  const zip = new JSZip();
  const used = new Set();
  for (const o of outputs) {
    let n = o.name, i = 1;
    while (used.has(n)) n = o.name.replace(/(\.[^.]+)?$/, `-${i++}$1`);
    used.add(n);
    zip.file(n, o.blob);
  }
  return { name, blob: await zip.generateAsync({ type: 'blob' }) };
}

// "1-3, 5, 8-" -> [[0,1,2],[4],[7..n-1]] (0-based page indexes, one array per range)
export function parseRanges(text, total) {
  const out = [];
  for (const part of String(text).split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let a, b;
    if (m) {
      a = m[1] ? +m[1] : 1;
      b = m[2] ? +m[2] : total;
    } else if (/^\d+$/.test(part)) {
      a = b = +part;
    } else {
      throw new Error(`"${part}" is not a valid page range. Use forms like 1-3, 5, 8-`);
    }
    a = Math.max(1, a); b = Math.min(total, b);
    if (a > b) continue;
    const r = [];
    for (let i = a; i <= b; i++) r.push(i - 1);
    out.push(r);
  }
  if (!out.length) throw new Error('No pages match that range.');
  return out;
}

// Which pages (0-based) an "apply to" option selects.
export function selectPages(mode, rangeText, total) {
  const all = [...Array(total).keys()];
  if (mode === 'odd') return all.filter((i) => i % 2 === 0);
  if (mode === 'even') return all.filter((i) => i % 2 === 1);
  if (mode === 'range') return [...new Set(parseRanges(rangeText, total).flat())];
  return all;
}

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read that image.'));
    img.src = src;
  });
}

// Any browser-readable image -> {bytes, kind:'jpg'|'png', width, height}
export async function imageFileToEmbeddable(fileOrBlob, preferJpeg = false) {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = await loadImage(url);
    const t = fileOrBlob.type || (/\.jpe?g$/i.test(fileOrBlob.name || '') ? 'image/jpeg' : '');
    // Phone photos are often stored sideways with an EXIF rotation flag; redraw those through a canvas.
    const rotated = t === 'image/jpeg' && jpegOrientation(await blobToBytes(fileOrBlob)) > 1;
    if (t === 'image/jpeg' && !preferJpeg && !rotated) return { bytes: await blobToBytes(fileOrBlob), kind: 'jpg', width: img.naturalWidth, height: img.naturalHeight };
    if (t === 'image/png' && !preferJpeg) return { bytes: await blobToBytes(fileOrBlob), kind: 'png', width: img.naturalWidth, height: img.naturalHeight };
    if (rotated) preferJpeg = true;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (preferJpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0);
    const kind = preferJpeg ? 'jpg' : 'png';
    const blob = await canvasToBlob(c, preferJpeg ? 'image/jpeg' : 'image/png', 0.9);
    return { bytes: await blobToBytes(blob), kind, width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// EXIF orientation tag (1 = upright) from JPEG bytes.
export function jpegOrientation(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xff) return 1;
    const marker = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
    if (marker === 0xe1 && String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]) === 'Exif') {
      const t = p + 10, le = b[t] === 0x49;
      const u16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
      const u32 = (o) => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === 0x0112) return u16(e + 8);
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    p += 2 + len;
  }
  return 1;
}

export async function embedImage(doc, img) {
  return img.kind === 'jpg' ? doc.embedJpg(img.bytes) : doc.embedPng(img.bytes);
}

// Group pdf.js text items into visual lines (top-to-bottom), each with items sorted left-to-right.
export function textLines(items, viewportHeight) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    const x = it.transform[4];
    const y = viewportHeight - it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < size * 0.5);
    if (!row) { row = { y, size, items: [] }; rows.push(row); }
    row.size = Math.max(row.size, size);
    row.items.push({ x, w: it.width, str: it.str, size, font: it.fontName });
  }
  rows.sort((a, b) => a.y - b.y);
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let text = '', lastEnd = null;
    for (const it of r.items) {
      if (lastEnd != null && it.x - lastEnd > it.size * 0.25 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
      lastEnd = it.x + it.w;
    }
    r.text = text.replace(/\s+/g, ' ').trim();
    r.x = r.items[0].x;
    // Cells split at wide gaps: a line with several cells is probably a table row.
    r.cells = [];
    let cell = null;
    for (const it of r.items) {
      if (cell && it.x - cell.end < it.size * 0.65) { cell.str += (it.x - cell.end > it.size * 0.2 ? ' ' : '') + it.str; cell.end = it.x + it.w; }
      else { cell = { str: it.str, end: it.x + it.w }; r.cells.push(cell); }
    }
    r.cells = r.cells.map((c) => c.str.trim()).filter(Boolean);
    if (r.cells.length < 2) {
      // Single-font lines may arrive as one item with runs of spaces between columns.
      const parts = r.items.length === 1 ? r.items[0].str.split(/\s{3,}/).map((s) => s.trim()).filter(Boolean) : [];
      r.cells = parts.length >= 2 ? parts : [];
    }
  }
  return rows;
}

export async function extractPageText(doc, i) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  return { page, vp, items: tc.items, lines: textLines(tc.items, vp.height) };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
