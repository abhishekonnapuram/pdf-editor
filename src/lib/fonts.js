// Google Fonts for every tool: the full catalogue (via Fontsource, no key needed), on-demand loading,
// a searchable font picker, embedding into PDFs, and matching a font from a picture of text.
import { h } from './ui.js';

// ---------- popular families (shown first, used offline, and tried when matching fonts) ----------
export const POPULAR = {
  'sans-serif': ['Roboto', 'Open Sans', 'Inter', 'Poppins', 'Montserrat', 'Lato', 'Arimo', 'Noto Sans', 'Source Sans 3', 'Raleway', 'Nunito', 'Nunito Sans', 'Ubuntu', 'Rubik', 'Work Sans', 'Mulish', 'PT Sans', 'Fira Sans', 'Kanit', 'Manrope', 'DM Sans', 'Barlow', 'Quicksand', 'Hind', 'Heebo', 'Karla', 'Josefin Sans', 'Libre Franklin', 'Outfit', 'Plus Jakarta Sans', 'IBM Plex Sans', 'Cabin', 'Exo 2', 'Titillium Web', 'Oxygen', 'Archivo', 'Lexend', 'Figtree', 'Urbanist', 'Red Hat Display', 'Sora', 'Space Grotesk', 'Public Sans', 'Assistant', 'Varela Round', 'Maven Pro', 'Barlow Condensed', 'Roboto Condensed', 'Encode Sans', 'Montserrat Alternates'],
  serif: ['Playfair Display', 'Merriweather', 'Lora', 'Tinos', 'PT Serif', 'Noto Serif', 'Roboto Slab', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Crimson Text', 'Source Serif 4', 'Bitter', 'Arvo', 'Zilla Slab', 'DM Serif Display', 'Prata', 'Cinzel', 'Gelasio', 'Spectral', 'Alegreya', 'Domine', 'Libre Caslon Text', 'Frank Ruhl Libre', 'Yeseva One'],
  display: ['Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Righteous', 'Abril Fatface', 'Alfa Slab One', 'Bangers', 'Lobster', 'Fredoka', 'Passion One', 'Russo One', 'Black Ops One', 'Bungee', 'Monoton', 'Staatliches', 'Teko', 'Fjalla One', 'Ultra', 'Luckiest Guy', 'Paytone One', 'Concert One', 'Chewy', 'Titan One', 'Comfortaa'],
  handwriting: ['Pacifico', 'Dancing Script', 'Great Vibes', 'Caveat', 'Satisfy', 'Sacramento', 'Kaushan Script', 'Shadows Into Light', 'Indie Flower', 'Amatic SC', 'Permanent Marker', 'Courgette', 'Allura', 'Parisienne', 'Cookie', 'Yellowtail', 'Patrick Hand', 'Kalam', 'Gloria Hallelujah', 'Homemade Apple', 'Alex Brush', 'Tangerine', 'Marck Script', 'Rock Salt', 'Covered By Your Grace'],
  monospace: ['Roboto Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Space Mono', 'IBM Plex Mono', 'Cousine', 'Inconsolata', 'Ubuntu Mono', 'Courier Prime']
};
export const CATEGORY_LABEL = { 'sans-serif': 'Sans serif', serif: 'Serif', display: 'Display', handwriting: 'Script & handwriting', monospace: 'Monospace' };
const popularCat = new Map(Object.entries(POPULAR).flatMap(([cat, list]) => list.map((f) => [f, cat])));

// ---------- catalogue ----------
const CACHE_KEY = 'editsupreme.fontcatalog.v1';
let catalog = null, catalogP = null;
const byFamily = new Map();
function index(list) { byFamily.clear(); for (const f of list) byFamily.set(f.family, f); }
const toId = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const guess = (family) => ({ id: toId(family), family, category: popularCat.get(family) || 'sans-serif', weights: [400, 700], styles: ['normal', 'italic'], defSubset: 'latin' });

/** Every Google font: [{id, family, category, weights, styles, defSubset}], cached on the device for a week. */
export function fontCatalog() {
  if (catalog) return Promise.resolve(catalog);
  catalogP ||= (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.at < 7 * 864e5 && c.list?.length > 500) { catalog = c.list; index(catalog); return catalog; }
    } catch { /* storage unavailable */ }
    try {
      const r = await fetch('https://api.fontsource.org/v1/fonts?type=google');
      if (!r.ok) throw new Error(r.status);
      catalog = (await r.json()).map((f) => ({ id: f.id, family: f.family, category: f.category, weights: f.weights, styles: f.styles, defSubset: f.defSubset }));
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list: catalog })); } catch { /* too big or blocked */ }
    } catch {
      // Offline: the popular families still work (their files are cached once used).
      catalog = Object.values(POPULAR).flat().map(guess);
    }
    index(catalog);
    return catalog;
  })();
  return catalogP;
}
fontCatalog();
export const fontInfo = (family) => byFamily.get(family) || (popularCat.has(family) ? guess(family) : null);
export function categoryOf(family) { return fontInfo(family)?.category || popularCat.get(family) || 'sans-serif'; }
/** CSS fallback stack for a Google family, so text still looks right while it loads. */
export function fontStack(family) {
  const cat = categoryOf(family);
  const fb = cat === 'serif' ? '"Times New Roman", serif' : cat === 'monospace' ? '"Courier New", monospace' : cat === 'handwriting' ? 'cursive' : 'Helvetica, Arial, sans-serif';
  return `"${family}", ${fb}`;
}

