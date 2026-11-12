// Page editor used by Edit PDF, Sign PDF, Redact PDF, Edit PDF images and the PDF Forms designer.
// Objects live in "page units": PDF points in the page's on-screen orientation, origin top-left.
import { StandardFonts, rgb, degrees, PDFDocument, pushGraphicsState, popGraphicsState, setCharacterSpacing, moveTo, lineTo, closePath, clip, endPath, stroke, setLineWidth, setStrokingRgbColor, setLineJoin, LineJoinStyle } from '@cantoo/pdf-lib';
import { pdfjsLib, readBytes, pdfBlob, stem, openPdfjs, loadPdfLib, renderPage, canvasToBlob, blobToBytes, hexToRgb01, loadImage, download } from '../lib/core.js';
import { pageImages } from '../lib/pdfimages.js';
import { removeTextInRects, removeNthImage, countImageDraws } from '../lib/contentedit.js';
import { findText, findPictures, eraseRegion, drawTexts, srcToCanvas, textWidth, ASC } from '../lib/imagetext.js';
import { h, ibtn, modal, pickFiles, toast, askPassword } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { fontPicker, fontStack, embedGoogleFont } from '../lib/fonts.js';
import { PHOTO_SOURCES, ALL_SOURCE, serverSources, searchPhotos, fetchPhoto, stockKeys, setStockKey, ICON_SETS, MULTICOLOR, searchIcons, iconPreviewUrl, iconifySrc } from '../lib/stock.js';
import { ensureFonts, fontsReady, PALETTE, GRADIENTS, gradientCss, canvasGradient, ICONS, iconSrc, SIZES, loadBrand, saveBrand, saveDraft } from '../lib/design.js';

const PDF = '.pdf,application/pdf';
const FONTS = {
  sans: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', asc: 0.945, std: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'] },
  serif: { css: '"Times New Roman", Times, "Liberation Serif", serif', asc: 0.9375, std: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'] },
  mono: { css: '"Courier New", Courier, "Liberation Mono", monospace', asc: 0.866, std: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }
};
const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Caveat', 'Sacramento'];

const MODES = {
  edit: {
    tools: ['select', '|', 'edittext', 'editimage', 'imgtext', '|', 'text', 'image', 'signature', 'rect', 'ellipse', 'line', 'arrow', 'pen', 'highlight', 'whiteout'],
    save: 'Save PDF', suffix: '-edited', start: 'select'
  },
  sign: { tools: ['select', '|', 'signature', 'initials', 'text', 'date', 'check', 'image'], save: 'Sign & download', suffix: '-signed', start: 'signature' },
  redact: { tools: ['select', '|', 'redact', 'whiteout'], save: 'Apply redactions', suffix: '-redacted', start: 'redact' },
  images: { tools: ['select', '|', 'editimage', 'imgtext', 'image'], save: 'Save PDF', suffix: '-edited', start: 'editimage' },
  forms: { tools: ['select', '|', 'textfield', 'checkbox', 'text'], save: 'Save fillable PDF', suffix: '-fillable', start: 'textfield' },
  design: { tools: ['select', '|', 'text', 'image', 'rect', 'ellipse', 'line', 'arrow', 'pen', '|', 'brush', 'perase'], save: 'Download', suffix: '-design', start: 'select' }
};

const TOOL_INFO = {
  select: ['cursor', 'Select & move (V)'],
  edittext: ['textedit', 'Edit existing text'],
  editimage: ['imgedit', 'Edit existing images'],
  imgtext: ['ocr', 'Edit text inside images & scans'],
  text: ['text', 'Add text (T)'],
  image: ['image', 'Add image'],
  signature: ['sign', 'Signature'],
  initials: ['edit', 'Initials'],
  date: ['calendar', 'Date'],
  check: ['check', 'Check mark'],
  rect: ['rect', 'Rectangle'],
  ellipse: ['ellipse', 'Ellipse'],
  line: ['line', 'Line'],
  arrow: ['arrow', 'Arrow'],
  pen: ['pen', 'Draw'],
  brush: ['brush', 'Brush (B)'],
  perase: ['eraser', 'Eraser (E)'],
  highlight: ['highlight', 'Highlighter'],
  whiteout: ['eraser', 'White-out (cover content)'],
  redact: ['redact', 'Redact area'],
  textfield: ['field', 'Text field'],
  checkbox: ['checkbox', 'Checkbox field']
};

const HINTS = {
  select: 'Click an item to select it. Drag to move, use the corner handle to resize. Double-click text to edit it.',
  edittext: 'Existing text is outlined in purple. Click any line to change its wording, font, size or colour. On save the original words are removed from the file, not just covered.',
  editimage: 'Images in the PDF are outlined in blue. Click one to move, resize, crop, recolour, replace, erase parts of it or delete it.',
  imgtext: 'Click an image or a scanned page. EditSupreme reads the words in it; then click any highlighted line to retype it. The old letters are erased and the background is rebuilt.',
  text: 'Click on the page where the text should go, then type.',
  rect: 'Drag on the page to draw.', ellipse: 'Drag on the page to draw.', line: 'Drag on the page to draw.', arrow: 'Drag on the page to draw.',
  pen: 'Draw freely with mouse, finger or stylus.',
  brush: 'Paint on the selected photo or paint layer. With nothing selected, a new paint layer is made for you. If the layer has a mask and "Paint on the mask" is on, you paint the mask instead.',
  perase: 'Erase parts of the selected photo or paint layer. On a mask, the eraser brings hidden parts back.',
  highlight: 'Drag across text to highlight it.',
  whiteout: 'Drag over anything you want to hide behind a solid box.',
  redact: 'Drag over areas to black them out, or search for words on the right. On save, redacted pages are flattened so the hidden content is really gone.',
  textfield: 'Drag to place a fillable text box.', checkbox: 'Click to place a fillable checkbox.',
  signature: 'Create your signature, then click where it should go.', initials: 'Create your initials, then click where they should go.',
  date: 'Click to place today\'s date.', check: 'Click to place a check mark.'
};

