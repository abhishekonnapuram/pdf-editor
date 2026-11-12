// "Segment anything" on the device: SlimSAM (Apache-2.0, about 14 MB, downloaded once) finds the outline of
// whatever is clicked, or of every object when asked to look for them itself. The main subject can also be
// cut out with the background-removal model, which is best at hair and soft edges.
import { transformers } from './ai.js';

const SAM_ID = 'Xenova/slimsam-77-uniform';
let samModel = null;
function loadSam(onStatus) {
  samModel ||= (async () => {
    const T = await transformers();
    const progress_callback = (p) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) onStatus?.(`downloading the object-finding AI ${Math.round(p.progress || 0)}% (14 MB, once)`); };
    const [model, processor] = await Promise.all([
      T.SamModel.from_pretrained(SAM_ID, { dtype: 'q8', device: 'wasm', progress_callback }),
      T.AutoProcessor.from_pretrained(SAM_ID)
    ]);
    return { T, model, processor };
  })();
  samModel.catch(() => { samModel = null; });
  return samModel;
}

const sigmoid = (v) => 1 / (1 + Math.exp(-v));
const LOW = 256;

/**
 * Prepare a picture for selecting objects. Returns
 *   { W, H, at(x, y) -> Promise<choices>, auto(onStatus) -> Promise<choices[]>, full(choice) -> Uint8ClampedArray }
 * A "choice" is { masks: [{low, area, score}] (small part to whole object), pick } where `low` is a 256×256
 * soft mask (0..1) over the model's view of the picture.
 */
export async function objectPicker(canvas, onStatus) {
  const { T, model, processor } = await loadSam(onStatus);
  onStatus?.('looking at the picture');
  const W = canvas.width, H = canvas.height;
  const raw = await T.RawImage.fromURL(canvas.toDataURL('image/png'));
  const inputs = await processor(raw);
  const emb = await model.get_image_embeddings(inputs);
  const [rh, rw] = inputs.reshaped_input_sizes[0].map(Number);
  // The part of the 256×256 low-resolution mask that covers the picture (the rest is padding).
  const vw = Math.round(rw / 4), vh = Math.round(rh / 4);
  const sx = rw / W, sy = rh / H;

  async function decode(prompts) {
    // prompts: [[{x, y, label}]] in picture pixels.
    const n = prompts.length, m = Math.max(...prompts.map((p) => p.length));
    const pts = new Float32Array(n * m * 2), lab = new BigInt64Array(n * m).fill(-10n);
    prompts.forEach((p, i) => p.forEach((q, j) => { pts[(i * m + j) * 2] = q.x * sx; pts[(i * m + j) * 2 + 1] = q.y * sy; lab[i * m + j] = BigInt(q.label ?? 1); }));
    const out = await model({ ...emb, input_points: new T.Tensor('float32', pts, [1, n, m, 2]), input_labels: new T.Tensor('int64', lab, [1, n, m]) });
    const logits = out.pred_masks.data, iou = out.iou_scores.data;
    const res = [];
    for (let i = 0; i < n; i++) {
      const masks = [];
      for (let k = 0; k < 3; k++) {
        const off = (i * 3 + k) * LOW * LOW;
        const low = new Float32Array(vw * vh);
        let area = 0, hard = 0, soft = 0, x0 = vw, y0 = vh, x1 = -1, y1 = -1;
        for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
          const v = logits[off + y * LOW + x];
          low[y * vw + x] = sigmoid(v);
          if (v > 0) { area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (v > 1) hard++; if (v > -1) soft++;
        }
        masks.push({ low, area, score: iou[i * 3 + k], stable: soft ? hard / soft : 0, box: [x0, y0, x1, y1] });
      }
      masks.sort((a, b) => a.area - b.area);
      res.push(masks);
    }
    return res;
  }

  return {
    W, H, vw, vh,
    /** The object under a point; extra points refine it ({label: 0} excludes a spot). */
    async at(points) {
      const [masks] = await decode([points]);
      // The most confident outline; a bigger one (the whole object rather than a part) when it is nearly as sure.
      const ok = masks.map((m, i) => i).filter((i) => masks[i].area > 0 && masks[i].area < vw * vh * 0.5);
      const cand = ok.length ? ok : [0, 1, 2];
      const best = Math.max(...cand.map((i) => masks[i].score));
      const pick = Math.max(...cand.filter((i) => masks[i].score >= best - 0.03));
      // Nothing clear under the point (plain background, for example).
      if (best < 0.6) return null;
      return { masks, pick, points };
    },
    /** Every clear object in the picture, largest first. */
    async auto(status) {
      const N = 7, prompts = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) prompts.push([{ x: (x + 0.5) * W / N, y: (y + 0.5) * H / N }]);
      status?.('finding objects');
      const all = [];
      for (let i = 0; i < prompts.length; i += 25) {
        const part = await decode(prompts.slice(i, i + 25));
        part.forEach((masks, j) => masks.forEach((mk, k) => all.push({ masks, k, mk, points: prompts[i + j] })));
        status?.(`finding objects ${Math.round(Math.min(1, (i + 25) / prompts.length) * 100)}%`);
      }
      const total = vw * vh;
      const edges = (b) => (b[0] <= 1) + (b[1] <= 1) + (b[2] >= vw - 2) + (b[3] >= vh - 2);
      const cands = all.filter(({ mk }) => mk.score > 0.86 && mk.stable > 0.85 && mk.area > total * 0.004 && mk.area < total * 0.6 && edges(mk.box) < 3);
      cands.sort((a, b) => b.mk.area - a.mk.area);
      const kept = [];
      const bin = (low) => { const b = new Uint8Array(low.length); for (let i = 0; i < low.length; i++) b[i] = low[i] > 0.5; return b; };
      for (const c of cands) {
        const b = bin(c.mk.low);
        let dup = false;
        for (const o of kept) {
          let inter = 0;
          for (let i = 0; i < b.length; i++) if (b[i] && o.bin[i]) inter++;
          // Same object found again, or a part of an object that is already kept.
          if (inter / (c.mk.area + o.area - inter) > 0.5 || inter / c.mk.area > 0.8) { dup = true; break; }
        }
        if (dup) continue;
        kept.push({ bin: b, area: c.mk.area, choice: { masks: c.masks, pick: c.k, points: c.points } });
        if (kept.length >= 14) break;
      }
      return kept.map((k) => k.choice);
    },
    /** The chosen outline at the picture's full size, as a soft alpha mask (0..255). */
    full(choice) { return lowToFull(choice.masks[choice.pick].low, vw, vh, W, H); }
  };
}

