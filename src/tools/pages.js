// Page-level visual tools: Organize, Crop, Compare and Scan to PDF.
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { diffWords } from 'diff';
import { readBytes, pdfBlob, stem, openPdfjs, loadPdfLib, renderPage, blobToBytes, extractPageText, isPdf } from '../lib/core.js';
import { h, ibtn, pickFiles, toast } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { cropDialog } from './editor.js';

const PDF = '.pdf,application/pdf';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------- Organize ----------------
async function mountOrganize(el, files, ctx) {
  const sources = []; // {name, bytes, view}
  let items = []; // {src, page, rot, blank:[w,h]}
  const selected = new Set();
  const grid = h('div', { class: 'thumbgrid' });
  const area = h('div', { class: 'canvasarea' }, grid);
  const info = h('span', { class: 'status' });
  const toolbar = h('div', { class: 'toolbar' });
  const ws = h('div', { class: 'ws noside' }, h('div', { class: 'wsmain' }, toolbar, area,
    h('div', { class: 'wsfoot' }, info, h('div', { style: { flex: 1 } }),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.restart() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save PDF'))));
  el.replaceChildren(ws);

  async function addFiles(list) {
    for (const f of list) {
      if (!isPdf(f)) continue;
      const bytes = await readBytes(f);
      let view;
      try { view = await openPdfjs(bytes); } catch (e) { toast(`${f.name}: ${e.name === 'PasswordException' ? 'password-protected, unlock it first' : 'could not be opened'}`); continue; }
      const src = sources.push({ name: f.name, bytes, view }) - 1;
      for (let i = 0; i < view.numPages; i++) items.push({ src, page: i, rot: 0, key: Math.random() });
    }
    draw();
  }

  const thumbCache = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); paintThumb(e.target); }
  }, { root: area, rootMargin: '300px' });

  async function paintThumb(tc) {
    const it = items.find((x) => String(x.key) === tc.dataset.key);
    if (!it || it.blank) return;
    const ck = it.src + ':' + it.page;
    let c = thumbCache.get(ck);
    if (!c) {
      const pg = await sources[it.src].view.getPage(it.page + 1);
      const vp = pg.getViewport({ scale: 1 });
      c = await renderPage(pg, 170 / Math.max(vp.width, vp.height) * 1.5);
      thumbCache.set(ck, c);
    }
    const copy = h('canvas');
    copy.width = c.width; copy.height = c.height;
    copy.getContext('2d').drawImage(c, 0, 0);
    copy.style.transform = `rotate(${it.rot}deg)`;
    tc.replaceChildren(copy);
  }

  let dragKey = null;
  function draw() {
    toolbar.replaceChildren(
      h('button', { class: 'btn small', type: 'button', onclick: async () => addFiles(await pickFiles(PDF, true)) }, h('span', { html: icon('plus') }), 'Add PDF'),
      h('button', { class: 'btn small', type: 'button', onclick: () => insertBlank() }, h('span', { html: icon('blank') }), 'Blank page'),
      h('span', { class: 'sep' }),
      h('span', { class: 'lbl' }, selected.size ? `${selected.size} selected` : 'Click pages to select'),
      selected.size ? ibtn('rotate', 'Rotate selected', () => bulk((it) => (it.rot = (it.rot + 90) % 360))) : null,
      selected.size ? ibtn('trash', 'Delete selected', () => { items = items.filter((it) => !selected.has(it.key)); selected.clear(); draw(); }) : null,
      selected.size ? ibtn('x', 'Clear selection', () => { selected.clear(); draw(); }) : null,
      h('span', { class: 'sep' }),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { selected.clear(); items.forEach((i) => selected.add(i.key)); draw(); } }, 'Select all'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { items.reverse(); draw(); } }, 'Reverse order'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { const odd = items.filter((_, i) => i % 2 === 0), even = items.filter((_, i) => i % 2 === 1); items = [...odd, ...even]; draw(); } }, 'Odd pages first'));
    grid.replaceChildren();
    items.forEach((it, idx) => {
      const tc = h('div', { class: 'tc', 'data-key': it.key }, it.blank ? h('canvas', { width: 90, height: 127, style: { transform: `rotate(${it.rot}deg)` } }) : h('span', { class: 'status' }, '…'));
      const card = h('div', { class: 'pthumb' + (selected.has(it.key) ? ' sel' : ''), draggable: 'true' },
        h('div', { class: 'acts' },
          idx > 0 && ibtn('left', 'Move earlier', (e) => { e.stopPropagation(); [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; draw(); }),
          idx < items.length - 1 && ibtn('right', 'Move later', (e) => { e.stopPropagation(); [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; draw(); }),
          ibtn('rotate', 'Rotate', (e) => { e.stopPropagation(); it.rot = (it.rot + 90) % 360; draw(); }),
          ibtn('dup', 'Duplicate', (e) => { e.stopPropagation(); items.splice(idx + 1, 0, { ...it, key: Math.random() }); draw(); }),
          ibtn('trash', 'Delete', (e) => { e.stopPropagation(); items.splice(idx, 1); selected.delete(it.key); draw(); })),
        tc,
        h('div', { class: 'lab' }, it.blank ? `${idx + 1} · blank` : `${idx + 1}` + (sources.length > 1 ? ` · ${sources[it.src].name.slice(0, 16)} p${it.page + 1}` : '')));
      card.addEventListener('click', (e) => {
        if (e.shiftKey && selected.size) {
          const keys = items.map((x) => x.key);
          const last = keys.findIndex((k) => selected.has(k));
          const [a, b] = [Math.min(last, idx), Math.max(last, idx)];
          for (let i = a; i <= b; i++) selected.add(keys[i]);
        } else selected.has(it.key) ? selected.delete(it.key) : selected.add(it.key);
        draw();
      });
      card.addEventListener('dragstart', () => { dragKey = it.key; card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('dropbefore'); });
      card.addEventListener('dragleave', () => card.classList.remove('dropbefore'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = items.findIndex((x) => x.key === dragKey);
        if (from < 0 || from === idx) return;
        const moving = selected.has(dragKey) ? items.filter((x) => selected.has(x.key)) : [items[from]];
        const target = items[idx];
        items = items.filter((x) => !moving.includes(x));
        items.splice(items.indexOf(target), 0, ...moving);
        dragKey = null; draw();
      });
      grid.append(card);
      if (!it.blank) io.observe(tc);
    });
    info.textContent = `${items.length} page${items.length === 1 ? '' : 's'}`;
  }

  function bulk(fn) { items.filter((it) => selected.has(it.key)).forEach(fn); draw(); }
  function insertBlank() {
    const keys = items.map((x) => x.key);
    const at = selected.size ? Math.max(...[...selected].map((k) => keys.indexOf(k))) + 1 : items.length;
    const ref = items[Math.max(0, at - 1)];
    items.splice(at, 0, { blank: true, rot: 0, key: Math.random(), size: ref && !ref.blank ? ref : null });
    draw();
  }

  async function save() {
    if (!items.length) { toast('There are no pages left.'); return; }
    info.textContent = 'Saving…';
    const out = await PDFDocument.create();
    const libs = [];
    for (const it of items) {
      if (it.blank) {
        let size = [595.28, 841.89];
        if (it.size) { const pg = await sources[it.size.src].view.getPage(it.size.page + 1); const vp = pg.getViewport({ scale: 1 }); size = [vp.width, vp.height]; }
        out.addPage(size).setRotation(degrees(it.rot));
        continue;
      }
      libs[it.src] ||= await loadPdfLib(sources[it.src].bytes);
      const [pg] = await out.copyPages(libs[it.src], [it.page]);
      pg.setRotation(degrees((pg.getRotation().angle + it.rot) % 360));
      out.addPage(pg);
    }
    const name = sources.length === 1 ? stem(sources[0].name) + '-organized.pdf' : 'organized.pdf';
    ctx.finish([{ name, blob: pdfBlob(await out.save()) }]);
  }

  await addFiles(files);
}

