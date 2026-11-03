// PDF Forms, Workflows, and the tools that need the server edition.
import { PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } from '@cantoo/pdf-lib';
import { pdfjsLib, readBytes, pdfBlob, stem, openPdfjs, loadPdfLib, isPdf } from '../lib/core.js';
import { h, optionsForm, pickFiles, progressBox, toast } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { mountEditor } from './editor.js';

const PDF = '.pdf,application/pdf';

// ---------------- PDF Forms ----------------
async function mountForms(el, [file], ctx) {
  const bytes = await readBytes(file);
  const doc = await loadPdfLib(bytes);
  let fields = [];
  try { fields = doc.getForm().getFields(); } catch { /* no AcroForm */ }

  const startDesigner = async (auto) => {
    let initial = null;
    if (auto) {
      initial = await detectFields(bytes);
      const n = Object.values(initial).flat().length;
      toast(n ? `Found ${n} place(s) to fill. Adjust them, then save.` : 'No blank lines or boxes found. Place fields by hand.', 4000);
    }
    mountEditor(el, file, ctx, 'forms', { initial });
  };

  if (!fields.length) {
    el.replaceChildren(h('div', { class: 'panel', style: { maxWidth: '720px', margin: '0 auto' } },
      h('h3', {}, 'This PDF has no fillable fields yet'),
      h('p', { class: 'status' }, 'Turn it into a fillable form: Pagewise can find blank lines (____) and boxes (☐) and put fields there, or you can place fields yourself.'),
      h('div', { class: 'chain', style: { justifyContent: 'flex-start' } },
        h('button', { class: 'btn primary', type: 'button', onclick: () => startDesigner(true) }, h('span', { html: icon('ai') }), 'Detect fields automatically'),
        h('button', { class: 'btn', type: 'button', onclick: () => startDesigner(false) }, h('span', { html: icon('field') }), 'Place fields by hand'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.restart() }, 'Choose another file')),
      h('p', { class: 'status', style: { marginTop: '14px' } }, 'Just want to write on it? Edit PDF lets you type anywhere on the page.')));
    return;
  }

  const inputs = [];
  const list = h('div');
  for (const f of fields) {
    const name = f.getName();
    let input;
    if (f instanceof PDFTextField) {
      const multi = f.isMultiline();
      input = h(multi ? 'textarea' : 'input', { class: 'inp', value: f.getText() || '', maxlength: f.getMaxLength() || undefined, style: multi ? { minHeight: '70px', fontFamily: 'inherit' } : undefined });
      if (multi) input.value = f.getText() || '';
      inputs.push(() => f.setText(input.value || undefined));
    } else if (f instanceof PDFCheckBox) {
      input = h('input', { type: 'checkbox', checked: f.isChecked() });
      inputs.push(() => (input.checked ? f.check() : f.uncheck()));
      input = h('label', { class: 'check' }, input, 'Checked');
    } else if (f instanceof PDFDropdown) {
      const sel = f.getSelected()[0];
      input = h('select', { class: 'inp' }, h('option', { value: '' }, '—'), f.getOptions().map((o) => h('option', { value: o, selected: o === sel }, o)));
      inputs.push(() => (input.value ? f.select(input.value) : f.clear()));
    } else if (f instanceof PDFRadioGroup) {
      const sel = f.getSelected();
      input = h('select', { class: 'inp' }, h('option', { value: '' }, '—'), f.getOptions().map((o) => h('option', { value: o, selected: o === sel }, o)));
      inputs.push(() => (input.value ? f.select(input.value) : f.clear()));
    } else if (f instanceof PDFOptionList) {
      const sel = new Set(f.getSelected());
      input = h('select', { class: 'inp', multiple: true }, f.getOptions().map((o) => h('option', { value: o, selected: sel.has(o) }, o)));
      inputs.push(() => { const v = [...input.selectedOptions].map((o) => o.value); v.length ? f.select(v) : f.clear(); });
    } else continue;
    if (f.isReadOnly()) input.setAttribute?.('disabled', '');
    list.append(h('div', { class: 'field' }, h('div', { class: 'lbl' }, name.replace(/[_.]+/g, ' ')), input));
  }
  const flatten = h('input', { type: 'checkbox' });
  const err = h('div', { class: 'error' });
  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, h('h3', {}, `Fill in ${fields.length} field${fields.length > 1 ? 's' : ''}`), list),
    h('div', { class: 'panel sidepanel' },
      h('h3', {}, 'Save'),
      h('label', { class: 'check field' }, flatten, 'Flatten (lock answers so they can\'t be changed)'),
      h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
        try {
          inputs.forEach((fn) => fn());
          const form = doc.getForm();
          if (flatten.checked) form.flatten(); else form.updateFieldAppearances();
          ctx.finish([{ name: stem(file.name) + '-filled.pdf', blob: pdfBlob(await doc.save()) }]);
        } catch (e) { err.textContent = e.message; }
      } }, 'Save filled PDF'),
      err,
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' } }),
      h('button', { class: 'btn small', type: 'button', onclick: () => startDesigner(false) }, 'Add more fields'))));
}

