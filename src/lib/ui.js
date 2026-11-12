// Tiny DOM helpers and the shared building blocks used by every tool page.
import { icon } from './icons.js';
import { fmtSize, isPdf, isImage, pdfThumb, readBytes, download, zipOutputs, openPdfjs, renderPage } from './core.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      // CSS variables (--tc etc.) need setProperty; Object.assign silently ignores them.
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const ibtn = (name, title, onclick, cls = '') =>
  h('button', { class: 'iconbtn ' + cls, title, 'aria-label': title, type: 'button', onclick, html: icon(name) });

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { bg.remove(); resolve(v); };
    const foot = h('div', { class: 'foot' },
      actions.map((a) => h('button', { class: 'btn ' + (a.primary ? 'primary' : ''), type: 'button', onclick: async () => {
        const v = a.value instanceof Function ? await a.value() : a.value;
        if (v !== undefined) close(v);
      } }, a.label)));
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': title }, h('h3', {}, title), body, foot));
    document.body.append(bg);
  });
}

export async function askPassword(message = 'This PDF is password-protected. Enter its password.') {
  const inp = h('input', { type: 'password', class: 'inp', autocomplete: 'off' });
  setTimeout(() => inp.focus(), 50);
  return modal('Password needed', h('div', {}, h('p', {}, message), inp), [
    { label: 'Cancel', value: null },
    { label: 'Open', primary: true, value: () => inp.value }
  ]);
}

export function pickFiles(accept, multiple, capture) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, multiple, capture, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

// Opens the free stock photo search (Pexels, Pixabay, Unsplash, Wikimedia, Openverse) and returns a File or null.
export async function stockPhoto(opts = {}) {
  const m = await import('./stock.js');
  return m.pickStockPhoto(opts);
}
const takesImages = (accept) => /image\/|\.jpe?g|\.png|\.webp/i.test(accept || '');

export function dropzone({ accept, multiple, label, onFiles, capture, stock }) {
  const zone = h('div', { class: 'drop' },
    h('div', { class: 'ticon lg', style: { margin: '0 auto', '--tc': 'var(--accent)' }, html: icon('upload') }),
    h('h2', {}, label),
    h('p', {}, 'or drop ' + (multiple ? 'files' : 'a file') + ' here'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary big', type: 'button', onclick: async () => { const f = await pickFiles(accept, multiple); if (f.length) onFiles(f); } }, 'Choose ' + (multiple ? 'files' : 'file')),
      capture && h('button', { class: 'btn big', type: 'button', onclick: async () => { const f = await pickFiles('image/*', true, 'environment'); if (f.length) onFiles(f); } }, h('span', { html: icon('camera') }), 'Use camera'),
      stock && takesImages(accept) && h('button', { class: 'btn big', type: 'button', onclick: async () => { const f = await stockPhoto({ title: 'Free stock photo' }); if (f) onFiles([f]); } }, h('span', { html: icon('image') }), 'Free stock photo')
    ));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('over');
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  });
  return zone;
}

// Reorderable list of input files with thumbnails.
export function fileList(files, { accept, multiple, onChange }) {
  const root = h('div', { class: 'files' });
  let dragIdx = null;
  const render = () => {
    root.innerHTML = '';
    files.forEach((f, i) => {
      const thumb = h('div', { class: 'thumb' }, h('span', { class: 'status' }, '…'));
      const meta = h('div', { class: 'fmeta' }, fmtSize(f.size));
      const item = h('div', { class: 'fitem', draggable: multiple ? 'true' : 'false' },
        h('div', { class: 'acts' },
          multiple && i > 0 && ibtn('left', 'Move earlier', () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; render(); onChange(); }),
          multiple && i < files.length - 1 && ibtn('right', 'Move later', () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; render(); onChange(); }),
          ibtn('x', 'Remove', () => { files.splice(i, 1); render(); onChange(); })
        ),
        thumb, h('div', { class: 'fname', title: f.name }, f.name), meta);
      item.addEventListener('dragstart', () => { dragIdx = i; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => e.preventDefault());
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragIdx == null || dragIdx === i) return;
        const [m] = files.splice(dragIdx, 1);
        files.splice(i, 0, m);
        dragIdx = null; render(); onChange();
      });
      root.append(item);
      thumb.title = 'Click to preview';
      thumb.classList.add('canpreview');
      thumb.addEventListener('click', () => previewFile(f));
      fillThumb(f, thumb, meta);
    });
    if (multiple) {
      root.append(h('button', { class: 'addmore', type: 'button', onclick: async () => {
        const more = await pickFiles(accept, true);
        if (more.length) { files.push(...more); render(); onChange(); }
      } }, '+ Add files'));
    }
  };
  render();
  return root;
}