let uid = 1;
const nid = () => 'o' + uid++;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function mountEditor(el, file, ctx, modeName = 'edit', opts = {}) {
  if (modeName === 'layers') modeName = 'design'; // Image to layers opens in the Design Studio editor
  const designMode = modeName === 'design';
  const mode = MODES[modeName];
  let bytes = await readBytes(file);
  let view;
  try { view = await openPdfjs(bytes); }
  catch (e) {
    if (e.name !== 'PasswordException') throw e;
    const pw = await askPassword();
    if (pw == null) { ctx.restart(); return; }
    const unlocked = await PDFDocument.load(bytes, { password: pw }).catch(() => null);
    if (!unlocked) { toast('Wrong password'); ctx.restart(); return; }
    bytes = await unlocked.save();
    view = await openPdfjs(bytes);
  }

  // ---------- state ----------
  const pages = [];
  let zoom = 1, tool = mode.start, sel = null, editing = null, pending = null;
  // Text living inside an image: sub = selected item, subEditing = item being typed, imgMode = 'erase' | 'addtext'
  let sub = null, subEditing = null, imgMode = null;
  let ocrLang = 'eng', scanHinted = false, autosaveTimer = null;
  // Design Studio: side panel tab, brush settings, and whether the brush paints a layer's mask.
  let sideTab = 'props', maskEdit = false, clipTimer = null;
  const ver = new WeakMap(), clipCache = new WeakMap(); // layer versions and cached clip masks
  const brush = { size: 40, color: '#d7191f', opacity: 100, soft: 0, maskPaint: 'hide' };
  const selectLike = () => ['select', 'edittext', 'editimage', 'imgtext'].includes(tool);
  const undoStack = [], redoStack = [];
  const style = { color: '#1d2321', size: 16, font: 'sans', bold: false, italic: false, stroke: '#c2412d', fill: '', sw: 2, opacity: 100, hl: '#ffe14d' };

  // ---------- layout ----------
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar' });
  const area = h('div', { class: 'canvasarea' });
  const side = h('div', { class: 'wsside' });
  const status = h('span', { class: 'status' });
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, mode.save);
  const foot = h('div', { class: 'wsfoot' }, status, h('div', { class: 'grow', style: { flex: 1 } }),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (!hasChanges() || confirm('Discard your changes?')) ctx.restart(); } }, 'Cancel'), saveBtn);
  const ws = h('div', { class: 'ws' + (designMode ? ' design' : '') }, h('div', { class: 'wsmain' }, toolbar, area, foot), side);
  // Always one click (or Esc) away from Select & move.
  const backChip = h('button', { class: 'backsel hidden', type: 'button', onclick: () => setTool('select') }, h('span', { html: icon('cursor') }), 'Back to Select & move', h('span', { class: 'kbd' }, 'Esc'));
  const chipBar = h('div', { class: 'chipbar' }, backChip);
  el.replaceChildren(ws);

  const hasChanges = () => pages.some((p) => p.objs.length);
  const beforeUnload = (e) => { if (!designMode && hasChanges()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('hashchange', () => window.removeEventListener('beforeunload', beforeUnload), { once: true });

  function drawToolbar() {
    toolbar.replaceChildren();
    if (designMode) toolbar.append(h('button', { class: 'btn small', type: 'button', title: 'Start a new project', onclick: () => newProject() }, h('span', { html: icon('plus') }), 'New'), h('span', { class: 'sep' }));
    const LABELS = { select: 'Select', text: 'Text', image: 'Image', brush: 'Brush', perase: 'Eraser' };
    for (const t of mode.tools) {
      if (t === '|') { toolbar.append(h('span', { class: 'sep' })); continue; }
      const [ic, title] = TOOL_INFO[t];
      if (designMode && LABELS[t]) toolbar.append(h('button', { class: 'tbtn' + (tool === t ? ' active' : ''), type: 'button', title, 'aria-label': title, onclick: () => setTool(t) }, h('span', { html: icon(ic) }), h('span', {}, LABELS[t])));
      else toolbar.append(ibtn(ic, title, () => setTool(t), tool === t ? 'active' : ''));
    }
    backChip.classList.toggle('hidden', !designMode || tool === 'select');
    toolbar.append(h('span', { class: 'sep' }),
      ibtn('undo', 'Undo (Ctrl+Z)', undo), ibtn('redo', 'Redo (Ctrl+Y)', redo),
      h('span', { class: 'sep' }),
      ibtn('zoomout', 'Zoom out', () => setZoom(zoom / 1.2)),
      h('span', { class: 'lbl' }, Math.round(zoom * 100) + '%'),
      ibtn('zoomin', 'Zoom in', () => setZoom(zoom * 1.2)),
      designMode ? h('button', { class: 'btn small ghost', type: 'button', title: 'Fit the whole canvas on screen', onclick: () => setZoom(fitZoom()) }, 'Fit') : null,
      designMode ? h('span', { class: 'grow' }) : null,
      designMode ? h('button', { class: 'tbtn' + (sideTab === 'layers' ? ' active' : ''), type: 'button', title: 'Layers', onclick: () => { sideTab = sideTab === 'layers' ? 'props' : 'layers'; drawSide(); drawToolbar(); } }, h('span', { html: icon('layers') }), h('span', {}, 'Layers')) : null);
  }

  async function setTool(t) {
    if (editing) finishEditing();
    if (subEditing) finishSubEditing();
    tool = t;
    pending = null;
    imgMode = null;
    sub = null;
    // Brush and eraser keep the selected layer: that is what they paint on.
    if (!((t === 'brush' || t === 'perase') && sel?.o?.type === 'image')) select(null);
    if (t === 'image') {
      const [f] = await pickFiles('image/*', false);
      tool = 'select';
      if (f) placeImageFile(f, visiblePage());
    } else if (t === 'signature' || t === 'initials') {
      const src = await signatureDialog(t === 'initials' ? 'Your initials' : 'Your signature');
      if (src) { pending = { type: 'image', src, sig: true, ratio: await imgRatio(src), w: t === 'initials' ? 70 : 150 }; toast('Click on the page to place it'); }
      else tool = 'select';
    }
    drawToolbar();
    for (const p of pages) { p.overlay.style.cursor = cursorFor(); refreshExisting(p); }
    drawSide();
  }
  const cursorFor = () => (tool === 'select' ? 'default' : selectLike() ? 'pointer' : 'crosshair');

  // ---------- pages ----------
  for (let i = 1; i <= view.numPages; i++) {
    const page = await view.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const canvas = h('canvas', { class: 'bg' });
    const overlay = h('div', { class: 'overlay' });
    const wrap = h('div', { class: 'pagewrap', 'data-i': i - 1 }, canvas, overlay, designMode ? h('span', { class: 'pagesize' }, `Canvas ${Math.round(vp.width)} × ${Math.round(vp.height)} px`) : h('span', { class: 'pnum' }, `${i} / ${view.numPages}`));
    const p = { i: i - 1, page, vp, canvas, overlay, wrap, objs: [], rendered: 0, runs: null, imgs: null, existingEls: [] };
    pages.push(p);
    area.append(wrap);
    bindOverlay(p);
  }
  if (designMode) area.prepend(chipBar);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { const p = pages[+e.target.dataset.i]; if (p.rendered !== zoom) renderBg(p); }
  }, { root: area, rootMargin: '600px' });
  pages.forEach((p) => io.observe(p.wrap));

  if (opts.initial) for (const p of pages) p.objs = (opts.initial[p.i] || []).map((o) => ({ id: nid(), ...o }));
  for (const p of pages) p.groups = {};
  if (opts.groups) pages[0].groups = JSON.parse(JSON.stringify(opts.groups));

  // Designs are seen whole (tall stories and posters fit the screen height too); PDFs fit the width.
  const fitZoom = () => designMode
    ? clamp(Math.min((area.clientWidth - 48) / pages[0].vp.width, (Math.max(320, Math.min(area.clientHeight, innerHeight * 0.78)) - 32) / pages[0].vp.height), 0.05, 2.2)
    : clamp((area.clientWidth - 48) / Math.max(...pages.map((p) => p.vp.width)), 0.3, 2.2);
  setZoom(fitZoom(), true);
  let brand = loadBrand();
  if (designMode) {
    // Sizes scale with the canvas, so a 1080 px post and an A4 poster both get sensible defaults.
    ensureFonts();
    const W = pages[0].vp.width;
    Object.assign(style, { size: Math.round(W / 16), color: '#14213d', family: brand.body || 'Poppins', stroke: '#14213d', fill: '#d7191f', sw: Math.max(2, Math.round(W / 300)) });
    fontsReady(pages[0].objs).then(() => pages.forEach((p) => p.objs.forEach((o) => o.type === 'text' && rerender(p, o))));
    autosave();
  }

  async function renderBg(p) {
    const z = zoom;
    p.rendered = z;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tmp = await renderPage(p.page, z * dpr);
    if (p.rendered !== z) return;
    p.canvas.width = tmp.width; p.canvas.height = tmp.height;
    p.canvas.getContext('2d').drawImage(tmp, 0, 0);
  }

  function setZoom(z, first) {
    const before = area.scrollTop / Math.max(1, area.scrollHeight);
    zoom = clamp(z, 0.25, 4);
    for (const p of pages) {
      p.wrap.style.width = p.vp.width * zoom + 'px';
      p.wrap.style.height = p.vp.height * zoom + 'px';
      p.rendered = 0;
      layoutObjs(p);
      refreshExisting(p);
    }
    if (!first) area.scrollTop = before * area.scrollHeight;
    pages.forEach((p) => { const r = p.wrap.getBoundingClientRect(), a = area.getBoundingClientRect(); if (r.bottom > a.top - 600 && r.top < a.bottom + 600) renderBg(p); });
    drawToolbar();
  }

  function visiblePage() {
    const a = area.getBoundingClientRect();
    let best = pages[0], bestD = Infinity;
    for (const p of pages) { const r = p.wrap.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - (a.top + a.bottom) / 2); if (d < bestD) { bestD = d; best = p; } }
    return best;
  }

  // ---------- history ----------
  const snap = () => pages.map((p) => ({ groups: JSON.parse(JSON.stringify(p.groups || {})), objs: p.objs.map((o) => ({ ...o, points: o.points?.map((q) => [...q]), filters: o.filters && { ...o.filters }, cover: o.cover && { ...o.cover }, texts: o.texts?.map((t) => ({ ...t })), ocr: o.ocr?.slice(), pics: o.pics?.slice(), shadow: o.shadow && { ...o.shadow }, outline: o.outline && { ...o.outline } })) }));
  function commit() { undoStack.push(snap()); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; autosave(); }
  // Design Studio keeps the latest design on this device, so closing the tab loses nothing.
  function autosave() {
    if (!designMode) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveDraft({ W: pages[0].vp.width, H: pages[0].vp.height, name: opts.name || 'design', sizeId: opts.sizeId, objs: pages[0].objs, groups: pages[0].groups }), 1500);
  }
  function restore(s) { pages.forEach((p, i) => { p.objs = s[i].objs; p.groups = s[i].groups; layoutObjs(p); }); select(null); }
  function undo() { if (editing) finishEditing(); if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); }

  // ---------- object rendering ----------
  function layoutObjs(p) {
    p.overlay.querySelectorAll('.obj, .cover').forEach((n) => n.remove());
    for (const o of p.objs) { if (o.cover) p.overlay.append(coverEl(o)); p.overlay.append(objEl(p, o)); }
    scheduleClips(p);
  }

  // "Clip to the layer below": the layer only shows where the nearest unclipped layer under it is painted.
  const clipBase = (p, o) => { let j = p.objs.indexOf(o) - 1; while (j >= 0 && p.objs[j].clipBelow) j--; return j >= 0 ? p.objs[j] : null; };
  function scheduleClips(p) { if (!designMode) return; clearTimeout(clipTimer); clipTimer = setTimeout(() => updateClips(p), 40); }
  async function updateClips(p) {
    const W = p.vp.width, H = p.vp.height, z = zoom;
    for (const o of p.objs) {
      const n = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
      if (!n) continue;
      const base = o.clipBelow ? clipBase(p, o) : null;
      if (!base) { if (n.dataset.clipped) { setMask(n, null); delete n.dataset.clipped; } continue; }
      let c = clipCache.get(base);
      const v = ver.get(base) || 0;
      if (!c || c.v !== v) {
        const s = Math.min(1, 900 / Math.max(W, H));
        const cv = await renderDesign([{ ...base, hidden: false, opacity: 100 }], W, H, s, null);
        c = { v, url: cv.toDataURL('image/png') };
        clipCache.set(base, c);
      }
      const b = bbox(o);
      setMask(n, c.url, `${W * z}px ${H * z}px`, `${-b.x * z}px ${-b.y * z}px`);
      n.dataset.clipped = '1';
      if (base.hidden) n.style.visibility = 'hidden';
    }
  }

  // Hides the original content underneath edited text/images; stays put when the object is moved.
  function coverEl(o) {
    const c = o.cover, z = zoom;
    return h('div', { class: 'cover', 'data-for': o.id, style: { position: 'absolute', pointerEvents: 'none', background: c.color, left: c.x * z + 'px', top: c.y * z + 'px', width: c.w * z + 'px', height: c.h * z + 'px' } });
  }

  function objEl(p, o) {
    const z = zoom;
    const e = h('div', { class: 'obj ' + o.type + (sel && sel.o === o ? ' sel' : ''), 'data-id': o.id });
    const box = bbox(o);
    Object.assign(e.style, { left: box.x * z + 'px', top: box.y * z + 'px', width: box.w * z + 'px', height: box.h * z + 'px', opacity: (o.opacity ?? 100) / 100 });
    // Layers: hidden ones aren't shown; locked ones can't be clicked (clicks go through to what's below).
    if (o.hidden) e.style.visibility = 'hidden';
    if (o.locked && !(sel && sel.o === o)) e.style.pointerEvents = 'none';
    if (o.rot) e.style.transform = `rotate(${o.rot}deg)`;
    if (o.type === 'text') {
      Object.assign(e.style, { fontFamily: fontCssOf(o), fontSize: o.size * z + 'px', fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? 'italic' : 'normal', color: o.color, textAlign: o.align || 'left', width: 'auto', height: 'auto', minWidth: '4px', letterSpacing: (o.ls || 0) * z + 'px' });
      if (o.lh) e.style.lineHeight = o.lh;
      if (o.shadow) e.style.textShadow = `${o.shadow.x * z}px ${o.shadow.y * z}px ${o.shadow.blur * z}px ${o.shadow.color}`;
      if (o.outline) { e.style.webkitTextStroke = `${o.outline.width * z}px ${o.outline.color}`; e.style.paintOrder = 'stroke fill'; }
      e.textContent = o.text;
    } else if (o.type === 'image') {
      if (o.deleted) { e.style.display = 'none'; return e; }
      const imgEl = h('img', { src: o.src, alt: '', draggable: 'false', style: { filter: cssFilter(o.filters), transform: o.flipX ? 'scaleX(-1)' : '' } });
      if (o.mask) setMask(imgEl, o.mask);
      if (o.clip && o.natW) {
        // Picture frame: the image is clipped to the shape (the selection handle stays outside the clip).
        const L = frameLayout(o);
        Object.assign(imgEl.style, { position: 'absolute', left: L.x * z + 'px', top: L.y * z + 'px', width: L.w * z + 'px', height: L.h * z + 'px', maxWidth: 'none' });
        e.append(h('div', { class: 'frame', style: { position: 'absolute', inset: 0, overflow: 'hidden', clipPath: clipPathCss(o.clip, box.w * z, box.h * z) } }, imgEl));
        if (o.frameSw) {
          const pts = clipPolygon(o.clip, box.w * z, box.h * z).map((q) => q.join(',')).join(' ');
          e.append(h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' }, html: `<svg width="100%" height="100%" style="overflow:visible"><polygon points="${pts}" fill="none" stroke="${o.frameStroke}" stroke-width="${o.frameSw * z}" stroke-linejoin="round"/></svg>` }));
        }
      } else e.append(imgEl);
      if (o.natW && !o.clip && (o.texts?.length || o.ocr?.length || o.pics?.length || imgMode)) {
        const s = (o.w * z) / o.natW;
        const clip = h('div', { class: 'imgclip' });
        if (o.showOcr !== false) (o.ocr || []).forEach((l, k) => clip.append(h('div', { class: 'ocrbox', 'data-line': k, title: 'Click to edit: ' + l.text, style: { left: l.bbox.x0 * s + 'px', top: l.bbox.y0 * s + 'px', width: (l.bbox.x1 - l.bbox.x0) * s + 'px', height: (l.bbox.y1 - l.bbox.y0) * s + 'px' } })));
        for (const t of o.texts || []) {
          clip.append(h('span', { class: 'imgtext' + (sub && sub.t.id === t.id ? ' sel' : ''), 'data-tid': t.id, style: {
            left: t.x * s + 'px', top: t.y * s + 'px', fontFamily: fontCssOf(t), fontSize: t.size * s + 'px', fontWeight: t.bold ? 700 : 400,
            fontStyle: t.italic ? 'italic' : 'normal', color: t.color, letterSpacing: (t.ls || 0) * s + 'px', textAlign: t.align || 'left', opacity: (t.opacity ?? 100) / 100
          } }, t.text));
        }
        (o.pics || []).forEach((b, k) => clip.append(h('div', { class: 'picbox' + (b.shape === 'ellipse' ? ' round' : ''), 'data-pic': k, title: 'Picture: click to select it on its own (then replace, delete or move it)', style: { left: b.x0 * s + 'px', top: b.y0 * s + 'px', width: (b.x1 - b.x0) * s + 'px', height: (b.y1 - b.y0) * s + 'px' } })));
        if (imgMode) clip.style.cursor = 'crosshair';
        e.append(clip);
      }
    } else if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'whiteout') {
      Object.assign(e.style, {
        border: o.type === 'whiteout' ? 'none' : `${o.sw * z}px solid ${o.stroke}`, borderRadius: o.type === 'ellipse' ? '50%' : (o.radius || 0) * z + 'px',
        background: o.type === 'whiteout' ? o.fill || '#ffffff' : o.grad ? gradientCss(o.grad) : o.fill || 'transparent', boxSizing: 'border-box'
      });
    } else if (o.type === 'line' || o.type === 'arrow' || o.type === 'path') {
      const pts = o.points.map(([x, y]) => [(x - box.x) * z, (y - box.y) * z]);
      const d = 'M' + pts.map((q) => q.join(' ')).join(' L');
      const sw = o.sw * z;
      let arrow = '';
      if (o.type === 'arrow') {
        const [a, b] = pts; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const L = Math.max(10, o.sw * 4) * z;
        arrow = `<path d="M${b[0] - L * Math.cos(ang - 0.45)} ${b[1] - L * Math.sin(ang - 0.45)} L${b[0]} ${b[1]} L${b[0] - L * Math.cos(ang + 0.45)} ${b[1] - L * Math.sin(ang + 0.45)}" />`;
      }
      e.innerHTML = `<svg width="${box.w * z}" height="${box.h * z}" style="overflow:visible"><g fill="none" stroke="${o.stroke}" stroke-width="${sw}" stroke-linecap="${o.hl ? 'butt' : 'round'}" stroke-linejoin="round"${o.hl ? ' style="mix-blend-mode:multiply"' : ''}><path d="${d}"/>${arrow}</g></svg>`;
    } else if (o.type === 'redact') {
      // styled by CSS
    } else if (o.type === 'field') {
      e.textContent = o.kind === 'checkbox' ? '☐' : o.name;
    }
    if (sel && sel.o === o && o.type !== 'line' && o.type !== 'arrow' && o.type !== 'path') e.append(h('div', { class: 'h', 'data-handle': '1' }));
    return e;
  }

  function bbox(o) {
    if (o.points) {
      const xs = o.points.map((q) => q[0]), ys = o.points.map((q) => q[1]);
      const pad = o.sw / 2 + (o.type === 'arrow' ? o.sw * 4 : 0);
      return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
    }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  }

  function select(s) {
    const prev = sel?.o;
    sel = s;
    if (prev && prev !== s?.o) {
      if (!(s?.o?.mask)) maskEdit = false;
      // Leaving an image: drop its sub-selection and tool mode.
      const hadUi = sub || imgMode;
      sub = null; imgMode = null;
      if (hadUi) { const pp = pages.find((q) => q.objs.includes(prev)); if (pp) rerender(pp, prev); }
    }
    for (const p of pages) p.overlay.querySelectorAll('.obj').forEach((n) => {
      const on = s && n.dataset.id === s.o.id;
      n.classList.toggle('sel', !!on);
      n.querySelector(':scope > .h')?.remove();
      if (on && !s.o.points) n.append(h('div', { class: 'h', 'data-handle': '1' }));
    });
    drawGroupSel();
    drawSide();
  }

  const findObj = (p, id) => p.objs.find((o) => o.id === id);

  // ---------- groups ----------
  // A group is {id, name, parent}; an object belongs to its innermost group through o.gid. Groups nest.
  // A selected group (or a multi-selection) is a proxy {type: 'group', gid} / {type: 'group', items: [...]}.
  const G = (p) => (p.groups ||= {});
  const gproxy = (gid) => ({ type: 'group', gid, id: 'g:' + gid });
  function chainOf(p, o) {
    const c = [], seen = new Set();
    let g = o.gid;
    while (g && G(p)[g] && !seen.has(g)) { seen.add(g); c.unshift(g); g = G(p)[g].parent; }
    return c; // outermost first
  }
  const topItem = (p, o) => { const c = chainOf(p, o); return c.length ? gproxy(c[0]) : o; };
  function membersOf(p, it) {
    if (!it) return [];
    if (it.type !== 'group') return [it];
    if (it.items) return [...new Set(it.items.flatMap((x) => membersOf(p, x)))].sort((a, b) => p.objs.indexOf(a) - p.objs.indexOf(b));
    return p.objs.filter((o) => chainOf(p, o).includes(it.gid));
  }
  const sameItem = (a, b) => a === b || (a?.type === 'group' && b?.type === 'group' && !!a.gid && a.gid === b.gid);
  const isGroupSel = () => sel?.o?.type === 'group';
  function boxOf(objs) {
    if (!objs.length) return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of objs) { const b = bbox(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function drawGroupSel() {
    for (const q of pages) q.overlay.querySelectorAll('.gsel').forEach((n) => n.remove());
    if (!isGroupSel()) return;
    const b = boxOf(membersOf(sel.p, sel.o)), z = zoom;
    sel.p.overlay.append(h('div', { class: 'gsel' + (sel.o.items ? ' multi' : ''), style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' } }, h('div', { class: 'h gh', 'data-ghandle': '1' })));
  }
  // Remember members' geometry, then move or scale them all together.
  const geom = (m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, points: m.points?.map((q) => [...q]), size: m.size, ls: m.ls, sw: m.sw, radius: m.radius, frameSw: m.frameSw, shadow: m.shadow && { ...m.shadow }, outline: m.outline && { ...m.outline } });
  function scaleFrom(m, o, ox, oy, k) {
    if (o.points) m.points = o.points.map(([x, y]) => [ox + (x - ox) * k, oy + (y - oy) * k]);
    else { m.x = ox + (o.x - ox) * k; m.y = oy + (o.y - oy) * k; m.w = o.w * k; m.h = o.h * k; }
    for (const key of ['size', 'ls', 'sw', 'radius', 'frameSw']) if (o[key] != null) m[key] = o[key] * k;
    if (o.shadow) m.shadow = { ...o.shadow, blur: o.shadow.blur * k, x: o.shadow.x * k, y: o.shadow.y * k };
    if (o.outline) m.outline = { ...o.outline, width: o.outline.width * k };
  }
  // Keep each group's members next to each other in the stacking order (needed for the layer tree).
  function packGroup(p, gid) {
    const mem = p.objs.filter((o) => chainOf(p, o).includes(gid));
    if (mem.length < 2) return;
    const top = p.objs.indexOf(mem[mem.length - 1]);
    const below = p.objs.filter((o, i) => i < top && !mem.includes(o)).length;
    p.objs = p.objs.filter((o) => !mem.includes(o));
    p.objs.splice(below, 0, ...mem);
  }
  function groupItems(p, items) {
    items = items.filter(Boolean);
    if (items.length < 2) { toast('Select two or more items to group (Shift+click or drag a box around them).'); return; }
    commit();
    const parents = items.map((it) => (it.type === 'group' ? G(p)[it.gid]?.parent : it.gid) || null);
    const parent = parents.every((x) => x === parents[0]) ? parents[0] : null;
    const id = 'g' + nid();
    const n = Object.keys(G(p)).length + 1;
    G(p)[id] = { id, name: 'Group ' + n, parent };
    for (const it of items) { if (it.type === 'group') G(p)[it.gid].parent = id; else it.gid = id; }
    packGroup(p, id);
    layoutObjs(p);
    select({ p, o: gproxy(id) });
  }
  function ungroup(p, gid) {
    const g = G(p)[gid];
    if (!g) return;
    commit();
    for (const o of p.objs) if (o.gid === gid) o.gid = g.parent || undefined;
    for (const k of Object.keys(G(p))) if (G(p)[k].parent === gid) G(p)[k].parent = g.parent;
    delete G(p)[gid];
    layoutObjs(p);
    select(null);
  }
  // Copy a group with everything inside it (nested groups get new ids too).
  function duplicateItem(p, it, dx = 12, dy = 12) {
    const mem = membersOf(p, it);
    const map = {};
    const newGid = (old) => { if (!old) return old; if (!map[old]) { map[old] = 'g' + nid(); } return map[old]; };
    const inside = (gid) => it.type === 'group' && it.gid && (gid === it.gid || chainOfGroup(p, gid).includes(it.gid));
    for (const gid of Object.keys(G(p))) if (inside(gid)) { const ng = newGid(gid); G(p)[ng] = { ...G(p)[gid], id: ng, name: G(p)[gid].name + ' copy', parent: gid === it.gid ? G(p)[gid].parent : newGid(G(p)[gid].parent) }; }
    const copies = mem.map((o) => {
      const c = { ...o, id: nid(), filters: o.filters && { ...o.filters }, cover: undefined, orig: undefined, texts: o.texts?.map((t) => ({ ...t, id: nid() })), points: o.points?.map(([x, y]) => [x + dx, y + dy]), gid: inside(o.gid) ? newGid(o.gid) : o.gid };
      if (!c.points) { c.x += dx; c.y += dy; }
      return c;
    });
    p.objs.push(...copies);
    return it.type === 'group' && it.gid ? gproxy(map[it.gid]) : copies[0];
  }
  function chainOfGroup(p, gid) { const c = []; let g = G(p)[gid]?.parent; const seen = new Set(); while (g && !seen.has(g)) { seen.add(g); c.push(g); g = G(p)[g]?.parent; } return c; }
  function rerender(p, o) {
    ver.set(o, (ver.get(o) || 0) + 1);
    scheduleClips(p);
    const old = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
    const n = objEl(p, o);
    if (old) old.replaceWith(n); else p.overlay.append(n);
    const oldCover = p.overlay.querySelector(`.cover[data-for="${o.id}"]`);
    if (o.cover) { const c = coverEl(o); oldCover ? oldCover.replaceWith(c) : n.before(c); } else oldCover?.remove();
    if (o.type === 'text') measureText(p, o, n);
    if (isGroupSel()) drawGroupSel();
    return n;
  }
  function measureText(p, o, n) {
    o.w = n.offsetWidth / zoom;
    o.h = n.offsetHeight / zoom;
  }

  // ---------- pointer handling ----------
  function bindOverlay(p) {
    const ov = p.overlay;
    ov.style.cursor = cursorFor();
    const pt = (e) => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]; };
    let drag = null;

    ov.addEventListener('dblclick', (e) => {
      const n = e.target.closest('.obj');
      const o = n && findObj(p, n.dataset.id);
      const it = e.target.closest('.imgtext');
      if (it && o) { const t = o.texts.find((q) => q.id === it.dataset.tid); if (t) startSubEditing(p, o, t); return; }
      if (o && isGroupSel() && sel.o.gid) {
        // Double-click inside a selected group: select the next level down (a sub-group or the item itself).
        const chain = chainOf(p, o), i = chain.indexOf(sel.o.gid);
        if (i >= 0) { select({ p, o: chain[i + 1] ? gproxy(chain[i + 1]) : o }); return; }
      }
      if (o?.type === 'text') startEditing(p, o);
    });

    ov.addEventListener('pointerdown', async (e) => {
      if (e.button > 0) return;
      const [x, y] = pt(e);
      const objNode = e.target.closest('.obj');
      const itNode = e.target.closest('.imgtext');
      if (editing && objNode && objNode.dataset.id === editing.o.id) return; // typing inside the text box
      if (subEditing && itNode && itNode.dataset.tid === subEditing.t.id) return;
      if (editing) finishEditing();
      if (subEditing) finishSubEditing();

      // Resize handle of a selected group or multi-selection.
      if (e.target.dataset.ghandle && isGroupSel()) {
        e.preventDefault();
        commit();
        const members = membersOf(p, sel.o);
        drag = { kind: 'gresize', o: sel.o, members, orig: new Map(members.map((m) => [m, geom(m)])), box: boxOf(members), start: [x, y], moved: false };
        ov.setPointerCapture(e.pointerId);
        return;
      }

      if (designMode && (tool === 'brush' || tool === 'perase')) { e.preventDefault(); await startPaint(p, e, x, y); return; }

      // ----- content inside an image -----
      const imgObj = objNode && findObj(p, objNode.dataset.id);
      if (imgObj?.type === 'image') {
        const toImg = (px, py) => [(px - imgObj.x) * imgObj.natW / imgObj.w, (py - imgObj.y) * imgObj.natH / imgObj.h];
        const ocrNode = e.target.closest('.ocrbox');
        if (ocrNode) { e.preventDefault(); await editOcrLine(p, imgObj, +ocrNode.dataset.line); return; }
        const picNode = e.target.closest('.picbox');
        if (picNode) { e.preventDefault(); await separatePicture(p, imgObj, +picNode.dataset.pic); return; }
        if (itNode) {
          const t = imgObj.texts.find((q) => q.id === itNode.dataset.tid);
          if (t) {
            e.preventDefault();
            selectSub(p, imgObj, t);
            commit();
            drag = { kind: 'submove', o: imgObj, t, start: [x, y], orig: { x: t.x, y: t.y }, moved: false };
            ov.setPointerCapture(e.pointerId);
            return;
          }
        }
        if (imgMode && sel?.o === imgObj && !e.target.dataset.handle) {
          e.preventDefault();
          if (imgMode === 'addtext') {
            commit();
            const [ix, iy] = toImg(x, y);
            const size = style.size * imgObj.natW / imgObj.w;
            const t = { id: nid(), text: '', x: ix, y: iy - size * 0.6, size, color: style.color, font: style.font, bold: style.bold, italic: style.italic, ls: 0, align: 'left' };
            imgObj.texts = [...(imgObj.texts || []), t];
            imgMode = null;
            rerender(p, imgObj);
            startSubEditing(p, imgObj, t);
            return;
          }
          const box = h('div', { class: 'erasebox' });
          ov.append(box);
          drag = { kind: 'erase', o: imgObj, start: [x, y], box, toImg };
          ov.setPointerCapture(e.pointerId);
          return;
        }
        if (tool === 'imgtext' && !imgObj.ocr && !imgObj.deleted) { select({ p, o: imgObj }); detectText(p, imgObj); return; }
      }

      if (pending) {
        commit();
        const w = pending.w, hh = w / pending.ratio;
        const o = { id: nid(), type: 'image', src: pending.src, x: x - w / 2, y: y - hh / 2, w, h: hh, opacity: 100, filters: {}, sig: true };
        p.objs.push(o); rerender(p, o); select({ p, o });
        pending = null; tool = 'select'; drawToolbar(); p.overlay.style.cursor = cursorFor();
        return;
      }
      const existing = e.target.closest('.existing');
      if (existing) {
        e.preventDefault();
        const o = await convertExisting(p, existing.dataset.kind, +existing.dataset.k);
        if (o && tool === 'imgtext') detectText(p, o);
        return;
      }

      if (objNode && (selectLike() || objNode.classList.contains('sel'))) {
        const o = findObj(p, objNode.dataset.id);
        if (!o) return;
        if (designMode && e.shiftKey) {
          // Shift+click adds or removes items from a multi-selection.
          const it = topItem(p, o);
          const cur = !sel ? [] : sel.o.items ? sel.o.items.slice() : [sel.o];
          const at = cur.findIndex((c) => sameItem(c, it));
          if (at >= 0) cur.splice(at, 1); else cur.push(it);
          select(cur.length ? { p, o: cur.length === 1 ? cur[0] : { type: 'group', items: cur, id: 'multi' } } : null);
          e.preventDefault();
          return;
        }
        // In a group, a click selects the whole group (Ctrl/Cmd+click picks the item inside directly).
        let target = o;
        if (designMode && !(e.ctrlKey || e.metaKey)) {
          const chain = chainOf(p, o);
          const keep = sel && (sel.o === o || (sel.o.gid && chain.includes(sel.o.gid)) || (sel.o.items && membersOf(p, sel.o).includes(o)));
          if (keep) target = sel.o; else if (chain.length) target = gproxy(chain[0]);
        }
        if (!sel || !sameItem(sel.o, target)) select({ p, o: target });
        if (target.type === 'group') {
          commit();
          const members = membersOf(p, target);
          drag = { kind: 'gmove', o: target, members, orig: new Map(members.map((m) => [m, geom(m)])), start: [x, y], moved: false };
          ov.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
        const handle = e.target.dataset.handle;
        commit();
        drag = { kind: handle ? 'resize' : 'move', o, start: [x, y], orig: { ...bbox(o), points: o.points?.map((q) => [...q]), size: o.size }, moved: false };
        ov.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (selectLike()) {
        if (designMode && tool === 'select') {
          // Drag on empty canvas: select everything inside the box.
          e.preventDefault();
          const box = h('div', { class: 'erasebox marquee' });
          ov.append(box);
          drag = { kind: 'marquee', start: [x, y], box };
          ov.setPointerCapture(e.pointerId);
          return;
        }
        select(null); return;
      }

      e.preventDefault();
      const today = new Date().toLocaleDateString();
      if (tool === 'text' || tool === 'date' || tool === 'check') {
        commit();
        const text = tool === 'date' ? today : tool === 'check' ? '✓' : '';
        const o = { id: nid(), type: 'text', text, x, y: y - style.size * 0.6, w: 10, h: style.size * 1.2, size: tool === 'check' ? 22 : style.size, font: style.font, family: designMode ? style.family : undefined, bold: style.bold, italic: style.italic, color: tool === 'check' ? '#1d4ed8' : style.color, opacity: 100, align: 'left' };
        p.objs.push(o);
        rerender(p, o);
        select({ p, o });
        if (tool === 'text') startEditing(p, o);
        if (modeName !== 'sign') { tool = 'select'; drawToolbar(); pages.forEach((q) => (q.overlay.style.cursor = cursorFor())); }
        return;
      }
      if (tool === 'checkbox') {
        commit();
        const o = { id: nid(), type: 'field', kind: 'checkbox', name: 'check_' + uid, x: x - 7, y: y - 7, w: 14, h: 14 };
        p.objs.push(o); rerender(p, o); select({ p, o });
        return;
      }
      commit();
      let o;
      if (tool === 'pen' || tool === 'highlight') o = { id: nid(), type: 'path', points: [[x, y]], stroke: tool === 'highlight' ? style.hl : style.stroke, sw: tool === 'highlight' ? 14 : style.sw, opacity: tool === 'highlight' ? 45 : style.opacity, hl: tool === 'highlight' };
      else if (tool === 'line' || tool === 'arrow') o = { id: nid(), type: tool, points: [[x, y], [x, y]], stroke: style.stroke, sw: style.sw, opacity: style.opacity };
      else if (tool === 'textfield') o = { id: nid(), type: 'field', kind: 'text', name: 'field_' + uid, x, y, w: 0, h: 0 };
      else o = { id: nid(), type: tool, x, y, w: 0, h: 0, stroke: style.stroke, fill: tool === 'whiteout' ? '#ffffff' : style.fill, sw: style.sw, opacity: tool === 'whiteout' || tool === 'redact' ? 100 : style.opacity };
      p.objs.push(o);
      drag = { kind: 'draw', o, start: [x, y] };
      ov.setPointerCapture(e.pointerId);
      rerender(p, o);
    });

    // Brush outline that follows the pointer.
    const cur = h('div', { class: 'brushcur hidden' });
    ov.append(cur);
    ov.addEventListener('pointermove', (e) => {
      if (!(designMode && (tool === 'brush' || tool === 'perase'))) { cur.classList.add('hidden'); return; }
      const [x, y] = pt(e), d = brush.size * zoom;
      if (!cur.isConnected) ov.append(cur);
      cur.classList.remove('hidden');
      Object.assign(cur.style, { width: d + 'px', height: d + 'px', left: x * zoom - d / 2 + 'px', top: y * zoom - d / 2 + 'px' });
    });
    ov.addEventListener('pointerleave', () => cur.classList.add('hidden'));

    ov.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pt(e);
      const { o } = drag;
      const dx = x - drag.start[0], dy = y - drag.start[1];
      if (drag.kind === 'submove') {
        drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
        drag.t.x = drag.orig.x + dx * o.natW / o.w;
        drag.t.y = drag.orig.y + dy * o.natH / o.h;
        rerender(p, o);
        return;
      }
      if (drag.kind === 'gmove' || drag.kind === 'gresize') {
        drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
        const b = drag.box, k = drag.kind === 'gresize' ? Math.max(0.05, (b.w + dx) / Math.max(1, b.w)) : 1;
        for (const [m, g0] of drag.orig) {
          if (drag.kind === 'gresize') scaleFrom(m, g0, b.x, b.y, k);
          else if (g0.points) m.points = g0.points.map(([a, c]) => [a + dx, c + dy]);
          else { m.x = g0.x + dx; m.y = g0.y + dy; }
          rerender(p, m);
        }
        drawGroupSel();
        return;
      }
      if (drag.kind === 'marquee') {
        const [sx, sy] = drag.start;
        Object.assign(drag.box.style, { left: Math.min(x, sx) * zoom + 'px', top: Math.min(y, sy) * zoom + 'px', width: Math.abs(dx) * zoom + 'px', height: Math.abs(dy) * zoom + 'px' });
        drag.end = [x, y];
        return;
      }
      if (drag.kind === 'erase') {
        const [sx, sy] = drag.start;
        Object.assign(drag.box.style, { left: Math.min(x, sx) * zoom + 'px', top: Math.min(y, sy) * zoom + 'px', width: Math.abs(dx) * zoom + 'px', height: Math.abs(dy) * zoom + 'px' });
        drag.end = [x, y];
        return;
      }
      if (drag.kind === 'move') {
        drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
        if (o.points) o.points = drag.orig.points.map(([a, b]) => [a + dx, b + dy]);
        else { o.x = drag.orig.x + dx; o.y = drag.orig.y + dy; }
      } else if (drag.kind === 'resize') {
        drag.moved = true;
        if (o.type === 'text') {
          o.size = clamp(drag.orig.size * (drag.orig.w + dx) / drag.orig.w, 4, 300);
        } else {
          let w = Math.max(6, drag.orig.w + dx), hh = Math.max(6, drag.orig.h + dy);
          if (o.type === 'image' && !e.shiftKey) hh = w * (drag.orig.h / drag.orig.w); // keep proportions unless Shift
          if (o.type === 'field' && o.kind === 'checkbox') hh = w;
          o.w = w; o.h = hh;
        }
      } else if (drag.kind === 'draw') {
        if (o.type === 'path') { const last = o.points[o.points.length - 1]; if (Math.hypot(x - last[0], y - last[1]) > 1.2) o.points.push([x, y]); }
        else if (o.type === 'line' || o.type === 'arrow') o.points[1] = [x, y];
        else { o.x = Math.min(x, drag.start[0]); o.y = Math.min(y, drag.start[1]); o.w = Math.abs(dx); o.h = Math.abs(dy); }
      }
      rerender(p, o);
    });

    const end = async (e) => {
      if (!drag) return;
      const { o } = drag;
      if (drag.kind === 'submove') {
        if (!drag.moved) undoStack.pop();
        drag = null;
        try { ov.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        return;
      }
      if (drag.kind === 'gmove' || drag.kind === 'gresize') {
        if (!drag.moved) undoStack.pop(); else autosave();
        drag = null;
        try { ov.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        drawSide();
        return;
      }
      if (drag.kind === 'marquee') {
        const d = drag;
        drag = null;
        d.box.remove();
        try { ov.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        if (!d.end) { select(null); return; }
        const r = { x0: Math.min(d.start[0], d.end[0]), y0: Math.min(d.start[1], d.end[1]), x1: Math.max(d.start[0], d.end[0]), y1: Math.max(d.start[1], d.end[1]) };
        const items = [];
        for (const o of p.objs) {
          if (o.locked || o.hidden || o.isBg) continue;
          const b = bbox(o);
          if (b.x >= r.x0 && b.y >= r.y0 && b.x + b.w <= r.x1 && b.y + b.h <= r.y1) { const it = topItem(p, o); if (!items.some((c) => sameItem(c, it))) items.push(it); }
        }
        select(items.length ? { p, o: items.length === 1 ? items[0] : { type: 'group', items, id: 'multi' } } : null);
        return;
      }
      if (drag.kind === 'erase') {
        const d = drag;
        drag = null;
        d.box.remove();
        try { ov.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        if (!d.end) return;
        const [ax, ay] = d.toImg(...d.start), [bx, by] = d.toImg(...d.end);
        const box = { x0: Math.max(0, Math.min(ax, bx)), y0: Math.max(0, Math.min(ay, by)), x1: Math.min(o.natW, Math.max(ax, bx)), y1: Math.min(o.natH, Math.max(ay, by)) };
        if (box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) return;
        commit();
        const c = await srcToCanvas(o.src);
        eraseRegion(c, box, 'all');
        await setSrc(o, c.toDataURL('image/png'));
        o.ocr = o.ocr?.filter((l) => l.bbox.x1 < box.x0 || l.bbox.x0 > box.x1 || l.bbox.y1 < box.y0 || l.bbox.y0 > box.y1);
        rerender(p, o);
        return;
      }
      if (drag.kind === 'draw') {
        const b = bbox(o);
        const tiny = o.type === 'path' ? o.points.length < 2 : o.points ? Math.hypot(o.points[1][0] - o.points[0][0], o.points[1][1] - o.points[0][1]) < 3 : b.w < 3 || b.h < 3;
        if (tiny) {
          if (o.type === 'field' && o.kind === 'text') { Object.assign(o, { x: drag.start[0], y: drag.start[1] - 9, w: 160, h: 20 }); rerender(p, o); select({ p, o }); }
          else { p.objs.splice(p.objs.indexOf(o), 1); undoStack.pop(); layoutObjs(p); }
        } else if (o.type !== 'path' && o.type !== 'redact' && o.type !== 'whiteout') select({ p, o });
      } else if (!drag.moved) undoStack.pop();
      drag = null;
      try { ov.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      drawSide();
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', end);
  }

  // ---------- text editing ----------
  function startEditing(p, o) {
    const n = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
    if (!n) return;
    select({ p, o });
    n.querySelector('.h')?.remove();
    n.contentEditable = 'true';
    n.spellcheck = true;
    n.focus();
    const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    editing = { p, o, n, before: o.text };
    n.addEventListener('input', () => { o.text = n.innerText.replace(/\n$/, ''); measureText(p, o, n); });
    n.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); finishEditing(); } ev.stopPropagation(); });
    n.addEventListener('blur', () => setTimeout(() => editing && editing.o === o && finishEditing(), 120), { once: true });
  }
  function finishEditing() {
    if (!editing) return;
    const { p, o, n } = editing;
    editing = null;
    o.text = n.innerText.replace(/\n$/, '');
    n.contentEditable = 'false';
    if (!o.text.trim() && !o.cover) { p.objs.splice(p.objs.indexOf(o), 1); layoutObjs(p); select(null); return; }
    rerender(p, o);
    select({ p, o });
  }

  // ---------- text inside images ----------
  async function setSrc(o, src) {
    const im = await loadImage(src);
    o.src = src;
    o.natW = im.naturalWidth;
    o.natH = im.naturalHeight;
  }

  function selectSub(p, o, t) {
    sub = t ? { p, o, t } : null;
    if (!sel || sel.o !== o) select({ p, o }); else drawSide();
    rerender(p, o);
  }

  function startSubEditing(p, o, t) {
    selectSub(p, o, t);
    const n = p.overlay.querySelector(`.imgtext[data-tid="${t.id}"]`);
    if (!n) return;
    n.contentEditable = 'true';
    n.spellcheck = true;
    n.focus();
    const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    subEditing = { p, o, t, n };
    n.addEventListener('input', () => { t.text = n.innerText.replace(/\n$/, ''); });
    n.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); finishSubEditing(); } ev.stopPropagation(); });
    n.addEventListener('blur', () => setTimeout(() => subEditing && subEditing.t === t && finishSubEditing(), 120), { once: true });
  }

  function finishSubEditing() {
    if (!subEditing) return;
    const { p, o, t, n } = subEditing;
    subEditing = null;
    t.text = n.innerText.replace(/\n$/, '');
    if (!t.text.trim()) { o.texts = o.texts.filter((q) => q !== t); if (sub?.t === t) sub = null; }
    rerender(p, o);
    drawSide();
  }

  async function detectText(p, o) {
    if (o.ocrBusy) return;
    o.ocrBusy = true;
    o.ocrStatus = 'Starting text recognition…';
    drawSide();
    try {
      const lines = await findText(o.src, ocrLang, (m) => { o.ocrStatus = 'Reading text: ' + m; const st = side.querySelector('[data-ocrstatus]'); if (st) st.textContent = o.ocrStatus; });
      o.ocr = lines;
      o.ocrStatus = lines.length ? '' : 'No text found in this image. Try another language.';
      if (!lines.length) toast('No text found in this image.');
      else toast(`Found ${lines.length} line${lines.length > 1 ? 's' : ''} of text. Click one to edit it.`);
    } catch (e) {
      console.error(e);
      o.ocrStatus = 'Text recognition failed: ' + e.message + ' (it needs internet the first time).';
    }
    o.ocrBusy = false;
    rerender(p, o);
    if (sel?.o === o) drawSide();
  }

  function ocrLineToText(l) {
    return { id: nid(), text: l.text, x: l.bbox.x0, y: l.baseline - ASC[l.font] * l.size, size: l.size, color: l.color, bold: l.bold, italic: l.italic, font: l.font, ls: l.ls, align: 'left' };
  }

  async function editOcrLine(p, o, k, all = false) {
    const lines = all ? o.ocr.slice() : [o.ocr[k]];
    if (!lines[0]) return;
    commit();
    const c = await srcToCanvas(o.src);
    eraseRegion(c, lines.map((l) => l.bbox), 'ink');
    await setSrc(o, c.toDataURL('image/png'));
    const added = lines.map(ocrLineToText);
    o.ocr = all ? [] : o.ocr.filter((_, i) => i !== k);
    o.texts = [...(o.texts || []), ...added];
    rerender(p, o);
    if (all) { selectSub(p, o, added[0]); toast(`${added.length} lines are now editable. Double-click any of them to type.`); }
    else startSubEditing(p, o, added[0]);
  }

  // ---------- pictures inside an image (e.g. the photo on a resume saved as one big picture) ----------
  async function detectPictures(p, o) {
    const c = await srcToCanvas(o.src);
    const skip = (o.ocr || []).map((l) => l.bbox);
    const W = o.natW, H = o.natH;
    // The whole image being one photo isn't a picture "inside" it.
    o.pics = findPictures(c, skip).filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) < W * H * 0.85);
    rerender(p, o);
    drawSide();
    toast(o.pics.length ? `Found ${o.pics.length} picture${o.pics.length > 1 ? 's' : ''}. Click one (purple outline) to work on it.` : 'No separate pictures found in this image. Use "Erase area" to remove part of it.', 4500);
  }

  // Lift a picture out of the image into its own object (clipped to its shape) and rebuild the hole behind it.
  async function separatePicture(p, o, k, then) {
    const b = o.pics?.[k];
    if (!b) return null;
    commit();
    const c = await srcToCanvas(o.src);
    const x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), w = Math.ceil(b.x1) - x0, hh = Math.ceil(b.y1) - y0;
    const piece = document.createElement('canvas');
    piece.width = w; piece.height = hh;
    piece.getContext('2d').drawImage(c, x0, y0, w, hh, 0, 0, w, hh);
    // Erase slightly beyond the edge so no fringe of the old picture is left.
    const g = Math.max(1, Math.round(Math.min(w, hh) * 0.01));
    eraseRegion(c, { x0: b.x0 - g, y0: b.y0 - g, x1: b.x1 + g, y1: b.y1 + g, shape: b.shape }, 'all');
    await setSrc(o, c.toDataURL('image/png'));
    o.pics = o.pics.filter((_, i) => i !== k);
    const kx = o.w / o.natW, ky = o.h / o.natH;
    const n = { id: nid(), type: 'image', src: piece.toDataURL('image/jpeg', 0.95), natW: w, natH: hh, jpeg: true, x: o.x + x0 * kx, y: o.y + y0 * ky, w: w * kx, h: hh * ky, opacity: o.opacity ?? 100, filters: {}, clip: b.shape === 'ellipse' ? 'ellipse' : 'rect' };
    p.objs.splice(p.objs.indexOf(o) + 1, 0, n);
    layoutObjs(p);
    select({ p, o: n });
    if (then) await then(n);
    else toast('Picture separated. Replace, delete, move or reshape it from the side panel.', 4500);
    return n;
  }

  // Burn editable image text into the pixels (needed before crop/rotate/flip).
  async function flattenImageTexts(o) {
    if (!o.texts?.length && !o.ocr) return;
    if (o.texts?.length) {
      const c = await srcToCanvas(o.src);
      drawTexts(c.getContext('2d'), o.texts);
      await setSrc(o, c.toDataURL('image/png'));
    }
    o.texts = [];
    o.ocr = null;
    sub = null;
  }

  // ---------- existing content (text runs and images already in the PDF) ----------
  async function loadRuns(p) {
    if (p.runs) return p.runs;
    const tc = await p.page.getTextContent();
    const runs = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
      if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0]) || tx[0] <= 0) continue; // rotated text isn't editable here
      const size = Math.hypot(tx[2], tx[3]);
      const x = tx[4], base = tx[5], w = it.width * p.vp.scale;
      const last = runs[runs.length - 1];
      if (last && Math.abs(last.base - base) < size * 0.3 && x - (last.x + last.w) < size * 0.6 && x >= last.x && Math.abs(last.size - size) < 0.6 && last.fontName === it.fontName) {
        last.str += (x - (last.x + last.w) > size * 0.15 && !last.str.endsWith(' ') ? ' ' : '') + it.str;
        last.w = x + w - last.x;
      } else runs.push({ x, base, w, size, str: it.str, fontName: it.fontName, family: tc.styles[it.fontName]?.fontFamily || 'sans-serif' });
    }
    p.runs = runs;
    return runs;
  }
  async function loadImgs(p) {
    if (!p.imgs) p.imgs = await pageImages(p.page, p.vp);
    return p.imgs;
  }

  async function refreshExisting(p) {
    p.existingEls.forEach((n) => n.remove());
    p.existingEls = [];
    if (tool !== 'edittext' && tool !== 'editimage' && tool !== 'imgtext') return;
    const z = zoom;
    // Calls can overlap while text/images load; only the latest one draws, so outlines never double up.
    const token = (p.refreshToken = (p.refreshToken || 0) + 1);
    await (tool === 'edittext' ? loadRuns(p) : loadImgs(p));
    if (token !== p.refreshToken) return;
    p.existingEls.forEach((n) => n.remove());
    p.existingEls = [];
    if (tool === 'edittext') {
      const runs = await loadRuns(p);
      if (!runs.length && !scanHinted && (await loadImgs(p)).length) {
        scanHinted = true;
        toast('This page looks like a scan or picture. Use "Edit text inside images & scans" to change its words, or the "Image to editable" tool to turn the whole page into editable text.', 6000);
      }
      runs.forEach((r, k) => {
        if (r.done) return;
        const n = h('div', { class: 'existing', 'data-kind': 'text', 'data-k': k, title: 'Click to edit this text', style: { left: (r.x - 1) * z + 'px', top: (r.base - r.size * 0.92) * z + 'px', width: (r.w + 2) * z + 'px', height: r.size * 1.18 * z + 'px' } });
        p.existingEls.push(n); p.overlay.prepend(n);
      });
    } else {
      const imgs = await loadImgs(p);
      imgs.forEach((im, k) => {
        if (im.done) return;
        const b = im.box;
        const n = h('div', { class: 'existing img', 'data-kind': 'image', 'data-k': k, title: tool === 'imgtext' ? 'Click to find and edit the text in this image' : 'Click to edit this image', style: { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' } });
        p.existingEls.push(n); p.overlay.prepend(n);
      });
    }
  }

  // Sample the rendered page to find the background colour behind a box and its darkest "ink" colour.
  function sampleColors(p, box) {
    const c = p.canvas;
    const k = c.width / p.vp.width;
    const x = clamp(Math.floor(box.x * k), 0, c.width - 1), y = clamp(Math.floor(box.y * k), 0, c.height - 1);
    const w = clamp(Math.ceil(box.w * k), 1, c.width - x), hh = clamp(Math.ceil(box.h * k), 1, c.height - y);
    let d;
    try { d = c.getContext('2d').getImageData(x, y, w, hh).data; } catch { return { bg: '#ffffff', fg: '#000000' }; }
    const counts = new Map();
    const edge = (i, j) => i < 2 || j < 2 || i >= w - 2 || j >= hh - 2;
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      if (!edge(i, j)) continue;
      const q = (j * w + i) * 4; const key = ((d[q] >> 3) << 10) | ((d[q + 1] >> 3) << 5) | (d[q + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let bgKey = 0x7fff, best = -1;
    for (const [kk, v] of counts) if (v > best) { best = v; bgKey = kk; }
    const br = ((bgKey >> 10) & 31) << 3 | 4, bgg = ((bgKey >> 5) & 31) << 3 | 4, bb = (bgKey & 31) << 3 | 4;
    let far = -1, fg = [0, 0, 0];
    for (let q = 0; q < d.length; q += 4) {
      const dist = Math.abs(d[q] - br) + Math.abs(d[q + 1] - bgg) + Math.abs(d[q + 2] - bb);
      if (dist > far) { far = dist; fg = [d[q], d[q + 1], d[q + 2]]; }
    }
    const hex = (a) => '#' + a.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
    return { bg: hex([br, bgg, bb]).replace(/^#f[89a-f]f[89a-f]f[89a-f]$/i, '#ffffff'), fg: far < 60 ? '#000000' : hex(fg) };
  }

  async function convertExisting(p, kind, k) {
    commit();
    if (kind === 'text') {
      const r = p.runs[k];
      r.done = true;
      const family = /mono|courier/i.test(r.family) ? 'mono' : /serif/i.test(r.family) && !/sans/i.test(r.family) ? 'serif' : 'sans';
      let bold = false, italic = false;
      try { const f = p.page.commonObjs.get(r.fontName); bold = /bold|black|heavy|semibold/i.test(f?.name || ''); italic = /italic|oblique/i.test(f?.name || ''); } catch { /* font not loaded */ }
      const cover = { x: r.x - 1, y: r.base - r.size * 0.92, w: r.w + 2, h: r.size * 1.18 };
      const { bg, fg } = sampleColors(p, cover);
      cover.color = bg;
      const size = Math.round(r.size * 10) / 10;
      // Letter spacing that makes the replacement font occupy exactly the original width.
      const n = [...r.str].length;
      const natural = textWidth({ text: r.str, size, font: family, bold, italic });
      const ls = n > 1 ? clamp((r.w - natural) / (n - 1), -0.15 * size, 0.3 * size) : 0;
      const o = { id: nid(), type: 'text', text: r.str, x: r.x, y: r.base - FONTS[family].asc * r.size, w: r.w, h: r.size * 1.2, size, font: family, bold, italic, color: fg, opacity: 100, align: 'left', ls: Math.round(ls * 100) / 100, cover, orig: { kind: 'text', rect: { ...cover } } };
      p.objs.push(o);
      refreshExisting(p);
      rerender(p, o);
      startEditing(p, o);
      return o;
    } else {
      const im = p.imgs[k];
      const c = await im.getCanvas();
      if (!c) { undoStack.pop(); toast('This image could not be read.'); return; }
      im.done = true;
      const b = im.box;
      const { bg } = sampleColors(p, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 });
      const alpha = hasAlpha(c);
      const src = c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.95);
      const o = { id: nid(), type: 'image', src, natW: c.width, natH: c.height, jpeg: !alpha, x: b.x, y: b.y, w: b.w, h: b.h, opacity: 100, filters: {}, cover: { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2, color: bg },
        orig: { kind: 'image', seq: im.seq, total: p.imgs.total, inForm: im.inForm, inline: im.inline } };
      p.objs.push(o);
      refreshExisting(p);
      rerender(p, o);
      select({ p, o });
      return o;
    }
  }

  // ---------- images ----------
  async function placeImageFile(f, p) {
    const src = await fileToDataUrl(f);
    const ratio = await imgRatio(src);
    const w = designMode ? p.vp.width * 0.4 : Math.min(p.vp.width * 0.5, 240), hh = w / ratio;
    commit();
    const o = { id: nid(), type: 'image', src, jpeg: f.type === 'image/jpeg', x: (p.vp.width - w) / 2, y: (p.vp.height - hh) / 2, w, h: hh, opacity: 100, filters: {} };
    await setSrc(o, src);
    p.objs.push(o); rerender(p, o); select({ p, o });
    drawToolbar();
  }

  // ---------- painting (brush, eraser, layer masks) ----------
  const paintable = (o) => o && o.type === 'image' && !o.clip && !o.icon && !o.iconify && !o.poly && !o.deleted && !o.isBg;
  function blankPng(w, hh, fill) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh));
    if (fill) { const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height); }
    return c.toDataURL('image/png');
  }
  // A new transparent layer as big as the canvas, placed above the selected layer (or on top).
  function addPaintLayer(p, selectIt = true) {
    const W = p.vp.width, H = p.vp.height;
    const n = { id: nid(), type: 'image', layer: 'Paint layer', paint: true, src: blankPng(W, H), natW: Math.round(W), natH: Math.round(H), x: 0, y: 0, w: W, h: H, opacity: 100, filters: {}, jpeg: false };
    const at = sel && !sel.o.items && sel.o.type !== 'group' ? p.objs.indexOf(sel.o) : -1;
    if (at >= 0) { n.gid = sel.o.gid; p.objs.splice(at + 1, 0, n); } else p.objs.push(n);
    layoutObjs(p);
    if (selectIt) select({ p, o: n }); else sel = { p, o: n };
    return n;
  }
  function addFillLayer(p) {
    commit();
    const n = { id: nid(), type: 'rect', layer: 'Fill layer', x: 0, y: 0, w: p.vp.width, h: p.vp.height, fill: style.fill || '#d7191f', stroke: style.fill || '#d7191f', sw: 0, opacity: 100 };
    const at = sel && !sel.o.items && sel.o.type !== 'group' ? p.objs.indexOf(sel.o) : -1;
    if (at >= 0) p.objs.splice(at + 1, 0, n); else p.objs.push(n);
    layoutObjs(p); select({ p, o: n });
  }
  async function startPaint(p, e, x, y) {
    let o = sel?.o;
    const onMask = !!(paintable(o) && o.mask && maskEdit);
    if (!paintable(o)) {
      if (tool === 'perase') { toast('Select a photo or a paint layer first, then erase on it.'); return; }
      commit();
      o = addPaintLayer(p, false);
    } else commit();
    const el0 = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
    const B = await srcToCanvas(onMask ? o.mask : o.src);
    const S = document.createElement('canvas'); S.width = B.width; S.height = B.height;
    const D = document.createElement('canvas'); D.width = B.width; D.height = B.height;
    const gs = S.getContext('2d'), gd = D.getContext('2d');
    const kx = B.width / o.w, ky = B.height / o.h;
    // Page point -> layer pixel (undoing the layer's rotation and mirror).
    const toImg = (px, py) => {
      let ax = px, ay = py;
      if (o.rot) { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = -o.rot * Math.PI / 180, dx = px - cx, dy = py - cy; ax = cx + dx * Math.cos(r) - dy * Math.sin(r); ay = cy + dx * Math.sin(r) + dy * Math.cos(r); }
      let ix = (ax - o.x) * kx; const iy = (ay - o.y) * ky;
      if (o.flipX && !onMask) ix = B.width - ix;
      return [ix, iy];
    };
    const erase = onMask ? (tool === 'perase' ? false : brush.maskPaint === 'hide') : tool === 'perase';
    gs.lineCap = 'round'; gs.lineJoin = 'round';
    gs.lineWidth = Math.max(1, brush.size * kx);
    gs.strokeStyle = onMask || erase ? '#ffffff' : brush.color;
    if (brush.soft) gs.filter = `blur(${(brush.soft / 100) * brush.size * kx * 0.35}px)`;
    let last = toImg(x, y);
    const seg = (a, b) => { gs.beginPath(); gs.moveTo(a[0], a[1]); gs.lineTo(b[0] + 0.01, b[1]); gs.stroke(); };
    seg(last, last);
    const compose = () => {
      gd.globalCompositeOperation = 'source-over'; gd.globalAlpha = 1;
      gd.clearRect(0, 0, D.width, D.height); gd.drawImage(B, 0, 0);
      gd.globalAlpha = brush.opacity / 100;
      gd.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      gd.drawImage(S, 0, 0);
    };
    // Live view: paint layers and photos show the canvas itself; masks update the mask image.
    let img = el0?.querySelector('img'), raf = 0, maskTimer = 0;
    const live = () => {
      raf = 0; compose();
      if (onMask) { if (!maskTimer) maskTimer = setTimeout(() => { maskTimer = 0; if (img) setMask(img, D.toDataURL('image/png')); }, 90); }
    };
    if (!onMask && el0 && img) {
      Object.assign(D.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', filter: cssFilter(o.filters), transform: o.flipX ? 'scaleX(-1)' : '' });
      if (o.mask) setMask(D, o.mask);
      img.style.visibility = 'hidden';
      el0.append(D);
    }
    live();
    const ptOf = (ev) => { const r = p.overlay.getBoundingClientRect(); return [(ev.clientX - r.left) / zoom, (ev.clientY - r.top) / zoom]; };
    const move = (ev) => { const q = toImg(...ptOf(ev)); seg(last, q); last = q; if (!raf) raf = requestAnimationFrame(live); };
    const up = async () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); clearTimeout(maskTimer);
      compose();
      const url = D.toDataURL('image/png');
      if (onMask) o.mask = url; else { await setSrc(o, url); o.jpeg = false; }
      rerender(p, o);
      select({ p, o });
      autosave();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  async function maskOp(p, o, kind) {
    commit();
    if (kind === 'add') { o.mask = blankPng(o.natW || o.w, o.natH || o.h, '#ffffff'); maskEdit = true; if (tool !== 'brush') { tool = 'brush'; drawToolbar(); } toast('Mask added. Paint with the Brush to hide parts; use the Eraser (or Reveal) to bring them back.', 5000); }
    else if (kind === 'delete') { o.mask = undefined; maskEdit = false; }
    else if (kind === 'invert' || kind === 'clear') {
      const c = await srcToCanvas(o.mask), g = c.getContext('2d');
      if (kind === 'clear') { g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      else { const d = g.getImageData(0, 0, c.width, c.height); for (let i = 3; i < d.data.length; i += 4) { d.data[i] = 255 - d.data[i]; d.data[i - 3] = d.data[i - 2] = d.data[i - 1] = 255; } g.putImageData(d, 0, 0); }
      o.mask = c.toDataURL('image/png');
    } else if (kind === 'apply') {
      const c = await srcToCanvas(o.src), g = c.getContext('2d');
      const m = await loadImage(o.mask);
      g.globalCompositeOperation = 'destination-in';
      if (o.flipX) { g.save(); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(m, 0, 0, c.width, c.height); g.restore(); } else g.drawImage(m, 0, 0, c.width, c.height);
      await setSrc(o, c.toDataURL('image/png')); o.jpeg = false; o.mask = undefined; maskEdit = false;
    }
    rerender(p, o); select({ p, o });
  }
  function toggleClip(p, o) {
    if (!o || o.type === 'group' || o.isBg) { toast('Select one layer that sits above another layer.'); return; }
    if (!o.clipBelow && !clipBase(p, o)) { toast('There is no layer below this one to clip to.'); return; }
    commit(); o.clipBelow = !o.clipBelow || undefined;
    layoutObjs(p); select({ p, o });
    if (o.clipBelow) toast('Clipped: this layer now only shows inside the layer below it.', 3500);
  }

  // Brush settings in the side panel.
  function brushPanel() {
    const o = sel?.o, onMaskable = paintable(o) && o.mask;
    const row = (label, input) => h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), input);
    const box = h('div', { class: 'designbox' }, h('h4', {}, tool === 'brush' ? 'Brush' : 'Eraser'),
      h('p', { class: 'hint', style: { marginTop: 0 } }, paintable(o) ? `Painting on: ${o.layer || 'Image'}${onMaskable && maskEdit ? ' (its mask)' : ''}` : tool === 'brush' ? 'Nothing selected: your first stroke makes a new paint layer.' : 'Select a photo or paint layer to erase on.'),
      row(`Size ${brush.size}px`, h('input', { type: 'range', min: 1, max: 400, value: brush.size, oninput: (e) => { brush.size = +e.target.value; e.target.closest('.field').querySelector('.lbl').textContent = `Size ${brush.size}px`; } })),
      row(`Softness ${brush.soft}%`, h('input', { type: 'range', min: 0, max: 100, value: brush.soft, oninput: (e) => { brush.soft = +e.target.value; e.target.closest('.field').querySelector('.lbl').textContent = `Softness ${brush.soft}%`; } })),
      row(`Strength ${brush.opacity}%`, h('input', { type: 'range', min: 5, max: 100, value: brush.opacity, oninput: (e) => { brush.opacity = +e.target.value; e.target.closest('.field').querySelector('.lbl').textContent = `Strength ${brush.opacity}%`; } })));
    if (tool === 'brush' && !(onMaskable && maskEdit)) box.append(row('Colour', h('div', { class: 'swatches' }, ...[...(brand.colors || []), '#000000', '#ffffff', '#d7191f', '#14213d', '#2f6fb0', '#1f9d55', '#e8784a', '#ffe14d'].slice(0, 12).map((c) => swatch(c, (v) => { brush.color = v; drawSide(); })), h('input', { type: 'color', value: brush.color, onchange: (e) => { brush.color = e.target.value; } }))));
    if (onMaskable) {
      box.append(h('label', { class: 'check', style: { margin: '6px 0' } }, h('input', { type: 'checkbox', checked: maskEdit, onchange: (e) => { maskEdit = e.target.checked; drawSide(); } }), 'Paint on the mask'));
      if (maskEdit && tool === 'brush') box.append(h('div', { class: 'seg' }, [['hide', 'Hide (paint black)'], ['reveal', 'Reveal (paint white)']].map(([v, l]) => h('button', { type: 'button', class: brush.maskPaint === v ? 'on' : '', onclick: () => { brush.maskPaint = v; drawSide(); } }, l))));
    }
    box.append(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
      h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); addPaintLayer(dpage()); toast('New paint layer added.'); } }, h('span', { html: icon('plus') }), 'New paint layer'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => setTool('select') }, 'Done painting')));
    return box;
  }

  // Layer mask controls for a selected image.
  function maskControls(p, o) {
    const box = h('div', { class: 'designbox' }, h('div', { class: 'lbl' }, 'Layer mask'));
    if (!o.mask) {
      box.append(h('p', { class: 'hint', style: { marginTop: 0 } }, 'Hide parts of this layer without deleting them: add a mask, then paint over what should disappear.'),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => maskOp(p, o, 'add') }, 'Add mask'));
      return box;
    }
    box.append(h('img', { src: o.mask, alt: 'Mask', class: 'maskthumb', title: 'White shows the layer, transparent hides it' }),
      h('label', { class: 'check', style: { margin: '6px 0' } }, h('input', { type: 'checkbox', checked: maskEdit, onchange: (e) => { maskEdit = e.target.checked; if (maskEdit && tool !== 'brush' && tool !== 'perase') setTool('brush'); else drawSide(); } }), 'Paint on the mask (with Brush / Eraser)'),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => { maskEdit = true; brush.maskPaint = 'hide'; setTool('brush'); } }, 'Paint to hide'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { maskEdit = true; brush.maskPaint = 'reveal'; setTool('brush'); } }, 'Paint to reveal'),
        h('button', { class: 'btn small', type: 'button', onclick: () => maskOp(p, o, 'invert') }, 'Invert'),
        h('button', { class: 'btn small', type: 'button', onclick: () => maskOp(p, o, 'clear') }, 'Show all'),
        h('button', { class: 'btn small', type: 'button', onclick: () => maskOp(p, o, 'apply') }, 'Apply'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => maskOp(p, o, 'delete') }, 'Delete mask')));
    return box;
  }

  // Tabs at the top of the Design Studio side panel.
  function sideTabs() {
    const n = pages[0].objs.length;
    return h('div', { class: 'sidetabs' },
      h('button', { type: 'button', class: sideTab === 'props' ? 'on' : '', onclick: () => { sideTab = 'props'; drawSide(); drawToolbar(); } }, sel ? 'Properties' : 'Design'),
      h('button', { type: 'button', class: sideTab === 'layers' ? 'on' : '', onclick: () => { sideTab = 'layers'; drawSide(); drawToolbar(); } }, `Layers (${n})`));
  }

  // ---------- side panel ----------
  function drawSide() {
    side.replaceChildren();
    if (designMode) {
      side.append(sideTabs());
      if (sideTab === 'layers') { side.append(layersPanel()); return; }
      if (tool === 'brush' || tool === 'perase') { side.append(brushPanel()); if (!paintable(sel?.o)) return; }
    }
    if (sel && sel.o.type === 'group') { side.append(groupPanel()); return; }
    if (sel) {
      const { p, o } = sel;
      const set = (fn) => { commit(); fn(); const n = rerender(p, o); if (o.type === 'text') measureText(p, o, n); select({ p, o }); };
      const row = (label, input) => h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), input);
      const color = (val, fn) => h('input', { type: 'color', value: val || '#000000', onchange: (e) => set(() => fn(e.target.value)) });
      const range = (min, max, val, fn, step = 1) => h('input', { type: 'range', min, max, step, value: val, onchange: (e) => set(() => fn(+e.target.value)) });
      if (o.type === 'image' && sub && sub.o === o && o.texts?.includes(sub.t)) {
        const t = sub.t, k = o.w / o.natW;
        const tset = (fn) => { commit(); fn(); rerender(p, o); drawSide(); };
        side.append(h('h4', {}, 'Text in image'),
          h('div', { class: 'field', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            h('button', { class: 'btn small primary', type: 'button', onclick: () => startSubEditing(p, o, t) }, 'Edit wording'),
            h('button', { class: 'btn small', type: 'button', onclick: () => { sub = null; rerender(p, o); drawSide(); } }, 'Back to image')),
          row('Font', h('select', { class: 'inp', onchange: (e) => tset(() => { t.font = e.target.value; }) }, [['sans', 'Sans (Helvetica/Arial)'], ['serif', 'Serif (Times)'], ['mono', 'Mono (Courier)']].map(([v, l]) => h('option', { value: v, selected: (t.font || 'sans') === v }, l)))),
          row('Google font', fontPicker(t.family, (v) => { tset(() => { t.family = v || undefined; }); fontsReady([{ type: 'text', ...t }]).then(() => rerender(p, o)); }, { standardLabel: 'None (use the font above)' })),
          row('Size (pt)', h('input', { class: 'inp', type: 'number', min: 2, max: 400, step: 0.5, value: Math.round(t.size * k * 10) / 10, onchange: (e) => tset(() => { t.size = clamp(+e.target.value, 2, 400) / k; }) })),
          h('div', { class: 'field seg' },
            h('button', { type: 'button', class: t.bold ? 'on' : '', onclick: () => tset(() => { t.bold = !t.bold; }) }, h('b', {}, 'B')),
            h('button', { type: 'button', class: t.italic ? 'on' : '', onclick: () => tset(() => { t.italic = !t.italic; }) }, h('i', {}, 'I'))),
          row('Colour', h('input', { type: 'color', value: t.color, onchange: (e) => tset(() => { t.color = e.target.value; }) })),
          row(`Letter spacing ${Math.round((t.ls || 0) * k * 10) / 10}pt`, h('input', { type: 'range', min: -3, max: 8, step: 0.1, value: (t.ls || 0) * k, onchange: (e) => tset(() => { t.ls = +e.target.value / k; }) })),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
            h('button', { class: 'btn small', type: 'button', onclick: () => tset(() => { const c = { ...t, id: nid(), y: t.y + t.size * 1.3 }; o.texts.push(c); sub = { p, o, t: c }; }) }, h('span', { html: icon('copy') }), 'Duplicate'),
            h('button', { class: 'btn small danger', type: 'button', onclick: () => tset(() => { o.texts = o.texts.filter((q) => q !== t); sub = null; }) }, h('span', { html: icon('trash') }), 'Delete text')),
          h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Drag the text to move it inside the image. Double-click to type.'));
        return;
      }
      side.append(h('h4', {}, { text: 'Text', image: o.sig ? 'Signature' : 'Image', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', path: o.hl ? 'Highlight' : 'Drawing', whiteout: 'White-out', redact: 'Redaction', field: o.kind === 'checkbox' ? 'Checkbox field' : 'Text field' }[o.type]));
      if (designMode) {
        side.append(designObjectControls(p, o, set, row));
        if (!o.isBg) side.append(h('label', { class: 'check', style: { margin: '0 0 12px' } }, h('input', { type: 'checkbox', checked: !!o.clipBelow, onchange: () => toggleClip(p, o) }), 'Clip to the layer below (show only inside it)'));
        if (paintable(o)) side.append(maskControls(p, o));
      }
      if (o.type === 'text') {
        side.append(
          h('div', { class: 'field' }, h('button', { class: 'btn small', type: 'button', onclick: () => startEditing(p, o) }, 'Edit wording')),
          ...(designMode ? [] : [row('Font', h('select', { class: 'inp', onchange: (e) => set(() => { style.font = o.font = e.target.value; }) }, [['sans', 'Sans (Helvetica/Arial)'], ['serif', 'Serif (Times)'], ['mono', 'Mono (Courier)']].map(([v, l]) => h('option', { value: v, selected: o.font === v }, l))))]),
          row('Size', h('input', { class: 'inp', type: 'number', min: 4, max: 300, step: 0.5, value: o.size, onchange: (e) => set(() => { style.size = o.size = clamp(+e.target.value, 4, 300); }) })),
          h('div', { class: 'field seg' },
            h('button', { type: 'button', class: o.bold ? 'on' : '', onclick: () => set(() => { style.bold = o.bold = !o.bold; }) }, h('b', {}, 'B')),
            h('button', { type: 'button', class: o.italic ? 'on' : '', onclick: () => set(() => { style.italic = o.italic = !o.italic; }) }, h('i', {}, 'I')),
            ...['left', 'center', 'right'].map((a) => h('button', { type: 'button', class: (o.align || 'left') === a ? 'on' : '', onclick: () => set(() => { o.align = a; }) }, a[0].toUpperCase() + a.slice(1)))),
          ...(designMode ? [] : [row('Google font', fontPicker(o.family, (v) => { set(() => { o.family = v || undefined; }); fontsReady([o]).then(() => { const n = rerender(p, o); measureText(p, o, n); }); }, { standardLabel: 'None (use the font above)' }))]),
          row('Colour', color(o.color, (v) => { style.color = o.color = v; })),
          row(`Letter spacing ${o.ls || 0}pt`, range(-3, 8, o.ls || 0, (v) => { o.ls = v; }, 0.1)));
        if (o.orig) side.append(h('p', { class: 'hint' }, 'The original words are removed from the file when you save. If that isn\'t possible for this font, they are hidden with the background colour below.'));
        if (o.cover) side.append(row('Background (fallback cover)', color(o.cover.color, (v) => { o.cover.color = v; })));
      }
      if (o.type === 'image' && o.sig) {
        side.append(h('p', { class: 'status' }, 'Drag to move, use the corner handle to resize.'),
          h('div', { class: 'field' }, h('button', { class: 'btn small', type: 'button', onclick: async () => { const src = await signatureDialog('Your signature'); if (src) { const r = await imgRatio(src); set(() => { o.src = src; o.h = o.w / r; }); } } }, h('span', { html: icon('replace') }), 'Change signature')));
      }
      if (o.type === 'image' && !o.sig) {
        const f = o.filters;
        const fset = (k) => (v) => { f[k] = v; };
        // Pixel operations: editable text is burned in first, then the new pixels replace the image.
        const pixelOp = async (fn) => { commit(); await flattenImageTexts(o); await fn(); rerender(p, o); select({ p, o }); };
        const modeBtn = (m, label, ic) => h('button', { class: 'btn small' + (imgMode === m ? ' primary' : ''), type: 'button', onclick: () => { imgMode = imgMode === m ? null : m; sub = null; rerender(p, o); drawSide(); if (imgMode) toast(m === 'erase' ? 'Drag over the part of the image to erase' : 'Click inside the image where the text should go'); } }, h('span', { html: icon(ic) }), label);
        const langSel = h('select', { class: 'inp', style: { width: 'auto', flex: 1 }, onchange: (e) => (ocrLang = e.target.value) },
          [['eng', 'English'], ['hin', 'Hindi'], ['tel', 'Telugu'], ['tam', 'Tamil'], ['kan', 'Kannada'], ['mar', 'Marathi'], ['eng+hin', 'English + Hindi'], ['eng+tel', 'English + Telugu'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ara', 'Arabic'], ['chi_sim', 'Chinese']].map(([v, l]) => h('option', { value: v, selected: ocrLang === v }, l)));
        const ocrBox = h('div', { class: 'notice info', style: { marginBottom: '14px' } },
          h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Text inside this image'));
        if (o.ocrBusy) ocrBox.append(h('div', { class: 'status', 'data-ocrstatus': '1' }, o.ocrStatus || 'Reading…'));
        else if (!o.ocr) {
          ocrBox.append(h('p', { class: 'status', style: { margin: '0 0 8px' } }, 'Find the words in this picture or scan, then click any line to retype it.'),
            h('div', { style: { display: 'flex', gap: '6px' } }, langSel, h('button', { class: 'btn small primary', type: 'button', onclick: () => detectText(p, o) }, h('span', { html: icon('search') }), 'Find text')));
          if (o.ocrStatus) ocrBox.append(h('div', { class: 'status', style: { marginTop: '6px' } }, o.ocrStatus));
        } else {
          ocrBox.append(h('p', { class: 'status', style: { margin: '0 0 8px' } }, o.ocr.length ? `${o.ocr.length} line${o.ocr.length > 1 ? 's' : ''} found. Click a highlighted line on the image to edit it.` : 'All found lines are editable now. Double-click one to type.'),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              o.ocr.length ? h('button', { class: 'btn small primary', type: 'button', onclick: () => editOcrLine(p, o, 0, true) }, 'Make all lines editable') : null,
              o.ocr.length ? h('button', { class: 'btn small', type: 'button', onclick: () => { o.showOcr = o.showOcr === false; rerender(p, o); drawSide(); } }, o.showOcr === false ? 'Show outlines' : 'Hide outlines') : null,
              h('button', { class: 'btn small ghost', type: 'button', onclick: () => { o.ocr = null; drawSide(); } }, 'Scan again')));
        }
        ocrBox.append(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' } }, modeBtn('addtext', 'Add text to image', 'text'), modeBtn('erase', 'Erase area', 'eraser')));
        if (o.texts?.length) ocrBox.append(h('label', { class: 'check', style: { marginTop: '10px', fontSize: '13px' } },
          h('input', { type: 'checkbox', checked: o.sharp !== false, onchange: (e) => { o.sharp = e.target.checked; } }), 'Save new text as sharp, searchable PDF text (untick to merge it into the image pixels)'));
        // Pictures inside this image (photos, logos on a page that is one big picture).
        const picBox = h('div', { class: 'notice info', style: { marginBottom: '14px' } },
          h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, 'Pictures inside this image'));
        const replaceInto = async (n) => { const [file] = await pickFiles('image/*', false); if (!file) return; await setSrc(n, await fileToDataUrl(file)); n.jpeg = file.type === 'image/jpeg'; n.panX = n.panY = 0.5; n.fzoom = 1; rerender(p, n); select({ p, o: n }); toast('Picture replaced. Use Zoom and Position to fit it in the frame.', 4000); };
        if (!o.pics) picBox.append(h('p', { class: 'status', style: { margin: '0 0 8px' } }, 'Find photos and pictures in this image so you can replace, move or delete them.'),
          h('button', { class: 'btn small primary', type: 'button', onclick: () => detectPictures(p, o) }, h('span', { html: icon('search') }), 'Find pictures'));
        else if (!o.pics.length) picBox.append(h('p', { class: 'status', style: { margin: 0 } }, 'No (more) pictures found. Use "Erase area" to remove part of the image.'));
        else o.pics.forEach((b, k) => picBox.append(h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' } },
          h('span', { class: 'status', style: { flex: '1 0 100%' } }, `Picture ${k + 1}${b.shape === 'ellipse' ? ' (round)' : ''}`),
          h('button', { class: 'btn small', type: 'button', onclick: () => separatePicture(p, o, k) }, 'Select'),
          h('button', { class: 'btn small primary', type: 'button', onclick: () => separatePicture(p, o, k, replaceInto) }, h('span', { html: icon('replace') }), 'Replace'),
          h('button', { class: 'btn small danger', type: 'button', onclick: () => separatePicture(p, o, k, async (n) => { p.objs.splice(p.objs.indexOf(n), 1); layoutObjs(p); select({ p, o }); toast('Picture deleted; the background behind it was rebuilt.'); }) }, h('span', { html: icon('trash') }), 'Delete'))));
        if (!o.clip) side.append(ocrBox, picBox);
        // Clipping mask: show the picture inside a shape.
        const shapeBtn = (key, label) => h('button', { type: 'button', title: label, class: (o.clip || '') === key ? 'on' : '', onclick: () => pixelOp(async () => {
          if (!o.natW) await setSrc(o, o.src);
          o.clip = key || undefined;
          if (!key) { o.panX = o.panY = 0.5; o.fzoom = 1; o.frameSw = 0; }
        }), html: key ? `<svg viewBox="-2 -2 28 28"><polygon points="${clipPolygon(key, 24, 24).map((q) => q.join(',')).join(' ')}" fill="currentColor" opacity=".75"/></svg>` : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-dasharray="3 2"/><path d="M4 20 20 4" stroke="currentColor"/></svg>' });
        side.append(row('Shape (clipping mask)', h('div', { class: 'shapegrid' }, shapeBtn('', 'No shape'), ...CLIP_SHAPES.map(([k2, l]) => shapeBtn(k2, l)))));
        if (o.clip) {
          side.append(
            h('div', { class: 'field' }, h('button', { class: 'btn small', type: 'button', onclick: () => set(() => { const s = Math.min(o.w, o.h); o.x += (o.w - s) / 2; o.y += (o.h - s) / 2; o.w = o.h = s; }) }, 'Make frame square')),
            row(`Zoom ${Math.round((o.fzoom || 1) * 100)}%`, range(100, 400, Math.round((o.fzoom || 1) * 100), (v) => { o.fzoom = v / 100; })),
            row('Position left ↔ right', range(0, 100, Math.round((o.panX ?? 0.5) * 100), (v) => { o.panX = v / 100; })),
            row('Position up ↕ down', range(0, 100, Math.round((o.panY ?? 0.5) * 100), (v) => { o.panY = v / 100; })),
            row(`Frame border ${o.frameSw || 0}pt`, range(0, 20, o.frameSw || 0, (v) => { o.frameSw = v; o.frameStroke ||= '#ffffff'; }, 0.5)),
            ...(o.frameSw ? [row('Border colour', color(o.frameStroke || '#ffffff', (v) => { o.frameStroke = v; }))] : []),
            h('p', { class: 'hint' }, 'Replace keeps the shape: the new picture fills the frame. Shift-drag the corner to change the frame\'s proportions.'));
        }
        side.append(
          h('div', { class: 'field', style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
            h('button', { class: 'btn small', type: 'button', onclick: async () => { const [file] = await pickFiles('image/*', false); if (file) { const src = await fileToDataUrl(file); const r = await imgRatio(src); await pixelOp(async () => { await setSrc(o, src); if (!o.clip) o.h = o.w / r; o.panX = o.panY = 0.5; o.fzoom = 1; o.filters = {}; o.jpeg = file.type === 'image/jpeg'; }); } } }, h('span', { html: icon('replace') }), 'Replace'),
            h('button', { class: 'btn small', type: 'button', onclick: async () => { await flattenImageTexts(o); const r = await cropDialog(o.src); if (r) await pixelOp(async () => { await setSrc(o, r.src); const ow = o.w, oh = o.h; o.x += r.fx * ow; o.y += r.fy * oh; o.w = r.fw * ow; o.h = r.fh * oh; }); else { rerender(p, o); drawSide(); } } }, h('span', { html: icon('crop') }), 'Crop'),
            h('button', { class: 'btn small', type: 'button', onclick: () => pixelOp(async () => { await setSrc(o, await rotateSrc(o.src)); const cx = o.x + o.w / 2, cy = o.y + o.h / 2; [o.w, o.h] = [o.h, o.w]; o.x = cx - o.w / 2; o.y = cy - o.h / 2; }) }, h('span', { html: icon('rotate') }), 'Rotate'),
            h('button', { class: 'btn small', type: 'button', onclick: () => pixelOp(async () => { await setSrc(o, await flipSrc(o.src)); }) }, h('span', { html: icon('flip') }), 'Flip'),
            h('button', { class: 'btn small', type: 'button', onclick: () => pixelOp(async () => { await setSrc(o, await removeWhite(o.src)); o.jpeg = false; }) }, 'Remove white background'),
            h('button', { class: 'btn small', type: 'button', onclick: async () => { const blob = await (await fetch(await bakeImage(o))).blob(); const a = h('a', { href: URL.createObjectURL(blob), download: 'image.' + (blob.type === 'image/png' ? 'png' : 'jpg') }); a.click(); } }, h('span', { html: icon('download') }), 'Save image')),
          row(`Brightness ${f.brightness ?? 100}%`, range(0, 200, f.brightness ?? 100, fset('brightness'))),
          row(`Contrast ${f.contrast ?? 100}%`, range(0, 200, f.contrast ?? 100, fset('contrast'))),
          row(`Saturation ${f.saturate ?? 100}%`, range(0, 300, f.saturate ?? 100, fset('saturate'))),
          row(`Hue ${f.hue ?? 0}°`, range(-180, 180, f.hue ?? 0, fset('hue'))),
          row(`Blur ${f.blur ?? 0}px`, range(0, 10, f.blur ?? 0, fset('blur'), 0.5)),
          h('div', { class: 'field seg' },
            ...[['grayscale', 'Black & white'], ['sepia', 'Sepia'], ['invert', 'Invert']].map(([k, l]) => h('button', { type: 'button', class: f[k] ? 'on' : '', onclick: () => set(() => { f[k] = f[k] ? 0 : 100; }) }, l))),
          h('div', { class: 'field' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => set(() => { o.filters = {}; o.flipX = false; }) }, 'Reset adjustments')));
        if (o.orig) side.append(h('p', { class: 'hint' }, 'On save the original image is replaced in the file, not just covered.'));
      }
      if (['rect', 'ellipse', 'line', 'arrow', 'path'].includes(o.type)) {
        side.append(row('Stroke colour', color(o.stroke, (v) => { style.stroke = o.stroke = v; })),
          row(`Thickness ${o.sw}pt`, range(0.5, 30, o.sw, (v) => { style.sw = o.sw = v; }, 0.5)));
        if (o.type === 'rect' || o.type === 'ellipse') side.append(h('div', { class: 'field' }, h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
          const [file] = await pickFiles('image/*', false);
          if (!file) return;
          commit();
          const n = { id: nid(), type: 'image', jpeg: file.type === 'image/jpeg', x: o.x, y: o.y, w: Math.max(6, o.w), h: Math.max(6, o.h), opacity: o.opacity ?? 100, filters: {}, clip: o.type === 'ellipse' ? 'ellipse' : 'rect', frameSw: o.sw, frameStroke: o.stroke };
          await setSrc(n, await fileToDataUrl(file));
          p.objs.splice(p.objs.indexOf(o), 1, n);
          layoutObjs(p); select({ p, o: n });
          toast('Picture placed in the shape. Change the shape, zoom or position in the side panel.', 4500);
        } }, h('span', { html: icon('image') }), 'Fill with picture (clipping mask)')));
        if (o.type === 'rect' || o.type === 'ellipse') side.append(h('div', { class: 'field' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!o.fill, onchange: (e) => set(() => { o.fill = e.target.checked ? '#fde68a' : ''; style.fill = o.fill; }) }), 'Fill'), o.fill ? color(o.fill, (v) => { style.fill = o.fill = v; }) : null));
      }
      if (o.type === 'whiteout') side.append(row('Colour', color(o.fill, (v) => { o.fill = v; })));
      if (o.type === 'field') side.append(row('Field name', h('input', { class: 'inp', value: o.name, onchange: (e) => set(() => { o.name = e.target.value.replace(/[^\w.-]/g, '_') || o.name; }) })));
      if (!['redact', 'whiteout', 'field'].includes(o.type)) side.append(row(`Opacity ${o.opacity ?? 100}%`, range(5, 100, o.opacity ?? 100, (v) => { o.opacity = v; })));
      side.append(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => duplicate() }, h('span', { html: icon('copy') }), 'Duplicate'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); p.objs.splice(p.objs.indexOf(o), 1); p.objs.push(o); layoutObjs(p); select({ p, o }); } }, 'Bring to front'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => removeSel() }, h('span', { html: icon('trash') }), 'Delete')));
      return;
    }
    side.append(h('h4', {}, TOOL_INFO[tool]?.[1] || 'Tools'), h('p', { class: 'status' }, HINTS[tool] || ''));
    if (['text', 'date', 'select', 'edittext'].includes(tool)) {
      side.append(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Text colour'), h('input', { type: 'color', value: style.color, oninput: (e) => (style.color = e.target.value) })),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Text size'), h('input', { class: 'inp', type: 'number', value: style.size, min: 4, max: 200, onchange: (e) => (style.size = +e.target.value) })));
    }
    if (['rect', 'ellipse', 'line', 'arrow', 'pen'].includes(tool)) {
      side.append(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Colour'), h('input', { type: 'color', value: style.stroke, oninput: (e) => (style.stroke = e.target.value) })),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Thickness'), h('input', { type: 'range', min: 0.5, max: 20, step: 0.5, value: style.sw, oninput: (e) => (style.sw = +e.target.value) })));
    }
    if (tool === 'highlight') side.append(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Highlighter colour'), h('div', { class: 'seg' }, ['#ffe14d', '#7ee787', '#7cc4ff', '#ff9ecf'].map((c) => h('button', { type: 'button', style: { background: c, minHeight: '30px' }, class: style.hl === c ? 'on' : '', onclick: () => { style.hl = c; drawSide(); } })))));
    if (modeName === 'redact') side.append(searchRedact());
    if (modeName === 'images' || tool === 'editimage') side.append(imageList());
    if (designMode) side.append(designPanels());
    if (modeName === 'sign') side.append(h('div', { class: 'notice info', style: { marginTop: '14px' } }, 'Tip: your signatures are remembered on this device so you can reuse them. Asking other people to sign needs the online server (coming in the server edition).'));
    side.append(h('div', { class: 'hint', style: { marginTop: '18px' } }, h('span', { class: 'kbd' }, 'Del'), ' delete · ', h('span', { class: 'kbd' }, 'Ctrl+Z'), ' undo · ', h('span', { class: 'kbd' }, 'Ctrl+D'), ' duplicate · arrows nudge'));
  }

  // ---------- Design Studio ----------
  let designTab = 'elements';
  const dpage = () => pages[0];
  const DW = () => dpage().vp.width, DH = () => dpage().vp.height;
  const bgObj = () => dpage().objs.find((o) => o.isBg || o.layer === 'Background');
  function addObj(o, center = true) {
    const p = dpage();
    commit();
    o.id = nid();
    if (center && o.w != null) { o.x = (DW() - o.w) / 2; o.y = (DH() - o.h) / 2; }
    p.objs.push(o);
    const n = rerender(p, o);
    if (o.type === 'text' && center) { measureText(p, o, n); o.x = (DW() - o.w) / 2; o.y = (DH() - o.h) / 2; rerender(p, o); }
    select({ p, o });
    return o;
  }
  const polySrc = (key, color) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><polygon fill="${color}" points="${clipPolygon(key, 512, 512).map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}"/></svg>`);
  function recolor(o, c) {
    if (o.iconify) {
      o.iconColor = c;
      if (!MULTICOLOR.has(o.iconify.split(':')[0])) iconifySrc(o.iconify, c).then((src) => { o.src = src; const p = pages.find((q) => q.objs.includes(o)); if (p) rerender(p, o); }).catch(() => toast('Could not recolour that icon (offline?).'));
    } else if (o.icon) { o.iconColor = c; o.src = iconSrc(o.icon, c); }
    else if (o.poly) { o.iconColor = c; o.src = polySrc(o.poly, c); }
    else if (o.type === 'text') o.color = c;
    else if (o.type === 'rect' || o.type === 'ellipse') { o.fill = c; o.grad = undefined; }
    else if (o.type === 'line' || o.type === 'arrow' || o.type === 'path') o.stroke = c;
  }
  const swatch = (c, onPick, title) => h('button', { type: 'button', class: 'swatch', title: title || c, style: { background: Array.isArray(c) ? gradientCss(c) : c }, onclick: () => onPick(c) });
  const fontSelect = (val, onChange) => fontPicker(val, onChange);

  // Controls shown for the selected object in design mode.
  function designObjectControls(p, o, set, row) {
    const box = h('div', { class: 'designbox' });
    const b = bbox(o);
    const align = (where) => set(() => {
      const dx = { left: -b.x, center: (DW() - b.w) / 2 - b.x, right: DW() - b.w - b.x }[where] ?? 0;
      const dy = { top: -b.y, middle: (DH() - b.h) / 2 - b.y, bottom: DH() - b.h - b.y }[where] ?? 0;
      if (o.points) o.points = o.points.map(([x, y]) => [x + dx, y + dy]); else { o.x += dx; o.y += dy; }
    });
    box.append(
      h('div', { class: 'lbl' }, 'Position on page'),
      h('div', { class: 'seg tight' }, ...[['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map(([k, l]) => h('button', { type: 'button', onclick: () => align(k) }, l))),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); p.objs.splice(p.objs.indexOf(o), 1); p.objs.push(o); layoutObjs(p); select({ p, o }); } }, 'To front'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); p.objs.splice(p.objs.indexOf(o), 1); const at = p.objs.findIndex((q) => !(q.isBg || q.layer === 'Background')); p.objs.splice(Math.max(0, at), 0, o); layoutObjs(p); select({ p, o }); } }, 'To back'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { o.locked = !o.locked; rerender(p, o); drawSide(); } }, o.locked ? '🔒 Unlock' : '🔓 Lock')));
    if (o.type === 'image' && !o.points) {
      const fitTo = (cover) => set(() => { const k = (cover ? Math.max : Math.min)(DW() / o.w, DH() / o.h); o.w *= k; o.h *= k; o.x = (DW() - o.w) / 2; o.y = (DH() - o.h) / 2; o.rot = undefined; });
      const out = b.x < -0.5 || b.y < -0.5 || b.x + b.w > DW() + 0.5 || b.y + b.h > DH() + 0.5;
      box.append(h('div', { class: 'lbl' }, 'Size on canvas'),
        ...(out ? [h('p', { class: 'hint', style: { margin: '0 0 6px', color: 'var(--warm)' } }, 'Part of this image is outside the canvas (the darkened area) and will be cut off.')] : []),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } },
          h('button', { class: 'btn small', type: 'button', onclick: () => fitTo(false) }, 'Fit inside canvas'),
          h('button', { class: 'btn small', type: 'button', onclick: () => fitTo(true) }, 'Fill the canvas')));
    }
    if (!o.points) box.append(row(`Rotate ${o.rot || 0}°`, h('input', { type: 'range', min: -180, max: 180, step: 1, value: o.rot || 0, onchange: (e) => set(() => { o.rot = +e.target.value || undefined; }) })));
    const quick = [...new Set([...(brand.colors || []), ...PALETTE.slice(6, 18)])].slice(0, 16);
    if (o.icon || o.poly || o.iconify || o.type === 'text' || o.type === 'rect' || o.type === 'ellipse' || o.points) {
      box.append(h('div', { class: 'lbl' }, o.type === 'text' ? 'Text colour' : 'Colour'),
        h('div', { class: 'swatches' }, ...quick.map((c) => swatch(c, (v) => set(() => recolor(o, v)))),
          h('input', { type: 'color', value: (o.icon || o.poly || o.iconify ? o.iconColor : o.type === 'text' ? o.color : o.points ? o.stroke : o.fill) || '#000000', title: 'Any colour', onchange: (e) => set(() => recolor(o, e.target.value)) })));
    }
    if (o.type === 'rect' || o.type === 'ellipse') {
      box.append(h('div', { class: 'lbl', style: { marginTop: '8px' } }, 'Gradient'), h('div', { class: 'swatches' }, ...GRADIENTS.map((g) => swatch(g, (v) => set(() => { o.grad = v; o.fill = v[0]; })))));
      if (o.type === 'rect') box.append(row(`Corner radius ${Math.round(o.radius || 0)}`, h('input', { type: 'range', min: 0, max: Math.round(Math.min(o.w, o.h) / 2), value: o.radius || 0, onchange: (e) => set(() => { o.radius = +e.target.value; }) })));
    }
    if (o.type === 'text') {
      box.append(
        row('Font', fontSelect(o.family, (v) => { set(() => { o.family = v || undefined; }); fontsReady([o]).then(() => { const n = rerender(p, o); measureText(p, o, n); }); })),
        row(`Line spacing ${(o.lh || 1.2).toFixed(2)}`, h('input', { type: 'range', min: 0.7, max: 2.5, step: 0.05, value: o.lh || 1.2, onchange: (e) => set(() => { o.lh = +e.target.value; }) })),
        h('div', { class: 'lbl' }, 'Effects'),
        h('div', { class: 'seg tight' },
          h('button', { type: 'button', class: o.shadow ? 'on' : '', onclick: () => set(() => { o.shadow = o.shadow ? undefined : { color: 'rgba(0,0,0,0.45)', blur: o.size * 0.12, x: o.size * 0.04, y: o.size * 0.04 }; }) }, 'Shadow'),
          h('button', { type: 'button', class: o.outline ? 'on' : '', onclick: () => set(() => { o.outline = o.outline ? undefined : { color: '#ffffff', width: Math.max(1, o.size * 0.06) }; }) }, 'Outline'),
          h('button', { type: 'button', onclick: () => set(() => { o.text = o.text === o.text.toUpperCase() ? o.text.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : o.text.toUpperCase(); }) }, 'Aa ⇄ AA')));
      if (o.outline) box.append(row('Outline colour', h('input', { type: 'color', value: o.outline.color, onchange: (e) => set(() => { o.outline = { ...o.outline, color: e.target.value }; }) })),
        row(`Outline width ${Math.round(o.outline.width)}`, h('input', { type: 'range', min: 1, max: Math.max(4, Math.round(o.size * 0.2)), value: o.outline.width, onchange: (e) => set(() => { o.outline = { ...o.outline, width: +e.target.value }; }) })));
      if (o.shadow) box.append(row('Shadow colour', h('input', { type: 'color', value: o.shadow.color.startsWith('#') ? o.shadow.color : '#000000', onchange: (e) => set(() => { o.shadow = { ...o.shadow, color: e.target.value }; }) })));
    }
    return box;
  }

  // Panels shown when nothing is selected.
  function designPanels() {
    const row = (label, input) => h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), input);
    const wrap = h('div', { class: 'designbox' });
    const tabs = [['elements', 'Elements'], ['text', 'Text'], ['photos', 'Photos'], ['background', 'Background'], ['brand', 'Brand kit'], ['resize', 'Resize']];
    wrap.append(h('div', { class: 'dtabs' }, ...tabs.map(([k, l]) => h('button', { type: 'button', class: designTab === k ? 'on' : '', onclick: () => { designTab = k; drawSide(); } }, l))));
    const W = DW();
    const body = h('div', { class: 'dtab' });
    wrap.append(body);
    if (designTab === 'elements') {
      const S = W * 0.3;
      body.append(h('div', { class: 'lbl' }, 'Shapes'), h('div', { class: 'elgrid' },
        elBtn('Square', `<rect x="3" y="3" width="18" height="18" fill="currentColor"/>`, () => addObj({ type: 'rect', layer: 'Shape', w: S, h: S, fill: style.fill, stroke: style.fill, sw: 0, opacity: 100 })),
        elBtn('Rounded', `<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/>`, () => addObj({ type: 'rect', layer: 'Shape', w: S, h: S, radius: S * 0.18, fill: style.fill, stroke: style.fill, sw: 0, opacity: 100 })),
        elBtn('Circle', `<circle cx="12" cy="12" r="9" fill="currentColor"/>`, () => addObj({ type: 'ellipse', layer: 'Circle', w: S, h: S, fill: style.fill, stroke: style.fill, sw: 0, opacity: 100 })),
        elBtn('Outline box', `<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/>`, () => addObj({ type: 'rect', layer: 'Frame', w: S, h: S, fill: '', stroke: style.stroke, sw: Math.max(2, W / 150), opacity: 100 })),
        ...['triangle', 'diamond', 'hexagon', 'star', 'heart', 'blob'].map((k) => elBtn(k[0].toUpperCase() + k.slice(1), `<polygon fill="currentColor" points="${clipPolygon(k, 18, 18).map(([x, y]) => `${(x + 3).toFixed(1)},${(y + 3).toFixed(1)}`).join(' ')}"/>`, () => addObj({ type: 'image', layer: 'Shape', poly: k, iconColor: style.fill, src: polySrc(k, style.fill), natW: 512, natH: 512, w: S, h: S, filters: {}, opacity: 100 }))),
        elBtn('Line', `<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2.5"/>`, () => { const x = W * 0.3, y = DH() / 2; addObj({ type: 'line', layer: 'Line', points: [[x, y], [W * 0.7, y]], stroke: style.stroke, sw: Math.max(2, W / 200), opacity: 100 }, false); }),
        elBtn('Arrow', `<path d="M3 12h16m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.5"/>`, () => { const x = W * 0.3, y = DH() / 2; addObj({ type: 'arrow', layer: 'Arrow', points: [[x, y], [W * 0.7, y]], stroke: style.stroke, sw: Math.max(2, W / 200), opacity: 100 }, false); })));
      body.append(h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Icons'), h('div', { class: 'elgrid' },
        ...Object.keys(ICONS).map((k) => elBtn(k, `<path fill="currentColor" d="${ICONS[k]}"/>`, () => addObj({ type: 'image', layer: 'Icon', icon: k, iconColor: style.stroke, src: iconSrc(k, style.stroke), natW: 512, natH: 512, w: W * 0.12, h: W * 0.12, filters: {}, opacity: 100 })))));
      body.append(iconLibrary());
      const qr = h('input', { class: 'inp', placeholder: 'https://editsupreme.com' });
      body.append(h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'QR code'), h('div', { style: { display: 'flex', gap: '6px' } }, qr,
        h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
          const text = qr.value.trim();
          if (!text) { toast('Type a link or text for the QR code first.'); return; }
          const QR = (await import('qrcode')).default;
          const src = await QR.toDataURL(text, { margin: 1, width: 600, color: { dark: '#000000', light: '#ffffff' } });
          addObj({ type: 'image', layer: 'QR code', src, natW: 600, natH: 600, w: W * 0.22, h: W * 0.22, filters: {}, opacity: 100 });
        } }, 'Add')));
    } else if (designTab === 'text') {
      const head = brand.heading || 'Montserrat', bodyF = brand.body || 'Poppins';
      const preset = (label, sample, o, css) => h('button', { type: 'button', class: 'textpreset', style: css, onclick: () => fontsReady([o]).then(() => addObj({ type: 'text', layer: 'Text', font: 'sans', color: style.color, opacity: 100, align: 'center', ls: 0, x: 0, y: 0, w: 10, h: 10, bold: false, italic: false, ...o, text: sample })) }, label);
      body.append(
        preset('Add a heading', 'Your heading', { family: head, size: Math.round(W / 9), bold: true }, { fontFamily: `"${head}"`, fontWeight: 700, fontSize: '22px' }),
        preset('Add a subheading', 'Your subheading', { family: head, size: Math.round(W / 16) }, { fontFamily: `"${head}"`, fontSize: '17px' }),
        preset('Add body text', 'Write something here', { family: bodyF, size: Math.round(W / 28) }, { fontFamily: `"${bodyF}"`, fontSize: '14px' }),
        h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Styles'),
        h('div', { class: 'presetgrid' },
          preset('BOLD SALE', 'BIG SALE', { family: 'Anton', size: Math.round(W / 7), color: '#d7191f' }, { fontFamily: '"Anton"', color: '#d7191f', fontSize: '20px' }),
          preset('Outline', 'OUTLINE', { family: 'Archivo Black', size: Math.round(W / 9), color: '#ffffff', outline: { color: '#14213d', width: Math.round(W / 160) } }, { fontFamily: '"Archivo Black"', color: '#fff', WebkitTextStroke: '1.5px #14213d', fontSize: '18px' }),
          preset('Shadow', 'Shadow', { family: 'Poppins', bold: true, size: Math.round(W / 10), shadow: { color: 'rgba(0,0,0,0.45)', blur: W / 90, x: W / 300, y: W / 300 } }, { fontFamily: '"Poppins"', fontWeight: 700, textShadow: '2px 2px 4px rgba(0,0,0,.45)', fontSize: '18px' }),
          preset('Script', 'Thank you', { family: 'Great Vibes', size: Math.round(W / 8) }, { fontFamily: '"Great Vibes"', fontSize: '24px' }),
          preset('Elegant', 'Elegant title', { family: 'Playfair Display', italic: true, size: Math.round(W / 11) }, { fontFamily: '"Playfair Display"', fontStyle: 'italic', fontSize: '18px' }),
          preset('Headline', 'HEADLINE', { family: 'Bebas Neue', size: Math.round(W / 6), ls: W / 200 }, { fontFamily: '"Bebas Neue"', fontSize: '24px', letterSpacing: '1px' })));
    } else if (designTab === 'photos') {
      body.append(
        h('button', { class: 'btn primary', type: 'button', style: { width: '100%' }, onclick: async () => { const [f] = await pickFiles('image/*', false); if (f) placeImageFile(f, dpage()); } }, h('span', { html: icon('image') }), 'Upload a photo'),
        h('p', { class: 'hint' }, 'Select a photo to crop it, filter it, replace it or put it inside a shape (clipping mask).'),
        stockPhotos(),
        h('div', { class: 'lbl' }, 'Photo frames'),
        h('div', { class: 'elgrid' }, ...['ellipse', 'rounded', 'rect', 'hexagon', 'star', 'heart', 'blob', 'diamond'].map((k) => elBtn(k === 'ellipse' ? 'Circle frame' : k + ' frame', `<polygon fill="currentColor" opacity=".6" points="${clipPolygon(k, 18, 18).map(([x, y]) => `${(x + 3).toFixed(1)},${(y + 3).toFixed(1)}`).join(' ')}"/>`, async () => {
          const [f] = await pickFiles('image/*', false);
          if (!f) return;
          const o = { type: 'image', layer: 'Photo', clip: k, w: W * 0.45, h: W * 0.45, filters: {}, opacity: 100, jpeg: f.type === 'image/jpeg' };
          await setSrc(o, await fileToDataUrl(f));
          addObj(o);
        }))));
    } else if (designTab === 'background') {
      const setBg = (fn) => { commit(); let b = bgObj(); if (!b) { b = { id: nid(), type: 'rect', layer: 'Background', isBg: true, locked: true, x: 0, y: 0, w: DW(), h: DH(), fill: '#ffffff', stroke: '#ffffff', sw: 0, opacity: 100 }; dpage().objs.unshift(b); } fn(b); layoutObjs(dpage()); drawSide(); };
      body.append(h('div', { class: 'lbl' }, 'Colour'), h('div', { class: 'swatches' }, ...[...(brand.colors || []), ...PALETTE].map((c) => swatch(c, (v) => setBg((b) => { b.type = 'rect'; b.fill = b.stroke = v; b.grad = undefined; delete b.src; }))),
        h('input', { type: 'color', value: bgObj()?.fill || '#ffffff', onchange: (e) => setBg((b) => { b.type = 'rect'; b.fill = b.stroke = e.target.value; b.grad = undefined; }) })),
        h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Gradient'), h('div', { class: 'swatches' }, ...GRADIENTS.map((g) => swatch(g, (v) => setBg((b) => { b.type = 'rect'; b.grad = v; b.fill = v[0]; })))),
        h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Picture'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const [f] = await pickFiles('image/*', false);
          if (!f) return;
          const src = await fileToDataUrl(f);
          const tmp = {}; await setSrc(tmp, src);
          setBg((b) => { Object.assign(b, { type: 'image', src, natW: tmp.natW, natH: tmp.natH, clip: 'rect', filters: {}, jpeg: f.type === 'image/jpeg', x: 0, y: 0, w: DW(), h: DH() }); });
        } }, h('span', { html: icon('image') }), 'Use a picture as background'));
    } else if (designTab === 'brand') {
      const save = () => { saveBrand(brand); drawSide(); };
      const add = h('input', { type: 'color', value: '#d7191f' });
      body.append(h('p', { class: 'hint', style: { marginTop: 0 } }, 'Your brand kit is kept on this device and shows up in every colour picker, text style and design.'),
        h('div', { class: 'lbl' }, 'Brand colours'),
        h('div', { class: 'swatches' }, ...(brand.colors || []).map((c) => h('span', { class: 'swatchwrap' }, swatch(c, (v) => { if (sel) { commit(); recolor(sel.o, v); rerender(sel.p, sel.o); } }, c + ' (click to use)'), h('button', { type: 'button', class: 'x', title: 'Remove', onclick: () => { brand.colors = brand.colors.filter((q) => q !== c); save(); } }, '×'))),
          add, h('button', { class: 'btn small', type: 'button', onclick: () => { brand.colors = [...new Set([...(brand.colors || []), add.value])]; save(); } }, 'Add')),
        row('Heading font', fontSelect(brand.heading, (v) => { brand.heading = v || 'Montserrat'; save(); })),
        row('Body font', fontSelect(brand.body, (v) => { brand.body = v || 'Poppins'; style.family = brand.body; save(); })),
        h('div', { class: 'lbl' }, 'Logo'),
        brand.logo ? h('img', { src: brand.logo, alt: 'Your logo', style: { maxWidth: '100%', maxHeight: '80px', display: 'block', margin: '4px 0 8px', background: '#fff', borderRadius: '6px' } }) : h('p', { class: 'status' }, 'No logo yet.'),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          h('button', { class: 'btn small', type: 'button', onclick: async () => { const [f] = await pickFiles('image/*', false); if (f) { brand.logo = await fileToDataUrl(f); save(); } } }, brand.logo ? 'Change logo' : 'Upload logo'),
          brand.logo ? h('button', { class: 'btn small primary', type: 'button', onclick: async () => { const o = { type: 'image', layer: 'Logo', filters: {}, opacity: 100 }; await setSrc(o, brand.logo); const r = o.natH / o.natW; o.w = DW() * 0.25; o.h = o.w * r; addObj(o); } }, 'Add logo to design') : null));
    } else if (designTab === 'resize') {
      const wIn = h('input', { class: 'inp', type: 'number', min: 50, max: 8000, value: Math.round(DW()) }), hIn = h('input', { class: 'inp', type: 'number', min: 50, max: 8000, value: Math.round(DH()) });
      body.append(h('p', { class: 'hint', style: { marginTop: 0 } }, `Now ${Math.round(DW())} × ${Math.round(DH())} px. Pick a new size; everything is scaled and centred to fit, and the background stretches to fill.`),
        ...SIZES.map(([group, list]) => h('div', {}, h('div', { class: 'lbl', style: { marginTop: '8px' } }, group),
          ...list.map(([id, name, w, hh]) => h('button', { type: 'button', class: 'sizerow', onclick: () => resizeDesign(w, hh, id) }, h('span', {}, name), h('span', { class: 'status' }, `${w}×${hh}`))))),
        h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Custom size (px)'),
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, wIn, '×', hIn, h('button', { class: 'btn small primary', type: 'button', onclick: () => resizeDesign(clamp(+wIn.value, 50, 8000), clamp(+hIn.value, 50, 8000)) }, 'Resize')));
    }
    return wrap;
  }
  // Free stock photos (Pexels, Pixabay, Unsplash with a free key; Wikimedia Commons and Openverse without).
  const stock = { source: 'all', q: '', results: [], page: 1, msg: '', srv: null };
  serverSources().then((set) => { stock.srv = set; });
  function stockPhotos() {
    const box = h('div', { style: { marginTop: '12px' } }, h('div', { class: 'lbl' }, 'Free stock photos'));
    const src = stock.source === 'all' ? ALL_SOURCE : PHOTO_SOURCES.find((x) => x.id === stock.source);
    const srv = stock.srv || new Set();
    const keys = stockKeys();
    const q = h('input', { class: 'inp', type: 'search', placeholder: 'Search photos, e.g. coffee, office, beach', value: stock.q });
    const go = async (more) => {
      stock.q = q.value.trim();
      if (!stock.q) return;
      stock.page = more ? stock.page + 1 : 1;
      stock.msg = 'Searching…';
      if (!more) stock.results = [];
      drawSide();
      try {
        const r = await searchPhotos(stock.source, stock.q, stock.page);
        stock.results = more ? [...stock.results, ...r] : r;
        stock.msg = r.length ? '' : 'No photos found. Try other words.';
      } catch (e) { stock.msg = e.message; }
      drawSide();
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(false); e.stopPropagation(); });
    box.append(
      h('select', { class: 'inp', style: { marginBottom: '6px' }, onchange: (e) => { stock.source = e.target.value; stock.results = []; stock.msg = ''; drawSide(); } },
        [ALL_SOURCE, ...PHOTO_SOURCES].map((x) => h('option', { value: x.id, selected: x.id === stock.source }, x.name + (x.needsKey && !keys[x.id] && !srv.has(x.id) ? ' (needs a free key)' : '')))),
      h('div', { style: { display: 'flex', gap: '6px' } }, q, h('button', { class: 'btn small primary', type: 'button', onclick: () => go(false) }, 'Search')));
    if (src.needsKey && !srv.has(src.id)) {
      const k = h('input', { class: 'inp', type: 'password', placeholder: `Your ${src.name} API key`, value: keys[src.id] || '', autocomplete: 'off' });
      box.append(h('details', { class: 'keybox', open: !keys[src.id] }, h('summary', {}, keys[src.id] ? `${src.name} key saved` : `Add your free ${src.name} key`),
        h('p', { class: 'hint' }, 'Get a free key at ', h('a', { href: src.keyUrl, target: '_blank', rel: 'noopener' }, src.keyUrl.replace(/^https:\/\//, '')), ', then paste it here. It is kept only on this device.'),
        h('div', { style: { display: 'flex', gap: '6px' } }, k, h('button', { class: 'btn small', type: 'button', onclick: () => { setStockKey(src.id, k.value); toast(k.value ? 'Key saved on this device.' : 'Key removed.'); drawSide(); } }, 'Save'))));
    }
    if (stock.msg) box.append(h('p', { class: 'status' }, stock.msg));
    if (stock.results.length) {
      box.append(h('div', { class: 'stockgrid' }, ...stock.results.map((ph) => h('button', { type: 'button', class: 'stockimg', title: `${ph.credit} · ${ph.license}`, onclick: async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('busy');
        try {
          const data = await fetchPhoto(ph);
          const o = { type: 'image', layer: 'Photo', filters: {}, opacity: 100, jpeg: true, credit: ph.credit, creditLink: ph.link, license: ph.license };
          await setSrc(o, data);
          o.w = DW() * 0.6; o.h = o.w * o.natH / o.natW;
          addObj(o);
          toast(`Added. ${ph.credit} (${ph.license}).`, 4500);
        } catch (err) { toast(err.message || 'Could not add that photo.'); }
        btn.classList.remove('busy');
      } }, h('img', { src: ph.thumb, alt: '', loading: 'lazy' })))),
        h('button', { class: 'btn small', type: 'button', style: { width: '100%', marginTop: '6px' }, onclick: () => go(true) }, 'More photos'),
        h('p', { class: 'hint' }, src.terms));
    }
    return box;
  }

  // 200,000+ free icons from open icon sets (Iconify).
  const icons = { q: '', set: '', results: [], msg: '' };
  function iconLibrary() {
    const box = h('div', { style: { marginTop: '12px' } }, h('div', { class: 'lbl' }, 'Icon library (200,000+ free icons)'));
    const q = h('input', { class: 'inp', type: 'search', placeholder: 'Search icons, e.g. phone, shop, rocket', value: icons.q });
    const go = async () => {
      icons.q = q.value.trim();
      if (!icons.q) return;
      icons.msg = 'Searching…';
      drawSide();
      try { icons.results = await searchIcons(icons.q, icons.set); icons.msg = icons.results.length ? '' : 'No icons found.'; }
      catch (e) { icons.msg = e.message; icons.results = []; }
      drawSide();
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    box.append(h('select', { class: 'inp', style: { marginBottom: '6px' }, onchange: (e) => { icons.set = e.target.value; if (icons.q) go(); } }, ICON_SETS.map(([v, l]) => h('option', { value: v, selected: v === icons.set }, l))),
      h('div', { style: { display: 'flex', gap: '6px' } }, q, h('button', { class: 'btn small primary', type: 'button', onclick: go }, 'Search')));
    if (icons.msg) box.append(h('p', { class: 'status' }, icons.msg));
    if (icons.results.length) {
      box.append(h('div', { class: 'elgrid' }, ...icons.results.map((id) => h('button', { type: 'button', class: 'elbtn', title: id, onclick: async () => {
        try {
          const color = style.stroke;
          const src = await iconifySrc(id, color);
          addObj({ type: 'image', layer: 'Icon', iconify: id, iconColor: color, src, natW: 512, natH: 512, w: DW() * 0.12, h: DW() * 0.12, filters: {}, opacity: 100 });
        } catch (e) { toast(e.message); }
      } }, h('img', { src: iconPreviewUrl(id), alt: id, loading: 'lazy', style: { width: '100%', height: '100%' } })))),
        h('p', { class: 'hint' }, 'Icons come from open-source sets (mostly MIT, Apache or CC BY licences). Brand logos stay the property of their owners.'));
    }
    return box;
  }

  function elBtn(title, svgInner, onclick) {
    return h('button', { type: 'button', class: 'elbtn', title, onclick, html: `<svg viewBox="0 0 24 24">${svgInner}</svg>` });
  }

  // Magic resize: rebuild the editor at the new size with everything scaled to fit.
  async function resizeDesign(W2, H2, sizeId) {
    if (editing) finishEditing();
    const W = DW(), H = DH();
    const s = Math.min(W2 / W, H2 / H), ox = (W2 - W * s) / 2, oy = (H2 - H * s) / 2;
    const objs = dpage().objs.map((o) => {
      const c = { ...o, points: o.points?.map(([x, y]) => [x * s + ox, y * s + oy]) };
      if (o.isBg || o.layer === 'Background') return { ...c, x: 0, y: 0, w: W2, h: H2 };
      if (!o.points) { c.x = o.x * s + ox; c.y = o.y * s + oy; c.w = o.w * s; c.h = o.h * s; }
      for (const k of ['size', 'ls', 'sw', 'radius', 'frameSw']) if (c[k]) c[k] *= s;
      if (o.shadow) c.shadow = { ...o.shadow, blur: o.shadow.blur * s, x: o.shadow.x * s, y: o.shadow.y * s };
      if (o.outline) c.outline = { ...o.outline, width: o.outline.width * s };
      return c;
    });
    window.removeEventListener('beforeunload', beforeUnload);
    const d = await PDFDocument.create();
    d.addPage([W2, H2]);
    const f = new File([await d.save()], file.name, { type: 'application/pdf' });
    await mountEditor(el, f, ctx, 'design', { ...opts, initial: [objs], groups: dpage().groups, sizeId: sizeId || opts.sizeId });
    toast(`Resized to ${W2} × ${H2} px.`);
  }

  function saveProjectFile() {
    const name = stem(opts.name || file.name).replace(/-design$/, '') || 'design';
    const data = { app: 'EditSupreme', kind: 'design', v: 1, W: DW(), H: DH(), name, sizeId: opts.sizeId, objs: dpage().objs.map(({ ocrBusy, ...o }) => o), groups: dpage().groups };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), name + '.editsupreme.json');
    toast('Project saved. Open it any time from Design Studio → Open a project file.');
  }

  // Download dialog: picture, print PDF, editable-text PDF, or a project file to keep editing later.
  async function exportDesign() {
    if (editing) finishEditing();
    if (subEditing) finishSubEditing();
    const W = DW(), H = DH();
    let fmt = 'png', scale = 1;
    const name = stem(opts.name || file.name).replace(/-design$/, '') || 'design';
    const segRow = (items, get, setv) => { const s = h('div', { class: 'seg' }); const draw = () => { s.replaceChildren(...items.map(([v, l]) => h('button', { type: 'button', class: get() === v ? 'on' : '', onclick: () => { setv(v); draw(); info(); } }, l))); }; draw(); return s; };
    const infoEl = h('p', { class: 'status' });
    const info = () => { infoEl.textContent = fmt === 'pdf-text' ? 'A PDF in which text stays editable (shown in built-in fonts; rotation and effects are left out).' : `${Math.round(W * scale)} × ${Math.round(H * scale)} px${fmt === 'pdf' ? ', as a print-ready PDF' : ''}.`; };
    const body = h('div', {},
      h('div', { class: 'lbl' }, 'File type'), segRow([['png', 'PNG'], ['jpg', 'JPG'], ['pdf', 'PDF (print)'], ['pdf-text', 'PDF (editable text)']], () => fmt, (v) => (fmt = v)),
      h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Size'), segRow([[1, '1×'], [2, '2×'], [3, '3×']], () => scale, (v) => (scale = Math.min(v, 8000 / Math.max(W, H)))),
      infoEl,
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' } }),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Want to edit this design again later, on any device? Save the project file and open it from Design Studio.'));
    info();
    const choice = await modal('Download your design', body, [
      { label: 'Save project file', value: 'project' },
      { label: 'Cancel', value: null },
      { label: 'Download', primary: true, value: 'download' }
    ]);
    if (choice === 'project') { saveProjectFile(); return; }
    if (choice !== 'download') return;
    if (fmt === 'pdf-text') { await save(true); return; }
    status.textContent = 'Preparing your file…';
    try {
      const c = await renderDesign(dpage().objs, W, H, scale);
      if (fmt === 'pdf') {
        // Print sizes are 300 dpi; screen designs are treated as 96 dpi.
        const print = SIZES.find(([g]) => g === 'Print')[1].some(([id]) => id === opts.sizeId);
        const k = 72 / (print ? 300 : 96);
        const d = await PDFDocument.create();
        const pg = d.addPage([W * k, H * k]);
        const jpg = await d.embedJpg(await blobToBytes(await canvasToBlob(c, 'image/jpeg', 0.95)));
        pg.drawImage(jpg, { x: 0, y: 0, width: W * k, height: H * k });
        download(pdfBlob(await d.save()), name + '.pdf');
      } else download(await canvasToBlob(c, fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.93), `${name}.${fmt}`);
      toast('Downloaded. Your design is still here if you want to keep editing.');
    } catch (e) { console.error(e); toast('Could not create the file: ' + e.message, 5000); }
    status.textContent = '';
  }

  // ---------- layers (Image to layers) ----------
  const layerName = (o) => o.layer || ({ text: 'Text', image: o.sig ? 'Signature' : 'Image', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', path: 'Drawing' }[o.type] || 'Layer');
function groupPanel() {
    const { p, o } = sel;
    const mem = membersOf(p, o);
    const real = o.gid && G(p)[o.gid];
    const box = h('div', { class: 'designbox' });
    box.append(h('h4', {}, real ? 'Group' : `${o.items.length} items selected`));
    if (real) box.append(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Name'), h('input', { class: 'inp', value: real.name, onchange: (e) => { commit(); real.name = e.target.value || real.name; drawSide(); } })));
    const b = boxOf(mem);
    const shift = (dx, dy) => { commit(); for (const m of mem) { if (m.points) m.points = m.points.map(([x, y]) => [x + dx, y + dy]); else { m.x += dx; m.y += dy; } rerender(p, m); } drawGroupSel(); };
    const W = p.vp.width, H = p.vp.height;
    const moveBlock = (front) => { commit(); p.objs = p.objs.filter((q) => !mem.includes(q)); if (front) p.objs.push(...mem); else { const at = p.objs.findIndex((q) => !(q.isBg || q.layer === 'Background')); p.objs.splice(Math.max(0, at), 0, ...mem); } layoutObjs(p); select({ p, o }); };
    box.append(
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } },
        real ? h('button', { class: 'btn small primary', type: 'button', onclick: () => ungroup(p, o.gid) }, 'Ungroup') : h('button', { class: 'btn small primary', type: 'button', onclick: () => groupItems(p, o.items) }, 'Group'),
        h('button', { class: 'btn small', type: 'button', onclick: () => duplicate() }, h('span', { html: icon('copy') }), 'Duplicate'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => removeSel() }, h('span', { html: icon('trash') }), 'Delete')),
      h('div', { class: 'lbl' }, 'Position on page'),
      h('div', { class: 'seg tight' }, ...[['Left', -b.x, 0], ['Centre', (W - b.w) / 2 - b.x, 0], ['Right', W - b.w - b.x, 0], ['Top', 0, -b.y], ['Middle', 0, (H - b.h) / 2 - b.y], ['Bottom', 0, H - b.h - b.y]].map(([l, dx, dy]) => h('button', { type: 'button', onclick: () => shift(dx, dy) }, l))),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => moveBlock(true) }, 'To front'),
        h('button', { class: 'btn small', type: 'button', onclick: () => moveBlock(false) }, 'To back'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); const lock = !mem.every((m) => m.locked); mem.forEach((m) => { m.locked = lock; }); layoutObjs(p); drawSide(); } }, mem.every((m) => m.locked) ? '🔒 Unlock all' : '🔓 Lock all'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { commit(); const hide = !mem.every((m) => m.hidden); mem.forEach((m) => { m.hidden = hide; }); layoutObjs(p); drawSide(); } }, mem.every((m) => m.hidden) ? '👁 Show all' : '🚫 Hide all')),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Opacity of everything inside'), h('input', { type: 'range', min: 5, max: 100, value: Math.round(mem.reduce((a, m) => a + (m.opacity ?? 100), 0) / Math.max(1, mem.length)), onchange: (e) => { commit(); mem.forEach((m) => { m.opacity = +e.target.value; rerender(p, m); }); } })),
      h('p', { class: 'hint' }, real ? 'Drag to move it all, use the corner handle to resize. Double-click an item (or Ctrl+click) to select it inside the group and edit it on its own. Ctrl+Shift+G ungroups.' : 'Ctrl+G or "Group" groups these items. Shift+click adds or removes items; drag a box on empty canvas to select several.'));
    return box;
  }

  // Layers as a tree: groups (nested) with their items, drag rows to reorder or move them into a group.
  function layersPanel() {
    const p = pages[0];
    const one = sel && sel.o.type !== 'group' ? sel.o : null;
    const multi = sel?.o?.items, grp = isGroupSel() && sel.o.gid;
    const tb = (ic, label, fn, on = true, title = label) => h('button', { class: 'btn small', type: 'button', title, disabled: !on, onclick: fn }, ic ? h('span', { html: icon(ic) }) : null, label);
    const newMenu = h('details', { class: 'newlayer' }, h('summary', { class: 'btn small primary' }, h('span', { html: icon('plus') }), 'New layer'),
      h('div', { class: 'menu' },
        h('button', { type: 'button', onclick: () => { newMenu.open = false; commit(); addPaintLayer(p); setTool('brush'); } }, h('b', {}, 'Paint layer'), h('span', {}, 'Empty layer for the Brush')),
        h('button', { type: 'button', onclick: () => { newMenu.open = false; addFillLayer(p); } }, h('b', {}, 'Fill layer'), h('span', {}, 'A solid colour over the whole canvas')),
        h('button', { type: 'button', onclick: () => { newMenu.open = false; sideTab = 'props'; setTool('text'); toast('Click on the canvas where the text should go.'); } }, h('b', {}, 'Text layer'), h('span', {}, 'Click on the canvas to type')),
        h('button', { type: 'button', onclick: async () => { newMenu.open = false; const [f] = await pickFiles('image/*', false); if (f) placeImageFile(f, p); } }, h('b', {}, 'Image layer'), h('span', {}, 'Upload a photo or picture')),
        h('button', { type: 'button', onclick: () => { newMenu.open = false; const S = DW() * 0.3; addObj({ type: 'rect', layer: 'Shape', w: S, h: S, fill: style.fill, stroke: style.fill, sw: 0, opacity: 100 }); } }, h('b', {}, 'Shape layer'), h('span', {}, 'A rectangle you can recolour'))));
    const box = h('div', {},
      h('div', { class: 'layertools' }, newMenu,
        tb('', 'Group', () => groupItems(p, sel.o.items), !!multi, 'Group the selected layers (Ctrl+G)'),
        tb('', 'Ungroup', () => ungroup(p, sel.o.gid), !!grp, 'Ungroup (Ctrl+Shift+G)'),
        tb('', one?.clipBelow ? 'Unclip' : 'Clip', () => toggleClip(p, one), !!one && !one.isBg, 'Clip to the layer below: show only inside it'),
        tb('', one?.mask ? 'Mask ✓' : 'Mask', () => (one.mask ? (sideTab = 'props', drawSide()) : maskOp(p, one, 'add')), paintable(one), 'Add a layer mask (photos and paint layers)'),
        tb('copy', '', () => duplicate(), !!sel, 'Duplicate (Ctrl+D)'),
        tb('trash', '', () => removeSel(), !!sel, 'Delete')),
      h('p', { class: 'hint', style: { margin: '6px 0 8px' } }, 'Top of the list is in front. Drag rows to reorder, or onto a group to put them inside. Shift+click to select several, then Group. Double-click a row to edit it.'));
    const list = h('div', { class: 'layerlist' });
    const itemOfRow = (row) => (row.dataset.gid ? gproxy(row.dataset.gid) : findObj(p, row.dataset.oid));
    let dragged = null;
    const dropOn = (row, e) => {
      const r = row.getBoundingClientRect(), f = (e.clientY - r.top) / r.height;
      return row.dataset.gid && f > 0.3 && f < 0.7 ? 'into' : f < 0.5 ? 'above' : 'below';
    };
    const bindDrag = (row) => {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { dragged = itemOfRow(row); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'layer'); } catch { /* older browsers */ } row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); list.querySelectorAll('.dropabove,.dropbelow,.dropinto').forEach((n) => n.classList.remove('dropabove', 'dropbelow', 'dropinto')); });
      row.addEventListener('dragover', (e) => { if (!dragged) return; e.preventDefault(); list.querySelectorAll('.dropabove,.dropbelow,.dropinto').forEach((n) => n.classList.remove('dropabove', 'dropbelow', 'dropinto')); row.classList.add('drop' + dropOn(row, e)); });
      row.addEventListener('drop', (e) => { e.preventDefault(); if (dragged) moveLayer(p, dragged, itemOfRow(row), dropOn(row, e)); dragged = null; });
    };
    // Rows, top (front) first. Group headers appear where their first member is reached.
    const objs = p.objs.slice().reverse();
    let open = [];
    for (const o of objs) {
      const chain = chainOf(p, o);
      let k = 0;
      while (k < open.length && open[k] === chain[k]) k++;
      open = open.slice(0, k);
      let hiddenByCollapse = chain.slice(0, k).some((g) => G(p)[g]?.collapsed);
      for (; k < chain.length; k++) {
        const gid = chain[k], g = G(p)[gid];
        open.push(gid);
        if (hiddenByCollapse) continue;
        const mem = membersOf(p, gproxy(gid));
        const row = h('div', { class: 'layerrow grouprow' + (isGroupSel() && sel.o.gid === gid ? ' on' : '') + (mem.every((m) => m.hidden) ? ' off' : ''), 'data-gid': gid, style: { paddingLeft: 6 + k * 14 + 'px' },
          onclick: (e) => { if (e.target.closest('button')) return; select({ p, o: gproxy(gid) }); } },
          h('button', { type: 'button', class: 'lbtn', title: g.collapsed ? 'Expand' : 'Collapse', onclick: () => { g.collapsed = !g.collapsed; drawSide(); } }, g.collapsed ? '▸' : '▾'),
          h('span', { class: 'sw' }, '▣'),
          h('span', { class: 'lname' }, `${g.name} (${mem.length})`),
          h('button', { type: 'button', class: 'lbtn', title: 'Show or hide everything in the group', onclick: () => { commit(); const hide = !mem.every((m) => m.hidden); mem.forEach((m) => { m.hidden = hide; }); layoutObjs(p); drawSide(); } }, mem.every((m) => m.hidden) ? '🚫' : '👁'),
          h('button', { type: 'button', class: 'lbtn', title: 'Ungroup', onclick: () => ungroup(p, gid) }, '⊟'));
        bindDrag(row);
        list.append(row);
        if (g.collapsed) hiddenByCollapse = true;
      }
      if (hiddenByCollapse) continue;
      const label = o.type === 'text' ? `“${(o.text || '').slice(0, 24)}${(o.text || '').length > 24 ? '…' : ''}”` : layerName(o);
      const swatch = o.type === 'image' && o.src ? h('img', { src: o.src, alt: '' }) : h('span', { class: 'sw', style: { background: o.type === 'text' ? 'transparent' : o.grad ? gradientCss(o.grad) : o.fill || o.stroke || '#ccc', color: o.color || 'inherit' } }, o.type === 'text' ? 'T' : '');
      const multiOn = sel?.o?.items?.some((it) => it === o);
      const row = h('div', { class: 'layerrow' + (sel?.o === o || multiOn ? ' on' : '') + (o.hidden ? ' off' : '') + (o.clipBelow ? ' clipped' : ''), 'data-oid': o.id, style: { paddingLeft: 6 + chain.length * 14 + (o.clipBelow ? 14 : 0) + 'px' }, ondblclick: () => { sideTab = 'props'; select({ p, o }); drawToolbar(); },
        onclick: (e) => { if (e.target.closest('button')) return; if (e.shiftKey && sel) { const cur = sel.o.items ? sel.o.items.slice() : [sel.o]; const at = cur.indexOf(o); if (at >= 0) cur.splice(at, 1); else cur.push(o); select({ p, o: cur.length === 1 ? cur[0] : { type: 'group', items: cur, id: 'multi' } }); return; } select({ p, o }); revealInCanvas(p, o); } },
        h('button', { type: 'button', class: 'lbtn', title: o.hidden ? 'Show' : 'Hide', onclick: () => { commit(); o.hidden = !o.hidden; rerender(p, o); drawSide(); } }, o.hidden ? '🚫' : '👁'),
        o.clipBelow ? h('span', { class: 'cliparrow', title: 'Clipped to the layer below' }, '↳') : null,
        swatch,
        h('span', { class: 'lname' }, label),
        o.mask ? h('img', { class: 'maskbadge' + (maskEdit && sel?.o === o ? ' on' : ''), src: o.mask, alt: 'mask', title: 'Layer mask: click to paint on it', onclick: (ev) => { ev.stopPropagation(); select({ p, o }); maskEdit = true; setTool('brush'); } }) : null,
        h('button', { type: 'button', class: 'lbtn', title: o.locked ? 'Unlock' : 'Lock', onclick: () => { o.locked = !o.locked; rerender(p, o); drawSide(); } }, o.locked ? '🔒' : '🔓'));
      bindDrag(row);
      list.append(row);
    }
    box.append(list);
    return box;
  }

  // Scroll the canvas (not the whole page) so a layer is in view.
  function revealInCanvas(p, o) {
    const n = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
    if (!n) return;
    const a = area.getBoundingClientRect(), r = n.getBoundingClientRect();
    if (r.bottom < a.top || r.top > a.bottom) area.scrollBy({ top: (r.top + r.bottom) / 2 - (a.top + a.bottom) / 2, behavior: 'smooth' });
  }

  // ---------- new project ----------
  async function newProject() {
    if (editing) finishEditing();
    const used = dpage().objs.some((o) => !(o.isBg || o.layer === 'Background'));
    if (used) {
      const c = await modal('Start a new project?', h('p', {}, 'Your current design will be closed. Save it as a project file first if you want to come back to it.'), [
        { label: 'Cancel', value: null }, { label: 'Save project file first', value: 'save' }, { label: 'Start new', primary: true, value: 'new' }]);
      if (!c) return;
      if (c === 'save') saveProjectFile();
    }
    const pick = await pickDesignSize({ onTemplates: () => ctx.restart() });
    if (!pick) return;
    const { W: W2, H: H2 } = pick;
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('keydown', onKey);
    const d = await PDFDocument.create();
    d.addPage([W2, H2]);
    const f = new File([await d.save()], pick.name + '.pdf', { type: 'application/pdf' });
    await mountEditor(el, f, ctx, 'design', { initial: [blankDesign(W2, H2)], groups: {}, name: pick.name, sizeId: pick.sizeId });
    toast(`New ${W2} × ${H2} px project.`);
  }

  // Move a layer (an item or a whole group) above/below another row, or into a group.
  function moveLayer(p, item, target, where) {
    if (!target || sameItem(item, target)) return;
    const block = membersOf(p, item);
    const tblock = membersOf(p, target);
    if (tblock.some((o) => block.includes(o))) return; // can't drop a group onto its own contents
    if (item.type === 'group' && item.gid && target.type === 'group' && target.gid && chainOfGroup(p, target.gid).includes(item.gid)) return;
    commit();
    p.objs = p.objs.filter((o) => !block.includes(o));
    const idx = where === 'below' ? p.objs.indexOf(tblock[0]) : p.objs.indexOf(tblock[tblock.length - 1]) + 1;
    p.objs.splice(Math.max(0, idx), 0, ...block);
    // The moved layer joins the target's group (or the target group itself for "into").
    const parent = where === 'into' ? target.gid : (target.type === 'group' ? G(p)[target.gid]?.parent : target.gid) || null;
    if (item.type === 'group' && item.gid) G(p)[item.gid].parent = parent;
    else if (item.type !== 'group') item.gid = parent || undefined;
    layoutObjs(p);
    select(item.type === 'group' && item.gid ? { p, o: item } : { p, o: item });
  }

  function imageList() {
    const box = h('div', { style: { marginTop: '14px' } }, h('div', { class: 'lbl', style: { fontWeight: 600, fontSize: '13.5px', marginBottom: '8px' } }, 'Images in this PDF'));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' } }, h('span', { class: 'status' }, 'Looking…'));
    box.append(grid);
    (async () => {
      const items = [];
      for (const p of pages.slice(0, 80)) for (const [k, im] of (await loadImgs(p)).entries()) if (!im.done) items.push([p, k, im]);
      grid.replaceChildren();
      if (!items.length) grid.append(h('span', { class: 'status', style: { gridColumn: '1 / -1' } }, pages.some((p) => p.imgs?.some((im) => im.done)) ? 'All images are open for editing. If a page is one big picture, select it and use "Find pictures" to work on the photos inside it.' : 'No images found in this PDF.'));
      for (const p of pages) {
        // A page that is a single full-page picture (scanned or exported as an image): point at "Find pictures".
        const full = p.imgs?.find((im) => !im.done && im.box.w * im.box.h > p.vp.width * p.vp.height * 0.8);
        if (full) { box.append(h('p', { class: 'hint', style: { marginTop: '8px' } }, `Page ${p.i + 1} is one big picture. Click it, then use "Find pictures" to replace or delete the photos inside it.`)); break; }
      }
      for (const [p, k, im] of items.slice(0, 60)) {
        const c = await im.getCanvas().catch(() => null);
        if (!c) continue;
        const t = document.createElement('canvas'); const s = 70 / Math.max(c.width, c.height); t.width = Math.max(1, c.width * s); t.height = Math.max(1, c.height * s); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        t.style.cssText = 'max-width:100%;margin:auto;background:#fff';
        grid.append(h('button', { type: 'button', class: 'btn small', title: `Page ${p.i + 1}`, style: { padding: '4px', height: '78px' }, onclick: async () => {
          p.wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (tool !== 'editimage' && tool !== 'imgtext') { tool = 'editimage'; drawToolbar(); }
          const o = await convertExisting(p, 'image', k);
          if (o && tool === 'imgtext') detectText(p, o);
        } }, t));
      }
    })();
    return box;
  }

  function searchRedact() {
    const inp = h('input', { class: 'inp', placeholder: 'Word, name, number…' });
    const cs = h('input', { type: 'checkbox' });
    const out = h('div', { class: 'status', style: { marginTop: '6px' } });
    const go = async () => {
      const q = inp.value.trim();
      if (!q) return;
      commit();
      let n = 0;
      for (const p of pages) {
        for (const r of await loadRuns(p)) {
          const hay = cs.checked ? r.str : r.str.toLowerCase(), needle = cs.checked ? q : q.toLowerCase();
          let at = hay.indexOf(needle);
          while (at >= 0) {
            p.objs.push({ id: nid(), type: 'redact', ...spanBox(r, at, needle.length) });
            n++;
            at = hay.indexOf(needle, at + needle.length);
          }
        }
        layoutObjs(p);
      }
      if (!n) undoStack.pop();
      out.textContent = n ? `Marked ${n} match${n > 1 ? 'es' : ''} for redaction.` : 'No matches found. Scanned pages need OCR first.';
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    return h('div', { style: { marginTop: '14px' } },
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Search and redact'), inp, h('label', { class: 'check', style: { marginTop: '6px' } }, cs, 'Match case')),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', { class: 'btn small primary', type: 'button', onclick: go }, h('span', { html: icon('search') }), 'Mark all'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { inp.value = '[\\w.+-]+@[\\w-]+\\.[\\w.]+'; regexRedact(/[\w.+-]+@[\w-]+\.[\w.]+/g, out); } }, 'Emails'),
        h('button', { class: 'btn small', type: 'button', onclick: () => regexRedact(/(?:\+?\d[\d\s().-]{7,}\d)/g, out) }, 'Phone numbers')),
      out);
  }
  async function regexRedact(re, out) {
    commit();
    let n = 0;
    for (const p of pages) {
      for (const r of await loadRuns(p)) {
        for (const m of r.str.matchAll(re)) { p.objs.push({ id: nid(), type: 'redact', ...spanBox(r, m.index, m[0].length) }); n++; }
      }
      layoutObjs(p);
    }
    if (!n) undoStack.pop();
    out.textContent = n ? `Marked ${n} match${n > 1 ? 'es' : ''} for redaction.` : 'No matches found.';
  }

  function duplicate() {
    if (!sel) return;
    const { p, o } = sel;
    if (o.type === 'group') {
      commit();
      const items = o.items || [o];
      const copies = items.map((it) => duplicateItem(p, it));
      layoutObjs(p);
      select({ p, o: copies.length === 1 ? copies[0] : { type: 'group', items: copies, id: 'multi' } });
      return;
    }
    commit();
    const c = { ...o, id: nid(), filters: o.filters && { ...o.filters }, cover: undefined, orig: undefined, texts: o.texts?.map((t) => ({ ...t, id: nid() })), ocr: o.ocr?.slice(), points: o.points?.map(([x, y]) => [x + 12, y + 12]) };
    if (!c.points) { c.x += 12; c.y += 12; }
    p.objs.push(c); rerender(p, c); select({ p, o: c });
  }
  function removeSel() {
    if (!sel) return;
    const { p, o } = sel;
    if (o.type === 'group') {
      commit();
      const mem = new Set(membersOf(p, o));
      p.objs = p.objs.filter((q) => !mem.has(q));
      // Drop groups that are now empty.
      for (const gid of Object.keys(G(p))) if (!p.objs.some((q) => chainOf(p, q).includes(gid))) delete G(p)[gid];
      layoutObjs(p); select(null);
      return;
    }
    if (sub && sub.o === o) {
      // Delete key with image text selected removes just that text.
      commit();
      o.texts = o.texts.filter((q) => q !== sub.t);
      sub = null; rerender(p, o); drawSide();
      return;
    }
    commit();
    if (o.orig) {
      // Deleting edited existing content: keep the object so the original is removed from the file on save.
      if (o.type === 'image') { o.deleted = true; rerender(p, o); select(null); return; }
      if (o.type === 'text') { o.text = ''; rerender(p, o); select(null); return; }
    }
    p.objs.splice(p.objs.indexOf(o), 1);
    layoutObjs(p); select(null);
  }

  // ---------- keyboard ----------
  const onKey = (e) => {
    if (!document.body.contains(ws)) { document.removeEventListener('keydown', onKey); return; }
    if (editing || subEditing || /input|textarea|select/i.test(document.activeElement?.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    else if (designMode && mod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (!sel) return;
      if (e.shiftKey) { if (sel.o.gid && !sel.o.items) ungroup(sel.p, sel.o.gid); }
      else groupItems(sel.p, sel.o.items || [sel.o]);
    }
    else if (designMode && mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const p = pages[0], items = [];
      for (const o of p.objs) { if (o.locked || o.hidden || o.isBg) continue; const it = topItem(p, o); if (!items.some((c) => sameItem(c, it))) items.push(it); }
      if (items.length) select({ p, o: items.length === 1 ? items[0] : { type: 'group', items, id: 'multi' } });
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
    else if (e.key === 'Escape') { pending = null; if (tool !== mode.start || pending) setTool(mode.start); else select(null); }
    else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1, { p, o } = sel;
      const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      for (const m of membersOf(p, o)) {
        if (m.points) m.points = m.points.map(([x, y]) => [x + dx, y + dy]); else { m.x += dx; m.y += dy; }
        rerender(p, m);
      }
    } else if (!mod && e.key === 'v' && mode.tools.includes('select')) setTool('select');
    else if (!mod && e.key === 't' && mode.tools.includes('text')) setTool('text');
    else if (!mod && e.key === 'b' && mode.tools.includes('brush')) setTool('brush');
    else if (!mod && e.key === 'e' && mode.tools.includes('perase')) setTool('perase');
    else if (!mod && (e.key === '[' || e.key === ']') && (tool === 'brush' || tool === 'perase')) { brush.size = clamp(brush.size + (e.key === ']' ? 5 : -5), 1, 400); drawSide(); }
  };
  document.addEventListener('keydown', onKey);

  // ---------- save ----------
  async function save(fromExport = false) {
    if (editing) finishEditing();
    if (designMode && !fromExport) { exportDesign(); return; }
    const redacts = pages.filter((p) => p.objs.some((o) => o.type === 'redact'));
    if (!hasChanges()) { toast('Nothing to save yet — add or change something first.'); return; }
    saveBtn.disabled = true;
    status.textContent = 'Saving…';
    try {
      // Pass 1: really remove the original text glyphs and images that were edited or deleted.
      let base = bytes;
      const textFailed = new Set(), imgRemoved = new Set();
      const edited = (p, kind) => p.objs.filter((o) => o.orig?.kind === kind);
      if (pages.some((p) => edited(p, 'text').length || edited(p, 'image').length)) {
        status.textContent = 'Removing original content…';
        const d0 = await loadPdfLib(bytes);
        for (const p of pages) {
          const texts = edited(p, 'text');
          if (texts.length) {
            const rects = texts.map((o) => {
              const r = o.orig.rect;
              const a = p.vp.convertToPdfPoint(r.x, r.y), b = p.vp.convertToPdfPoint(r.x + r.w, r.y + r.h);
              return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
            });
            try { removeTextInRects(d0, p.i, rects); } catch (e) { console.warn('text removal failed', e); }
          }
          // Remove the last-drawn first, so earlier draw numbers stay valid.
          const imgs = edited(p, 'image').sort((a, b) => b.orig.seq - a.orig.seq);
          let total = null;
          for (const o of imgs) {
            try {
              total ??= countImageDraws(d0, p.i);
              if (total !== o.orig.total) break; // can't match images to the file safely: covers are used instead
              if (removeNthImage(d0, p.i, o.orig.seq)) imgRemoved.add(o.id);
            } catch (e) { console.warn('image removal failed', e); }
          }
        }
        base = await d0.save();
        // Check that every edited line really disappeared; anything left gets the cover as a fallback.
        const check = await openPdfjs(base);
        for (const p of pages) {
          const texts = edited(p, 'text');
          if (!texts.length) continue;
          const items = (await (await check.getPage(p.i + 1)).getTextContent()).items;
          for (const o of texts) {
            const r = o.orig.rect;
            const left = items.some((it) => {
              if (!it.str?.trim()) return false;
              const tx = pdfjsLib.Util.transform(p.vp.transform, it.transform);
              const x0 = tx[4], x1 = tx[4] + it.width, base_ = tx[5];
              const overlap = Math.min(x1, r.x + r.w) - Math.max(x0, r.x);
              return base_ > r.y && base_ < r.y + r.h + 1 && overlap > Math.min(it.width, r.w) * 0.5;
            });
            if (left) textFailed.add(o.id);
          }
        }
        check.destroy();
      }
      const needsCover = (o) => (o.orig?.kind === 'text' ? textFailed.has(o.id) : o.orig?.kind === 'image' ? !imgRemoved.has(o.id) : !!o.cover);

      // Pass 2: draw everything new.
      const doc = await loadPdfLib(base);
      const fonts = {};
      const fontFor = async (o) => {
        if (o.family) {
          // A Google font: embedded (subset). Falls back to the built-in family if it can't be fetched.
          const gk = `g:${o.family}|${o.bold ? 1 : 0}|${o.italic ? 1 : 0}`;
          if (!(gk in fonts)) fonts[gk] = await embedGoogleFont(doc, o.family, o);
          if (fonts[gk]) return fonts[gk];
        }
        const key = FONTS[o.font || 'sans'].std[(o.bold ? 1 : 0) + (o.italic ? 2 : 0)];
        return (fonts[key] ||= await doc.embedFont(StandardFonts[key]));
      };
      const drawTextObj = async (page, toPdf, R, o) => {
        if (!o.text) return;
        const op = (o.opacity ?? 100) / 100;
        const font = await fontFor(o);
        const lines = o.text.split('\n');
        const ls = o.ls || 0;
        let encodable = true;
        try { lines.forEach((l) => font.encodeText(l)); } catch { encodable = false; }
        if (encodable) {
          if (ls) page.pushOperators(pushGraphicsState(), setCharacterSpacing(ls));
          lines.forEach((line, k) => {
            const lw = font.widthOfTextAtSize(line, o.size) + ls * Math.max(0, line.length - 1);
            const dx = o.align === 'center' ? (o.w - lw) / 2 : o.align === 'right' ? o.w - lw : 0;
            const [x, y] = toPdf(o.x + dx, o.y + o.size * (baselineRatio(o) + k * (o.lh || 1.2)));
            page.drawText(line, { x, y, size: o.size, font, color: rgb(...hexToRgb01(o.color)), opacity: op, rotate: R });
          });
          if (ls) page.pushOperators(popGraphicsState());
        } else {
          // Characters outside the built-in PDF fonts (e.g. Indic scripts, emoji): draw as a sharp image.
          const png = await doc.embedPng(await textToPng(o));
          const [x, y] = toPdf(o.x, o.y + o.h);
          page.drawImage(png, { x, y, width: o.w, height: o.h, opacity: op, rotate: R });
        }
      };
      for (const p of pages) {
        if (!p.objs.length) continue;
        const page = doc.getPage(p.i);
        const rot = ((p.page.rotate % 360) + 360) % 360;
        const toPdf = (x, y) => p.vp.convertToPdfPoint(x, y);
        const R = degrees(rot);
        for (const o of p.objs) {
          if (o.type === 'redact' || o.hidden) continue;
          if (o.cover && needsCover(o)) {
            const [cx, cy] = toPdf(o.cover.x, o.cover.y + o.cover.h);
            page.drawRectangle({ x: cx, y: cy, width: o.cover.w, height: o.cover.h, color: rgb(...hexToRgb01(o.cover.color)), rotate: R });
          }
          const op = (o.opacity ?? 100) / 100;
          if (o.type === 'text') {
            await drawTextObj(page, toPdf, R, o);
          } else if (o.type === 'image') {
            if (!o.src || o.deleted) continue;
            const sharp = o.sharp !== false && o.texts?.length && o.natW;
            const src = await bakeImage(o, !sharp);
            const imgBytes = await blobToBytes(await (await fetch(src)).blob());
            const img = src.startsWith('data:image/png') ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);
            if (o.clip && o.natW) {
              // Clipping mask: a real PDF clipping path, so the picture keeps its full quality.
              const poly = clipPolygon(o.clip, o.w, o.h).map(([px, py]) => toPdf(o.x + px, o.y + py));
              const outline = () => [moveTo(...poly[0]), ...poly.slice(1).map((q) => lineTo(...q)), closePath()];
              page.pushOperators(pushGraphicsState(), ...outline(), clip(), endPath());
              const L = frameLayout(o);
              const [x, y] = toPdf(o.x + L.x, o.y + L.y + L.h);
              page.drawImage(img, { x, y, width: L.w, height: L.h, opacity: op, rotate: R });
              page.pushOperators(popGraphicsState());
              if (o.frameSw) {
                const [r, g, b] = hexToRgb01(o.frameStroke || '#ffffff');
                page.pushOperators(pushGraphicsState(), setStrokingRgbColor(r, g, b), setLineWidth(o.frameSw), setLineJoin(LineJoinStyle.Round), ...outline(), stroke(), popGraphicsState());
              }
              continue;
            }
            const [x, y] = toPdf(o.x, o.y + o.h);
            page.drawImage(img, { x, y, width: o.w, height: o.h, opacity: op, rotate: R });
            if (sharp) {
              // Text typed into the image becomes real, searchable PDF text at the same spot.
              const k = o.w / o.natW;
              for (const t of o.texts) {
                if (!t.text) continue;
                const nLines = t.text.split('\n').length;
                await drawTextObj(page, toPdf, R, { text: t.text, x: o.x + t.x * k, y: o.y + t.y * k, size: t.size * k, font: t.font || 'sans', family: t.family, bold: t.bold, italic: t.italic, color: t.color, ls: (t.ls || 0) * k, align: t.align, opacity: o.opacity, w: textWidth(t) * k, h: t.size * 1.2 * nLines * k });
              }
            }
          } else if (o.type === 'rect' || o.type === 'whiteout') {
            const [x, y] = toPdf(o.x, o.y + o.h);
            page.drawRectangle({ x, y, width: o.w, height: o.h, rotate: R, borderWidth: o.type === 'rect' ? o.sw : 0, borderColor: o.type === 'rect' && o.sw > 0 ? rgb(...hexToRgb01(o.stroke)) : undefined, color: o.fill ? rgb(...hexToRgb01(o.fill)) : undefined, opacity: o.fill ? op : undefined, borderOpacity: op });
          } else if (o.type === 'ellipse') {
            const [x, y] = toPdf(o.x + o.w / 2, o.y + o.h / 2);
            const rx = rot % 180 ? o.h / 2 : o.w / 2, ry = rot % 180 ? o.w / 2 : o.h / 2;
            page.drawEllipse({ x, y, xScale: rx, yScale: ry, borderWidth: o.sw, borderColor: o.sw > 0 ? rgb(...hexToRgb01(o.stroke)) : undefined, color: o.fill ? rgb(...hexToRgb01(o.fill)) : undefined, opacity: o.fill ? op : undefined, borderOpacity: op });
          } else if (o.type === 'line' || o.type === 'arrow' || o.type === 'path') {
            const color = rgb(...hexToRgb01(o.stroke));
            if (o.type === 'path') {
              const [ox, oy] = toPdf(0, 0);
              const d = 'M' + o.points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L');
              page.drawSvgPath(d, { x: ox, y: oy, borderColor: color, borderWidth: o.sw, borderOpacity: op, rotate: R, borderLineCap: o.hl ? 0 : 1 });
            } else {
              const [a, b] = o.points.map(([x, y]) => toPdf(x, y));
              page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: o.sw, color, opacity: op, lineCap: 1 });
              if (o.type === 'arrow') {
                const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.max(10, o.sw * 4);
                for (const s of [-0.45, 0.45]) page.drawLine({ start: { x: b[0], y: b[1] }, end: { x: b[0] - L * Math.cos(ang + s), y: b[1] - L * Math.sin(ang + s) }, thickness: o.sw, color, opacity: op, lineCap: 1 });
              }
            }
          } else if (o.type === 'field') {
            const form = doc.getForm();
            const c1 = toPdf(o.x, o.y), c2 = toPdf(o.x + o.w, o.y + o.h);
            const rect = { x: Math.min(c1[0], c2[0]), y: Math.min(c1[1], c2[1]), width: Math.abs(c2[0] - c1[0]), height: Math.abs(c2[1] - c1[1]), borderWidth: 1, borderColor: rgb(0.4, 0.45, 0.5) };
            let name = o.name, n = 2;
            while (form.getFieldMaybe(name)) name = `${o.name}_${n++}`;
            if (o.kind === 'checkbox') form.createCheckBox(name).addToPage(page, rect);
            else { const tf = form.createTextField(name); tf.addToPage(page, { ...rect, backgroundColor: rgb(0.94, 0.96, 1) }); tf.setFontSize(0); }
          }
        }
      }
      let out = await doc.save();
      if (redacts.length) out = await flattenRedactions(out, redacts, (m) => (status.textContent = m));
      window.removeEventListener('beforeunload', beforeUnload);
      if (designMode) {
        // "PDF with editable text" from the Download menu: hand the file over and stay in the editor.
        download(pdfBlob(out), stem(opts.name || file.name) + '-editable.pdf');
        status.textContent = ''; saveBtn.disabled = false;
        toast('Downloaded a PDF with editable text (built-in fonts are used for the text).');
        return;
      }
      ctx.finish([{ name: stem(file.name) + mode.suffix + '.pdf', blob: pdfBlob(out) }],
        redacts.length ? `Redacted ${redacts.length} page(s). Those pages were flattened into images so the hidden text cannot be recovered.` : null);
    } catch (e) {
      console.error(e);
      status.textContent = '';
      toast('Could not save: ' + e.message, 5000);
      saveBtn.disabled = false;
    }
  }

  async function flattenRedactions(pdfBytes, redactPages, onStatus) {
    const v = await openPdfjs(pdfBytes);
    const doc = await loadPdfLib(pdfBytes);
    for (const p of redactPages) {
      onStatus(`Flattening page ${p.i + 1}…`);
      const pg = await v.getPage(p.i + 1);
      const scale = 200 / 72;
      const c = await renderPage(pg, scale);
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      for (const o of p.objs) if (o.type === 'redact') g.fillRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale);
      const img = await doc.embedJpg(await blobToBytes(await canvasToBlob(c, 'image/jpeg', 0.88)));
      const np = doc.insertPage(p.i, [p.vp.width, p.vp.height]);
      np.drawImage(img, { x: 0, y: 0, width: p.vp.width, height: p.vp.height });
      doc.removePage(p.i + 1);
    }
    // Redacted documents shouldn't leak details through their metadata either.
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator('EditSupreme'); doc.setProducer('EditSupreme');
    v.destroy();
    return doc.save();
  }

  drawToolbar();
  drawSide();
  if (tool === 'signature') setTool('signature');
  else if (tool === 'editimage') setTool('editimage');
}