// Blank lines made of underscores become text fields; empty boxes become checkboxes.
async function detectFields(bytes) {
  const view = await openPdfjs(bytes);
  const out = {};
  for (let i = 1; i <= view.numPages; i++) {
    const page = await view.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const objs = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(tx[2], tx[3]);
      const cw = it.width / Math.max(1, it.str.length);
      for (const m of it.str.matchAll(/_{4,}|\.{8,}/g)) {
        const x = tx[4] + m.index * cw, w = m[0].length * cw;
        if (w < 25) continue;
        objs.push({ type: 'field', kind: 'text', name: `field_${i}_${objs.length + 1}`, x, y: tx[5] - size * 1.05, w, h: Math.max(12, size * 1.2) });
      }
      for (const m of it.str.matchAll(/[☐□▢❏]|\[\s?\]/g)) {
        const x = tx[4] + m.index * cw;
        objs.push({ type: 'field', kind: 'checkbox', name: `check_${i}_${objs.length + 1}`, x, y: tx[5] - size * 0.85, w: Math.max(10, size * 0.9), h: Math.max(10, size * 0.9) });
      }
    }
    out[i - 1] = objs;
  }
  view.destroy();
  return out;
}

// ---------------- Workflows ----------------
const WF_KEY = 'pagewise.workflows';
const loadWfs = () => { try { return JSON.parse(localStorage.getItem(WF_KEY) || '[]'); } catch { return []; } };
const storeWfs = (w) => { try { localStorage.setItem(WF_KEY, JSON.stringify(w)); } catch { /* blocked */ } };

const STEP_TYPES = {
  merge: 'Merge all files into one',
  rotate: 'Rotate pages',
  watermark: 'Add watermark (text)',
  'page-numbers': 'Add page numbers',
  compress: 'Compress',
  metadata: 'Set title & author',
  protect: 'Protect with password'
};