function lowToFull(low, vw, vh, W, H) {
  const s = document.createElement('canvas');
  s.width = vw; s.height = vh;
  const sg = s.getContext('2d');
  const id = sg.createImageData(vw, vh);
  for (let i = 0; i < low.length; i++) { id.data[i * 4 + 3] = Math.round(low[i] * 255); }
  sg.putImageData(id, 0, 0);
  const b = document.createElement('canvas');
  b.width = W; b.height = H;
  const bg = b.getContext('2d', { willReadFrequently: true });
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(s, 0, 0, W, H);
  const d = bg.getImageData(0, 0, W, H).data;
  // Sharpen the scaled-up edge: the model's outline is soft over several pixels at full size.
  const a = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) a[i] = Math.max(0, Math.min(255, (d[i * 4 + 3] - 128) * 4 + 128));
  return a;
}

/** The main subject's soft mask (0..255) from the background-removal model. */
export async function subjectMask(canvas, onStatus) {
  const { cutoutMask } = await import('../tools/images.js');
  const m = await cutoutMask(canvas, 'best', (s) => onStatus?.(s.replace(/…$/, '').toLowerCase()));
  const d = m.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, m.width, m.height).data;
  const a = new Uint8ClampedArray(m.width * m.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

/** Bounding box of a soft mask, or null when it is empty. */
export function maskBox(a, W, H, min = 100) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] > min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** One object cut from `canvas` with its mask, trimmed to its box: {x0, y0, x1, y1, canvas}. */
export function cutObject(canvas, a) {
  const W = canvas.width, H = canvas.height;
  const b = maskBox(a, W, H, 8);
  if (!b) return null;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, b.x0, b.y0, w, h, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id.data[(y * w + x) * 4 + 3] = a[(y + b.y0) * W + x + b.x0];
  g.putImageData(id, 0, 0);
  return { ...b, canvas: c };
}

/** Union of masks (alpha > 40), grown by `grow` pixels: what has to be filled in behind the objects. */
export function holeMask(masks, W, H, grow = 3) {
  let m = new Uint8Array(W * H);
  for (const a of masks) for (let i = 0; i < W * H; i++) if (a[i] > 40) m[i] = 1;
  for (let p = 0; p < grow; p++) {
    const s = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (s[i]) continue;
      if ((x > 0 && s[i - 1]) || (x < W - 1 && s[i + 1]) || (y > 0 && s[i - W]) || (y < H - 1 && s[i + W])) m[i] = 1;
    }
  }
  return m;
}