/**
 * Draw editor objects (back to front) onto a canvas at `scale` × the design size. Matches what the editor
 * shows: Google fonts, rotation, line spacing, shadows, outlines, gradients, frames, filters.
 */
export async function renderDesign(objs, W, H, scale = 1, bgColor = '#ffffff') {
  await fontsReady(objs);
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale); const g = c.getContext('2d'); g.scale(scale, scale); return [c, g]; };
  const [c, g] = mk();
  if (bgColor) { g.fillStyle = bgColor; g.fillRect(0, 0, W, H); }
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (o.clipBelow && i > 0) continue; // drawn together with the layer it is clipped to
    // Layers clipped to this one only show where this one is painted.
    const followers = [];
    for (let j = i + 1; j < objs.length && objs[j].clipBelow; j++) followers.push(objs[j]);
    if (!followers.length) { await drawObj(g, o, scale); continue; }
    if (o.hidden || o.deleted) continue;
    const [L, gl] = mk();
    await drawObj(gl, o, scale);
    for (const f of followers) {
      if (f.hidden || f.deleted) continue;
      const [F, gf] = mk();
      await drawObj(gf, f, scale);
      gf.setTransform(1, 0, 0, 1, 0, 0);
      gf.globalCompositeOperation = 'destination-in';
      gf.drawImage(L, 0, 0);
      gl.save(); gl.setTransform(1, 0, 0, 1, 0, 0); gl.drawImage(F, 0, 0); gl.restore();
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L, 0, 0); g.restore();
  }
  return c;
}