async function mountWorkflow(el, ctx) {
  const simple = await import('./simple.js');
  const schemaFor = (type) => {
    if (type === 'metadata') return [{ key: 'title', label: 'Title', default: '' }, { key: 'author', label: 'Author', default: '' }];
    if (type === 'compress') return [{ key: 'level', label: 'Level', type: 'seg', default: 'recommended', options: [['low', 'Light'], ['recommended', 'Recommended']] }];
    if (type === 'watermark') return simple.tools.watermark.options.filter((o) => !['kind', 'image', 'scale'].includes(o.key));
    if (type === 'merge') return [];
    return simple.tools[type].options;
  };
  let wfs = loadWfs();
  let current = { name: 'My workflow', steps: [] };
  const forms = new Map();

  const render = () => {
    const steps = h('div');
    current.steps.forEach((s, i) => {
      const f = optionsForm(schemaFor(s.type), s.opts);
      forms.set(s, f);
      const open = h('details', { open: i === current.steps.length - 1 }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Settings'), h('div', { style: { marginTop: '10px' } }, f.el));
      steps.append(h('div', { class: 'wfstep', style: { flexDirection: 'column', alignItems: 'stretch' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', { class: 'pill' }, String(i + 1)), h('span', { class: 'n' }, STEP_TYPES[s.type]),
          h('button', { class: 'iconbtn', type: 'button', title: 'Remove step', html: icon('trash'), onclick: () => { save(); current.steps.splice(i, 1); render(); } })),
        schemaFor(s.type).length ? open : null));
    });
    const addSel = h('select', { class: 'inp', style: { width: 'auto' } }, h('option', { value: '' }, '+ Add a step…'),
      Object.entries(STEP_TYPES).filter(([k]) => !(k === 'merge' && current.steps.some((s) => s.type === 'merge'))).map(([k, l]) => h('option', { value: k }, l)));
    addSel.addEventListener('change', () => {
      if (!addSel.value) return;
      save();
      const step = { type: addSel.value, opts: {} };
      if (step.type === 'merge') current.steps.unshift(step);
      else if (step.type === 'protect') current.steps.push(step);
      else { const pi = current.steps.findIndex((s) => s.type === 'protect'); pi >= 0 ? current.steps.splice(pi, 0, step) : current.steps.push(step); }
      render();
    });
    const nameIn = h('input', { class: 'inp', value: current.name, onchange: (e) => (current.name = e.target.value) });
    const prog = progressBox(); prog.el.classList.add('hidden');
    const err = h('div', { class: 'error' });
    el.replaceChildren(h('div', { class: 'layout' },
      h('div', { class: 'panel' },
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Workflow name'), nameIn),
        steps, current.steps.length ? null : h('p', { class: 'status' }, 'Add the steps you want to run, in order. Merge always runs first and Protect always runs last.'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } }, addSel,
          h('button', { class: 'btn', type: 'button', onclick: () => { save(); const i = wfs.findIndex((w) => w.name === current.name); i >= 0 ? (wfs[i] = clone(current)) : wfs.push(clone(current)); storeWfs(wfs); toast('Workflow saved on this device'); render(); } }, 'Save workflow'))),
      h('div', { class: 'panel sidepanel' },
        h('h3', {}, 'Run'),
        h('p', { class: 'status' }, 'Pick PDF files and every step runs on them automatically.'),
        h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
          save(); err.textContent = '';
          if (!current.steps.length) { err.textContent = 'Add at least one step.'; return; }
          const files = (await pickFiles(PDF, true)).filter(isPdf);
          if (!files.length) return;
          prog.el.classList.remove('hidden');
          try { ctx.finish(await runWorkflow(current, files, simple, prog.set)); }
          catch (e) { err.textContent = e.message; prog.el.classList.add('hidden'); }
        } }, 'Choose files & run'),
        prog.el, err,
        wfs.length ? h('div', { style: { marginTop: '18px' } }, h('h4', {}, 'Saved workflows'),
          ...wfs.map((w, i) => h('div', { class: 'wfstep' }, h('span', { class: 'n' }, w.name, h('div', { class: 'status' }, w.steps.map((s) => STEP_TYPES[s.type]).join(' → '))),
            h('button', { class: 'btn small', type: 'button', onclick: () => { current = clone(w); render(); } }, 'Open'),
            h('button', { class: 'iconbtn', type: 'button', title: 'Delete', html: icon('trash'), onclick: () => { wfs.splice(i, 1); storeWfs(wfs); render(); } })))) : null)));
  };
  const save = () => { for (const s of current.steps) { const f = forms.get(s); if (f) s.opts = strip(f.values()); } };
  render();
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !(v instanceof Blob)));

