import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { h, dropzone, fileList, optionsForm, progressBox, resultView, toast } from './lib/ui.js';
import { icon } from './lib/icons.js';
import { TOOLS, CATEGORIES, CAT_COLOR, toolById, loadTool } from './tools/registry.js';

registerSW({ immediate: true });

const app = document.getElementById('app');
let handoff = null; // files passed from one tool's result to the next tool
let installPrompt = null;
let filter = 'all';
let query = '';

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; renderInstall(); });

// Desktop PWA: "Open with EditSupreme" from the OS file manager.
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((fh) => fh.getFile()));
    handoff = files;
    location.hash = '#/tool/edit';
  });
}

// Four easy groups so people can find a tool: PDF, image, editing & design, AI.
const PDF_CATS = ['organize', 'optimize', 'convert', 'edit', 'security', 'intel', 'workflows'];
const AI_POWERED = ['remove-background', 'upscale-image', 'blur-face', 'ocr', 'translate', 'summarize', 'font-finder', 'image-hd', 'screenshot-to-template', 'image-to-layers', 'image-to-editable'];
const EDITING = ['edit', 'photo-editor', 'edit-images', 'sign', 'meme-generator', 'crop-image', 'redact', 'forms'];
const GROUPS = [
  { id: 'pdf', name: 'PDF tools', icon: 'page', color: 'var(--c-convert)', blurb: 'Merge, split, compress, convert, protect', has: (t) => PDF_CATS.includes(t.cat) && !t.server },
  { id: 'image', name: 'Image tools', icon: 'image', color: 'var(--c-image)', blurb: 'Compress, resize, crop, convert, remove background', has: (t) => t.cat === 'image' },
  { id: 'design', name: 'Edit & Design', icon: 'pen', color: 'var(--c-design)', blurb: 'Edit PDFs and photos, design posts, creative apps', has: (t) => t.cat === 'design' || t.cat === 'photo' || EDITING.includes(t.id) },
  { id: 'ai', name: 'AI tools', icon: 'ai', color: 'var(--c-ai)', blurb: 'AI assistant, passport photos, speech to text, chat with PDF', has: (t) => t.cat === 'ai' || AI_POWERED.includes(t.id) }
];
const groupTools = (g) => TOOLS.filter(g.has);
const catName = (id) => (CATEGORIES.find((c) => c[0] === id) || [id, id])[1];

/** The list of tools inside a menu: PDF tools are shown in columns by kind, the others as one list. */
function menuList(g, onPick) {
  const link = (t) => h('a', { href: '#/tool/' + t.id, onclick: onPick, style: { '--tc': CAT_COLOR[t.cat] } }, h('span', { class: 'mi', html: icon(t.icon) }), t.name);
  if (g.id === 'pdf') return h('div', { class: 'megacols' }, PDF_CATS.map((c) => {
    const ts = TOOLS.filter((t) => t.cat === c && !t.server);
    return ts.length ? h('div', { class: 'megacol' }, h('div', { class: 'megah' }, catName(c)), ts.map(link)) : null;
  }));
  return h('div', { class: 'megalist' }, groupTools(g).map(link));
}

// ---------- light / dark ----------
const THEME_KEY = 'editsupreme.theme';
function savedTheme() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0f1526' : '#14213d');
  const b = document.getElementById('themebtn');
  if (b) {
    b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
    b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', b.title);
  }
}
// Follow the system setting until the visitor picks a mode themselves.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light'); });

function themeButton() {
  const b = h('button', { class: 'iconbtn themebtn', id: 'themebtn', type: 'button', onclick: () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
    applyTheme(t);
  } });
  queueMicrotask(() => applyTheme(document.documentElement.dataset.theme || 'light'));
  return b;
}