// The picture of an image layer with its mask applied (transparent where the mask is empty).
async function maskedSrc(o, src) {
  const img = await loadImage(src), m = await loadImage(o.mask);
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  // The mask follows the layer on screen, so a mirrored layer has a mirrored mask too.
  if (o.flipX) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(m, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function drawObj(g, o, scale) {
  {
    if (o.hidden || o.deleted || o.type === 'redact' || o.type === 'field') return;
    const b = o.points ? null : { x: o.x, y: o.y, w: o.w, h: o.h };
    g.save();
    g.globalAlpha = (o.opacity ?? 100) / 100;
    if (o.rot && b) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; g.translate(cx, cy); g.rotate((o.rot * Math.PI) / 180); g.translate(-cx, -cy); }
    if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'whiteout') {
      const path = new Path2D();
      if (o.type === 'ellipse') path.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      else if (o.radius) path.roundRect(b.x, b.y, b.w, b.h, Math.min(o.radius, b.w / 2, b.h / 2));
      else path.rect(b.x, b.y, b.w, b.h);
      const fill = o.type === 'whiteout' ? o.fill || '#ffffff' : o.grad ? canvasGradient(g, o.grad, b.x, b.y, b.w, b.h) : o.fill;
      if (fill && fill !== 'transparent') { g.fillStyle = fill; g.fill(path); }
      if (o.type !== 'whiteout' && o.sw > 0) {
        // CSS borders sit inside the box: stroke along a path inset by half the width.
        const s = o.sw, p2 = new Path2D();
        if (o.type === 'ellipse') p2.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.max(0, b.w / 2 - s / 2), Math.max(0, b.h / 2 - s / 2), 0, 0, Math.PI * 2);
        else p2.roundRect(b.x + s / 2, b.y + s / 2, Math.max(0, b.w - s), Math.max(0, b.h - s), Math.max(0, Math.min(o.radius || 0, b.w / 2, b.h / 2) - s / 2));
        g.strokeStyle = o.stroke; g.lineWidth = s; g.stroke(p2);
      }
    } else if (o.type === 'image' && o.src) {
      let baked = await bakeImage(o, true);
      if (o.mask) baked = await maskedSrc(o, baked);
      const img = await loadImage(baked);
      if (o.clip && o.natW) {
        const poly = clipPolygon(o.clip, b.w, b.h);
        g.beginPath(); poly.forEach(([px, py], k) => (k ? g.lineTo(b.x + px, b.y + py) : g.moveTo(b.x + px, b.y + py))); g.closePath();
        g.save(); g.clip();
        const L = frameLayout(o);
        g.drawImage(img, b.x + L.x, b.y + L.y, L.w, L.h);
        g.restore();
        if (o.frameSw) { g.strokeStyle = o.frameStroke || '#ffffff'; g.lineWidth = o.frameSw; g.lineJoin = 'round'; g.stroke(); }
      } else g.drawImage(img, b.x, b.y, b.w, b.h);
    } else if (o.type === 'text' && o.text) {
      const lh = (o.lh || 1.2) * o.size;
      g.font = `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : '400 '}${o.size}px ${fontCssOf(o)}`;
      g.letterSpacing = (o.ls || 0) + 'px';
      g.textBaseline = 'alphabetic';
      const m = g.measureText('Hg');
      const asc = m.fontBoundingBoxAscent ?? o.size * 0.9, desc = m.fontBoundingBoxDescent ?? o.size * 0.25;
      const lines = o.text.split('\n');
      const boxW = Math.max(o.w || 0, ...lines.map((l) => g.measureText(l).width));
      lines.forEach((line, k) => {
        const lw = g.measureText(line).width;
        const x = b.x + (o.align === 'center' ? (boxW - lw) / 2 : o.align === 'right' ? boxW - lw : 0);
        // CSS puts half the extra line height above the glyphs, so the baseline lands here.
        const y = b.y + k * lh + (lh - (asc + desc)) / 2 + asc;
        if (o.shadow) { g.shadowColor = o.shadow.color; g.shadowBlur = o.shadow.blur * scale; g.shadowOffsetX = o.shadow.x * scale; g.shadowOffsetY = o.shadow.y * scale; }
        if (o.outline) { g.strokeStyle = o.outline.color; g.lineWidth = o.outline.width; g.lineJoin = 'round'; g.strokeText(line, x, y); g.shadowColor = 'transparent'; }
        g.fillStyle = o.color; g.fillText(line, x, y);
        g.shadowColor = 'transparent';
      });
    } else if (o.points && o.points.length > 1) {
      g.strokeStyle = o.stroke; g.lineWidth = o.sw; g.lineCap = o.hl ? 'butt' : 'round'; g.lineJoin = 'round';
      if (o.hl) g.globalCompositeOperation = 'multiply';
      g.beginPath(); o.points.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      if (o.type === 'arrow') {
        const [a, bb] = o.points, ang = Math.atan2(bb[1] - a[1], bb[0] - a[0]), L = Math.max(10, o.sw * 4);
        g.beginPath(); g.moveTo(bb[0] - L * Math.cos(ang - 0.45), bb[1] - L * Math.sin(ang - 0.45)); g.lineTo(bb[0], bb[1]); g.lineTo(bb[0] - L * Math.cos(ang + 0.45), bb[1] - L * Math.sin(ang + 0.45)); g.stroke();
      }
    }
    g.restore();
  }
}

