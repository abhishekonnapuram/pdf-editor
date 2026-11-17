// Resume builder and editor: several saved resumes, a live preview, sections and entries that can be
// dragged into any order, hidden or renamed, 12 templates with full design control, import of an old
// resume (PDF, Word, photo), "match a design" from a picture, a resume checker and Word / text export.
import { h, toast, pickFiles, modal } from '../../lib/ui.js';
import { icon } from '../../lib/icons.js';
import { download, openPdfjs, renderPage } from '../../lib/core.js';
import { readPicture, resizeCanvas } from '../../lib/imgio.js';
import {
  SECTION_TYPES, KIND_NAMES, TEMPLATES, RFONTS, ACCENTS, templateOf, applyTemplate, fieldsOf, newSection, newEntry, uid,
  blankResume, normalize, listResumes, loadResume, saveResume, deleteResume, openLast, history, sampleResume, SIDE_TYPES, splitLines
} from './model.js';
import { renderResume } from './render.js';

const ib = (name, title, onclick, cls = '') => h('button', { class: 'iconbtn ' + cls, type: 'button', title, 'aria-label': title, onclick, html: icon(name) });
const debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.now = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };

/**
 * Drag to reorder: items move in the list while the pointer moves; onDone gets the new order of data-id values.
 * Works with mouse, touch and pen. Only starts from the handle.
 */