function openMenu() {
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const bg = h('div', { class: 'drawer-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('nav', { class: 'drawer', 'aria-label': 'Menu' },
      h('div', { class: 'drawer-head' },
        h('img', { src: './logo.png', alt: 'EditSupreme', height: 40 }),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close menu', html: icon('x'), onclick: close })),
      h('a', { href: '#/tool/assistant', class: 'navhot', onclick: close }, 'AI Assistant'),
      GROUPS.map((g) => h('details', { class: 'drawgroup' }, h('summary', {}, h('span', { class: 'mi', style: { '--tc': g.color }, html: icon(g.icon) }), g.name, h('span', { class: 'cnt' }, groupTools(g).length)), menuList(g, close))),
      h('a', { href: '#/', onclick: close }, 'All tools')));
  document.addEventListener('keydown', esc);
  document.body.append(bg);
  bg.querySelector('a')?.focus();
}

function header() {
  const closeAll = () => nav.querySelectorAll('.navgroup.open').forEach((n) => n.classList.remove('open'));
  const nav = h('nav', { class: 'topnav' },
    GROUPS.map((g) => {
      const box = h('div', { class: 'navgroup' },
        h('button', { type: 'button', class: 'navbtn', 'aria-haspopup': 'true', onclick: (e) => { const was = box.classList.contains('open'); closeAll(); box.classList.toggle('open', !was); e.stopPropagation(); } }, g.name, h('span', { class: 'car', html: icon('down') })),
        h('div', { class: 'mega' + (g.id === 'pdf' ? ' wide' : '') }, h('div', { class: 'megatitle' }, g.name, h('a', { href: '#/', onclick: () => { filter = 'g:' + g.id; closeAll(); if (!/^#\/tool\//.test(location.hash)) route(); setTimeout(() => document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' }), 300); } }, 'See all ' + groupTools(g).length + ' →')), menuList(g, closeAll)));
      return box;
    }),
    h('a', { href: '#/tool/assistant', class: 'navhot' }, 'AI Assistant'),
    h('a', { href: '#/' }, 'All tools'));
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  return h('header', { class: 'topbar' },
    h('button', { class: 'iconbtn menubtn', type: 'button', 'aria-label': 'Open menu', html: icon('menu'), onclick: openMenu }),
    h('a', { class: 'brand', href: '#/', 'aria-label': 'EditSupreme home' }, h('img', { src: './logo.png', alt: 'EditSupreme', width: 116, height: 44 })),
    h('div', { class: 'spacer' }), nav, h('span', { id: 'installslot' }), themeButton());
}

function renderInstall() {
  const slot = document.getElementById('installslot');
  if (!slot) return;
  slot.replaceChildren();
  if (installPrompt) {
    slot.append(h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null; renderInstall();
    } }, h('span', { html: icon('install') }), 'Install app'));
  }
}

function toolCard(t) {
  return h('a', { class: 'card', href: '#/tool/' + t.id, style: { '--tc': CAT_COLOR[t.cat] } },
    t.server ? h('span', { class: 'tag' }, 'Server') : t.tag ? h('span', { class: 'tag plus' }, t.tag) : null,
    h('div', { class: 'ticon', html: icon(t.icon) }),
    h('h3', {}, t.name), h('p', {}, t.desc),
    h('span', { class: 'go', 'aria-hidden': 'true' }, 'Open →'));
}

function home() {
  const grid = h('div', { class: 'grid' });
  const inFilter = (t) => filter === 'all' || (filter.startsWith('g:') ? GROUPS.find((g) => 'g:' + g.id === filter)?.has(t) : t.cat === filter);
  const draw = () => {
    const q = query.toLowerCase();
    drawChips();
    grid.replaceChildren(...TOOLS
      .filter((t) => !q || inFilter(t))
      .filter((t) => q || inFilter(t))
      .filter((t) => !q || (t.name + ' ' + t.desc).toLowerCase().includes(q))
      .map(toolCard));
    if (!grid.children.length) grid.append(h('p', { class: 'status' }, 'No tools match that search.'));
  };
  // Row 1: All + the four groups. Row 2 (PDF only): the kinds of PDF tool.
  const chips = h('div', { class: 'filters' });
  const sub = h('div', { class: 'filters sub' });
  const chip = (id, label, on) => h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: () => { filter = id; draw(); } }, label);
  function drawChips() {
    const inPdf = filter === 'g:pdf' || PDF_CATS.includes(filter);
    chips.replaceChildren(chip('all', 'All tools', filter === 'all'), ...GROUPS.map((g) => chip('g:' + g.id, g.name, filter === 'g:' + g.id || (g.id === 'pdf' && inPdf))));
    sub.replaceChildren(...(inPdf ? [chip('g:pdf', 'All PDF tools', filter === 'g:pdf'), ...PDF_CATS.map((c) => chip(c, catName(c), filter === c))] : []));
    sub.hidden = !inPdf;
  }
  const finder = h('div', { class: 'finder' }, GROUPS.map((g) => h('button', { type: 'button', class: 'findtile', style: { '--tc': g.color }, onclick: () => { filter = 'g:' + g.id; query = ''; const s = document.querySelector('.search input'); if (s) s.value = ''; draw(); document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' }); } },
    h('span', { class: 'ticon', html: icon(g.icon) }), h('span', { class: 'ft' }, h('b', {}, g.name), h('span', {}, g.blurb)), h('span', { class: 'fc' }, groupTools(g).length + ' tools →'))));
  draw();
  const isStandalone = matchMedia('(display-mode: standalone)').matches;
  return h('main', {},
    h('section', { class: 'herowrap' },
      h('div', { class: 'heroart', 'aria-hidden': 'true' }, FLOATERS.map(([ic, cat], i) => h('span', { class: 'floater f' + i, style: { '--tc': CAT_COLOR[cat] }, html: icon(ic) }))),
      h('div', { class: 'wrap hero' },
      h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Free · No sign-up · Private'),
      h('h1', {}, 'Every PDF, Image & Design Tool You Need, ', h('span', { class: 'grad' }, 'Right in Your Browser')),
      h('p', {}, `${TOOLS.filter((t) => !t.server).length} free tools for PDFs, pictures, design and AI, on your phone, tablet or computer. Your files are processed on your own device and never uploaded.`),
      h('div', { class: 'cta' },
        h('a', { class: 'btn primary big', href: '#tools', onclick: (e) => { e.preventDefault(); document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Browse all tools'),
        h('a', { class: 'btn big glass', href: '#/tool/design-studio' }, h('span', { html: icon('image') }), 'Open Design Studio')),
      h('div', { class: 'badges' },
        h('span', { class: 'pill', html: icon('shield') + ' Private: files stay on your device' }),
        h('span', { class: 'pill', html: icon('offline') + ' Works offline' }),
        h('span', { class: 'pill', html: icon('devices') + ' Phone, tablet & desktop' })),
      h('div', { class: 'search' }, h('span', { class: 'sicon', html: icon('search') }), h('input', { type: 'search', placeholder: 'Search tools, e.g. compress, sign, resize…', value: query, 'aria-label': 'Search tools', oninput: (e) => { query = e.target.value; draw(); } })),
      h('div', { class: 'stats' },
        stat(String(TOOLS.filter((t) => !t.server).length), 'tools'),
        stat('0', 'files uploaded'),
        stat('100%', 'free'),
        stat('Offline', 'after first visit')))),
    h('section', { class: 'wrap findwrap' }, h('h2', {}, 'What do you want to work on?'), finder),
    h('section', { class: 'wrap', id: 'tools' }, chips, sub, grid),
    h('section', { class: 'wrap section' },
      h('h2', {}, 'Work your way'),
      h('div', { class: 'features' },
        feature('install', 'Install it like an app', isStandalone ? 'You are using the installed app.' : 'Use "Install app" (desktop Chrome/Edge), "Add to Home Screen" (iPhone/iPad Safari) or the browser menu on Android. Open PDFs straight from your file manager.'),
        feature('offline', 'Offline-ready', 'After the first visit everything keeps working without internet. OCR languages are downloaded once, then cached.'),
        feature('shield', 'Nothing is uploaded', 'Processing happens in your browser. No accounts, no file limits, no waiting in a queue.'),
        feature('workflow', 'Chain tools together', 'Send a result straight into another tool, or save a reusable workflow that runs several steps at once.'))),
    h('section', { class: 'wrap' },
      h('div', { class: 'ctaband' },
        h('div', {}, h('h2', {}, 'Your files never leave your device'), h('p', {}, 'No uploads, no accounts, no watermarks. Install EditSupreme and use it like any other app, even offline.')),
        h('a', { class: 'btn big light', href: '#/tool/edit' }, 'Start editing a PDF'))),
    footer());
}

const FLOATERS = [['merge', 'organize'], ['sign', 'edit'], ['image', 'image'], ['compress', 'optimize'], ['lock', 'security'], ['word', 'convert']];
const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, label));

function footer() {
  const col = (title, ids) => h('div', { class: 'fcol' }, h('h4', {}, title),
    ids.map((id) => toolById(id)).filter(Boolean).map((t) => h('a', { href: '#/tool/' + t.id }, t.name)));
  return h('footer', { class: 'footer' },
    h('div', { class: 'wrap fgrid' },
      h('div', { class: 'fcol fbrand' }, h('img', { src: './logo.png', alt: 'EditSupreme', height: 44 }),
        h('p', {}, 'Your complete PDF editing solution. Everything runs in your browser, so your files stay private.')),
      col('PDF tools', ['merge', 'split', 'compress', 'edit', 'sign', 'ocr']),
      col('Image tools', ['compress-image', 'resize-image', 'remove-background', 'crop-image', 'convert-to-jpg']),
      col('Create', ['design-studio', 'photo-studio', 'creative-apps', 'workflow'])),
    h('div', { class: 'fbottom' }, `© ${new Date().getFullYear()} EditSupreme · Runs on your device`));
}

const FEATURE_COLORS = { install: 'var(--c-convert)', offline: 'var(--c-optimize)', shield: 'var(--accent)', workflow: 'var(--c-flow)' };
const feature = (ic, title, text) => h('div', { class: 'feature', style: { '--tc': FEATURE_COLORS[ic] || 'var(--accent)' } }, h('div', { class: 'ticon', html: icon(ic) }), h('h3', {}, title), h('p', {}, text));

async function toolPage(id) {
  const meta = toolById(id);
  if (!meta) { location.hash = '#/'; return h('div'); }
  document.title = `${meta.name} – EditSupreme`;
  const main = h('main', { class: 'wrap' });
  main.append(h('a', { class: 'back', href: '#/', html: icon('left') + ' All tools' }),
    h('div', { class: 'toolhead', style: { '--tc': CAT_COLOR[meta.cat] } }, h('div', { class: 'ticon lg', html: icon(meta.icon) }),
      h('div', {}, h('h1', {}, meta.name), h('p', {}, meta.desc))));
  const body = h('div');
  main.append(body);
  body.append(h('p', { class: 'status' }, 'Loading tool…'));
  let impl;
  try { impl = await loadTool(meta); } catch (e) { body.replaceChildren(h('p', { class: 'error' }, 'Could not load this tool. ' + e.message)); return main; }

  const ctxBase = { meta, toast, openTool: (tid, files) => { keepPage(); handoff = files; go('#/tool/' + tid); } };
  // The page has work on it once the visitor has done something past the "choose a file" screen.
  let touched = false, downloaded = false;
  for (const ev of ['pointerdown', 'keydown', 'drop', 'input']) body.addEventListener(ev, () => { touched = true; }, true);
  body.addEventListener('click', (e) => { if (/download|share/i.test(e.target.closest('button')?.textContent || '')) downloaded = true; }, true);
  leaveGuard = () => {
    if (!touched || !document.body.contains(body)) return false;
    const first = body.firstElementChild;
    if (!first || first.classList.contains('drop')) return false;
    if (first.classList.contains('result')) return !downloaded;
    return true;
  };
  const NON_PDF_INPUT = ['creative-apps', 'vectorcraft', 'lightcraft', 'filmcraft', 'effectcraft', 'soundcraft', 'pdfcraft', 'photo-studio', 'font-finder', 'design-studio', 'image-hd', 'word-to-pdf', 'ppt-to-pdf', 'excel-to-pdf', 'html-to-pdf', 'jpg-to-pdf', 'scan', 'workflow', 'assistant', 'passport-photo', 'audio-to-text'];
  const imgTools = TOOLS.filter((t) => (t.cat === 'image' && t.id !== 'html-to-image' && t.id !== id) || t.id === 'jpg-to-pdf');
  const tools = TOOLS.filter((t) => !t.server && t.id !== id && !NON_PDF_INPUT.includes(t.id) && t.cat !== 'image');
  // The editing screen is kept (not thrown away) while the result shows, so "Back to editing" and the
  // browser's back button return to it exactly as it was.
  let editing = null;
  const pageHash = location.hash;
  const backToEditing = () => {
    if (!editing) return;
    body.replaceChildren(...editing.nodes);
    window.scrollTo(0, editing.y);
    editing = null;
  };
  window.addEventListener('popstate', (e) => {
    // Only for this page's own back step: going to another tool also fires popstate, with the new address.
    if (editing && document.body.contains(body) && location.hash === pageHash && !e.state?.esResult) backToEditing();
  });
  const finish = (outputs, note) => {
    downloaded = false;
    const nodes = [...body.childNodes];
    editing = nodes.length && !(nodes[0].classList?.contains('drop')) ? { nodes, y: window.scrollY } : null;
    if (editing) history.pushState({ ...(history.state || {}), esResult: true }, '', location.href);
    body.replaceChildren(resultView(outputs, {
      onBack: editing ? () => { if (history.state?.esResult) history.back(); else backToEditing(); } : null,
      note, tools, imgTools,
      onRestart: () => start([]),
      onChain: (tid, files) => { keepPage(); handoff = files; go('#/tool/' + tid); }
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function start(files) {
    body.replaceChildren();
    if (impl.server) { body.append(impl.render()); return; }
    if (impl.standalone) { impl.mount(body, { ...ctxBase, finish, files }); return; }
    if (!files.length && !impl.optionalFiles) {
      body.append(dropzone({ accept: impl.accept, multiple: impl.multiple, label: impl.label || 'Select files', capture: impl.capture, stock: impl.stock, onFiles: (f) => start(f) }),
        h('p', { class: 'privacy' }, 'Files are processed on this device and never uploaded.'));
      return;
    }
    if (impl.mount) { impl.mount(body, files, { ...ctxBase, finish, restart: () => start([]) }); return; }
    processLayout(files);
  }

  function processLayout(files) {
    const left = h('div', { class: 'panel' });
    const side = h('div', { class: 'panel sidepanel' });
    const layout = h('div', { class: 'layout' }, left, side);
    body.replaceChildren(layout);
    let form;
    const drawSide = () => {
      side.replaceChildren(h('h3', {}, meta.name + ' options'));
      if (impl.notice) side.append(h('div', { class: 'notice info' }, impl.notice));
      const schema = typeof impl.options === 'function' ? impl.options(files) : impl.options || [];
      const prev = form ? form.values() : {};
      form = optionsForm(schema, prev);
      side.append(form.el);
      const prog = progressBox();
      prog.el.classList.add('hidden');
      const err = h('div', { class: 'error' });
      const run = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
        err.textContent = '';
        const need = impl.minFiles || (impl.optionalFiles ? 0 : 1);
        if (files.length < need) { err.textContent = `Add at least ${need} file${need > 1 ? 's' : ''}.`; return; }
        run.disabled = true; prog.el.classList.remove('hidden'); prog.set(0.02, 'Working…');
        try {
          const res = await impl.process(files, form.values(), { ...ctxBase, progress: prog.set });
          const outputs = Array.isArray(res) ? res : res.outputs;
          run.disabled = false; prog.el.classList.add('hidden');
          finish(outputs, Array.isArray(res) ? null : res.note);
        } catch (e) {
          console.error(e);
          err.textContent = e.message || String(e);
          run.disabled = false; prog.el.classList.add('hidden');
        }
      } }, impl.runLabel || meta.name);
      side.append(run, prog.el, err);
    };
    if (files.length || !impl.optionalFiles) {
      left.append(fileList(files, { accept: impl.accept, multiple: impl.multiple, onChange: () => { if (!files.length && !impl.optionalFiles) start([]); else drawSide(); } }));
    } else {
      left.append(h('div', { class: 'notice info' }, impl.optionalHint || 'You can add files, or use the options on the right.'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { const { pickFiles } = await import('./lib/ui.js'); const f = await pickFiles(impl.accept, impl.multiple); if (f.length) start(f); } }, 'Choose file'));
    }
    drawSide();
  }

  const initial = handoff || [];
  handoff = null;
  start(initial);
  return main;
}

// Floating "Ask AI" button on every page except the assistant itself.
function aiFab() {
  return h('button', { type: 'button', class: 'aifab', title: 'AI Assistant: tell it what to do with your files', 'aria-label': 'Open the AI Assistant', onclick: openAssistant },
    h('span', { html: icon('mic') }), h('span', { class: 'lbl' }, 'Ask AI'));
}

// The assistant as a panel at the side. The page underneath (and any work on it) stays exactly as it was.
let aiDock = null;
function openAssistant() {
  if (aiDock) { aiDock.el.classList.add('open'); aiDock.api?.focus(); return; }
  const meta = toolById('assistant');
  const body = h('div', { class: 'aidock-body' }, h('p', { class: 'status' }, 'Loading the assistant…'));
  const close = () => el.classList.remove('open');
  const el = h('aside', { class: 'aidock open', 'aria-label': 'AI Assistant' },
    h('div', { class: 'aidock-head' }, h('div', { class: 'aibadge', html: icon('ai') }),
      h('div', { class: 't' }, h('strong', {}, 'AI Assistant'), h('span', { class: 'hint' }, 'Your page stays open behind this panel')),
      h('button', { class: 'iconbtn', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close the assistant', html: icon('x'), onclick: close })),
    body);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(el);
  aiDock = { el, close };
  loadTool(meta).then((impl) => {
    aiDock.api = impl.mount(body, { meta, toast, docked: true, files: [], openTool: (tid, files) => { keepPage(); handoff = files; location.hash = '#/tool/' + tid; } });
    aiDock.api?.focus();
  }).catch((e) => body.replaceChildren(h('p', { class: 'error' }, 'Could not load the assistant. ' + e.message)));
}

// Pages left by sending a result to another tool are kept, so going back shows them again with all their work.
const pageCache = new Map();
let pageSeq = 0;
function keepPage() {
  const main = app.querySelector('main');
  if (!main || !/^#\/tool\//.test(location.hash)) return;
  const id = 'p' + (++pageSeq);
  pageCache.set(id, { main, guard: leaveGuard, title: document.title });
  if (pageCache.size > 6) pageCache.delete(pageCache.keys().next().value);
  history.replaceState({ ...(history.state || {}), esPage: id }, '', location.href);
}

async function route() {
  const m = location.hash.match(/^#\/tool\/([\w-]+)/);
  app.replaceChildren(header());
  renderInstall();
  const kept = m && pageCache.get(history.state?.esPage);
  if (kept) {
    app.append(kept.main);
    if (m[1] !== 'assistant') app.append(aiFab());
    leaveGuard = kept.guard; document.title = kept.title;
    return;
  }
  if (m) {
    const page = await toolPage(m[1]);
    app.append(page);
    if (m[1] !== 'assistant') app.append(aiFab());
  } else {
    document.title = 'EditSupreme – Your Complete PDF Editing Solution';
    app.append(home(), aiFab());
  }
  window.scrollTo(0, 0);
}

// Leaving a page with work on it (link, back button, closing the tab) asks first.
let leaveGuard = null, allowNav = false, lastHash = location.hash;
function go(hash) { allowNav = true; location.hash = hash; }
window.addEventListener('beforeunload', (e) => { if (leaveGuard?.()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => {
  if (!allowNav && leaveGuard?.() && !confirm('Leave this page? Work you have not downloaded or saved here will be lost.')) {
    handoff = null;
    history.replaceState(null, '', location.href.split('#')[0] + (lastHash || '#/'));
    return;
  }
  allowNav = false; lastHash = location.hash; leaveGuard = null;
  if (aiDock && /^#\/tool\/assistant/.test(location.hash)) aiDock.close();
  route();
});
route();