// ---------- loading ----------
const nearest = (weights, want) => weights.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), weights[0] || 400);
export function fontFileUrl(f, weight, style, fmt = 'woff2') {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${f.id}@latest/${f.defSubset || 'latin'}-${weight}-${style}.${fmt}`;
}
const loaded = new Map();
/** Load a family (regular or bold, upright or italic) so the browser and canvases can use it. */
export async function loadFont(family, { bold = false, italic = false } = {}) {
  if (!family) return false;
  await fontCatalog();
  const f = fontInfo(family);
  if (!f) return false;
  const want = bold ? 700 : 400;
  const w = nearest(f.weights || [400], want);
  const style = italic && f.styles?.includes('italic') ? 'italic' : 'normal';
  const key = `${family}|${want}|${italic ? 'i' : 'n'}`;
  if (!loaded.has(key)) {
    loaded.set(key, (async () => {
      try {
        // Registered under the requested weight, so CSS "bold" picks the heaviest file the family has.
        const face = new FontFace(family, `url(${fontFileUrl(f, w, style)})`, { weight: String(want), style: italic ? 'italic' : 'normal' });
        await face.load();
        document.fonts.add(face);
        return true;
      } catch { return false; }
    })());
  }
  return loaded.get(key);
}
/** Load every font the given objects use (objects with .family, .bold, .italic). */
export async function fontsFor(objs) {
  await Promise.all(objs.filter((o) => o.family).map((o) => loadFont(o.family, o)));
}

// ---------- PDF embedding ----------
let fontkitP = null;
/** Embed a Google font in a pdf-lib document (subset to the characters used). Returns a PDFFont or null. */
export async function embedGoogleFont(doc, family, { bold = false, italic = false } = {}) {
  await fontCatalog();
  const f = fontInfo(family);
  if (!f) return null;
  fontkitP ||= import('@cantoo/fontkit').then((m) => m.default || m);
  doc.registerFontkit(await fontkitP);
  const w = nearest(f.weights || [400], bold ? 700 : 400);
  const style = italic && f.styles?.includes('italic') ? 'italic' : 'normal';
  try {
    const r = await fetch(fontFileUrl(f, w, style, 'ttf'));
    if (!r.ok) return null;
    return await doc.embedFont(new Uint8Array(await r.arrayBuffer()), { subset: true });
  } catch { return null; }
}

// ---------- font picker ----------
/**
 * A searchable picker over every Google font. value: family or ''. options.standard adds the built-in
 * PDF fonts at the top (value ''). onChange(family).
 */
export function fontPicker(value, onChange, { standard = true, standardLabel = 'Standard (Helvetica / Times / Courier)' } = {}) {
  const btn = h('button', { type: 'button', class: 'fontbtn', style: value ? { fontFamily: fontStack(value) } : {} }, value || standardLabel);
  if (value) loadFont(value);
  btn.addEventListener('click', () => openFontDialog(value, (v) => { btn.textContent = v || standardLabel; btn.style.fontFamily = v ? fontStack(v) : ''; if (v) loadFont(v); onChange(v); }, standard ? standardLabel : null));
  return btn;
}

async function openFontDialog(value, onPick, standardLabel) {
  const list = await fontCatalog();
  let cat = 'all', q = '';
  const search = h('input', { class: 'inp', type: 'search', placeholder: `Search ${list.length.toLocaleString()} Google fonts…`, autofocus: true });
  const chips = h('div', { class: 'filters', style: { margin: '8px 0' } });
  const results = h('div', { class: 'fontlist' });
  const count = h('div', { class: 'status' });
  const close = () => bg.remove();
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal fontmodal', role: 'dialog', 'aria-label': 'Choose a font' }, h('h3', {}, 'Choose a font'), search, chips, count, results,
      h('div', { class: 'foot' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'))));
  document.body.append(bg);
  setTimeout(() => search.focus(), 30);
  const cats = [['all', 'All'], ['popular', 'Popular'], ...Object.entries(CATEGORY_LABEL)];
  const drawChips = () => chips.replaceChildren(...cats.map(([k, l]) => h('button', { type: 'button', class: 'chip' + (cat === k ? ' on' : ''), onclick: () => { cat = k; drawChips(); draw(); } }, l)));
  // Previews load each family's file only when its row scrolls into view.
  const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { const f = e.target.dataset.family; loadFont(f).then(() => { e.target.style.fontFamily = fontStack(f); }); io.unobserve(e.target); } }), { root: results });
  let shown = [], limit = 80;
  const draw = () => {
    const ql = q.trim().toLowerCase();
    const pop = new Set(Object.values(POPULAR).flat());
    shown = list.filter((f) => (cat === 'all' || (cat === 'popular' ? pop.has(f.family) : f.category === cat)) && (!ql || f.family.toLowerCase().includes(ql)));
    if (cat === 'all' && !ql) shown.sort((a, b) => (pop.has(b.family) - pop.has(a.family)));
    limit = 80;
    count.textContent = `${shown.length.toLocaleString()} font${shown.length === 1 ? '' : 's'}`;
    results.replaceChildren();
    if (standardLabel && !ql) results.append(row('', standardLabel));
    more();
  };
  const row = (family, label) => {
    const r = h('button', { type: 'button', class: 'fontrow' + ((value || '') === family ? ' on' : ''), 'data-family': family, onclick: () => { onPick(family); close(); } },
      h('span', { class: 'fname' }, label || family), family ? h('span', { class: 'fcat' }, CATEGORY_LABEL[fontInfo(family)?.category] || '') : null);
    if (family) io.observe(r.firstChild.parentElement);
    return r;
  };
  const more = () => {
    const start = results.querySelectorAll('.fontrow[data-family]:not([data-family=""])').length;
    for (const f of shown.slice(start, limit)) results.append(row(f.family));
  };
  results.addEventListener('scroll', () => { if (results.scrollTop + results.clientHeight > results.scrollHeight - 200 && limit < shown.length) { limit += 80; more(); } });
  search.addEventListener('input', () => { q = search.value; draw(); });
  drawChips(); draw();
}

// ---------- matching a font from a picture ----------
// Candidates tried by default (popular families of every style); `deep` adds the rest of the popular list.
export const MATCH_SET = ['Roboto', 'Open Sans', 'Inter', 'Poppins', 'Montserrat', 'Lato', 'Arimo', 'Raleway', 'Nunito', 'Ubuntu', 'Rubik', 'Work Sans', 'PT Sans', 'Fira Sans', 'Kanit', 'DM Sans', 'Barlow', 'Quicksand', 'Josefin Sans', 'Outfit', 'Archivo', 'Lexend', 'Space Grotesk', 'Roboto Condensed', 'Barlow Condensed',
  'Playfair Display', 'Merriweather', 'Lora', 'Tinos', 'PT Serif', 'Roboto Slab', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Bitter', 'Arvo', 'DM Serif Display', 'Cinzel',
  'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Righteous', 'Abril Fatface', 'Alfa Slab One', 'Bangers', 'Lobster', 'Fredoka', 'Russo One', 'Teko', 'Fjalla One', 'Comfortaa', 'Staatliches',
  'Pacifico', 'Dancing Script', 'Great Vibes', 'Caveat', 'Satisfy', 'Sacramento', 'Kaushan Script', 'Permanent Marker', 'Amatic SC', 'Allura',
  'Roboto Mono', 'Source Code Pro', 'Space Mono', 'Cousine'];

// The ink of a box on a canvas as a 0/1 mask, cropped to the ink and resized to height `H`.
function inkMask(src, box, H = 40) {
  const x0 = Math.max(0, Math.floor(box.x0) - 1), y0 = Math.max(0, Math.floor(box.y0) - 1);
  const w = Math.min(src.width - x0, Math.ceil(box.x1 - box.x0) + 3), hh = Math.min(src.height - y0, Math.ceil(box.y1 - box.y0) + 3);
  if (w < 3 || hh < 3) return null;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, hh).data;
  // Background = the most common colour along the border.
  const counts = new Map();
  for (let x = 0; x < w; x++) for (const y of [0, hh - 1]) { const q = (y * w + x) * 4, k = ((d[q] >> 4) << 8) | ((d[q + 1] >> 4) << 4) | (d[q + 2] >> 4); counts.set(k, (counts.get(k) || 0) + 1); }
  let bk = 0, best = -1; for (const [k, v] of counts) if (v > best) { best = v; bk = k; }
  const bgc = [((bk >> 8) & 15) * 16 + 8, ((bk >> 4) & 15) * 16 + 8, (bk & 15) * 16 + 8];
  const m = new Uint8Array(w * hh);
  let mx0 = w, my0 = hh, mx1 = -1, my1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4;
    if (Math.abs(d[q] - bgc[0]) + Math.abs(d[q + 1] - bgc[1]) + Math.abs(d[q + 2] - bgc[2]) > 110) { m[y * w + x] = 1; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; }
  }
  if (mx1 < 0) return null;
  return resizeMask(m, w, mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1, H);
}
function resizeMask(m, stride, sx, sy, sw, sh, H) {
  const W = Math.max(4, Math.round((sw / sh) * H));
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Box-sample so thin strokes aren't lost when shrinking.
    const ax = sx + (x / W) * sw, bx = sx + ((x + 1) / W) * sw, ay = sy + (y / H) * sh, by = sy + ((y + 1) / H) * sh;
    let s = 0, n = 0;
    for (let yy = Math.floor(ay); yy < Math.max(Math.floor(ay) + 1, Math.ceil(by)); yy++) for (let xx = Math.floor(ax); xx < Math.max(Math.floor(ax) + 1, Math.ceil(bx)); xx++) { s += m[yy * stride + xx] || 0; n++; }
    out[y * W + x] = s / n;
  }
  return { m: out, W, H, aspect: sw / sh };
}
function renderMask(text, family, bold, italic, H) {
  const size = 120;
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px ${fontStack(family)}`;
  const tw = Math.ceil(g.measureText(text).width) + 20;
  c.width = Math.min(8000, tw); c.height = size * 2;
  g.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px ${fontStack(family)}`;
  g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
  g.fillText(text, 10, size * 1.4);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const m = new Uint8Array(c.width * c.height);
  let mx0 = c.width, my0 = c.height, mx1 = -1, my1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 110) { m[y * c.width + x] = 1; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; }
  if (mx1 < 0) return null;
  return resizeMask(m, c.width, mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1, H);
}
// Similarity of two masks (stretched to the same width) times how well their width/height ratios agree.
function similarity(a, b) {
  const W = a.W, H = a.H;
  let inter = 0, sa = 0, sb = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const va = a.m[y * W + x], vb = b.m[y * b.W + Math.min(b.W - 1, Math.floor((x / W) * b.W))];
    inter += Math.min(va, vb); sa += va; sb += vb;
  }
  const dice = (2 * inter) / Math.max(1e-6, sa + sb);
  return dice * Math.exp(-Math.abs(Math.log(b.aspect / a.aspect)) * 1.6);
}

/**
 * Rank fonts for one or more samples of the same text style. samples: [{canvas, box, text}] (box in pixels).
 * Returns [{family, bold, italic, score}] best first.
 */
export async function matchFont(samples, { candidates = MATCH_SET, italic = false, top = 8, onProgress } = {}) {
  const targets = samples.map((s) => ({ ...s, mask: inkMask(s.canvas, s.box) })).filter((s) => s.mask && s.text.replace(/\s/g, '').length >= 2);
  if (!targets.length) return [];
  const out = [];
  let i = 0;
  for (const family of candidates) {
    onProgress?.(++i / candidates.length);
    // italic 'auto': also try the italic version (for families that have one).
    const slants = italic === 'auto' ? (fontInfo(family)?.styles?.includes('italic') ? [false, true] : [false]) : [!!italic];
    for (const it of slants) for (const bold of [false, true]) {
      await loadFont(family, { bold, italic: it });
      let s = 0;
      for (const t of targets) { const r = renderMask(t.text, family, bold, it, t.mask.H); if (r) s += similarity(t.mask, r); }
      out.push({ family, bold, italic: it, score: s / targets.length });
    }
  }
  out.sort((a, b) => b.score - a.score);
  // One entry per family (its better weight), best first.
  const seen = new Set();
  return out.filter((r) => (seen.has(r.family) ? false : seen.add(r.family))).slice(0, top);
}