// A text object's CSS font: its Google font (Design Studio) first, then the matching built-in family.
// Where the first baseline sits below the top of a text box, as a fraction of the font size (CSS line box model).
const baseCtx = document.createElement('canvas').getContext('2d');
function baselineRatio(o) {
  if (!o.family && !o.lh) return FONTS[o.font || 'sans'].asc;
  baseCtx.font = `${o.italic ? 'italic ' : ''}${o.bold ? 700 : 400} 100px ${fontCssOf(o)}`;
  const m = baseCtx.measureText('Hg');
  const a = (m.fontBoundingBoxAscent ?? 90) / 100, d = (m.fontBoundingBoxDescent ?? 25) / 100, lh = o.lh || 1.2;
  return (lh - (a + d)) / 2 + a;
}

function fontCssOf(o) {
  return o.family ? fontStack(o.family) : FONTS[o.font || 'sans'].css;
}

// ---------- clipping masks (picture frames) ----------
// Shapes are outlines in a 0..1 box, used for the on-screen clip-path and the PDF clipping path alike.
// Apply (or remove) a CSS mask image on an element.
function setMask(el, url, size = '100% 100%', pos = '0 0') {
  const v = url ? `url("${url}")` : '';
  for (const k of ['maskImage', 'webkitMaskImage']) el.style[k] = v;
  for (const k of ['maskSize', 'webkitMaskSize']) el.style[k] = url ? size : '';
  for (const k of ['maskPosition', 'webkitMaskPosition']) el.style[k] = url ? pos : '';
  for (const k of ['maskRepeat', 'webkitMaskRepeat']) el.style[k] = url ? 'no-repeat' : '';
}