export async function runWorkflow(wf, files, simple, progress) {
  const steps = wf.steps;
  const optsOf = (s) => {
    const schema = ['merge', 'metadata', 'compress'].includes(s.type) ? [] : simple.tools[s.type].options;
    const defaults = Object.fromEntries(schema.map((o) => [o.key, o.default]));
    return { ...defaults, ...(s.type === 'watermark' ? { kind: 'text' } : {}), ...s.opts };
  };
  let docs;
  if (steps[0]?.type === 'merge') {
    progress(0.05, 'Merging…');
    docs = [{ name: files.length > 1 ? 'merged' : stem(files[0].name), doc: await simple.mergeFiles(files, { progress: () => {} }) }];
  } else {
    docs = [];
    for (const f of files) docs.push({ name: stem(f.name), doc: await loadPdfLib(await readBytes(f)) });
  }
  const outputs = [];
  for (const [k, d] of docs.entries()) {
    for (const s of steps) {
      progress((k + 0.5) / docs.length, `${d.name}: ${STEP_TYPES[s.type]}`);
      const o = optsOf(s);
      if (s.type === 'rotate') await simple.ops.rotate(d.doc, o);
      else if (s.type === 'watermark') await simple.ops.watermark(d.doc, o);
      else if (s.type === 'page-numbers') await simple.ops.pageNumbers(d.doc, o);
      else if (s.type === 'compress') await simple.ops.compress(d.doc, o);
      else if (s.type === 'metadata') { if (o.title) d.doc.setTitle(o.title); if (o.author) d.doc.setAuthor(o.author); }
      else if (s.type === 'protect') {
        if (!o.pw) throw new Error('The Protect step needs a password.');
        if (o.pw !== o.pw2) throw new Error('The two passwords in the Protect step do not match.');
        d.doc.encrypt({ userPassword: o.pw, ownerPassword: o.owner || crypto.getRandomValues(new Uint32Array(4)).join('-'), permissions: { printing: o.print ? 'highResolution' : false, copying: o.copy, modifying: o.modify, annotating: o.annot, fillingForms: o.annot, contentAccessibility: true, documentAssembly: o.modify } });
      }
    }
    outputs.push({ name: `${d.name}-${wf.name.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'processed'}.pdf`, blob: pdfBlob(await d.doc.save({ useObjectStreams: true })) });
  }
  return outputs;
}

// ---------------- Server-edition tools ----------------
function serverPage(title, why, now) {
  return () => h('div', { class: 'panel', style: { maxWidth: '760px', margin: '0 auto 40px' } },
    h('div', { class: 'ticon lg', style: { '--tc': 'var(--c-security)' }, html: icon('server') }),
    h('h2', { style: { margin: '12px 0 6px' } }, `${title} needs the Pagewise server`),
    h('p', {}, why),
    h('div', { class: 'notice info' }, h('b', {}, 'What you can do now: '), now),
    h('p', { class: 'status' }, 'Every other tool runs fully on your device. This one will switch on automatically when the app is connected to a Pagewise server.'));
}

export const tools = {
  forms: { accept: PDF, multiple: false, label: 'Select a PDF form', mount: (el, files, ctx) => mountForms(el, files, ctx).catch((e) => el.replaceChildren(h('p', { class: 'error' }, e.message))) },
  workflow: { standalone: true, mount: (el, ctx) => mountWorkflow(el, ctx) },
  'pdf-to-pdfa': { server: true, render: serverPage('PDF to PDF/A', 'Real PDF/A must embed every font and colour profile and pass strict validation. Doing that reliably needs a full PDF engine (Ghostscript/veraPDF) running on a server.', 'Compress PDF with "Light" keeps a clean, archive-friendly copy, and Protect PDF can lock it against changes.') },
  translate: { server: true, render: serverPage('Translate PDF', 'High-quality translation that keeps fonts and layout uses an AI translation service, which needs a server and an API key.', 'Convert the PDF with PDF to Word, translate the .docx with your usual translator, then use Word to PDF.') }
};

