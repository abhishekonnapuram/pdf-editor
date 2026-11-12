// Remove pages and Extract pages: pick pages from thumbnails (or type ranges), then save.
import { PDFDocument } from '@cantoo/pdf-lib';
import { readBytes, pdfBlob, stem, openPdfjs, loadPdfLib, renderPage, parseRanges } from '../lib/core.js';
import { h, toast } from '../lib/ui.js';

const PDF = '.pdf,application/pdf';

async function mountPicker(el, [file], ctx, kind) {
  const bytes = await readBytes(file);
  let view;
  try { view = await openPdfjs(bytes); } catch (e) { el.replaceChildren(h('p', { class: 'error' }, e.name === 'PasswordException' ? 'This PDF is password-protected. Unlock it first.' : 'This PDF could not be opened.')); return; }
  const n = view.numPages;
  const sel = new Set();
  let mode = 'one'; // extract: one PDF, or one PDF per page
  const grid = h('div', { class: 'thumbgrid' });
  const area = h('div', { class: 'canvasarea' }, grid);
  const info = h('span', { class: 'status' });
  const ranges = h('input', { class: 'inp', placeholder: kind === 'remove' ? 'Pages to remove, e.g. 2, 5-8' : 'Pages to extract, e.g. 1, 3-5', style: { maxWidth: '260px' } });
  const toolbar = h('div', { class: 'toolbar' });
  const go = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, kind === 'remove' ? 'Remove pages' : 'Extract pages');
  el.replaceChildren(h('div', { class: 'ws noside' }, h('div', { class: 'wsmain' }, toolbar, area,
    h('div', { class: 'wsfoot' }, info, h('div', { style: { flex: 1 } }), h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.restart() }, 'Cancel'), go))));

  const pick = (fn) => { sel.clear(); for (let i = 0; i < n; i++) if (fn(i)) sel.add(i); update(); };
  ranges.addEventListener('change', () => { sel.clear(); for (const i of parseRanges(ranges.value, n).flat()) if (i >= 0 && i < n) sel.add(i); update(); });
  ranges.addEventListener('keydown', (e) => e.stopPropagation());
  toolbar.append(
    h('span', { class: 'lbl' }, kind === 'remove' ? 'Click the pages to remove' : 'Click the pages to extract'),
    h('span', { class: 'sep' }), ranges, h('span', { class: 'sep' }),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => pick(() => true) }, 'All'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => pick((i) => i % 2 === 0) }, 'Odd'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => pick((i) => i % 2 === 1) }, 'Even'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => pick(() => false) }, 'None'),
    ...(kind === 'extract' ? [h('span', { class: 'sep' }), h('span', { class: 'seg' }, ...[['one', 'Into one PDF'], ['each', 'Each page as its own PDF']].map(([k, l]) => { const b = h('button', { type: 'button', class: mode === k ? 'on' : '', onclick: () => { mode = k; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } }, l); return b; }))] : []));

  const io = new IntersectionObserver((ents) => ents.forEach(async (e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const pg = await view.getPage(+e.target.dataset.i + 1), vp = pg.getViewport({ scale: 1 });
    e.target.replaceChildren(await renderPage(pg, (170 / Math.max(vp.width, vp.height)) * 1.5));
  }), { root: area, rootMargin: '300px' });
  const cards = [];
  let last = null;
  for (let i = 0; i < n; i++) {
    const tc = h('div', { class: 'tc', 'data-i': i }, h('span', { class: 'status' }, '…'));
    const card = h('div', { class: 'pthumb' + (kind === 'remove' ? ' removing' : '') }, tc, h('div', { class: 'lab' }, String(i + 1)));
    card.addEventListener('click', (e) => {
      if (e.shiftKey && last != null) { const [a, b] = [Math.min(last, i), Math.max(last, i)]; for (let k = a; k <= b; k++) sel.add(k); }
      else sel.has(i) ? sel.delete(i) : sel.add(i);
      last = i; update();
    });
    cards.push(card); grid.append(card); io.observe(tc);
  }
  function update() {
    cards.forEach((c, i) => c.classList.toggle('sel', sel.has(i)));
    const left = n - sel.size;
    info.textContent = kind === 'remove' ? `${sel.size} of ${n} pages will be removed · ${left} left` : `${sel.size} of ${n} pages selected`;
    go.disabled = !sel.size || (kind === 'remove' && !left);
  }
  update();

  async function save() {
    const list = [...sel].sort((a, b) => a - b);
    go.disabled = true;
    try {
      const src = await loadPdfLib(bytes);
      const outputs = [];
      if (kind === 'remove') {
        const keep = [...Array(n).keys()].filter((i) => !sel.has(i));
        const out = await PDFDocument.create();
        (await out.copyPages(src, keep)).forEach((p) => out.addPage(p));
        outputs.push({ name: `${stem(file.name)}-pages-removed.pdf`, blob: pdfBlob(await out.save()) });
      } else if (mode === 'one') {
        const out = await PDFDocument.create();
        (await out.copyPages(src, list)).forEach((p) => out.addPage(p));
        outputs.push({ name: `${stem(file.name)}-extracted.pdf`, blob: pdfBlob(await out.save()) });
      } else {
        for (const i of list) {
          const out = await PDFDocument.create();
          out.addPage((await out.copyPages(src, [i]))[0]);
          outputs.push({ name: `${stem(file.name)}-page-${i + 1}.pdf`, blob: pdfBlob(await out.save()) });
        }
      }
      view.destroy();
      go.disabled = false;
      ctx.finish(outputs, kind === 'remove' ? `Removed ${list.length} page${list.length > 1 ? 's' : ''}; ${n - list.length} left.` : `Extracted ${list.length} page${list.length > 1 ? 's' : ''}.`);
    } catch (e) { console.error(e); toast('Could not save: ' + e.message, 5000); go.disabled = false; }
  }
}

export const tools = {
  'remove-pages': { accept: PDF, multiple: false, label: 'Select a PDF', mount: (el, files, ctx) => mountPicker(el, files, ctx, 'remove') },
  'extract-pages': { accept: PDF, multiple: false, label: 'Select a PDF', mount: (el, files, ctx) => mountPicker(el, files, ctx, 'extract') }
};
