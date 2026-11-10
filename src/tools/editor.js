// Page editor used by Edit PDF, Sign PDF, Redact PDF, Edit PDF images and the PDF Forms designer.
// Objects live in "page units": PDF points in the page's on-screen orientation, origin top-left.
import { StandardFonts, rgb, degrees, PDFDocument, pushGraphicsState, popGraphicsState, setCharacterSpacing, moveTo, lineTo, closePath, clip, endPath, stroke, setLineWidth, setStrokingRgbColor, setLineJoin, LineJoinStyle } from '@cantoo/pdf-lib';
import { pdfjsLib, readBytes, pdfBlob, stem, openPdfjs, loadPdfLib, renderPage, canvasToBlob, blobToBytes, hexToRgb01, loadImage } from '../lib/core.js';
import { pageImages } from '../lib/pdfimages.js';
import { removeTextInRects, removeNthImage, countImageDraws } from '../lib/contentedit.js';
import { findText, findPictures, eraseRegion, drawTexts, srcToCanvas, textWidth, ASC } from '../lib/imagetext.js';
import { h, ibtn, modal, pickFiles, toast, askPassword } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

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
  forms: { tools: ['select', '|', 'textfield', 'checkbox', 'text'], save: 'Save fillable PDF', suffix: '-fillable', start: 'textfield' }
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
  pen: 'Draw freely with mouse, finger or stylus.', highlight: 'Drag across text to highlight it.',
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
  let ocrLang = 'eng', scanHinted = false;
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
  const ws = h('div', { class: 'ws' }, h('div', { class: 'wsmain' }, toolbar, area, foot), side);
  el.replaceChildren(ws);

  const hasChanges = () => pages.some((p) => p.objs.length);
  const beforeUnload = (e) => { if (hasChanges()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('hashchange', () => window.removeEventListener('beforeunload', beforeUnload), { once: true });

  function drawToolbar() {
    toolbar.replaceChildren();
    for (const t of mode.tools) {
      if (t === '|') { toolbar.append(h('span', { class: 'sep' })); continue; }
      const [ic, title] = TOOL_INFO[t];
      toolbar.append(ibtn(ic, title, () => setTool(t), tool === t ? 'active' : ''));
    }
    toolbar.append(h('span', { class: 'sep' }),
      ibtn('undo', 'Undo (Ctrl+Z)', undo), ibtn('redo', 'Redo (Ctrl+Y)', redo),
      h('span', { class: 'sep' }),
      ibtn('zoomout', 'Zoom out', () => setZoom(zoom / 1.2)),
      h('span', { class: 'lbl' }, Math.round(zoom * 100) + '%'),
      ibtn('zoomin', 'Zoom in', () => setZoom(zoom * 1.2)));
  }

  async function setTool(t) {
    if (editing) finishEditing();
    if (subEditing) finishSubEditing();
    tool = t;
    pending = null;
    imgMode = null;
    sub = null;
    select(null);
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
    const wrap = h('div', { class: 'pagewrap', 'data-i': i - 1 }, canvas, overlay, h('span', { class: 'pnum' }, `${i} / ${view.numPages}`));
    const p = { i: i - 1, page, vp, canvas, overlay, wrap, objs: [], rendered: 0, runs: null, imgs: null, existingEls: [] };
    pages.push(p);
    area.append(wrap);
    bindOverlay(p);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { const p = pages[+e.target.dataset.i]; if (p.rendered !== zoom) renderBg(p); }
  }, { root: area, rootMargin: '600px' });
  pages.forEach((p) => io.observe(p.wrap));

  if (opts.initial) for (const p of pages) p.objs = (opts.initial[p.i] || []).map((o) => ({ id: nid(), ...o }));

  const fitZoom = () => clamp((area.clientWidth - 48) / Math.max(...pages.map((p) => p.vp.width)), 0.3, 2.2);
  setZoom(fitZoom(), true);

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
  const snap = () => pages.map((p) => p.objs.map((o) => ({ ...o, points: o.points?.map((q) => [...q]), filters: o.filters && { ...o.filters }, cover: o.cover && { ...o.cover }, texts: o.texts?.map((t) => ({ ...t })), ocr: o.ocr?.slice(), pics: o.pics?.slice() })));
  function commit() { undoStack.push(snap()); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; }
  function restore(s) { pages.forEach((p, i) => { p.objs = s[i]; layoutObjs(p); }); select(null); }
  function undo() { if (editing) finishEditing(); if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); }

  // ---------- object rendering ----------
  function layoutObjs(p) {
    p.overlay.querySelectorAll('.obj, .cover').forEach((n) => n.remove());
    for (const o of p.objs) { if (o.cover) p.overlay.append(coverEl(o)); p.overlay.append(objEl(p, o)); }
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
    if (o.type === 'text') {
      Object.assign(e.style, { fontFamily: FONTS[o.font].css, fontSize: o.size * z + 'px', fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? 'italic' : 'normal', color: o.color, textAlign: o.align || 'left', width: 'auto', height: 'auto', minWidth: '4px', letterSpacing: (o.ls || 0) * z + 'px' });
      e.textContent = o.text;
    } else if (o.type === 'image') {
      if (o.deleted) { e.style.display = 'none'; return e; }
      const imgEl = h('img', { src: o.src, alt: '', draggable: 'false', style: { filter: cssFilter(o.filters), transform: o.flipX ? 'scaleX(-1)' : '' } });
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
            left: t.x * s + 'px', top: t.y * s + 'px', fontFamily: FONTS[t.font || 'sans'].css, fontSize: t.size * s + 'px', fontWeight: t.bold ? 700 : 400,
            fontStyle: t.italic ? 'italic' : 'normal', color: t.color, letterSpacing: (t.ls || 0) * s + 'px', textAlign: t.align || 'left', opacity: (t.opacity ?? 100) / 100
          } }, t.text));
        }
        (o.pics || []).forEach((b, k) => clip.append(h('div', { class: 'picbox' + (b.shape === 'ellipse' ? ' round' : ''), 'data-pic': k, title: 'Picture: click to select it on its own (then replace, delete or move it)', style: { left: b.x0 * s + 'px', top: b.y0 * s + 'px', width: (b.x1 - b.x0) * s + 'px', height: (b.y1 - b.y0) * s + 'px' } })));
        if (imgMode) clip.style.cursor = 'crosshair';
        e.append(clip);
      }
    } else if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'whiteout') {
      Object.assign(e.style, {
        border: o.type === 'whiteout' ? 'none' : `${o.sw * z}px solid ${o.stroke}`, borderRadius: o.type === 'ellipse' ? '50%' : '0',
        background: o.type === 'whiteout' ? o.fill || '#ffffff' : o.fill || 'transparent'
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
    drawSide();
  }

  const findObj = (p, id) => p.objs.find((o) => o.id === id);
  function rerender(p, o) {
    const old = p.overlay.querySelector(`.obj[data-id="${o.id}"]`);
    const n = objEl(p, o);
    if (old) old.replaceWith(n); else p.overlay.append(n);
    const oldCover = p.overlay.querySelector(`.cover[data-for="${o.id}"]`);
    if (o.cover) { const c = coverEl(o); oldCover ? oldCover.replaceWith(c) : n.before(c); } else oldCover?.remove();
    if (o.type === 'text') measureText(p, o, n);
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
        if (!sel || sel.o !== o) select({ p, o });
        const handle = e.target.dataset.handle;
        commit();
        drag = { kind: handle ? 'resize' : 'move', o, start: [x, y], orig: { ...bbox(o), points: o.points?.map((q) => [...q]), size: o.size }, moved: false };
        ov.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (selectLike()) { select(null); return; }

      e.preventDefault();
      const today = new Date().toLocaleDateString();
      if (tool === 'text' || tool === 'date' || tool === 'check') {
        commit();
        const text = tool === 'date' ? today : tool === 'check' ? '✓' : '';
        const o = { id: nid(), type: 'text', text, x, y: y - style.size * 0.6, w: 10, h: style.size * 1.2, size: tool === 'check' ? 22 : style.size, font: style.font, bold: style.bold, italic: style.italic, color: tool === 'check' ? '#1d4ed8' : style.color, opacity: 100, align: 'left' };
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
    const w = Math.min(p.vp.width * 0.5, 240), hh = w / ratio;
    commit();
    const o = { id: nid(), type: 'image', src, jpeg: f.type === 'image/jpeg', x: (p.vp.width - w) / 2, y: (p.vp.height - hh) / 2, w, h: hh, opacity: 100, filters: {} };
    await setSrc(o, src);
    p.objs.push(o); rerender(p, o); select({ p, o });
    drawToolbar();
  }

  // ---------- side panel ----------
  function drawSide() {
    side.replaceChildren();
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
      if (o.type === 'text') {
        side.append(
          h('div', { class: 'field' }, h('button', { class: 'btn small', type: 'button', onclick: () => startEditing(p, o) }, 'Edit wording')),
          row('Font', h('select', { class: 'inp', onchange: (e) => set(() => { style.font = o.font = e.target.value; }) }, [['sans', 'Sans (Helvetica/Arial)'], ['serif', 'Serif (Times)'], ['mono', 'Mono (Courier)']].map(([v, l]) => h('option', { value: v, selected: o.font === v }, l)))),
          row('Size', h('input', { class: 'inp', type: 'number', min: 4, max: 300, step: 0.5, value: o.size, onchange: (e) => set(() => { style.size = o.size = clamp(+e.target.value, 4, 300); }) })),
          h('div', { class: 'field seg' },
            h('button', { type: 'button', class: o.bold ? 'on' : '', onclick: () => set(() => { style.bold = o.bold = !o.bold; }) }, h('b', {}, 'B')),
            h('button', { type: 'button', class: o.italic ? 'on' : '', onclick: () => set(() => { style.italic = o.italic = !o.italic; }) }, h('i', {}, 'I')),
            ...['left', 'center', 'right'].map((a) => h('button', { type: 'button', class: (o.align || 'left') === a ? 'on' : '', onclick: () => set(() => { o.align = a; }) }, a[0].toUpperCase() + a.slice(1)))),
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
    if (modeName === 'sign') side.append(h('div', { class: 'notice info', style: { marginTop: '14px' } }, 'Tip: your signatures are remembered on this device so you can reuse them. Asking other people to sign needs the online server (coming in the server edition).'));
    side.append(h('div', { class: 'hint', style: { marginTop: '18px' } }, h('span', { class: 'kbd' }, 'Del'), ' delete · ', h('span', { class: 'kbd' }, 'Ctrl+Z'), ' undo · ', h('span', { class: 'kbd' }, 'Ctrl+D'), ' duplicate · arrows nudge'));
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
    commit();
    const c = { ...o, id: nid(), filters: o.filters && { ...o.filters }, cover: undefined, orig: undefined, texts: o.texts?.map((t) => ({ ...t, id: nid() })), ocr: o.ocr?.slice(), points: o.points?.map(([x, y]) => [x + 12, y + 12]) };
    if (!c.points) { c.x += 12; c.y += 12; }
    p.objs.push(c); rerender(p, c); select({ p, o: c });
  }
  function removeSel() {
    if (!sel) return;
    const { p, o } = sel;
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
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
    else if (e.key === 'Escape') { pending = null; select(null); }
    else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1, { p, o } = sel;
      const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (o.points) o.points = o.points.map(([x, y]) => [x + dx, y + dy]); else { o.x += dx; o.y += dy; }
      rerender(p, o);
    } else if (!mod && e.key === 'v' && mode.tools.includes('select')) setTool('select');
    else if (!mod && e.key === 't' && mode.tools.includes('text')) setTool('text');
  };
  document.addEventListener('keydown', onKey);

  // ---------- save ----------
  async function save() {
    if (editing) finishEditing();
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
        const key = FONTS[o.font].std[(o.bold ? 1 : 0) + (o.italic ? 2 : 0)];
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
            const [x, y] = toPdf(o.x + dx, o.y + o.size * (FONTS[o.font].asc + k * 1.2));
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
          if (o.type === 'redact') continue;
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
                await drawTextObj(page, toPdf, R, { text: t.text, x: o.x + t.x * k, y: o.y + t.y * k, size: t.size * k, font: t.font || 'sans', bold: t.bold, italic: t.italic, color: t.color, ls: (t.ls || 0) * k, align: t.align, opacity: o.opacity, w: textWidth(t) * k, h: t.size * 1.2 * nLines * k });
              }
            }
          } else if (o.type === 'rect' || o.type === 'whiteout') {
            const [x, y] = toPdf(o.x, o.y + o.h);
            page.drawRectangle({ x, y, width: o.w, height: o.h, rotate: R, borderWidth: o.type === 'rect' ? o.sw : 0, borderColor: o.type === 'rect' ? rgb(...hexToRgb01(o.stroke)) : undefined, color: o.fill ? rgb(...hexToRgb01(o.fill)) : undefined, opacity: o.fill ? op : undefined, borderOpacity: op });
          } else if (o.type === 'ellipse') {
            const [x, y] = toPdf(o.x + o.w / 2, o.y + o.h / 2);
            const rx = rot % 180 ? o.h / 2 : o.w / 2, ry = rot % 180 ? o.w / 2 : o.h / 2;
            page.drawEllipse({ x, y, xScale: rx, yScale: ry, borderWidth: o.sw, borderColor: rgb(...hexToRgb01(o.stroke)), color: o.fill ? rgb(...hexToRgb01(o.fill)) : undefined, opacity: o.fill ? op : undefined, borderOpacity: op });
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

// ---------- clipping masks (picture frames) ----------
// Shapes are outlines in a 0..1 box, used for the on-screen clip-path and the PDF clipping path alike.
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