// Picture formats browsers can't show by themselves (TIFF, PSD, HEIC, camera RAW, SVG files).
async function otherPicture(f) {
  if (!f.name) return false;
  const { kindOf } = await import('./imgio.js');
  return ['tiff', 'psd', 'heic', 'raw', 'svg'].includes(kindOf(f));
}
async function pictureCanvas(f, max) {
  const { readPicture } = await import('./imgio.js');
  const src = (await readPicture(f)).frames[0].canvas;
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s)); c.height = Math.max(1, Math.round(src.height * s));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Large preview of a file (PDF pages, a picture or text) in a pop-up.
export function previewFile(blob, name = blob.name || 'file') {
  const f = blob instanceof File ? blob : new File([blob], name, { type: blob.type });
  const stage = h('div', { class: 'pvstage' }, h('p', { class: 'status' }, 'Loading preview…'));
  const info = h('span', { class: 'status' }, fmtSize(f.size));
  let alive = true;
  const close = () => { alive = false; bg.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal pvmodal', role: 'dialog', 'aria-label': 'Preview of ' + name },
      h('div', { class: 'pvhead' }, h('h3', { title: name }, name), info,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close preview', html: icon('x'), onclick: close })),
      stage));
  document.addEventListener('keydown', esc);
  document.body.append(bg);
  (async () => {
    try {
      if (isPdf(f)) {
        const doc = await openPdfjs(await readBytes(f));
        const n = doc.numPages, show = Math.min(n, 40);
        info.textContent = n + (n > 1 ? ' pages' : ' page') + ' · ' + fmtSize(f.size) + (n > show ? ' · showing the first ' + show : '');
        stage.replaceChildren();
        const width = Math.min(stage.clientWidth || 800, 900) * Math.min(2, devicePixelRatio || 1);
        for (let i = 1; i <= show && alive; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const c = await renderPage(page, width / vp.width);
          stage.append(h('figure', { class: 'pvpage' }, c, h('figcaption', {}, 'Page ' + i)));
        }
        doc.destroy();
      } else if (await otherPicture(f)) {
        stage.replaceChildren(await pictureCanvas(f, 1600));
      } else if (isImage(f) || (f.type || '').startsWith('image/')) {
        const img = h('img', { src: URL.createObjectURL(f), alt: name });
        img.onload = () => { info.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px · ' + fmtSize(f.size); };
        stage.replaceChildren(img);
      } else if (/^text\/|json|xml|csv/.test(f.type || '') || /\.(txt|md|csv|json|xml|html?)$/i.test(name)) {
        stage.replaceChildren(h('pre', { class: 'pvtext' }, await f.slice(0, 200000).text()));
      } else {
        stage.replaceChildren(h('p', { class: 'status' }, 'No preview for this kind of file. You can still use it with the tools.'));
      }
    } catch (e) {
      stage.replaceChildren(h('p', { class: 'status' }, /password/i.test(e.message || '') || e.name === 'PasswordException'
        ? 'This PDF is password-protected, so it can not be previewed.' : 'Could not show a preview of this file.'));
    }
  })();
}

async function fillThumb(f, thumb, meta) {
  try {
    if (isPdf(f)) {
      const { canvas, pages } = await pdfThumb(await readBytes(f));
      thumb.replaceChildren(canvas);
      meta.textContent = `${pages} page${pages > 1 ? 's' : ''} · ${fmtSize(f.size)}`;
    } else if (await otherPicture(f)) {
      thumb.replaceChildren(await pictureCanvas(f, 300));
    } else if (isImage(f)) {
      const img = h('img', { src: URL.createObjectURL(f), alt: '' });
      thumb.replaceChildren(img);
    } else {
      thumb.replaceChildren(h('div', { class: 'ticon lg', style: { '--tc': 'var(--c-convert)' }, html: icon('page') }));
    }
  } catch (e) {
    thumb.replaceChildren(h('div', { class: 'ticon lg', style: { '--tc': 'var(--danger)' }, html: icon(e.code === 'ENCRYPTED' || /password/i.test(e.message) ? 'lock' : 'page') }));
    if (/password/i.test(e.message || '') || e.name === 'PasswordException') meta.textContent = 'Password-protected · ' + fmtSize(f.size);
  }
}

// Options form generated from a schema. Returns {el, values()}.
export function optionsForm(schema, initial = {}) {
  const vals = {};
  const root = h('div');
  const rows = [];
  for (const o of schema) {
    vals[o.key] = initial[o.key] ?? o.default;
    const row = h('div', { class: 'field' });
    const set = (v) => { vals[o.key] = v; refresh(); };
    if (o.type === 'checkbox') {
      const c = h('input', { type: 'checkbox', checked: !!vals[o.key], onchange: (e) => set(e.target.checked) });
      row.append(h('label', { class: 'check' }, c, o.label));
    } else {
      row.append(h('div', { class: 'lbl' }, o.label));
      if (o.type === 'seg') {
        const seg = h('div', { class: 'seg' });
        for (const [v, l] of o.options) {
          const b = h('button', { type: 'button', class: vals[o.key] === v ? 'on' : '', onclick: () => { set(v); [...seg.children].forEach((x) => x.classList.toggle('on', x === b)); } }, l);
          seg.append(b);
        }
        row.append(seg);
      } else if (o.type === 'select') {
        const s = h('select', { onchange: (e) => set(e.target.value) }, o.options.map(([v, l]) => h('option', { value: v, selected: vals[o.key] === v }, l)));
        row.append(s);
      } else if (o.type === 'position') {
        const g = h('div', { class: 'posgrid' });
        ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].forEach((p) => {
          if (o.only && !o.only.includes(p)) { g.append(h('span')); return; }
          const b = h('button', { type: 'button', title: p, class: vals[o.key] === p ? 'on' : '', onclick: () => { set(p); [...g.children].forEach((x) => x.classList && x.classList.toggle('on', x === b)); } });
          g.append(b);
        });
        row.append(g);
      } else if (o.type === 'range') {
        const out = h('span', { class: 'status' }, ` ${vals[o.key]}${o.unit || ''}`);
        row.firstChild.append(out);
        row.append(h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: vals[o.key], oninput: (e) => { out.textContent = ` ${e.target.value}${o.unit || ''}`; set(+e.target.value); } }));
      } else if (o.type === 'gfont') {
        // Any Google font (loaded lazily to keep this helper light).
        const slot = h('span', { class: 'status' }, 'Loading fonts…');
        row.append(slot);
        import('./fonts.js').then((m) => slot.replaceWith(m.fontPicker(vals[o.key] || '', (v) => set(v), { standardLabel: o.standardLabel || 'Use the font above' })));
      } else if (o.type === 'color') {
        row.append(h('input', { type: 'color', value: vals[o.key], oninput: (e) => set(e.target.value) }));
      } else if (o.type === 'file') {
        const name = h('span', { class: 'status' }, ' none');
        row.append(h('button', { class: 'btn small', type: 'button', onclick: async () => { const [f] = await pickFiles(o.accept, false); if (f) { name.textContent = ' ' + f.name; set(f); } } }, 'Choose…'),
          o.stock && takesImages(o.accept) && h('button', { class: 'btn small', type: 'button', onclick: async () => { const f = await stockPhoto({ title: o.label || 'Free stock photo', suggestion: o.stockHint }); if (f) { name.textContent = ' ' + f.name; set(f); } } }, 'Stock photo…'), name);
      } else if (o.type === 'textarea') {
        row.append(h('textarea', { placeholder: o.placeholder || '', oninput: (e) => set(e.target.value) }, vals[o.key] || ''));
      } else {
        row.append(h('input', { type: o.type || 'text', value: vals[o.key] ?? '', placeholder: o.placeholder || '', min: o.min, max: o.max, step: o.type === 'number' ? (o.step || 'any') : undefined, autocomplete: o.type === 'password' ? 'new-password' : 'off', oninput: (e) => set(o.type === 'number' ? +e.target.value : e.target.value) }));
      }
    }
    if (o.hint) row.append(h('div', { class: 'hint' }, o.hint));
    rows.push([o, row]);
    root.append(row);
  }
  function refresh() {
    for (const [o, row] of rows) row.classList.toggle('hidden', !!o.showIf && !o.showIf(vals));
  }
  refresh();
  return { el: root, values: () => ({ ...vals }) };
}