function sortable(list, handleSel, onDone) {
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest(handleSel);
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest('[data-id]');
    if (!item || item.parentElement !== list) return;
    e.preventDefault();
    const before = [...list.children].map((c) => c.dataset.id).join();
    item.classList.add('dragging');
    // Listen on the window: moving the item in the page drops any pointer capture.
    const move = (ev) => {
      const sibs = [...list.children].filter((c) => c !== item && c.dataset.id);
      let target = null;
      for (const s of sibs) { const r = s.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { target = s; break; } }
      if (target) { if (item.nextElementSibling !== target) list.insertBefore(item, target); }
      else { const last = sibs[sibs.length - 1]; if (last && last.nextElementSibling !== item) last.after(item); }
      // Scroll the page when dragging near the top or bottom.
      if (ev.clientY < 60) window.scrollBy(0, -12); else if (ev.clientY > innerHeight - 60) window.scrollBy(0, 12);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      item.classList.remove('dragging');
      const ids = [...list.children].map((c) => c.dataset.id).filter(Boolean);
      if (ids.join() !== before) onDone(ids);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
}

// Template pictures (rendered once per template and font).
const thumbCache = new Map();
async function templateThumb(tid, font) {
  const key = tid + '|' + font;
  if (!thumbCache.has(key)) {
    thumbCache.set(key, (async () => {
      const r = sampleResume();
      const t = templateOf(tid);
      r.design = { ...applyTemplate(r.design, tid), font: t.plain ? t.font : font };
      const { blob } = await renderResume(r, { fit: true });
      const doc = await openPdfjs(new Uint8Array(await blob.arrayBuffer()));
      const page = await doc.getPage(1);
      const c = await renderPage(page, 240 / page.getViewport({ scale: 1 }).width);
      return c.toDataURL('image/jpeg', 0.82);
    })().catch((e) => { thumbCache.delete(key); throw e; }));
  }
  return thumbCache.get(key);
}

async function photoDataUrl(file) {
  const c = (await readPicture(file)).frames[0].canvas;
  const k = Math.min(1, 520 / Math.max(c.width, c.height));
  return resizeCanvas(c, c.width * k, c.height * k).toDataURL('image/jpeg', 0.88);
}

// Undo snapshots leave out the save time and folded/open state of the form.
const snapOf = (r) => JSON.stringify(r, (k, v) => (k === 'updated' || k[0] === '_' ? undefined : v));

export function mount(el, ctx) {
  const snap = () => snapOf(R);
  let R = openLast() || blankResume();
  const hist = history();
  hist.reset(snap());
  let tab = 'content', mobileView = 'edit';
  let aiState = 'unavailable';
  import('../../lib/ai.js').then((m) => m.builtinAIStatus()).then((s) => { aiState = s; if (s !== 'unavailable') drawContent(); }).catch(() => {});

  // ---------- saving, history, preview ----------
  const saveNow = () => { if (!saveResume(R)) toast('Your browser storage is full. Remove a photo or an old resume to keep saving.'); };
  const saveSoon = debounce(saveNow, 500);
  const snapSoon = debounce(() => { hist.push(snap()); updUndo(); }, 700);
  /** Something changed: save, remember for undo, redraw the preview. structural=true also redraws the form. */
  function changed(structural = false) {
    saveSoon(); snapSoon(); preview();
    if (structural) { snapSoon.now(); drawContent(); }
  }

  const prevPages = h('div', { class: 'rsm-pages' });
  const prevInfo = h('div', { class: 'rsm-pinfo' });
  let gen = 0, lastPages = 1;
  const preview = debounce(async () => {
    const my = ++gen;
    try {
      const { blob, pages, scale } = await renderResume(R);
      if (my !== gen) return;
      lastPages = pages;
      const doc = await openPdfjs(new Uint8Array(await blob.arrayBuffer()));
      const w = Math.max(280, prevPages.clientWidth || 520);
      const cs = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const c = await renderPage(page, Math.min(2.4, (w * (devicePixelRatio || 1)) / vp.width));
        c.className = 'rsm-page';
        cs.push(c);
      }
      if (my !== gen) return;
      prevPages.replaceChildren(...cs);
      prevInfo.replaceChildren(...[
        h('span', {}, `${pages} page${pages > 1 ? 's' : ''}`),
        R.design.fit && scale < 1 ? h('span', { class: 'status' }, ` · shrunk to ${Math.round(scale * 100)}% to fit`) : null,
        pages > 1 && !R.design.fit ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { R.design.fit = true; changed(); drawDesign(); } }, 'Fit to one page') : null].filter(Boolean));
      if (tab === 'check') drawCheck();
    } catch (e) { console.error(e); if (my === gen) prevInfo.textContent = 'Could not draw the preview: ' + e.message; }
  }, 300);

  // ---------- toolbar ----------
  const pickSel = h('select', { class: 'rsm-pick', 'aria-label': 'Your resumes', onchange: (e) => switchTo(e.target.value) });
  const drawPick = () => {
    const list = listResumes();
    if (!list.some((x) => x.id === R.id)) list.unshift({ id: R.id, name: R.name });
    pickSel.replaceChildren(...list.map((x) => h('option', { value: x.id, selected: x.id === R.id }, x.id === R.id ? R.name : x.name)));
  };
  function switchTo(id) {
    saveSoon.now();
    const r = loadResume(id);
    if (!r) return;
    R = r; hist.reset(snap()); updUndo();
    drawAll();
  }
  function useResume(r, note, keepOld = true) {
    if (keepOld) saveSoon.now(); else saveSoon.cancel();
    R = normalize(r); saveNow(); hist.reset(snap()); updUndo();
    drawAll();
    if (note) toast(note, 3600);
  }
  async function askName(title, value) {
    const inp = h('input', { type: 'text', class: 'inp', value, maxlength: 60 });
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    return modal(title, h('div', {}, inp), [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: () => inp.value.trim() || value }]);
  }
  const undoB = ib('undo', 'Undo (Ctrl+Z)', () => doUndo(false));
  const redoB = ib('redo', 'Redo (Ctrl+Y)', () => doUndo(true));
  const updUndo = () => { undoB.disabled = !hist.canUndo; redoB.disabled = !hist.canRedo; };
  function doUndo(redo) {
    snapSoon.now();
    const s = redo ? hist.redo() : hist.undo();
    if (!s) return;
    R = normalize(JSON.parse(s)); saveSoon(); updUndo(); drawAll();
  }

  const fileBaseP = import('./export.js');
  async function get(kind) {
    try {
      const ex = await fileBaseP;
      const base = ex.fileBase(R);
      if (kind === 'pdf') download((await renderResume(R)).blob, base + '.pdf');
      else if (kind === 'docx') download(await ex.resumeDocx(R), base + '.docx');
      else download(ex.resumeText(R), base + '.txt');
    } catch (e) { console.error(e); toast('Could not make the file: ' + e.message); }
  }
  const moreMenu = h('div', { class: 'rsm-menu', hidden: true },
    h('button', { type: 'button', onclick: () => { moreMenu.hidden = true; get('docx'); } }, h('span', { html: icon('word') }), 'Word (.docx)'),
    h('button', { type: 'button', onclick: () => { moreMenu.hidden = true; get('txt'); } }, h('span', { html: icon('text') }), 'Plain text for job sites (.txt)'));
  document.addEventListener('pointerdown', (e) => { if (!moreMenu.hidden && !e.target.closest('.rsm-dl')) moreMenu.hidden = true; });

  const bar = h('div', { class: 'rsm-bar' },
    h('div', { class: 'rsm-files' },
      pickSel,
      ib('plus', 'New resume', async () => { const n = await askName('Name of the new resume', 'Resume ' + (listResumes().length + 1)); if (n) { const r = blankResume(n); r.design = { ...R.design }; useResume(r); } }),
      ib('dup', 'Duplicate this resume (for another job)', () => { const c = JSON.parse(snap()); c.id = uid(); c.name = R.name + ' (copy)'; useResume(c, 'Copy made. Changes to it will not touch the original.'); }),
      ib('edit', 'Rename', async () => { const n = await askName('Rename resume', R.name); if (n) { R.name = n; saveNow(); drawPick(); } }),
      ib('trash', 'Delete this resume', async () => {
        if (!(await modal('Delete this resume?', h('p', {}, `“${R.name}” will be removed from this browser. This cannot be undone.`), [{ label: 'Cancel', value: false }, { label: 'Delete', primary: true, value: true }]))) return;
        saveSoon.cancel(); // a pending save would bring the deleted resume back
        deleteResume(R.id);
        const next = listResumes()[0];
        useResume(next ? loadResume(next.id) : blankResume(), null, false);
      })),
    h('div', { class: 'rsm-acts' },
      h('button', { class: 'btn small', type: 'button', onclick: () => importFlow() }, h('span', { html: icon('upload') }), 'Import old resume'),
      h('button', { class: 'btn small', type: 'button', onclick: () => matchFlow() }, h('span', { html: icon('palette') }), 'Match a design'),
      undoB, redoB,
      h('div', { class: 'rsm-dl' },
        h('button', { class: 'btn small primary', type: 'button', onclick: () => get('pdf') }, h('span', { html: icon('download') }), 'Download PDF'),
        h('button', { class: 'btn small', type: 'button', title: 'More formats', 'aria-label': 'More formats', onclick: () => { moreMenu.hidden = !moreMenu.hidden; } }, h('span', { html: icon('down') })),
        moreMenu)));

  // ---------- tabs ----------
  const tabBtns = {};
  const tabs = h('div', { class: 'seg rsm-tabs', role: 'tablist' }, ...[['content', 'Content'], ['design', 'Design'], ['check', 'Check & improve']].map(([k, l]) => {
    tabBtns[k] = h('button', { type: 'button', role: 'tab', class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); } }, l);
    return tabBtns[k];
  }));
  const pane = h('div', { class: 'rsm-pane docform' });
  function drawTabs() {
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', k === tab);
    if (tab === 'content') drawContent(); else if (tab === 'design') drawDesign(); else drawCheck();
  }

  // ---------- form helpers ----------
  const field = (label, input, cls = '') => h('label', { class: 'field ' + cls }, h('span', { class: 'lbl' }, label), input);
  function txt(obj, key, { ph = '', area = false, rows = 3, onInput } = {}) {
    const a = { placeholder: ph, spellcheck: 'true', value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; onInput?.(); changed(); } };
    if (!area) return h('input', { type: 'text', ...a });
    const t = h('textarea', { ...a, rows });
    t.value = obj[key] || '';
    return t;
  }
  const grid = (...k) => h('div', { class: 'formgrid' }, ...k);

  // AI writing help (only when the browser has its own model).
  function aiBtn(label, run) {
    if (aiState === 'unavailable') return '';
    return h('button', { class: 'btn small ghost rsm-ai', type: 'button', title: 'Uses the AI built into your browser. Nothing is uploaded.', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; const old = b.textContent; b.textContent = 'Thinking…';
      try { await run(); } catch (err) { console.error(err); toast('The browser\'s AI could not help this time.'); }
      finally { b.disabled = false; b.textContent = old; }
    } }, h('span', { html: icon('ai') }), label);
  }
  async function ask(system, prompt) {
    const { builtinAI } = await import('../../lib/ai.js');
    const s = await builtinAI(system, { allowDownload: true, onStatus: (m) => toast(m) });
    if (!s) throw new Error('no model');
    try { return (await s.prompt(prompt)).trim(); } finally { s.destroy?.(); }
  }
  async function offer(title, text) {
    const ta = h('textarea', { rows: 8, style: { width: '100%' } });
    ta.value = text;
    return modal(title, h('div', { class: 'docform' }, h('p', { class: 'hint' }, 'Check it and change anything that is not true before using it.'), ta),
      [{ label: 'Cancel', value: null }, { label: 'Use this', primary: true, value: () => ta.value }]);
  }
  const resumeAsText = () => [R.basics.title, ...R.sections.filter((s) => !s.hidden).map((s) => s.title + ': ' + (s.kind === 'entries' ? s.items.map((e) => [e.title, e.subtitle, e.bullets].join(' ')).join('; ') : s.text))].join('\n').slice(0, 5000);

  // ---------- Content tab ----------
  function basicsCard() {
    const b = R.basics;
    const ph = h('div', { class: 'rsm-photo' });
    const drawPhoto = () => ph.replaceChildren(
      b.photo ? h('img', { src: b.photo, alt: 'Your photo' }) : h('div', { class: 'rsm-nophoto', html: icon('camera') }),
      h('div', {},
        h('button', { class: 'btn small', type: 'button', onclick: async () => { const f = (await pickFiles('image/*', false))[0]; if (f) { b.photo = await photoDataUrl(f); drawPhoto(); changed(); } } }, b.photo ? 'Change photo' : 'Add photo'),
        b.photo ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { b.photo = null; drawPhoto(); changed(); } }, 'Remove') : null,
        h('div', { class: 'hint' }, R.design.photo === 'none' || templateOf(R.design.template).plain ? 'This design does not show a photo.' : 'Optional. Many Indian employers expect one; many abroad do not.')));
    drawPhoto();
    return h('section', { class: 'rsec rsm-basics' },
      h('div', { class: 'rsec-head' }, h('strong', {}, 'Your details')),
      h('div', { class: 'rsec-body' },
        grid(field('Full name', txt(b, 'name', { ph: 'e.g. Priya Sharma', onInput: () => { if (/^(My resume|Resume \d+|Imported.*)$/.test(R.name) && b.name) { R.name = b.name; drawPick(); } } })),
          field('Headline / job title', txt(b, 'title', { ph: 'e.g. Software Engineer' }))),
        grid(field('Email', txt(b, 'email')), field('Phone', txt(b, 'phone')), field('City', txt(b, 'location', { ph: 'e.g. Hyderabad, India' }))),
        field('Links (one per line)', txt(b, 'links', { area: true, rows: 2, ph: 'linkedin.com/in/…\ngithub.com/…' })),
        ph));
  }

  function entryCard(sec, e) {
    const open = !!e._open || (!e.title && !e.subtitle);
    const sum = h('div', { class: 'rent-sum' },
      h('span', { class: 'rgrip', title: 'Drag to move', html: icon('grip') }),
      h('button', { type: 'button', class: 'rent-title', onclick: () => { e._open = !open; drawContent(); } },
        h('strong', {}, e.title || e.subtitle || '(new entry)'),
        h('span', {}, [e.title && e.subtitle, [e.from, e.to].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))),
      ib('dup', 'Duplicate', () => { const i = sec.items.indexOf(e); sec.items.splice(i + 1, 0, newEntry({ ...e, id: uid(), _open: true })); changed(true); }),
      ib('trash', 'Remove', () => { sec.items.splice(sec.items.indexOf(e), 1); changed(true); }));
    const card = h('div', { class: 'rent' + (open ? ' open' : ''), 'data-id': e.id }, sum);
    if (open) {
      const fs = fieldsOf(sec);
      const lab = Object.fromEntries(fs);
      const has = (k) => k in lab;
      const bullets = has('bullets') ? txt(e, 'bullets', { area: true, rows: 4, ph: 'Built …\nImproved … by 30%' }) : null;
      card.append(h('div', { class: 'rent-body' },
        grid(field(lab.title, txt(e, 'title')), has('subtitle') ? field(lab.subtitle, txt(e, 'subtitle')) : null),
        grid(has('place') ? field(lab.place, txt(e, 'place')) : null, field('From', txt(e, 'from', { ph: 'Jan 2023' })), field('To', txt(e, 'to', { ph: 'Present' }))),
        has('link') || has('note') ? grid(has('link') ? field(lab.link, txt(e, 'link')) : null, has('note') ? field(lab.note, txt(e, 'note')) : null) : null,
        bullets ? field(lab.bullets, bullets) : null,
        bullets ? aiBtn('Improve these points', async () => {
          if (!e.bullets.trim()) { toast('Write a few points first.'); return; }
          const out = await ask('You improve resume bullet points. Start each with a strong action verb, keep them short (under 25 words), keep every fact and number, never invent results. Reply with one point per line and nothing else.',
            `Role: ${e.title} at ${e.subtitle}\nPoints:\n${e.bullets}`);
          const v = await offer('Improved points', splitLines(out).join('\n'));
          if (v != null) { e.bullets = v; bullets.value = v; changed(); }
        }) : null));
    }
    return card;
  }

  function sectionCard(sec, i) {
    const t = SECTION_TYPES[sec.type] || SECTION_TYPES.custom;
    const T = templateOf(R.design.template);
    const two = T.layout !== 'single';
    const title = h('input', { type: 'text', class: 'rsec-title', value: sec.title, 'aria-label': 'Section title', oninput: (e) => { sec.title = e.target.value; changed(); } });
    const move = (d) => { const j = i + d; if (j < 0 || j >= R.sections.length) return; R.sections.splice(j, 0, R.sections.splice(i, 1)[0]); changed(true); };
    const head = h('div', { class: 'rsec-head' },
      h('span', { class: 'rgrip', title: 'Drag to move', html: icon('grip') }),
      ib(sec._closed ? 'right' : 'down', sec._closed ? 'Open' : 'Fold', () => { sec._closed = !sec._closed; drawContent(); }, 'rfold'),
      title,
      two ? h('select', { class: 'rsec-col', title: 'Which column', onchange: (e) => { sec.column = e.target.value; changed(); } },
        [['auto', SIDE_TYPES.has(sec.type) ? 'Side (auto)' : 'Main (auto)'], ['main', 'Main column'], ['side', 'Side column']].map(([v, l]) => h('option', { value: v, selected: sec.column === v }, l))) : null,
      ib('up', 'Move up', () => move(-1)), ib('down', 'Move down', () => move(1)),
      ib(sec.hidden ? 'eyeoff' : 'eye', sec.hidden ? 'Hidden: click to show' : 'Hide from the resume', () => { sec.hidden = !sec.hidden; changed(true); }, sec.hidden ? 'active' : ''),
      ib('trash', 'Delete section', async () => {
        const empty = sec.kind === 'entries' ? !sec.items.some((e) => e.title || e.bullets) : !sec.text.trim();
        if (!empty && !(await modal('Delete this section?', h('p', {}, `“${sec.title}” and everything in it will be removed. (Undo can bring it back.)`), [{ label: 'Cancel', value: false }, { label: 'Delete', primary: true, value: true }]))) return;
        R.sections.splice(i, 1); changed(true);
      }));
    const card = h('section', { class: 'rsec' + (sec.hidden ? ' hidden' : '') + (sec._closed ? ' closed' : ''), 'data-id': sec.id }, head);
    if (sec._closed) return card;
    const body = h('div', { class: 'rsec-body' });
    if (sec.kind === 'entries') {
      const list = h('div', { class: 'rents' }, ...sec.items.map((e) => entryCard(sec, e)));
      sortable(list, '.rgrip', (ids) => { sec.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); changed(true); });
      body.append(list, h('button', { class: 'btn small', type: 'button', onclick: () => { sec.items.push(newEntry({ _open: true })); changed(true); } }, '+ Add ' + ({ experience: 'job', internships: 'internship', education: 'education', projects: 'project' }[sec.type] || 'entry')));
    } else {
      const area = txt(sec, 'text', { area: true, rows: sec.kind === 'text' ? 4 : 3, ph: t.ph || (sec.kind === 'tags' ? 'Separate with commas' : sec.kind === 'list' ? 'One item per line' : '') });
      body.append(area);
      if (sec.kind === 'tags') body.append(h('div', { class: 'hint' }, 'Separate with commas.'));
      if (sec.kind === 'list') body.append(h('div', { class: 'hint' }, sec.type === 'personal' ? 'One per line, like “Date of birth: 12 March 2001”.' : 'One item per line.'));
      if (sec.type === 'summary') body.append(aiBtn(sec.text.trim() ? 'Improve my summary' : 'Write a summary for me', async () => {
        const out = await ask('You write resume summaries: 2 to 4 sentences, confident and specific, no "I", no clichés, no invented facts.',
          (sec.text.trim() ? 'Improve this summary:\n' + sec.text + '\n\nResume:\n' : 'Write a summary for this resume:\n') + resumeAsText());
        const v = await offer('Summary', out.replace(/^["']|["']$/g, ''));
        if (v != null) { sec.text = v; area.value = v; changed(); }
      }));
      if (sec.type === 'skills') body.append(aiBtn('Suggest skills', async () => {
        const out = await ask('You suggest skills for a resume. Reply with a comma-separated list of 8 to 12 skills only.', 'Suggest skills that fit this resume and are not already listed:\n' + resumeAsText());
        const v = await offer('Suggested skills (add the ones you really have)', [sec.text.trim(), out].filter(Boolean).join(', '));
        if (v != null) { sec.text = v; area.value = v; changed(); }
      }));
    }
    card.append(body);
    return card;
  }

  function addSectionMenu() {
    const have = new Set(R.sections.map((s) => s.type));
    const sel = h('select', { class: 'rsm-add', 'aria-label': 'Add a section', onchange: (e) => {
      const v = e.target.value;
      if (!v) return;
      if (v.startsWith('custom:')) R.sections.push(newSection('custom', { kind: v.slice(7), title: 'New section', items: v.slice(7) === 'entries' ? [newEntry()] : [] }));
      else R.sections.push(newSection(v));
      changed(true);
      setTimeout(() => el.querySelector('.rsec:last-of-type .rsec-title')?.focus(), 50);
    } },
    h('option', { value: '' }, '+ Add a section…'),
    h('optgroup', { label: 'Sections' }, Object.entries(SECTION_TYPES).filter(([k]) => k !== 'custom' && !have.has(k)).map(([k, t]) => h('option', { value: k }, t.title))),
    h('optgroup', { label: 'Your own section' }, Object.entries(KIND_NAMES).map(([k, l]) => h('option', { value: 'custom:' + k }, 'Custom – ' + l))));
    return sel;
  }

  function drawContent() {
    if (tab !== 'content') return;
    const y = window.scrollY;
    const list = h('div', { class: 'rsecs' }, ...R.sections.map((s, i) => sectionCard(s, i)));
    sortable(list, '.rsec-head > .rgrip', (ids) => { R.sections.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); changed(true); });
    pane.replaceChildren(basicsCard(), h('p', { class: 'hint rsm-tip' }, 'Drag ', h('span', { class: 'rgrip inline', html: icon('grip') }), ' to reorder sections and entries. Click a title to rename it.'), list, addSectionMenu());
    window.scrollTo(0, y);
  }

  // ---------- Design tab ----------
  function drawDesign() {
    if (tab !== 'design') return;
    const d = R.design;
    const set = (k, v, redraw = false) => { d[k] = v; changed(); if (redraw) drawDesign(); };
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', class: d[key] === v ? 'on' : '', onclick: () => set(key, v, true) }, l)));
    const gal = h('div', { class: 'rsm-gallery' }, TEMPLATES.map((t) => {
      const img = h('img', { alt: '', loading: 'lazy' });
      templateThumb(t.id, d.font).then((u) => { img.src = u; }).catch(() => {});
      return h('button', { type: 'button', class: 'rsm-tpl' + (d.template === t.id ? ' on' : ''), title: t.name, onclick: () => {
        R.design = applyTemplate(d, t.id); R.design.fit = d.fit; R.design.paper = d.paper; R.design.margin = d.margin;
        // Keep 'No photo' if the visitor chose it (not when it only came from the ATS design).
        if (d.photo === 'none' && !templateOf(d.template).photo && !t.photo) R.design.photo = 'none';
        changed(); drawDesign();
      } }, h('div', { class: 'rsm-thumb' }, img), h('span', {}, t.name));
    }));
    const fontSel = (key, first) => h('select', { onchange: (e) => set(key, e.target.value, true) },
      first ? h('option', { value: '' }, first) : null, RFONTS.map((f) => h('option', { value: f, selected: d[key] === f }, f)));
    const rng = (key, min, max, step, fmt) => {
      const out = h('span', { class: 'status' }, fmt(d[key]));
      return h('div', { class: 'rsm-range' }, h('input', { type: 'range', min, max, step, value: d[key], oninput: (e) => { d[key] = +e.target.value; out.textContent = fmt(d[key]); changed(); } }), out);
    };
    pane.replaceChildren(
      h('h3', { class: 'rsm-h' }, 'Template'), gal,
      h('h3', { class: 'rsm-h' }, 'Colour'),
      h('div', { class: 'rsm-swatches' }, ACCENTS.map((c) => h('button', { type: 'button', class: 'rsm-sw' + (d.accent.toLowerCase() === c ? ' on' : ''), style: { background: c }, title: c, 'aria-label': 'Colour ' + c, onclick: () => set('accent', c, true) })),
        h('label', { class: 'rsm-sw custom', title: 'Any colour' }, h('input', { type: 'color', value: d.accent, oninput: (e) => { d.accent = e.target.value; changed(); } }))),
      h('h3', { class: 'rsm-h' }, 'Fonts'),
      grid(field('Text', fontSel('font')), field('Name and headings', fontSel('headFont', 'Same as text'))),
      grid(field('Text size', rng('size', 8.5, 12, 0.1, (v) => (+v).toFixed(1) + ' pt')), field('Line spacing', rng('spacing', 0.75, 1.4, 0.05, (v) => Math.round(v * 100) + '%'))),
      field('Margins', seg('margin', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']])),
      field('Paper', seg('paper', [['a4', 'A4'], ['letter', 'US Letter']])),
      field('Photo', seg('photo', [['circle', 'Round'], ['rounded', 'Rounded'], ['square', 'Square'], ['none', 'No photo']])),
      h('label', { class: 'check rsm-fit' }, h('input', { type: 'checkbox', checked: !!d.fit, onchange: (e) => set('fit', e.target.checked) }), ' Fit to one page (makes text and spacing a little smaller when needed)'));
  }

  // ---------- Check tab ----------
  let jd = '';
  async function drawCheck() {
    if (tab !== 'check') return;
    const { checkResume, jobMatch } = await import('./check.js');
    if (tab !== 'check') return;
    const { score, items } = checkResume(R, lastPages);
    const ring = h('div', { class: 'rsm-score', style: { '--p': score, '--c': score >= 80 ? 'var(--ok)' : score >= 60 ? '#c2861a' : 'var(--danger)' } }, h('b', {}, score), h('span', {}, '/100'));
    const order = { bad: 0, warn: 1, tip: 2, good: 3 };
    const jdBox = h('textarea', { rows: 5, placeholder: 'Paste the job description here to see which of its keywords your resume is missing.', spellcheck: 'false' });
    jdBox.value = jd;
    const jdOut = h('div', { class: 'rsm-jd' });
    const runJd = () => {
      jd = jdBox.value;
      if (jd.trim().length < 40) { jdOut.replaceChildren(); return; }
      const m = jobMatch(R, jd);
      jdOut.replaceChildren(...[
        h('p', {}, h('strong', {}, `Keyword match: ${m.score}%`), m.score < 60 ? ' – add the missing words you really have to your skills and points.' : ' – good match.'),
        m.missing.length ? h('div', {}, h('div', { class: 'lbl' }, 'Missing'), h('div', { class: 'rsm-kw' }, m.missing.map((k) => h('span', { class: 'miss' }, k)))) : null,
        m.found.length ? h('div', {}, h('div', { class: 'lbl' }, 'Found'), h('div', { class: 'rsm-kw' }, m.found.map((k) => h('span', {}, k)))) : null].filter(Boolean));
    };
    jdBox.addEventListener('input', debounce(runJd, 300));
    runJd();
    pane.replaceChildren(
      h('div', { class: 'rsm-checkhead' }, ring, h('div', {}, h('h3', {}, score >= 85 ? 'Looking great' : score >= 65 ? 'Good, with a few things to fix' : 'Needs some work'), h('p', { class: 'hint' }, 'Checked on this device against common recruiter and ATS advice.'))),
      h('ul', { class: 'rsm-issues' }, items.sort((a, b) => order[a.level] - order[b.level]).map((it) => h('li', { class: it.level }, h('span', { class: 'dot' }), h('div', {}, it.text, it.where ? h('div', { class: 'where' }, it.where) : null)))),
      h('h3', { class: 'rsm-h' }, 'Match a job'), jdBox, jdOut,
      h('h3', { class: 'rsm-h' }, 'AI writing help'),
      h('p', { class: 'hint' }, aiState === 'unavailable'
        ? 'Your browser has no built-in AI, so the writing buttons are hidden. In recent Chrome or Edge on a computer, “Improve these points” and “Write a summary” buttons appear in Content. Everything else works without AI.'
        : aiState === 'available' ? 'Your browser\'s built-in AI is ready. Look for the ✦ buttons in Content (summary, points and skills). It runs on this device; nothing is uploaded.'
          : 'Your browser can download its built-in AI model once (free, runs on this device). Use the ✦ buttons in Content to start.'),
      h('h3', { class: 'rsm-h' }, 'Spelling'),
      h('p', { class: 'hint' }, 'Words your browser does not know are underlined in red as you type; right-click one for suggestions. Common resume misspellings are also listed above.'));
  }

  // ---------- import and match ----------
  async function importFlow() {
    const f = (await pickFiles('.pdf,.docx,.txt,image/*,.heic,.webp', false))[0];
    if (!f) return;
    const isPic = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name);
    const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    if (/\.doc$/i.test(f.name)) { toast('Old .doc files cannot be read here. Save it as .docx or PDF first.'); return; }
    const status = h('p', { class: 'status' }, 'Starting…');
    const useAi = h('input', { type: 'checkbox', checked: false, disabled: aiState === 'unavailable' });
    const copyLook = h('input', { type: 'checkbox', checked: isPic || isPdf, disabled: !(isPic || isPdf) });
    const go = await modal('Import “' + f.name + '”', h('div', {},
      h('p', {}, 'Your resume is read on this device and opened as a new, editable resume. Your current resume is kept.'),
      h('label', { class: 'check' }, copyLook, ' Also copy its look (layout, colour, fonts, photo)'),
      h('label', { class: 'check' }, useAi, ' Use the browser\'s built-in AI to sort the text', aiState === 'unavailable' ? h('div', { class: 'hint' }, 'Not available in this browser; the built-in rules are used.') : null),
      status), [{ label: 'Cancel', value: false }, { label: 'Import', primary: true, value: true }]);
    if (!go) return;
    const wait = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, h('h3', {}, 'Reading your resume…'), status));
    document.body.append(wait);
    const say = (m) => { status.textContent = m; };
    try {
      const P = await import('./parse.js');
      const { lines } = await P.resumeLines(f, say);
      if (lines.filter((l) => l.text).length < 3) throw new Error(isPdf ? 'No text found. If it is a scan, import a photo of it instead.' : 'No text found.');
      let r = null;
      if (useAi.checked) r = await P.parseWithAI(lines, say);
      r ||= P.parseLines(lines);
      // Photo and design
      let canvas = null;
      if (isPic) canvas = (await readPicture(f)).frames[0].canvas;
      else if (isPdf && copyLook.checked) {
        const { readBytes } = await import('../../lib/core.js');
        const doc = await openPdfjs(await readBytes(f));
        canvas = await renderPage(await doc.getPage(1), 2);
      }
      if (canvas) {
        say('Looking for a photo…');
        try {
          const { findFaces } = await import('../imagestudio.js');
          const faces = await findFaces(canvas);
          const face = faces.sort((a, b) => b.w * b.h - a.w * a.h)[0];
          if (face && face.w > canvas.width * 0.05) r.basics.photo = P.cropFace(canvas, face);
        } catch { /* no face finder offline */ }
      }
      if (copyLook.checked && canvas) {
        const { matchDesign } = await import('./match.js');
        const m = await matchDesign(canvas, say);
        r.design = { ...applyTemplate(r.design, m.template), accent: m.accent, font: m.font, headFont: m.headFont, photo: r.basics.photo ? (m.photo === 'none' ? 'circle' : m.photo) : 'none' };
      }
      wait.remove();
      const n = r.sections.length;
      useResume(r, `Imported ${n} section${n === 1 ? '' : 's'}. Check each one: sorting text from a file is never perfect.`);
      tab = 'content'; drawTabs();
    } catch (e) { console.error(e); wait.remove(); toast('Could not import: ' + e.message, 4200); }
  }

  async function matchFlow() {
    const f = (await pickFiles('image/*,.pdf,.heic,.webp', false))[0];
    if (!f) return;
    const status = h('p', { class: 'status' }, 'Starting…');
    const wait = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, h('h3', {}, 'Looking at the design…'), status));
    document.body.append(wait);
    try {
      let src = f;
      if (/\.pdf$/i.test(f.name)) {
        const { readBytes } = await import('../../lib/core.js');
        const doc = await openPdfjs(await readBytes(f));
        src = await renderPage(await doc.getPage(1), 2);
      } else src = (await readPicture(f)).frames[0].canvas;
      const { matchDesign } = await import('./match.js');
      const m = await matchDesign(src, (s) => { status.textContent = s; });
      wait.remove();
      const t = templateOf(m.template);
      const pic = src.toDataURL('image/jpeg', 0.7);
      const choice = await modal('Closest design: ' + t.name, h('div', { class: 'rsm-match' },
        h('img', { src: pic, alt: 'Your picture' }),
        h('div', {},
          h('p', {}, 'Found ', m.notes.join(', '), '.'),
          h('p', {}, 'Your resume will use the ', h('strong', {}, t.name), ' template with ', h('span', { class: 'rsm-dot', style: { background: m.accent } }), ' this colour', m.font ? ` and ${m.font}` : '', '. You can fine-tune everything in Design.'),
          h('p', { class: 'hint' }, 'Want a pixel-perfect copy of that exact page instead? Use ',
            h('a', { href: '#/tool/image-to-editable', onclick: (e) => { e.preventDefault(); document.querySelector('.modal-bg')?.remove(); ctx.openTool('image-to-editable', [f]); } }, 'Image to editable'),
            ' (opens it as an editable PDF and Word file).'))),
      [{ label: 'Cancel', value: null }, { label: 'Also bring in its text', value: 'text' }, { label: 'Use this design', primary: true, value: 'design' }]);
      if (!choice) return;
      const design = { ...applyTemplate(R.design, m.template), accent: m.accent, font: m.font, headFont: m.headFont, fit: R.design.fit, paper: R.design.paper };
      if (m.photo !== 'none') design.photo = m.photo;
      if (choice === 'text') {
        const P = await import('./parse.js');
        const lines = m.textLines.map((l) => ({ text: l.text.trim(), size: l.size, bold: l.bold }));
        const r = P.parseLines(lines);
        r.design = design;
        useResume(r, 'Opened as a new resume with the text and design of the picture. Check each section.');
      } else { R.design = design; changed(); tab = 'design'; drawTabs(); toast('Design applied. Undo brings back the old one.'); }
    } catch (e) { console.error(e); wait.remove(); toast('Could not read the design: ' + e.message, 4200); }
  }

  // ---------- page ----------
  const viewBtns = h('div', { class: 'seg rsm-views' },
    h('button', { type: 'button', class: 'on', onclick: () => setView('edit') }, 'Edit'),
    h('button', { type: 'button', onclick: () => setView('preview') }, 'Preview'));
  const root = h('div', { class: 'rsm', 'data-autosave': '1' });
  function setView(v) {
    mobileView = v;
    root.dataset.view = v;
    [...viewBtns.children].forEach((b, i) => b.classList.toggle('on', (i === 0) === (v === 'edit')));
    if (v === 'preview') preview.now();
  }
  root.dataset.view = mobileView;
  root.append(bar, viewBtns,
    h('div', { class: 'rsm-body' },
      h('div', { class: 'rsm-edit panel' }, tabs, pane),
      h('div', { class: 'rsm-prev' }, h('div', { class: 'rsm-prevcard' }, prevInfo, prevPages))));
  el.replaceChildren(root);
  root.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if ((k === 'z' && !e.shiftKey) || k === 'y' || (k === 'z' && e.shiftKey)) {
      // Let text boxes keep their own undo while typing; ours takes over once the change is remembered.
      e.preventDefault();
      doUndo(k === 'y' || e.shiftKey);
    }
  });
  function drawAll() { drawPick(); drawTabs(); preview(); }
  updUndo();
  drawAll();
  // Saved straight away so an imported or migrated resume is kept.
  saveNow();
  addEventListener('resize', debounce(() => { if (document.body.contains(root)) preview(); }, 400));
}

export const tools = { 'resume-builder': { standalone: true, mount } };
