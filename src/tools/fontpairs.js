// Font pairing: browse hand-picked Google font pairs by design need, try them on your own picture,
// make and save your own pairs, get pairs and colours suggested from an image, and export PNG or CSS.
import { h, toast, pickFiles, stockPhoto } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { download } from '../lib/core.js';
import { IMG_ACCEPT, readPicture } from '../lib/imgio.js';
import { fontPicker, loadFont, fontStack, fontCatalog, fontInfo } from '../lib/fonts.js';
import { FONT_PAIRS, NEEDS, PALETTES, imagePalette, imageMood, rankPairs, textOn, lumOf } from '../lib/pairs.js';

const FAV_KEY = 'editsupreme.fontpairs.fav', MINE_KEY = 'editsupreme.fontpairs.mine';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

const SIZES = [
  ['square', 'Square post', 1080, 1080], ['portrait', 'Portrait 4:5', 1080, 1350], ['story', 'Story / Reel', 1080, 1920],
  ['landscape', 'Thumbnail 16:9', 1280, 720], ['banner', 'Banner', 1500, 500], ['image', 'Same as picture', 0, 0]
];
const LAYOUTS = [['center', 'Centre'], ['bottom', 'Bottom'], ['top', 'Top left'], ['card', 'Card'], ['split', 'Side']];

/** Loads the fonts a pair needs, so the canvas can draw them. */
async function pairReady(p) {
  const heavy = (p.hw || 700) >= 600;
  await Promise.all([loadFont(p.head, { bold: heavy }), loadFont(p.head), loadFont(p.body), loadFont(p.body, { bold: true })]);
  try { await document.fonts.load(`${heavy ? 700 : 400} 40px "${p.head}"`); await document.fonts.load(`400 20px "${p.body}"`); } catch { /* fallback font */ }
}