export const blankDesign = (W, H) => [{ type: 'rect', layer: 'Background', isBg: true, locked: true, x: 0, y: 0, w: W, h: H, fill: '#ffffff', stroke: '#ffffff', sw: 0, opacity: 100 }];

/** Pick a canvas size for a new design: a preset (Instagram, A4…) or a custom size. Resolves {W, H, sizeId, name} or null. */
export function pickDesignSize({ onTemplates } = {}) {
  return new Promise((resolve) => {
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') close(null); };
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
    const card = ([id, name, w, hh]) => {
      const k = 46 / Math.max(w, hh);
      return h('button', { type: 'button', class: 'sizepick', onclick: () => close({ W: w, H: hh, sizeId: id, name: slug(name) }) },
        h('span', { class: 'shape', style: { width: w * k + 'px', height: hh * k + 'px' } }), h('b', {}, name), h('span', {}, `${w} × ${hh}`));
    };
    const unit = { v: 'px' };
    const wIn = h('input', { class: 'inp', type: 'number', min: 1, step: 'any', value: 1080 }), hIn = h('input', { class: 'inp', type: 'number', min: 1, step: 'any', value: 1080 });
    const dpi = h('input', { class: 'inp', type: 'number', min: 30, max: 1200, value: 300, title: 'DPI for cm, mm and inches' });
    const unitSel = h('select', { class: 'inp', onchange: (e) => { unit.v = e.target.value; dpiWrap.classList.toggle('hidden', unit.v === 'px'); } }, [['px', 'pixels'], ['mm', 'mm'], ['cm', 'cm'], ['in', 'inches']].map(([v, l]) => h('option', { value: v }, l)));
    const dpiWrap = h('label', { class: 'mini hidden' }, 'DPI', dpi);
    const err = h('div', { class: 'error' });
    const create = () => {
      const per = { px: 1, in: +dpi.value || 300, cm: (+dpi.value || 300) / 2.54, mm: (+dpi.value || 300) / 25.4 }[unit.v];
      const w = Math.round((+wIn.value || 0) * per), hh = Math.round((+hIn.value || 0) * per);
      if (w < 16 || hh < 16) { err.textContent = 'Enter a width and height (at least 16 px).'; return; }
      if (w > 8000 || hh > 8000) { err.textContent = `${w} × ${hh} px is too big; the largest is 8000 px per side.`; return; }
      close({ W: w, H: hh, name: 'custom-design' });
    };
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(null); } },
      h('div', { class: 'modal sizemodal', role: 'dialog', 'aria-label': 'New project' },
        h('div', { class: 'pvhead' }, h('h3', {}, 'New project: choose a size'), h('span', { class: 'status' }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', html: icon('x'), onclick: () => close(null) })),
        h('div', { class: 'sizebody' },
          h('div', { class: 'customsize' }, h('b', {}, 'Custom size'),
            h('div', { class: 'row' }, h('label', { class: 'mini' }, 'Width', wIn), h('span', {}, '×'), h('label', { class: 'mini' }, 'Height', hIn), h('label', { class: 'mini' }, 'Unit', unitSel), dpiWrap,
              h('button', { class: 'btn primary', type: 'button', onclick: create }, 'Create')), err),
          ...SIZES.map(([group, list]) => h('div', {}, h('div', { class: 'lbl' }, group), h('div', { class: 'sizepicks' }, ...list.map(card))))),
        onTemplates ? h('div', { class: 'foot' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(null); onTemplates(); } }, 'Start from a template instead')) : null));
    document.addEventListener('keydown', esc);
    document.body.append(bg);
  });
}

