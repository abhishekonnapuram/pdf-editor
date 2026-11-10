// Recreate a picture at a higher resolution, on the device:
//  - "AI" mode: a small super-resolution network (ESRGAN, run with TensorFlow.js) enlarges every pixel.
//  - "Recreate" mode: the picture is split into layers first; text, the background colour and solid shapes
//    are redrawn perfectly sharp at the new size, and only photos and graphics go through the AI.
import { analyseLayers, paintShape, paintPicture } from './layers.js';
import { drawLine } from './rebuild.js';

const MODEL_SCALES = [2, 4];
let tfReady = null;
const upscalers = new Map();

async function getUpscaler(scale) {
  if (!upscalers.has(scale)) {
    upscalers.set(scale, (async () => {
      tfReady ||= (async () => { const tf = await import('@tensorflow/tfjs'); await tf.ready(); return tf; })();
      const tf = await tfReady;
      const Upscaler = (await import('upscaler')).default;
      const def = (await (scale === 4 ? import('@upscalerjs/esrgan-slim/4x') : import('@upscalerjs/esrgan-slim/2x'))).default;
      // The model files are served by this site (public/models), so it also works offline once cached.
      const path = new URL(`./models/esrgan-slim/x${scale}/model.json`, location.href).href;
      const up = new Upscaler({ model: { ...def, path } });
      await up.getModel();
      return { tf, up };
    })());
  }
  return upscalers.get(scale);
}

/**
 * Enlarge a canvas `scale` times (2 or 4; 3 = 4 then shrink) with the AI model, tile by tile so large
 * pictures fit in memory. onProgress(fraction).
 */
export async function aiUpscale(canvas, scale, onProgress, regions = null) {
  const ms = scale <= 2 ? 2 : 4;
  const { tf, up } = await getUpscaler(ms);
  const W = canvas.width, H = canvas.height;
  const out = document.createElement('canvas');
  out.width = W * ms; out.height = H * ms;
  const og = out.getContext('2d');
  const TILE = 192, PAD = 8;
  const tiles = [];
  // With `regions` (boxes that need detail), other tiles are only resized: they get redrawn sharply anyway.
  const needed = (x, y) => !regions || regions.some((b) => b.x0 < x + TILE && b.x1 > x && b.y0 < y + TILE && b.y1 > y);
  if (regions) { og.imageSmoothingQuality = 'high'; og.drawImage(canvas, 0, 0, out.width, out.height); }
  for (let y = 0; y < H; y += TILE) for (let x = 0; x < W; x += TILE) if (needed(x, y)) tiles.push([x, y]);
  const src = canvas.getContext('2d', { willReadFrequently: true });
  let done = 0;
  for (const [x, y] of tiles) {
    const x0 = Math.max(0, x - PAD), y0 = Math.max(0, y - PAD);
    const x1 = Math.min(W, x + TILE + PAD), y1 = Math.min(H, y + TILE + PAD);
    const img = src.getImageData(x0, y0, x1 - x0, y1 - y0);
    const input = tf.tidy(() => tf.browser.fromPixels(img));
    const res = await up.upscale(input, { output: 'tensor', patchSize: 64, padding: 4 });
    const px = tf.tidy(() => res.clipByValue(0, 255).cast('int32').squeeze());
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = (x1 - x0) * ms; tileCanvas.height = (y1 - y0) * ms;
    await tf.browser.toPixels(px, tileCanvas);
    input.dispose(); res.dispose(); px.dispose();
    // Keep only the middle of each tile (the padding was there so tile edges don't show).
    const cx = x - x0, cy = y - y0, cw = Math.min(TILE, W - x), ch = Math.min(TILE, H - y);
    og.drawImage(tileCanvas, cx * ms, cy * ms, cw * ms, ch * ms, x * ms, y * ms, cw * ms, ch * ms);
    onProgress?.(++done / tiles.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (ms === scale) return out;
  const fin = document.createElement('canvas');
  fin.width = Math.round(W * scale); fin.height = Math.round(H * scale);
  const fg = fin.getContext('2d');
  fg.imageSmoothingQuality = 'high';
  fg.drawImage(out, 0, 0, fin.width, fin.height);
  return fin;
}

/** Smooth (non-AI) enlargement, used for masks. */
function enlarge(canvas, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, w, h);
  return c;
}

/**
 * Recreate a picture `scale` times larger. mode 'recreate' rebuilds text, background and shapes sharply
 * and uses AI for photos/graphics; mode 'ai' enlarges everything with AI.
 */
export async function recreateHD(canvas, scale, { mode = 'recreate', langs = 'eng', onStatus, onProgress } = {}) {
  if (mode === 'ai') { onStatus?.('enlarging with AI'); return { canvas: await aiUpscale(canvas, scale, onProgress) }; }
  const L = await analyseLayers(canvas, { langs, onStatus });
  const W = canvas.width, H = canvas.height, S = scale;
  // The picture without its text, enlarged with AI: photos and graphics are taken from it.
  const clean = document.createElement('canvas');
  clean.width = W; clean.height = H;
  const cg = clean.getContext('2d');
  if (L.bg.canvas) cg.drawImage(L.bg.canvas, 0, 0); else { cg.fillStyle = L.bg.color; cg.fillRect(0, 0, W, H); }
  for (const s of L.shapes) paintShape(cg, s, 1);
  for (const gfx of L.graphics) cg.drawImage(gfx.canvas, gfx.x0, gfx.y0);
  for (const p of L.pictures) paintPicture(cg, p, p.canvas, 1);
  const needAi = !!L.bg.canvas || L.graphics.length || L.pictures.length;
  let base = null;
  if (needAi) {
    onStatus?.('enlarging photos and graphics with AI');
    base = await aiUpscale(clean, S, onProgress, L.bg.canvas ? null : [...L.graphics, ...L.pictures]);
  }

  onStatus?.('redrawing sharp text and shapes');
  const out = document.createElement('canvas');
  out.width = Math.round(W * S); out.height = Math.round(H * S);
  const g = out.getContext('2d');
  if (L.bg.canvas) g.drawImage(base, 0, 0, out.width, out.height);
  else { g.fillStyle = L.bg.color; g.fillRect(0, 0, out.width, out.height); }
  for (const s of L.shapes) paintShape(g, s, S);
  // Graphics: the AI-enlarged pixels, cut out with a smoothly enlarged version of their own outline.
  for (const gfx of L.graphics) {
    const w = Math.round((gfx.x1 - gfx.x0) * S), h = Math.round((gfx.y1 - gfx.y0) * S);
    const piece = document.createElement('canvas');
    piece.width = w; piece.height = h;
    const pg = piece.getContext('2d');
    pg.drawImage(base, gfx.x0 * S, gfx.y0 * S, w, h, 0, 0, w, h);
    pg.globalCompositeOperation = 'destination-in';
    pg.drawImage(enlarge(gfx.canvas, w, h), 0, 0);
    g.drawImage(piece, gfx.x0 * S, gfx.y0 * S);
  }
  for (const p of L.pictures) {
    const w = Math.round((p.x1 - p.x0) * S), h = Math.round((p.y1 - p.y0) * S);
    const piece = document.createElement('canvas');
    piece.width = w; piece.height = h;
    piece.getContext('2d').drawImage(base, p.x0 * S, p.y0 * S, w, h, 0, 0, w, h);
    paintPicture(g, p, piece, S);
  }
  for (const l of L.lines) drawLine(g, l, S);
  return { canvas: out, layers: L };
}

export { MODEL_SCALES };
