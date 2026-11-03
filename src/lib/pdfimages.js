// Locate the images drawn on a pdf.js page (with their on-page boxes) and turn them into canvases.
import { pdfjsLib } from './core.js';

const { OPS } = pdfjsLib;
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Returns [{id, name, box:{x,y,w,h} in viewport units, getCanvas()}]
export async function pageImages(page, viewport) {
  const ops = await page.getOperatorList();
  const found = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let seq = 0, formDepth = 0; // seq: draw order of every image on the page, including tiny ones
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      formDepth++;
      if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) ctm = mul(ctm, Array.from(args[0]));
    } else if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; formDepth--; }
    else if (fn === OPS.paintImageMaskXObjectGroup) seq += args[0]?.length || 1; // tiny merged images: count, don't list
    else if (fn === OPS.paintInlineImageXObjectGroup) seq += args[1]?.length || 1;
    else if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintImageMaskXObjectRepeat) seq += (args[args.length - 1]?.length || 2) / 2;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => viewport.convertToViewportPoint(...apply(ctm, x, y)));
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      const order = seq++;
      if (box.w < 4 || box.h < 4) continue;
      const name = typeof args[0] === 'string' ? args[0] : null;
      const inline = fn === OPS.paintInlineImageXObject ? args[0] : null;
      found.push({
        id: `${page.pageNumber}-${found.length}`,
        name, box, seq: order, inForm: formDepth > 0, inline: fn === OPS.paintInlineImageXObject,
        getCanvas: async () => {
          if (inline) return imgDataToCanvas(inline);
          if (!name) return null;
          const objs = name.startsWith('g_') ? page.commonObjs : page.objs;
          const img = await new Promise((res) => { try { objs.get(name, res); } catch { res(null); } });
          return img ? imgDataToCanvas(img) : null;
        }
      });
    }
  }
  found.total = seq;
  return found;
}

export function imgDataToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return c; }
  if (!img.data) return null;
  const n = img.width * img.height;
  const id = ctx.createImageData(img.width, img.height);
  const d = img.data, o = id.data;
  if (img.kind === 3 || d.length >= n * 4) {
    o.set(d.subarray(0, n * 4));
  } else if (img.kind === 2 || d.length >= n * 3) {
    for (let i = 0; i < n; i++) { o[i * 4] = d[i * 3]; o[i * 4 + 1] = d[i * 3 + 1]; o[i * 4 + 2] = d[i * 3 + 2]; o[i * 4 + 3] = 255; }
  } else {
    // 1 bit per pixel, rows padded to whole bytes; a set bit is white.
    const rb = Math.ceil(img.width / 8);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const v = (d[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
      const k = (y * img.width + x) * 4;
      o[k] = o[k + 1] = o[k + 2] = v; o[k + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