export const CLIP_SHAPES = [['rect', 'Square'], ['rounded', 'Rounded'], ['ellipse', 'Circle / oval'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'], ['star', 'Star'], ['heart', 'Heart'], ['blob', 'Blob']];
function clipPolygon(shape, w = 1, h = 1) {
  const ring = (n, f) => Array.from({ length: n }, (_, k) => f((k / n) * Math.PI * 2, k));
  let pts;
  switch (shape) {
    case 'ellipse': pts = ring(120, (a) => [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]); break;
    case 'rounded': {
      const r = Math.min(w, h) * 0.14, rx = r / w, ry = r / h;
      pts = [];
      for (const [cx, cy, a0] of [[1 - rx, ry, -90], [1 - rx, 1 - ry, 0], [rx, 1 - ry, 90], [rx, ry, 180]])
        for (let k = 0; k <= 12; k++) { const a = ((a0 + (k * 90) / 12) * Math.PI) / 180; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      break;
    }
    case 'triangle': pts = [[0.5, 0], [1, 1], [0, 1]]; break;
    case 'diamond': pts = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]; break;
    case 'hexagon': pts = ring(6, (a) => [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]); break;
    case 'star': pts = ring(10, (a, k) => { const r = k % 2 ? 0.2 : 0.5; return [0.5 + Math.cos(a - Math.PI / 2) * r, 0.53 + Math.sin(a - Math.PI / 2) * r]; }); break;
    case 'heart': pts = ring(120, (a) => { const x = 16 * Math.sin(a) ** 3, y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); return [0.5 + x / 34, 0.47 - y / 32]; }); break;
    case 'blob': pts = ring(120, (a) => { const r = 0.42 + 0.05 * Math.sin(3 * a) + 0.03 * Math.cos(5 * a + 1); return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]; }); break;
    default: pts = [[0, 0], [1, 0], [1, 1], [0, 1]];
  }
  return pts.map(([x, y]) => [x * w, y * h]);
}
const clipPathCss = (shape, w, h) => `path('M${clipPolygon(shape, w, h).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z')`;
// Where the picture sits inside its frame: it covers the frame, then is zoomed and panned.
function frameLayout(o) {
  const s = Math.max(o.w / o.natW, o.h / o.natH) * (o.fzoom || 1);
  const dw = o.natW * s, dh = o.natH * s;
  return { x: (o.w - dw) * (o.panX ?? 0.5), y: (o.h - dh) * (o.panY ?? 0.5), w: dw, h: dh };
}