export function progressBox() {
  const bar = h('div');
  const status = h('div', { class: 'status' }, '');
  const el = h('div', {}, h('div', { class: 'progress' }, bar), status);
  return { el, set: (frac, msg) => { bar.style.width = Math.round(Math.min(1, frac) * 100) + '%'; if (msg) status.textContent = msg; } };
}

// Result screen: download buttons, zip, text preview, and hand-off to another tool.
export function resultView(outputs, { title = 'Done!', onRestart, onBack, tools, imgTools, onChain, note }) {
  const root = h('div', { class: 'panel result' });
  if (onBack) root.append(h('button', { class: 'btn backedit', type: 'button', title: 'Go back to your work and change something', onclick: onBack }, h('span', { html: icon('left') }), 'Back to editing'));
  root.append(h('div', { class: 'ticon lg', style: { margin: '0 auto', '--tc': 'var(--ok)' }, html: icon('check') }), h('h2', {}, title));
  if (note) root.append(h('p', { class: 'status' }, note));
  const texts = outputs.filter((o) => o.preview);
  for (const t of texts) root.append(h('div', { class: 'textout' }, t.preview));
  const pics = outputs.filter((o) => o.blob.type.startsWith('image/'));
  const docs = outputs.filter((o) => o.blob.type === 'application/pdf');
  if (pics.length || docs.length) {
    const strip = h('div', { class: 'imgprev' });
    for (const o of [...docs, ...pics].slice(0, 8)) {
      const open = () => previewFile(o.blob, o.name);
      if (o.blob.type === 'application/pdf') {
        const tile = h('button', { class: 'pdfprev', type: 'button', title: 'Preview ' + o.name, onclick: open }, h('span', { class: 'status' }, '…'));
        strip.append(tile);
        readBytes(o.blob).then((b) => pdfThumb(b, 180))
          .then(({ canvas, pages }) => tile.replaceChildren(canvas, h('span', { class: 'pg' }, pages + (pages > 1 ? ' pages' : ' page'))))
          .catch(() => tile.remove());
      } else {
        strip.append(h('img', { src: URL.createObjectURL(o.blob), alt: o.name, title: 'Preview ' + o.name, class: 'canpreview', onclick: open }));
      }
    }
    root.append(strip);
  }
  const list = h('div', { class: 'outlist' });
  for (const o of outputs) {
    list.append(h('div', { class: 'outrow' },
      h('div', { class: 'n', title: o.name }, o.name),
      /^(application\/pdf|image\/|text\/)/.test(o.blob.type) && h('button', { class: 'btn small ghost', type: 'button', onclick: () => previewFile(o.blob, o.name) }, 'Preview'),
      h('div', { class: 's' }, fmtSize(o.blob.size)),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => download(o.blob, o.name) }, h('span', { html: icon('download') }), 'Download')));
  }
  root.append(list);
  const row = h('div', { class: 'chain' });
  if (outputs.length > 1) row.append(h('button', { class: 'btn primary', type: 'button', onclick: async () => { const z = await zipOutputs(outputs); download(z.blob, z.name); } }, h('span', { html: icon('download') }), 'Download all (ZIP)'));
  if (navigator.canShare && outputs.length) {
    const files = outputs.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
    if (navigator.canShare({ files })) row.append(h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ files }).catch(() => {}) }, 'Share'));
  }
  const pdfs = outputs.filter((o) => o.blob.type === 'application/pdf');
  if (pdfs.length && tools) {
    const sel = h('select', { class: 'inp', style: { width: 'auto' } }, h('option', { value: '' }, 'Continue with another tool…'), tools.map((t) => h('option', { value: t.id }, t.name)));
    sel.addEventListener('change', () => sel.value && onChain(sel.value, pdfs.map((o) => new File([o.blob], o.name, { type: 'application/pdf' }))));
    row.append(sel);
  }
  if (pics.length && imgTools?.length) {
    const sel = h('select', { class: 'inp', style: { width: 'auto' } }, h('option', { value: '' }, 'Continue with another image tool…'), imgTools.map((t) => h('option', { value: t.id }, t.name)));
    sel.addEventListener('change', () => sel.value && onChain(sel.value, pics.map((o) => new File([o.blob], o.name, { type: o.blob.type }))));
    row.append(sel);
  }
  if (onBack) row.append(h('button', { class: 'btn', type: 'button', onclick: onBack }, h('span', { html: icon('edit') }), 'Make more changes'));
  row.append(h('button', { class: 'btn ghost', type: 'button', onclick: onRestart }, 'Start over'));
  root.append(row);
  return root;
}
