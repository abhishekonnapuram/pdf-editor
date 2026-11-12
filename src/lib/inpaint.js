// Fill in the parts of a picture that were cut away (behind objects moved to their own layers).
// MI-GAN (MIT licence, about 28 MB, downloaded once) does the filling on the device; if it can't run,
// a quick smooth fill from the surrounding pixels is used instead.
import * as ort from 'onnxruntime-web';

const MIGAN = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
let session = null;

async function fetchWithProgress(url, onStatus) {
  const cache = typeof caches !== 'undefined' ? await caches.open('es-models').catch(() => null) : null;
  const hit = cache && await cache.match(url).catch(() => null);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(url);
  if (!res.ok) throw new Error('could not download the fill model');
  const total = +res.headers.get('content-length') || 28e6;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onStatus?.(`downloading the fill-in AI model ${Math.round(got / total * 100)}% (28 MB, once)`);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  cache?.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
  return buf;
}

function getSession(onStatus) {
  session ||= (async () => {
    const v = ort.env.versions?.web;
    if (v) ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${v}/dist/`;
    const bytes = await fetchWithProgress(MIGAN, onStatus);
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  })();
  session.catch(() => { session = null; });
  return session;
}

/**
 * Fill the masked area of `canvas` in place. `mask`: Uint8Array W×H, 1 = fill this pixel.
 * Works on the bounding area of the mask (with a margin), so big pictures stay quick.
 */
export async function inpaint(canvas, mask, { onStatus, ai = true } = {}) {
  const W = canvas.width, H = canvas.height;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return canvas;
  // Smooth fill first: it is the result if the AI can't run, and gives the AI a fair start.
  smoothFill(canvas, mask);
  if (!ai) return canvas;
  try {
    const s = await getSession(onStatus);
    onStatus?.('filling in behind the objects');
    // The model sees the area around the hole at up to 512 px; the result is scaled back and only the hole is replaced.
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
    const m = Math.round(Math.max(mw, mh) * 0.5) + 16;
    const bx0 = Math.max(0, x0 - m), by0 = Math.max(0, y0 - m), bx1 = Math.min(W, x1 + 1 + m), by1 = Math.min(H, y1 + 1 + m);
    const bw = bx1 - bx0, bh = by1 - by0;
    const k = Math.min(1, 512 / Math.max(bw, bh));
    const tw = Math.max(8, Math.round(bw * k)), th = Math.max(8, Math.round(bh * k));
    const src = document.createElement('canvas');
    src.width = tw; src.height = th;
    const sg = src.getContext('2d', { willReadFrequently: true });
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(canvas, bx0, by0, bw, bh, 0, 0, tw, th);
    const px = sg.getImageData(0, 0, tw, th).data;
    // The hole at the model's size (any pixel touching the hole counts, so edges are covered).
    const hole = new Uint8Array(tw * th);
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (mask[y * W + x]) {
      const tx = Math.min(tw - 1, ((x - bx0) * k) | 0), ty = Math.min(th - 1, ((y - by0) * k) | 0);
      hole[ty * tw + tx] = 1;
    }
    const img = new Uint8Array(3 * tw * th), msk = new Uint8Array(tw * th);
    for (let i = 0; i < tw * th; i++) {
      img[i] = px[i * 4]; img[tw * th + i] = px[i * 4 + 1]; img[2 * tw * th + i] = px[i * 4 + 2];
      msk[i] = hole[i] ? 0 : 255; // 255 = keep, 0 = fill
    }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('uint8', img, [1, 3, th, tw]), [s.inputNames[1]]: new ort.Tensor('uint8', msk, [1, 1, th, tw]) });
    const r = out[s.outputNames[0]].data;
    const res = document.createElement('canvas');
    res.width = tw; res.height = th;
    const rg = res.getContext('2d');
    const rd = rg.createImageData(tw, th);
    for (let i = 0; i < tw * th; i++) { rd.data[i * 4] = r[i]; rd.data[i * 4 + 1] = r[tw * th + i]; rd.data[i * 4 + 2] = r[2 * tw * th + i]; rd.data[i * 4 + 3] = 255; }
    rg.putImageData(rd, 0, 0);
    // Back at full size, replace only the hole (with a soft 1–2 px edge).
    const big = document.createElement('canvas');
    big.width = bw; big.height = bh;
    const bgc = big.getContext('2d', { willReadFrequently: true });
    bgc.imageSmoothingQuality = 'high';
    bgc.drawImage(res, 0, 0, bw, bh);
    const fill = bgc.getImageData(0, 0, bw, bh).data;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const cur = g.getImageData(bx0, by0, bw, bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!mask[(y + by0) * W + x + bx0]) continue;
      const i = (y * bw + x) * 4;
      cur.data[i] = fill[i]; cur.data[i + 1] = fill[i + 1]; cur.data[i + 2] = fill[i + 2]; cur.data[i + 3] = 255;
    }
    g.putImageData(cur, bx0, by0);
  } catch (e) {
    console.warn('AI fill unavailable, kept the smooth fill', e);
  }
  return canvas;
}

/** A smooth fill of the masked pixels from their surroundings (image pyramid, push-pull). */
export function smoothFill(canvas, mask) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  // Level 0: known colours with weight 1, holes with weight 0.
  const levels = [];
  let w = W, h = H;
  let col = new Float32Array(W * H * 3), wt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) if (!mask[i]) { col[i * 3] = d[i * 4]; col[i * 3 + 1] = d[i * 4 + 1]; col[i * 3 + 2] = d[i * 4 + 2]; wt[i] = 1; }
  levels.push({ w, h, col, wt });
  while (w > 1 || h > 1) {
    const nw = Math.max(1, Math.ceil(w / 2)), nh = Math.max(1, Math.ceil(h / 2));
    const nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = (y >> 1) * nw + (x >> 1), a = wt[i];
      if (!a) continue;
      nc[j * 3] += col[i * 3] * a; nc[j * 3 + 1] += col[i * 3 + 1] * a; nc[j * 3 + 2] += col[i * 3 + 2] * a; nwt[j] += a;
    }
    for (let j = 0; j < nw * nh; j++) if (nwt[j]) { nc[j * 3] /= nwt[j]; nc[j * 3 + 1] /= nwt[j]; nc[j * 3 + 2] /= nwt[j]; nwt[j] = Math.min(1, nwt[j]); }
    w = nw; h = nh; col = nc; wt = nwt;
    levels.push({ w, h, col, wt });
  }
  // Pull back down: each level's holes take the (smoothly sampled) colour of the level above.
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], U = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      if (L.wt[i] >= 1) continue;
      const ux = Math.min(U.w - 1, Math.max(0, (x - 0.5) / 2)), uy = Math.min(U.h - 1, Math.max(0, (y - 0.5) / 2));
      const xa = Math.floor(ux), ya = Math.floor(uy), xb = Math.min(U.w - 1, xa + 1), yb = Math.min(U.h - 1, ya + 1), fx = ux - xa, fy = uy - ya;
      const a = 1 - L.wt[i];
      for (let c = 0; c < 3; c++) {
        const v = (U.col[(ya * U.w + xa) * 3 + c] * (1 - fx) + U.col[(ya * U.w + xb) * 3 + c] * fx) * (1 - fy) + (U.col[(yb * U.w + xa) * 3 + c] * (1 - fx) + U.col[(yb * U.w + xb) * 3 + c] * fx) * fy;
        L.col[i * 3 + c] = L.col[i * 3 + c] * L.wt[i] + v * a;
      }
      L.wt[i] = 1;
    }
  }
  const c0 = levels[0].col;
  for (let i = 0; i < W * H; i++) if (mask[i]) { d[i * 4] = c0[i * 3]; d[i * 4 + 1] = c0[i * 3 + 1]; d[i * 4 + 2] = c0[i * 3 + 2]; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}