// ---------- helpers ----------
// Box around characters [at, at+len) of a text run, using real glyph widths of a similar font, with a safety margin.
const measureCtx = document.createElement('canvas').getContext('2d');
function spanBox(r, at, len) {
  measureCtx.font = `100px ${/mono|courier/i.test(r.family) ? FONTS.mono.css : /serif/i.test(r.family) && !/sans/i.test(r.family) ? FONTS.serif.css : FONTS.sans.css}`;
  const k = r.w / (measureCtx.measureText(r.str).width || 1);
  const x0 = measureCtx.measureText(r.str.slice(0, at)).width * k;
  const x1 = measureCtx.measureText(r.str.slice(0, at + len)).width * k;
  const pad = r.size * 0.2;
  return { x: r.x + x0 - pad, y: r.base - r.size * 0.95, w: x1 - x0 + 2 * pad, h: r.size * 1.25 };
}
function cssFilter(f = {}) {
  return [
    f.brightness != null && `brightness(${f.brightness}%)`, f.contrast != null && `contrast(${f.contrast}%)`,
    f.saturate != null && `saturate(${f.saturate}%)`, f.hue && `hue-rotate(${f.hue}deg)`, f.blur && `blur(${f.blur}px)`,
    f.grayscale && 'grayscale(100%)', f.sepia && 'sepia(100%)', f.invert && 'invert(100%)'
  ].filter(Boolean).join(' ') || 'none';
}

function hasAlpha(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true;
  return false;
}

async function bakeImage(o, withTexts = true) {
  const f = cssFilter(o.filters);
  const texts = withTexts ? (o.texts || []).filter((t) => t.text) : [];
  const wantJpeg = o.jpeg ?? o.src.startsWith('data:image/jpeg');
  const isJpeg = o.src.startsWith('data:image/jpeg');
  if (f === 'none' && !o.flipX && !texts.length && /^data:image\/(png|jpeg)/.test(o.src) && wantJpeg === isJpeg) return o.src;
  const img = await loadImage(o.src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.save();
  g.filter = f;
  if (o.flipX) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0);
  g.restore();
  if (texts.length) drawTexts(g, texts);
  return wantJpeg ? c.toDataURL('image/jpeg', 0.93) : c.toDataURL('image/png');
}

async function flipSrc(src) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

async function textToPng(o) {
  const S = 4;
  const c = document.createElement('canvas');
  c.width = Math.ceil(o.w * S); c.height = Math.ceil(o.h * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  drawTexts(g, [{ ...o, x: 0, y: 0, opacity: 100 }]);
  return blobToBytes(await canvasToBlob(c, 'image/png'));
}

const fileToDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const imgRatio = async (src) => { const i = await loadImage(src); return i.naturalWidth / i.naturalHeight || 1; };

async function rotateSrc(src) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalHeight; c.height = img.naturalWidth;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
  return src.startsWith('data:image/jpeg') ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}

async function removeWhite(src, threshold = 225) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    if (m > threshold) d[i + 3] = 0;
    else if (m > threshold - 40) d[i + 3] = Math.round(d[i + 3] * (threshold - m) / 40);
  }
  g.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

function trimCanvas(c) {
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const t = document.createElement('canvas');
  t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
  t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

const SIG_KEY = 'pagewise.signatures';
const loadSigs = () => { try { return JSON.parse(localStorage.getItem(SIG_KEY) || '[]'); } catch { return []; } };
const storeSigs = (list) => { try { localStorage.setItem(SIG_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* storage full or blocked */ } };

async function signatureDialog(title) {
  if (!document.getElementById('sigfonts')) {
    document.head.append(h('link', { id: 'sigfonts', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&display=swap' }));
  }
  let tab = 'draw', ink = '#1d2b6b', typed = '', typedFont = SIG_FONTS[0], uploaded = null;
  const body = h('div');
  const pad = h('canvas', { class: 'sigpad' });
  let strokes = [];
  const drawPad = () => {
    const g = pad.getContext('2d');
    g.clearRect(0, 0, pad.width, pad.height);
    g.strokeStyle = ink; g.lineWidth = 2.6 * (pad.width / pad.clientWidth); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of strokes) {
      g.beginPath();
      s.forEach(([x, y], i) => { if (!i) g.moveTo(x, y); else { const [px, py] = s[i - 1]; g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); } });
      if (s.length === 1) g.lineTo(s[0][0] + 0.1, s[0][1]);
      g.stroke();
    }
  };
  let drawing = null;
  pad.addEventListener('pointerdown', (e) => { const r = pad.getBoundingClientRect(), k = pad.width / r.width; drawing = [[(e.clientX - r.left) * k, (e.clientY - r.top) * k]]; strokes.push(drawing); pad.setPointerCapture(e.pointerId); drawPad(); });
  pad.addEventListener('pointermove', (e) => { if (!drawing) return; const r = pad.getBoundingClientRect(), k = pad.width / r.width; drawing.push([(e.clientX - r.left) * k, (e.clientY - r.top) * k]); drawPad(); });
  pad.addEventListener('pointerup', () => (drawing = null));

  const render = () => {
    body.replaceChildren(
      h('div', { class: 'seg', style: { marginBottom: '12px' } }, ...[['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']].map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; render(); } }, l))),
      h('div', { class: 'seg', style: { marginBottom: '12px' } }, ...['#111111', '#1d2b6b', '#b42318'].map((c) => h('button', { type: 'button', title: 'Ink colour', class: ink === c ? 'on' : '', style: { color: c, fontWeight: 800 }, onclick: () => { ink = c; render(); } }, '●'))));
    if (tab === 'draw') {
      body.append(pad, h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px' } }, h('span', { class: 'status' }, 'Sign with your mouse, finger or stylus'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => { strokes = []; drawPad(); } }, 'Clear')));
      requestAnimationFrame(() => { pad.width = pad.clientWidth * 2; pad.height = pad.clientHeight * 2; drawPad(); });
    } else if (tab === 'type') {
      const inp = h('input', { class: 'inp', placeholder: 'Type your name', value: typed, oninput: (e) => { typed = e.target.value; opts.querySelectorAll('.sigopt').forEach((b) => (b.textContent = typed || 'Your name')); } });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      const opts = h('div', { class: 'sigopts', style: { marginTop: '10px' } }, SIG_FONTS.map((f) => h('button', { type: 'button', class: 'sigopt' + (typedFont === f ? ' on' : ''), style: { fontFamily: `'${f}', cursive`, color: ink }, onclick: () => { typedFont = f; render(); } }, typed || 'Your name')));
      body.append(inp, opts);
      setTimeout(() => inp.focus(), 30);
    } else {
      body.append(h('button', { class: 'btn', type: 'button', onclick: async () => { const [f] = await pickFiles('image/*', false); if (f) { uploaded = await removeWhite(await fileToDataUrl(f)); render(); } } }, 'Choose an image of your signature'),
        uploaded ? h('img', { src: uploaded, style: { maxHeight: '120px', marginTop: '10px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px' } }) : h('p', { class: 'status' }, 'A photo of your signature on white paper works well; the white background is removed automatically.'));
    }
    const saved = loadSigs();
    if (saved.length) {
      body.append(h('div', { class: 'lbl', style: { marginTop: '16px', fontWeight: 600, fontSize: '13px' } }, 'Saved on this device'),
        h('div', { class: 'savedsigs' }, saved.map((s, i) => h('button', { type: 'button', title: 'Use this one (right-click to forget it)', onclick: () => { chosen = s; done(); }, oncontextmenu: (e) => { e.preventDefault(); saved.splice(i, 1); storeSigs(saved); render(); } }, h('img', { src: s, alt: 'Saved signature' })))));
    }
  };
  let chosen = null, done = () => {};
  render();
  const make = async () => {
    if (chosen) return chosen;
    let src = null;
    if (tab === 'draw') src = strokes.length ? trimCanvas(pad) : null;
    else if (tab === 'type') {
      if (!typed.trim()) return null;
      await document.fonts.load(`64px '${typedFont}'`).catch(() => {});
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      g.font = `96px '${typedFont}', cursive`;
      c.width = Math.ceil(g.measureText(typed).width + 60); c.height = 180;
      g.font = `96px '${typedFont}', cursive`; g.fillStyle = ink; g.textBaseline = 'middle';
      g.fillText(typed, 30, 95);
      src = trimCanvas(c);
    } else src = uploaded;
    if (src) storeSigs([src, ...loadSigs().filter((s) => s !== src)]);
    return src;
  };
  return new Promise((resolve) => {
    const p = modal(title, body, [{ label: 'Cancel', value: null }, { label: 'Use it', primary: true, value: async () => { const s = await make(); if (!s) { toast('Draw, type or upload first.'); return undefined; } return s; } }]);
    done = () => document.querySelector('.modal-bg .foot .btn.primary')?.click();
    p.then(resolve);
  });
}

export async function cropDialog(src) {
  const img = await loadImage(src);
  const c = h('canvas', { style: { width: '100%', touchAction: 'none', cursor: 'crosshair', background: '#fff' } });
  const maxW = 500;
  const s = Math.min(1, maxW / img.naturalWidth, 380 / img.naturalHeight);
  c.width = img.naturalWidth * s; c.height = img.naturalHeight * s;
  let r = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, 0, c.width, r.y * c.height);
    g.fillRect(0, (r.y + r.h) * c.height, c.width, c.height);
    g.fillRect(0, r.y * c.height, r.x * c.width, r.h * c.height);
    g.fillRect((r.x + r.w) * c.width, r.y * c.height, c.width, r.h * c.height);
    g.strokeStyle = '#4fb3a6'; g.lineWidth = 2; g.strokeRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
  };
  let st = null;
  const pos = (e) => { const b = c.getBoundingClientRect(); return [clamp((e.clientX - b.left) / b.width, 0, 1), clamp((e.clientY - b.top) / b.height, 0, 1)]; };
  c.addEventListener('pointerdown', (e) => { st = pos(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => { if (!st) return; const [x, y] = pos(e); r = { x: Math.min(x, st[0]), y: Math.min(y, st[1]), w: Math.abs(x - st[0]), h: Math.abs(y - st[1]) }; draw(); });
  c.addEventListener('pointerup', () => (st = null));
  draw();
  return modal('Crop image', h('div', {}, h('p', { class: 'status' }, 'Drag over the part of the image to keep.'), c), [
    { label: 'Cancel', value: null },
    { label: 'Crop', primary: true, value: () => {
      if (r.w < 0.01 || r.h < 0.01) return null;
      const o = document.createElement('canvas');
      o.width = Math.max(1, Math.round(r.w * img.naturalWidth)); o.height = Math.max(1, Math.round(r.h * img.naturalHeight));
      o.getContext('2d').drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight, o.width, o.height, 0, 0, o.width, o.height);
      return { src: src.startsWith('data:image/jpeg') ? o.toDataURL('image/jpeg', 0.92) : o.toDataURL('image/png'), fx: r.x, fy: r.y, fw: r.w, fh: r.h };
    } }
  ]);
}

const editorTool = (mode, label) => ({ accept: PDF, multiple: false, label, mount: (el, files, ctx) => mountEditor(el, files[0], ctx, mode).catch((e) => { el.replaceChildren(h('p', { class: 'error' }, e.message)); }) });

export const tools = {
  edit: editorTool('edit', 'Select a PDF to edit'),
  sign: editorTool('sign', 'Select a PDF to sign'),
  redact: editorTool('redact', 'Select a PDF to redact'),
  'edit-images': editorTool('images', 'Select a PDF')
};