/** Lines of text that fit in maxW with the context's current font. */
function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function mount(el) {
  const S = {
    pair: { ...FONT_PAIRS[0] }, need: '', q: '', fav: new Set(read(FAV_KEY, [])), mine: read(MINE_KEY, []),
    text: { head: 'Make it unforgettable', sub: 'Fresh designs, ready in minutes. Pick a pair and make it yours.', cta: 'Get started' },
    size: 'square', img: null, imgPal: [], mood: null, pal: PALETTES[1].c.slice(), layout: 'center', align: 'center',
    pos: null, scale: 1, overlay: 0.35, auto: true
  };
  const canvas = h('canvas', { class: 'fp-canvas', 'aria-label': 'Preview of the font pair' });
  const g = canvas.getContext('2d');
  let groupBox = null;

  // ---------- drawing ----------
  const dims = () => {
    const s = SIZES.find((x) => x[0] === S.size);
    if (s[0] === 'image' && S.img) { const k = Math.min(1, 1600 / Math.max(S.img.width, S.img.height)); return [Math.round(S.img.width * k), Math.round(S.img.height * k)]; }
    return s[0] === 'image' ? [1080, 1080] : [s[2], s[3]];
  };
  const defaultPos = () => ({ center: [0.5, 0.5], bottom: [0.5, 0.8], top: [0.08, 0.2], card: [0.5, 0.5], split: [0.06, 0.5] }[S.layout]);
  const colors = () => {
    const [bg, text, accent] = S.pal;
    if (!S.img || !S.auto) return { bg, text, accent, onAccent: textOn(accent) };
    // On a picture: white or near-black text, whichever reads better where the text sits.
    const t = S.layout === 'card' ? S.pal[1] : S.underLum > 140 && S.overlay < 0.25 ? '#111111' : '#ffffff';
    return { bg, text: t, accent, onAccent: textOn(accent) };
  };
  async function draw() {
    const [W, H] = dims();
    canvas.width = W; canvas.height = H;
    const p = S.pair, col = colors();
    await pairReady(p);
    // Background
    if (S.img) {
      const k = Math.max(W / S.img.width, H / S.img.height), iw = S.img.width * k, ih = S.img.height * k;
      g.drawImage(S.img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    } else {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, S.pal[0]); gr.addColorStop(1, S.pal[4] || S.pal[0]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    const [px, py] = S.pos || defaultPos();
    if (S.img && S.overlay > 0 && S.layout !== 'card') {
      const dark = col.text === '#ffffff';
      const c0 = dark ? '0,0,0' : '255,255,255';
      if (S.layout === 'bottom') { const gr = g.createLinearGradient(0, H * 0.35, 0, H); gr.addColorStop(0, `rgba(${c0},0)`); gr.addColorStop(1, `rgba(${c0},${Math.min(0.9, S.overlay * 2)})`); g.fillStyle = gr; }
      else if (S.layout === 'split') { const gr = g.createLinearGradient(0, 0, W * 0.75, 0); gr.addColorStop(0, `rgba(${c0},${Math.min(0.9, S.overlay * 2)})`); gr.addColorStop(1, `rgba(${c0},0)`); g.fillStyle = gr; }
      else g.fillStyle = `rgba(${c0},${S.overlay})`;
      g.fillRect(0, 0, W, H);
    }
    // Text group
    const base = Math.min(W, H * 1.2) * S.scale;
    const maxW = W * (S.layout === 'split' ? 0.52 : S.layout === 'card' ? 0.68 : 0.84);
    const blocks = [];
    const headTxt = p.up ? S.text.head.toUpperCase() : S.text.head;
    if (headTxt.trim()) {
      const size = base * (p.up ? 0.095 : 0.088);
      g.font = `${p.hw || 700} ${size}px ${fontStack(p.head)}`;
      g.letterSpacing = (p.ls || 0) * size + 'px';
      blocks.push({ kind: 'head', size, font: g.font, ls: g.letterSpacing, lines: wrapText(g, headTxt, maxW), lh: size * 1.12, color: col.text });
    }
    if (S.text.sub.trim()) {
      const size = base * 0.036;
      g.font = `400 ${size}px ${fontStack(p.body)}`; g.letterSpacing = '0px';
      blocks.push({ kind: 'sub', size, font: g.font, ls: '0px', lines: wrapText(g, S.text.sub, maxW * 0.92), lh: size * 1.45, color: col.text, alpha: 0.88 });
    }
    if (S.text.cta.trim()) {
      const size = base * 0.032;
      g.font = `700 ${size}px ${fontStack(p.body)}`; g.letterSpacing = '0px';
      blocks.push({ kind: 'cta', size, font: g.font, ls: '0px', lines: [S.text.cta], lh: size * 2.6, color: col.onAccent, w: g.measureText(S.text.cta).width + size * 2.4 });
    }
    const gapOf = (b, i) => (i ? (b.kind === 'cta' ? base * 0.04 : base * 0.022) : 0);
    const totalH = blocks.reduce((a, b, i) => a + gapOf(b, i) + b.lines.length * b.lh, 0);
    const widest = Math.max(1, ...blocks.map((b) => { g.font = b.font; g.letterSpacing = b.ls; return b.kind === 'cta' ? b.w : Math.max(...b.lines.map((l) => g.measureText(l).width)); }));
    const align = S.layout === 'top' || S.layout === 'split' ? 'left' : S.align;
    const ax = px * W, top = S.layout === 'top' ? py * H : py * H - totalH / 2;
    const left = align === 'left' ? ax : align === 'right' ? ax - widest : ax - widest / 2;
    if (S.layout === 'card') {
      const pad = base * 0.06;
      g.fillStyle = S.pal[0]; g.globalAlpha = S.img ? 0.92 : 1;
      g.beginPath(); g.roundRect(left - pad, top - pad, widest + pad * 2, totalH + pad * 2, base * 0.025); g.fill(); g.globalAlpha = 1;
    }
    let y = top;
    blocks.forEach((b, i) => {
      y += gapOf(b, i);
      g.font = b.font; g.letterSpacing = b.ls; g.textBaseline = 'middle';
      if (b.kind === 'cta') {
        const bx = align === 'left' ? left : align === 'right' ? left + widest - b.w : ax - b.w / 2, bh = b.size * 2.3;
        g.fillStyle = col.accent; g.beginPath(); g.roundRect(bx, y + (b.lh - bh) / 2, b.w, bh, bh / 2); g.fill();
        g.fillStyle = b.color; g.textAlign = 'center'; g.fillText(b.lines[0], bx + b.w / 2, y + b.lh / 2);
        y += b.lh; return;
      }
      g.fillStyle = b.color; g.globalAlpha = b.alpha || 1; g.textAlign = align;
      for (const l of b.lines) { g.fillText(l, align === 'left' ? left : align === 'right' ? left + widest : ax, y + b.lh / 2); y += b.lh; }
      g.globalAlpha = 1;
    });
    g.letterSpacing = '0px';
    groupBox = { x: left, y: top, w: widest, h: totalH };
  }
  const redraw = (() => { let busy = false, again = false; return async () => { if (busy) { again = true; return; } busy = true; try { await draw(); } finally { busy = false; if (again) { again = false; redraw(); } } }; })();

  // Drag the text anywhere on the picture.
  canvas.addEventListener('pointerdown', (e) => {
    if (!groupBox) return;
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const pad = 30 * k;
    if (x < groupBox.x - pad || x > groupBox.x + groupBox.w + pad || y < groupBox.y - pad || y > groupBox.y + groupBox.h + pad) return;
    const start = S.pos || defaultPos(), sx = x, sy = y;
    const move = (ev) => {
      const nx = (ev.clientX - r.left) * k, ny = (ev.clientY - r.top) * k;
      S.pos = [Math.max(0, Math.min(1, start[0] + (nx - sx) / canvas.width)), Math.max(0, Math.min(1, start[1] + (ny - sy) / canvas.height))];
      redraw();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); measureUnder(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!groupBox) return;
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    canvas.style.cursor = x > groupBox.x && x < groupBox.x + groupBox.w && y > groupBox.y && y < groupBox.y + groupBox.h ? 'move' : '';
  });
  // Brightness of the picture under the text, for automatic text colour.
  function measureUnder() {
    if (!S.img) return;
    const [W, H] = dims(), [px, py] = S.pos || defaultPos();
    const c = document.createElement('canvas'); c.width = 64; c.height = Math.round(64 * H / W);
    const cg = c.getContext('2d', { willReadFrequently: true });
    const k = Math.max(W / S.img.width, H / S.img.height), iw = S.img.width * k, ih = S.img.height * k;
    cg.drawImage(S.img, (W - iw) / 2 * 64 / W, (H - ih) / 2 * 64 / W, iw * 64 / W, ih * 64 / W);
    const x0 = Math.max(0, Math.round((px - 0.3) * 64)), y0 = Math.max(0, Math.round((py - 0.12) * c.height));
    const d = cg.getImageData(x0, y0, Math.max(1, Math.min(64 - x0, 38)), Math.max(1, Math.min(c.height - y0, Math.round(c.height * 0.24)))).data;
    let L = 0; for (let i = 0; i < d.length; i += 4) L += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const before = S.underLum; S.underLum = L / (d.length / 4);
    if (before == null || Math.abs(before - S.underLum) > 20) redraw();
  }

  // ---------- controls ----------
  const side = h('div', { class: 'fp-side' });
  const gallery = h('div', { class: 'fp-gallery' });
  const chips = h('div', { class: 'filters fp-chips' });
  const search = h('input', { class: 'inp', type: 'search', placeholder: 'Search by font name…', oninput: (e) => { S.q = e.target.value.trim().toLowerCase(); drawGallery(); } });

  async function useImage(file) {
    try {
      const pic = await readPicture(file);
      S.img = pic.frames[0].canvas; S.imgPal = imagePalette(S.img, 6); S.mood = imageMood(S.img);
      S.need = 'suggested'; S.pos = null; S.auto = true;
      if (S.size === 'square' && Math.abs(S.img.width / S.img.height - 1) > 0.15) S.size = 'image';
      measureUnder(); drawSide(); drawChips(); drawGallery(); redraw();
      toast('Pairs that suit your picture are shown first.');
    } catch { toast('Could not read that picture.'); }
  }
  const setPair = (p) => { S.pair = { ...p }; drawSide(); drawGallery(); redraw(); };

  function drawSide() {
    const p = S.pair;
    const seg = (opts, cur, on) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', class: cur === v ? 'on' : '', onclick: () => on(v) }, l)));
    const inp = (key, label, rows) => h('label', { class: 'fp-field' }, h('span', {}, label), h(rows ? 'textarea' : 'input', { class: 'inp', rows, value: S.text[key], oninput: (e) => { S.text[key] = e.target.value; redraw(); clearTimeout(S.gt); S.gt = setTimeout(drawGallery, 400); } }));
    const palBtn = (c, name, tag) => h('button', { type: 'button', class: 'fp-pal' + (S.pal.join() === c.join() ? ' on' : ''), title: name, 'aria-label': 'Colours ' + name, onclick: () => { S.pal = c.slice(); S.auto = !!S.img && tag !== 'manual'; drawSide(); redraw(); } }, c.slice(0, 4).map((x) => h('i', { style: { background: x } })));
    const fromImg = S.imgPal.length >= 3 ? (() => {
      const byL = S.imgPal.slice().sort((a, b) => lumOf(a) - lumOf(b));
      const vivid = S.imgPal.slice(1).find((x) => { const n = parseInt(x.slice(1), 16), r = n >> 16, g2 = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g2, b); return mx && (mx - Math.min(r, g2, b)) / mx > 0.35; }) || S.imgPal[1];
      return [byL[byL.length - 1], byL[0], vivid, S.imgPal[2] || vivid, S.imgPal[0]];
    })() : null;
    side.replaceChildren(
      h('div', { class: 'fp-now' },
        h('div', {}, h('b', { style: { fontFamily: fontStack(p.head), fontWeight: p.hw } }, p.head), h('span', {}, ' + '), h('span', { style: { fontFamily: fontStack(p.body) } }, p.body)),
        p.why ? h('p', { class: 'hint' }, p.why) : ''),
      h('h3', {}, 'Your text'),
      inp('head', 'Headline'), inp('sub', 'Text', 3), inp('cta', 'Button (leave empty to hide)'),
      h('h3', {}, 'Make your own pair'),
      h('div', { class: 'fp-grid2' },
        h('label', { class: 'fp-field' }, h('span', {}, 'Headline font'), fontPicker(p.head, (v) => { if (v) { S.pair = { ...S.pair, head: v, id: '', why: '' }; drawSide(); redraw(); } }, { standard: false })),
        h('label', { class: 'fp-field' }, h('span', {}, 'Text font'), fontPicker(p.body, (v) => { if (v) { S.pair = { ...S.pair, body: v, id: '', why: '' }; drawSide(); redraw(); } }, { standard: false }))),
      h('div', { class: 'fp-grid2' },
        h('label', { class: 'fp-field' }, h('span', {}, 'Headline weight'), h('select', { class: 'inp', onchange: (e) => { S.pair.hw = +e.target.value; redraw(); } }, [400, 500, 600, 700, 800, 900].map((w) => h('option', { value: w, selected: (p.hw || 700) === w }, { 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[w])))),
        h('label', { class: 'fp-field' }, h('span', {}, 'Letter spacing'), h('input', { type: 'range', min: -0.04, max: 0.2, step: 0.01, value: p.ls || 0, oninput: (e) => { S.pair.ls = +e.target.value; redraw(); } }))),
      h('div', { class: 'fp-row' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!p.up, onchange: (e) => { S.pair.up = e.target.checked; redraw(); } }), ' Headline in capitals'),
        h('button', { class: 'btn small', type: 'button', onclick: () => setPair({ ...p, head: p.body, body: p.head, id: '' }) }, 'Swap fonts'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { const list = currentList(); setPair(list[Math.floor(Math.random() * list.length)] || FONT_PAIRS[0]); } }, 'Shuffle'),
        h('button', { class: 'btn small', type: 'button', onclick: () => {
          const name = `${p.head} + ${p.body}`;
          if (S.mine.some((m) => m.head === p.head && m.body === p.body && m.hw === p.hw)) return toast('Already in My pairs.');
          S.mine.unshift({ ...p, id: 'mine-' + Date.now().toString(36), mine: true, tags: [], why: p.why || 'Saved by you.', name }); write(MINE_KEY, S.mine);
          toast('Saved to My pairs.'); drawChips();
        } }, h('span', { html: icon('plus') }), 'Save pair')),
      h('h3', {}, 'Picture'),
      h('div', { class: 'fp-row' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => { const [f] = await pickFiles(IMG_ACCEPT, false); if (f) useImage(f); } }, h('span', { html: icon('upload') }), S.img ? 'Change picture' : 'Add your picture'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { const f = await stockPhoto({ title: 'Free stock photo' }); if (f) useImage(f); } }, h('span', { html: icon('image') }), 'Stock photo'),
        S.img ? h('button', { class: 'btn small', type: 'button', onclick: () => { S.img = null; S.imgPal = []; S.mood = null; if (S.need === 'suggested') S.need = ''; if (S.size === 'image') S.size = 'square'; drawSide(); drawChips(); drawGallery(); redraw(); } }, 'Remove') : ''),
      S.img ? h('label', { class: 'fp-field' }, h('span', {}, 'Darken / lighten behind the text'), h('input', { type: 'range', min: 0, max: 0.7, step: 0.05, value: S.overlay, oninput: (e) => { S.overlay = +e.target.value; redraw(); } })) : '',
      h('h3', {}, 'Size and layout'),
      h('select', { class: 'inp', onchange: (e) => { S.size = e.target.value; S.pos = null; redraw(); } }, SIZES.filter((s) => s[0] !== 'image' || S.img).map(([v, l, w, hh]) => h('option', { value: v, selected: S.size === v }, l + (w ? ` (${w} × ${hh})` : '')))),
      seg(LAYOUTS, S.layout, (v) => { S.layout = v; S.pos = null; measureUnder(); drawSide(); redraw(); }),
      S.layout === 'center' || S.layout === 'bottom' || S.layout === 'card' ? seg([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], S.align, (v) => { S.align = v; drawSide(); redraw(); }) : '',
      h('label', { class: 'fp-field' }, h('span', {}, 'Text size'), h('input', { type: 'range', min: 0.6, max: 1.6, step: 0.05, value: S.scale, oninput: (e) => { S.scale = +e.target.value; redraw(); } })),
      h('p', { class: 'hint' }, 'Drag the text on the preview to move it.'),
      h('h3', {}, 'Colours'),
      fromImg ? h('div', {}, h('p', { class: 'hint', style: { margin: '0 0 6px' } }, 'From your picture'), h('div', { class: 'fp-pals' }, palBtn(fromImg, 'From your picture'))) : '',
      h('div', { class: 'fp-pals' }, PALETTES.map((x) => palBtn(x.c, x.name))),
      h('div', { class: 'fp-row' }, ...[['Background', 0], ['Text', 1], ['Accent', 2]].map(([l, i]) => h('label', { class: 'rsm-colf' }, h('input', { type: 'color', value: S.pal[i], oninput: (e) => { S.pal[i] = e.target.value; S.auto = false; redraw(); } }), h('span', {}, l)))),
      S.img ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.auto, onchange: (e) => { S.auto = e.target.checked; redraw(); } }), ' Pick black or white text automatically for the picture') : '');
  }

  // ---------- gallery ----------
  function currentList() {
    let list = S.need === 'fav' ? [...S.mine, ...FONT_PAIRS].filter((p) => S.fav.has(p.id))
      : S.need === 'mine' ? S.mine
        : S.need === 'suggested' && S.mood ? rankPairs(S.mood.tags)
          : S.need ? FONT_PAIRS.filter((p) => p.tags.includes(S.need)) : FONT_PAIRS;
    if (S.q) list = [...S.mine, ...FONT_PAIRS].filter((p) => (p.head + ' ' + p.body).toLowerCase().includes(S.q));
    return list;
  }
  function drawChips() {
    const opts = [['', 'All'], ...(S.mood ? [['suggested', 'Best for your picture']] : []), ['fav', '♥ Favourites'], ...(S.mine.length ? [['mine', 'My pairs']] : []), ...NEEDS];
    chips.replaceChildren(...opts.map(([k, l]) => h('button', { type: 'button', class: 'chip' + (S.need === k ? ' on' : ''), onclick: () => { S.need = k; S.q = ''; search.value = ''; drawChips(); drawGallery(); } }, l)));
  }
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return;
    const n = e.target; io.unobserve(n);
    loadFont(n.dataset.head, { bold: +n.dataset.hw >= 600 }); loadFont(n.dataset.body);
  }), { rootMargin: '200px' });
  function drawGallery() {
    const list = currentList();
    const card = (p) => {
      const fav = S.fav.has(p.id);
      const heart = h('button', { type: 'button', class: 'fp-fav' + (fav ? ' on' : ''), title: fav ? 'Remove from favourites' : 'Add to favourites', 'aria-label': 'Favourite', onclick: (e) => {
        e.stopPropagation(); S.fav.has(p.id) ? S.fav.delete(p.id) : S.fav.add(p.id); write(FAV_KEY, [...S.fav]); drawGallery();
      } }, fav ? '♥' : '♡');
      const del = p.mine ? h('button', { type: 'button', class: 'fp-fav', title: 'Delete this pair', 'aria-label': 'Delete', onclick: (e) => { e.stopPropagation(); S.mine = S.mine.filter((m) => m.id !== p.id); write(MINE_KEY, S.mine); drawChips(); drawGallery(); } }, '×') : '';
      const c = h('div', { class: 'fp-card' + (S.pair.id && S.pair.id === p.id ? ' on' : ''), role: 'button', tabindex: 0, 'data-head': p.head, 'data-body': p.body, 'data-hw': p.hw || 700,
        onclick: () => { setPair(p); canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, onkeydown: (e) => { if (e.key === 'Enter') c.click(); } },
        h('div', { class: 'fp-card-top' }, heart, del),
        h('div', { class: 'fp-sample-h', style: { fontFamily: fontStack(p.head), fontWeight: p.hw || 700, textTransform: p.up ? 'uppercase' : 'none', letterSpacing: (p.ls || 0) + 'em' } }, S.text.head || 'Headline'),
        h('div', { class: 'fp-sample-b', style: { fontFamily: fontStack(p.body) } }, S.text.sub || 'Body text'),
        h('div', { class: 'fp-names' }, h('b', {}, p.head), ' + ', p.body),
        p.tags?.length ? h('div', { class: 'fp-tags' }, p.tags.slice(0, 3).map((t) => h('span', {}, (NEEDS.find((n) => n[0] === t) || [, t])[1]))) : '');
      io.observe(c);
      return c;
    };
    gallery.replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'status' }, S.need === 'fav' ? 'Tap ♡ on a pair to keep it here.' : 'No pairs found.')]));
  }

  // ---------- export ----------
  const cssOf = (p) => {
    const fam = (f, ws) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${ws.join(';')}`;
    const same = p.head === p.body;
    const url = `https://fonts.googleapis.com/css2?${same ? fam(p.head, [...new Set([400, 700, p.hw || 700])].sort()) : fam(p.head, [p.hw || 700]) + '&' + fam(p.body, [400, 700])}&display=swap`;
    const cat = (f) => ({ serif: 'serif', handwriting: 'cursive', monospace: 'monospace' }[fontInfo(f)?.category] || 'sans-serif');
    return `@import url('${url}');\n\nh1, h2, h3 {\n  font-family: '${p.head}', ${cat(p.head)};\n  font-weight: ${p.hw || 700};${p.up ? '\n  text-transform: uppercase;' : ''}${p.ls ? `\n  letter-spacing: ${p.ls}em;` : ''}\n}\n\nbody {\n  font-family: '${p.body}', ${cat(p.body)};\n}\n`;
  };
  const actions = h('div', { class: 'fp-actions' },
    h('button', { class: 'btn primary', type: 'button', onclick: async () => { await draw(); canvas.toBlob((b) => download(b, `font-pair-${S.pair.head}-${S.pair.body}.png`.replace(/\s+/g, '-').toLowerCase()), 'image/png'); } }, h('span', { html: icon('download') }), 'Download PNG'),
    h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(cssOf(S.pair)); toast('CSS copied: paste it into your website.'); } catch { download(new Blob([cssOf(S.pair)], { type: 'text/css' }), 'fonts.css'); } } }, h('span', { html: icon('copy') }), 'Copy CSS'),
    h('button', { class: 'btn', type: 'button', onclick: () => { if (S.fav.has(S.pair.id)) return toast('Already in favourites.'); if (!S.pair.id) return toast('Save your own pair with "Save pair" first.'); S.fav.add(S.pair.id); write(FAV_KEY, [...S.fav]); drawGallery(); toast('Added to favourites.'); } }, '♡ Favourite'));

  el.replaceChildren(h('div', { class: 'fp' },
    h('div', { class: 'fp-top' },
      h('div', { class: 'fp-stage' }, canvas, actions),
      side),
    h('h3', { class: 'fp-gh' }, 'Font pairs'),
    h('div', { class: 'fp-gtools' }, search),
    chips, gallery,
    h('p', { class: 'hint' }, 'All fonts are free Google Fonts, fine for personal and commercial work. Your favourites and saved pairs stay in this browser.')));
  // Drop a picture anywhere on the tool.
  el.addEventListener('dragover', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); e.stopPropagation(); useImage(f); } });
  fontCatalog().then(() => redraw());
  drawSide(); drawChips(); drawGallery(); redraw();
}

export const tools = { 'font-pairs': { standalone: true, mount: (el) => mount(el) } };