// ---------------- Crop ----------------
async function mountCrop(el, [file], ctx) {
  const bytes = await readBytes(file);
  const view = await openPdfjs(bytes);
  let cur = 0;
  const crops = {}; // page index -> {x,y,w,h} as fractions of the visible page
  let rect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
  const canvas = h('canvas', { style: { display: 'block', maxWidth: '100%', maxHeight: '100%', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.2)' } });
  const box = h('div', { style: { position: 'absolute', border: '2px solid #2f6fb0', boxShadow: '0 0 0 9999px rgba(10,20,30,.45)', cursor: 'move', touchAction: 'none' } });
  const handle = h('div', { style: { position: 'absolute', right: '-8px', bottom: '-8px', width: '16px', height: '16px', background: '#fff', border: '2px solid #2f6fb0', borderRadius: '4px', cursor: 'nwse-resize' } });
  box.append(handle);
  const stage = h('div', { style: { position: 'relative', display: 'inline-block', overflow: 'hidden', touchAction: 'none' } }, canvas, box);
  const area = h('div', { class: 'canvasarea', style: { display: 'grid', placeItems: 'center' } }, stage);
  const scope = h('select', { class: 'inp' }, h('option', { value: 'all' }, 'All pages'), h('option', { value: 'one' }, 'Only this page'));
  const pageLbl = h('span', { class: 'lbl' });
  const inputs = {};
  const side = h('div', { class: 'wsside' },
    h('h4', {}, 'Crop area'),
    h('p', { class: 'status' }, 'Drag the box to move it, use the corner handle to resize, or drag on the page to draw a new box.'),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Apply to'), scope),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Margins to remove (%)'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
        ...['top', 'right', 'bottom', 'left'].map((k) => h('label', { class: 'status' }, k, (inputs[k] = h('input', { class: 'inp', type: 'number', min: 0, max: 90, step: 0.5, onchange: fromInputs })))))),
    h('button', { class: 'btn small', type: 'button', onclick: autoTrim }, 'Auto-trim white margins'),
    h('button', { class: 'btn small ghost', type: 'button', style: { marginLeft: '6px' }, onclick: () => { rect = { x: 0, y: 0, w: 1, h: 1 }; layout(); } }, 'Reset'));
  const ws = h('div', { class: 'ws' }, h('div', { class: 'wsmain' },
    h('div', { class: 'toolbar' }, ibtn('left', 'Previous page', () => go(cur - 1)), pageLbl, ibtn('right', 'Next page', () => go(cur + 1))),
    area,
    h('div', { class: 'wsfoot' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.restart() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Crop PDF'))), side);
  el.replaceChildren(ws);

  function fromInputs() {
    const v = (k) => clamp(+inputs[k].value || 0, 0, 95) / 100;
    rect = { x: v('left'), y: v('top'), w: Math.max(0.05, 1 - v('left') - v('right')), h: Math.max(0.05, 1 - v('top') - v('bottom')) };
    layout();
  }
  function layout() {
    Object.assign(box.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' });
    const f = (n) => (Math.round(n * 1000) / 10).toString();
    inputs.top.value = f(rect.y); inputs.left.value = f(rect.x); inputs.right.value = f(1 - rect.x - rect.w); inputs.bottom.value = f(1 - rect.y - rect.h);
    if (scope.value === 'one') crops[cur] = { ...rect };
  }
  async function go(i) {
    cur = clamp(i, 0, view.numPages - 1);
    pageLbl.textContent = `Page ${cur + 1} of ${view.numPages}`;
    const pg = await view.getPage(cur + 1);
    const vp = pg.getViewport({ scale: 1 });
    const fit = Math.min((area.clientWidth - 40) / vp.width, (area.clientHeight - 40) / vp.height, 2);
    const c = await renderPage(pg, fit * Math.min(devicePixelRatio || 1, 2));
    canvas.width = c.width; canvas.height = c.height;
    canvas.getContext('2d').drawImage(c, 0, 0);
    canvas.style.width = vp.width * fit + 'px';
    canvas.style.height = vp.height * fit + 'px';
    if (scope.value === 'one' && crops[cur]) rect = { ...crops[cur] };
    layout();
  }
  function autoTrim() {
    const g = canvas.getContext('2d');
    const { width: W, height: H } = canvas;
    const d = g.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const q = (y * W + x) * 4;
      if (d[q] < 235 || d[q + 1] < 235 || d[q + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0) { toast('This page looks blank.'); return; }
    const pad = 0.01;
    rect = { x: clamp(x0 / W - pad, 0, 1), y: clamp(y0 / H - pad, 0, 1), w: 0, h: 0 };
    rect.w = clamp(x1 / W + pad, 0, 1) - rect.x; rect.h = clamp(y1 / H + pad, 0, 1) - rect.y;
    layout();
  }
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const b = stage.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    drag = { mode: e.target === handle ? 'resize' : e.target === box ? 'move' : 'draw', sx: px, sy: py, orig: { ...rect } };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const b = stage.getBoundingClientRect();
    const px = clamp((e.clientX - b.left) / b.width, 0, 1), py = clamp((e.clientY - b.top) / b.height, 0, 1);
    const o = drag.orig;
    if (drag.mode === 'move') rect = { ...o, x: clamp(o.x + px - drag.sx, 0, 1 - o.w), y: clamp(o.y + py - drag.sy, 0, 1 - o.h) };
    else if (drag.mode === 'resize') rect = { ...o, w: clamp(px - o.x, 0.03, 1 - o.x), h: clamp(py - o.y, 0.03, 1 - o.y) };
    else rect = { x: Math.min(px, drag.sx), y: Math.min(py, drag.sy), w: Math.max(0.03, Math.abs(px - drag.sx)), h: Math.max(0.03, Math.abs(py - drag.sy)) };
    layout();
  });
  stage.addEventListener('pointerup', () => (drag = null));
  scope.addEventListener('change', layout);

  async function save() {
    const doc = await loadPdfLib(bytes);
    for (let i = 0; i < doc.getPageCount(); i++) {
      const r = scope.value === 'all' ? rect : crops[i];
      if (!r) continue;
      const pg = await view.getPage(i + 1);
      const vp = pg.getViewport({ scale: 1 });
      const a = vp.convertToPdfPoint(r.x * vp.width, r.y * vp.height);
      const b = vp.convertToPdfPoint((r.x + r.w) * vp.width, (r.y + r.h) * vp.height);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), hh = Math.abs(b[1] - a[1]);
      const page = doc.getPage(i);
      page.setCropBox(x, y, w, hh);
      page.setMediaBox(x, y, w, hh);
      page.setTrimBox(x, y, w, hh);
      page.setBleedBox(x, y, w, hh);
    }
    ctx.finish([{ name: stem(file.name) + '-cropped.pdf', blob: pdfBlob(await doc.save()) }]);
  }
  requestAnimationFrame(() => go(0));
}

// ---------------- Compare ----------------
async function mountCompare(el, files, ctx) {
  if (files.length < 2) {
    el.replaceChildren(h('div', { class: 'panel' }, h('p', {}, `Comparing needs two PDFs. You chose ${files[0]?.name || 'none'}; now choose the other version.`),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { const more = await pickFiles(PDF, false); if (more.length) mountCompare(el, [...files, ...more].slice(0, 2), ctx); } }, 'Choose the second PDF')));
    return;
  }
  const [A, B] = await Promise.all(files.slice(0, 2).map(async (f) => openPdfjs(await readBytes(f))));
  const n = Math.max(A.numPages, B.numPages);
  let cur = 0, tab = 'text';
  const content = h('div');
  const summary = h('div', { class: 'notice info' }, 'Comparing…');
  const pageLbl = h('span', { class: 'lbl' });
  const tabs = h('div', { class: 'seg', style: { maxWidth: '360px' } });
  const panel = h('div', { class: 'panel' },
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' } }, tabs,
      h('div', { style: { flex: 1 } }), ibtn('left', 'Previous page', () => go(cur - 1)), pageLbl, ibtn('right', 'Next page', () => go(cur + 1))),
    summary, content,
    h('div', { class: 'chain' }, h('button', { class: 'btn', type: 'button', onclick: () => ctx.restart() }, 'Compare other files'), h('button', { class: 'btn primary', type: 'button', onclick: report }, 'Download report')));
  el.replaceChildren(panel);

  const texts = [];
  for (let i = 0; i < n; i++) {
    const get = async (D) => (i < D.numPages ? (await extractPageText(D, i + 1)).lines.map((l) => l.text).join('\n') : '');
    texts.push([await get(A), await get(B)]);
  }
  const diffs = texts.map(([a, b]) => diffWords(a, b));
  const changed = diffs.map((d) => d.filter((p) => p.added || p.removed).length);
  const totalAdded = diffs.flat().filter((p) => p.added).reduce((s, p) => s + p.value.split(/\s+/).filter(Boolean).length, 0);
  const totalRemoved = diffs.flat().filter((p) => p.removed).reduce((s, p) => s + p.value.split(/\s+/).filter(Boolean).length, 0);
  const changedPages = changed.map((c, i) => (c ? i + 1 : 0)).filter(Boolean);
  summary.textContent = changedPages.length
    ? `${totalAdded} word(s) added and ${totalRemoved} removed, on page(s) ${changedPages.slice(0, 30).join(', ')}${changedPages.length > 30 ? '…' : ''}.`
    : `No text differences found across ${n} page(s). Try the Visual tab to check images and layout.`;
  if (A.numPages !== B.numPages) summary.textContent += ` The files have different page counts (${A.numPages} vs ${B.numPages}).`;

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sideHtml = (d, which) => d.map((p) => (p.added ? (which === 'b' ? `<ins>${esc(p.value)}</ins>` : '') : p.removed ? (which === 'a' ? `<del>${esc(p.value)}</del>` : '') : esc(p.value))).join('');

  function drawTabs() {
    tabs.replaceChildren(...[['text', 'Text changes'], ['visual', 'Visual differences']].map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); go(cur); } }, l)));
  }
  async function go(i) {
    cur = clamp(i, 0, n - 1);
    pageLbl.textContent = `Page ${cur + 1} of ${n}` + (changed[cur] ? ' · changed' : '');
    if (tab === 'text') {
      content.replaceChildren(h('div', { class: 'cmpgrid' },
        h('div', {}, h('div', { class: 'lbl', style: { fontWeight: 600, marginBottom: '6px' } }, files[0].name), h('div', { class: 'cmptext', html: sideHtml(diffs[cur], 'a') || '<i>(no text)</i>' })),
        h('div', {}, h('div', { class: 'lbl', style: { fontWeight: 600, marginBottom: '6px' } }, files[1].name), h('div', { class: 'cmptext', html: sideHtml(diffs[cur], 'b') || '<i>(no text)</i>' }))));
    } else {
      content.replaceChildren(h('p', { class: 'status' }, 'Rendering…'));
      const render = async (D) => {
        if (cur >= D.numPages) return null;
        const pg = await D.getPage(cur + 1);
        return renderPage(pg, 900 / Math.max(...[pg.getViewport({ scale: 1 })].map((v) => v.width)));
      };
      const [ca, cb] = await Promise.all([render(A), render(B)]);
      const W = Math.max(ca?.width || 0, cb?.width || 0), H = Math.max(ca?.height || 0, cb?.height || 0);
      const diff = h('canvas', { width: W, height: H, style: { width: '100%', background: '#fff', borderRadius: '8px', border: '1px solid var(--line)' } });
      const g = diff.getContext('2d');
      let changedPx = 0;
      if (ca && cb) {
        const da = ca.getContext('2d').getImageData(0, 0, W, H).data, db = cb.getContext('2d').getImageData(0, 0, W, H).data;
        const out = g.createImageData(W, H);
        for (let q = 0; q < out.data.length; q += 4) {
          const delta = Math.abs(da[q] - db[q]) + Math.abs(da[q + 1] - db[q + 1]) + Math.abs(da[q + 2] - db[q + 2]);
          const lum = (da[q] + da[q + 1] + da[q + 2]) / 3;
          if (delta > 60) { out.data[q] = 225; out.data[q + 1] = 40; out.data[q + 2] = 40; out.data[q + 3] = 255; changedPx++; }
          else { const v = 255 - (255 - lum) * 0.25; out.data[q] = out.data[q + 1] = out.data[q + 2] = v; out.data[q + 3] = 255; }
        }
        g.putImageData(out, 0, 0);
      }
      const show = (c) => { if (!c) return h('p', { class: 'status' }, '(no page)'); c.style.cssText = 'width:100%;border:1px solid var(--line);border-radius:8px'; return c; };
      content.replaceChildren(
        h('p', { class: 'status' }, ca && cb ? (changedPx ? `Changed areas are shown in red (${(changedPx / (W * H) * 100).toFixed(2)}% of the page).` : 'These pages look identical.') : 'This page exists in only one of the files.'),
        h('div', { class: 'cmpgrid' }, h('div', {}, show(ca)), h('div', {}, show(cb))),
        ca && cb ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'lbl', style: { fontWeight: 600, marginBottom: '6px' } }, 'Differences'), diff) : null);
    }
  }
  function report() {
    const body = diffs.map((d, i) => `<h2>Page ${i + 1}${changed[i] ? '' : ' (no changes)'}</h2><div class="g"><div><h3>${esc(files[0].name)}</h3><pre>${sideHtml(d, 'a')}</pre></div><div><h3>${esc(files[1].name)}</h3><pre>${sideHtml(d, 'b')}</pre></div></div>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>Comparison report</title><style>body{font:14px system-ui;margin:24px}pre{white-space:pre-wrap;font:13px/1.6 system-ui;background:#f6f6f6;padding:12px;border-radius:8px}.g{display:grid;grid-template-columns:1fr 1fr;gap:16px}ins{background:#c7f0d2;text-decoration:none}del{background:#f8c9c2}</style><h1>Comparison report</h1><p>${esc(summary.textContent)}</p>${body}`;
    ctx.finish([{ name: 'comparison-report.html', blob: new Blob([html], { type: 'text/html' }) }]);
  }
  drawTabs();
  go(changed.findIndex(Boolean) >= 0 ? changed.findIndex(Boolean) : 0);
}

