// Tiny DOM helpers and the shared building blocks used by every tool page.
import { icon } from './icons.js';
import { fmtSize, isPdf, isImage, pdfThumb, readBytes, download, zipOutputs } from './core.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

export function dropzone({ accept, multiple, label, onFiles, capture }) {
  const zone = h('div', { class: 'drop' },
    h('div', { class: 'ticon lg', style: { margin: '0 auto', '--tc': 'var(--accent)' }, html: icon('upload') }),
    h('h2', {}, label),
    h('p', {}, 'or drop ' + (multiple ? 'files' : 'a file') + ' here'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary big', type: 'button', onclick: async () => { const f = await pickFiles(accept, multiple); if (f.length) onFiles(f); } }, 'Choose ' + (multiple ? 'files' : 'file')),
      capture && h('button', { class: 'btn big', type: 'button', onclick: async () => { const f = await pickFiles('image/*', true, 'environment'); if (f.length) onFiles(f); } }, h('span', { html: icon('camera') }), 'Use camera')
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

async function fillThumb(f, thumb, meta) {
  try {
    if (isPdf(f)) {
      const { canvas, pages } = await pdfThumb(await readBytes(f));
      thumb.replaceChildren(canvas);
      meta.textContent = `${pages} page${pages > 1 ? 's' : ''} · ${fmtSize(f.size)}`;
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
      } else if (o.type === 'color') {
        row.append(h('input', { type: 'color', value: vals[o.key], oninput: (e) => set(e.target.value) }));
      } else if (o.type === 'file') {
        const name = h('span', { class: 'status' }, ' none');
        row.append(h('button', { class: 'btn small', type: 'button', onclick: async () => { const [f] = await pickFiles(o.accept, false); if (f) { name.textContent = ' ' + f.name; set(f); } } }, 'Choose…'), name);
      } else if (o.type === 'textarea') {
        row.append(h('textarea', { placeholder: o.placeholder || '', oninput: (e) => set(e.target.value) }, vals[o.key] || ''));
      } else {
        row.append(h('input', { type: o.type || 'text', value: vals[o.key] ?? '', placeholder: o.placeholder || '', min: o.min, max: o.max, autocomplete: o.type === 'password' ? 'new-password' : 'off', oninput: (e) => set(o.type === 'number' ? +e.target.value : e.target.value) }));
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
export function resultView(outputs, { title = 'Done!', onRestart, tools, onChain, note }) {
  const root = h('div', { class: 'panel result' });
  root.append(h('div', { class: 'ticon lg', style: { margin: '0 auto', '--tc': 'var(--ok)' }, html: icon('check') }), h('h2', {}, title));
  if (note) root.append(h('p', { class: 'status' }, note));
  const texts = outputs.filter((o) => o.preview);
  for (const t of texts) root.append(h('div', { class: 'textout' }, t.preview));
  const list = h('div', { class: 'outlist' });
  for (const o of outputs) {
    list.append(h('div', { class: 'outrow' },
      h('div', { class: 'n', title: o.name }, o.name),
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
  row.append(h('button', { class: 'btn ghost', type: 'button', onclick: onRestart }, 'Start over'));
  root.append(row);
  return root;
}