// ---------------- Scan to PDF ----------------
function mountScan(el, ctx) {
  const shots = []; // {src, filter}
  let stream = null, filter = 'enhance';
  const video = h('video', { autoplay: true, playsinline: true, muted: true });
  const cam = h('div', { class: 'camera hidden' }, video);
  const strip = h('div', { class: 'shots' });
  const camBtns = h('div', { class: 'chain' });
  const filterSeg = h('div', { class: 'seg' });
  const pageSize = h('select', { class: 'inp' }, h('option', { value: 'a4' }, 'A4'), h('option', { value: 'letter' }, 'US Letter'), h('option', { value: 'fit' }, 'Same as photo'));
  const side = h('div', { class: 'panel sidepanel' },
    h('h3', {}, 'Scan settings'),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Clean-up'), filterSeg, h('div', { class: 'hint' }, 'Applied to every page when the PDF is made.')),
    h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Page size'), pageSize),
    h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: makePdf }, 'Create PDF'));
  const left = h('div', { class: 'panel' }, cam, camBtns, h('h3', { style: { marginTop: '10px' } }, 'Pages'), strip);
  el.replaceChildren(h('div', { class: 'layout' }, left, side));

  const drawFilters = () => filterSeg.replaceChildren(...[['color', 'Original'], ['enhance', 'Auto enhance'], ['gray', 'Grayscale'], ['bw', 'Black & white']].map(([k, l]) => h('button', { type: 'button', class: filter === k ? 'on' : '', onclick: () => { filter = k; drawFilters(); drawStrip(); } }, l)));
  drawFilters();

  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  window.addEventListener('hashchange', stop, { once: true });

  async function startCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = stream;
      cam.classList.remove('hidden');
      drawButtons();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Camera permission was refused.' : 'No camera is available. Choose photos instead.', 4000);
    }
  }
  function capture() {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    shots.push({ src: c.toDataURL('image/jpeg', 0.92) });
    drawStrip();
    cam.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 200 });
  }
  function drawButtons() {
    camBtns.replaceChildren(
      stream ? h('button', { class: 'btn primary big', type: 'button', onclick: capture }, h('span', { html: icon('camera') }), 'Capture page') :
        navigator.mediaDevices?.getUserMedia ? h('button', { class: 'btn primary', type: 'button', onclick: startCam }, h('span', { html: icon('camera') }), 'Open camera') : null,
      h('button', { class: 'btn', type: 'button', onclick: async () => { const fs = await pickFiles('image/*', true, 'environment'); for (const f of fs) shots.push({ src: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) }); drawStrip(); } }, 'Add photos'),
      stream ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { stop(); cam.classList.add('hidden'); drawButtons(); } }, 'Close camera') : null);
  }
  async function drawStrip() {
    strip.replaceChildren();
    if (!shots.length) { strip.append(h('p', { class: 'status' }, 'No pages yet. Capture with the camera or add photos.')); return; }
    for (const [i, s] of shots.entries()) {
      const img = h('img', { src: await processed(s.src, filter, 400), alt: `Page ${i + 1}` });
      strip.append(h('div', { class: 'shot' }, img,
        h('div', { style: { display: 'flex', gap: '2px', marginTop: '4px', justifyContent: 'center' } },
          i > 0 && ibtn('left', 'Move earlier', () => { [shots[i - 1], shots[i]] = [shots[i], shots[i - 1]]; drawStrip(); }),
          ibtn('crop', 'Crop', async () => { const r = await cropDialog(s.src); if (r) { s.src = r.src; drawStrip(); } }),
          ibtn('rotate', 'Rotate', async () => { s.src = await rotate(s.src); drawStrip(); }),
          ibtn('trash', 'Remove', () => { shots.splice(i, 1); drawStrip(); }))));
    }
  }
  async function makePdf() {
    if (!shots.length) { toast('Add at least one page.'); return; }
    const doc = await PDFDocument.create();
    for (const s of shots) {
      const src = await processed(s.src, filter, 2600);
      const bytes = await blobToBytes(await (await fetch(src)).blob());
      const img = await doc.embedJpg(bytes);
      let W, H;
      if (pageSize.value === 'fit') { W = img.width * 0.5; H = img.height * 0.5; }
      else { [W, H] = pageSize.value === 'letter' ? [612, 792] : [595.28, 841.89]; if (img.width > img.height) [W, H] = [H, W]; }
      const sc = Math.min(W / img.width, H / img.height);
      doc.addPage([W, H]).drawImage(img, { x: (W - img.width * sc) / 2, y: (H - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
    }
    stop();
    ctx.finish([{ name: `scan-${new Date().toISOString().slice(0, 10)}.pdf`, blob: pdfBlob(await doc.save()) }]);
  }
  drawButtons();
  drawStrip();
}

async function rotate(src) {
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const c = document.createElement('canvas');
  c.width = img.naturalHeight; c.height = img.naturalWidth;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}

// Document clean-up filters for scans.
async function processed(src, filter, maxSide) {
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  if (filter !== 'color') {
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    // Stretch levels between the 2nd and 98th percentile of brightness.
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0]++;
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.08) { hi = v; break; } }
    const span = Math.max(20, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      if (filter === 'enhance') for (let k = 0; k < 3; k++) d[i + k] = clamp(((d[i + k] - lo) / span) * 255, 0, 255);
      else {
        let v = clamp(((l - lo) / span) * 255, 0, 255);
        if (filter === 'bw') v = v > 150 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    g.putImageData(id, 0, 0);
  }
  return c.toDataURL('image/jpeg', filter === 'bw' ? 0.8 : 0.88);
}

export const tools = {
  organize: { accept: PDF, multiple: true, label: 'Select PDF files', mount: (el, files, ctx) => mountOrganize(el, files, ctx) },
  crop: { accept: PDF, multiple: false, label: 'Select a PDF', mount: (el, files, ctx) => mountCrop(el, files, ctx) },
  compare: { accept: PDF, multiple: true, label: 'Select two PDF versions', mount: (el, files, ctx) => mountCompare(el, files, ctx) },
  scan: { standalone: true, mount: (el, ctx) => mountScan(el, ctx) }
};
