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

const NAV = () => [
  ...['merge', 'split', 'compress', 'edit', 'sign', 'ocr'].map((id) => ['#/tool/' + id, toolById(id).name.replace(' PDF', ''), '']),
  ['#/tool/design-studio', 'Design Studio', 'navhot'],
  ['#/tool/photo-studio', 'Photo Studio', 'navhot'],
  ['#/tool/creative-apps', 'Creative apps', 'navhot'],
  ['#/', 'All tools', '']];

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
      NAV().map(([href, label, cls]) => h('a', { href, class: cls, onclick: close }, label))));
  document.addEventListener('keydown', esc);
  document.body.append(bg);
  bg.querySelector('a')?.focus();
}

function header() {
  const nav = h('nav', { class: 'topnav' }, NAV().map(([href, label, cls]) => h('a', { href, class: cls || null }, label)));
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
  const draw = () => {
    const q = query.toLowerCase();
    grid.replaceChildren(...TOOLS
      .filter((t) => filter === 'all' || t.cat === filter)
      .filter((t) => !q || (t.name + ' ' + t.desc).toLowerCase().includes(q))
      .map(toolCard));
    if (!grid.children.length) grid.append(h('p', { class: 'status' }, 'No tools match that search.'));
  };
  const chips = h('div', { class: 'filters' }, CATEGORIES.map(([id, label]) =>
    h('button', { class: 'chip' + (filter === id ? ' on' : ''), type: 'button', onclick: (e) => {
      filter = id; [...chips.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); draw();
    } }, label)));
  draw();
  const isStandalone = matchMedia('(display-mode: standalone)').matches;
  return h('main', {},
    h('section', { class: 'herowrap' },
      h('div', { class: 'heroart', 'aria-hidden': 'true' }, FLOATERS.map(([ic, cat], i) => h('span', { class: 'floater f' + i, style: { '--tc': CAT_COLOR[cat] }, html: icon(ic) }))),
      h('div', { class: 'wrap hero' },
      h('span', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Free · No sign-up · Private'),
      h('h1', {}, 'Every PDF tool you need, ', h('span', { class: 'grad' }, 'on every device')),
      h('p', {}, `${TOOLS.filter((t) => !t.server).length} tools to merge, split, compress, convert, edit, sign, secure and understand PDFs, plus image tools and creative apps. Your files are processed on your own device and never uploaded.`),
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
    h('section', { class: 'wrap', id: 'tools' }, chips, grid),
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

  const ctxBase = { meta, toast };
  const NON_PDF_INPUT = ['creative-apps', 'vectorcraft', 'lightcraft', 'filmcraft', 'effectcraft', 'soundcraft', 'pdfcraft', 'photo-studio', 'font-finder', 'design-studio', 'image-hd', 'word-to-pdf', 'ppt-to-pdf', 'excel-to-pdf', 'html-to-pdf', 'jpg-to-pdf', 'scan', 'workflow'];
  const imgTools = TOOLS.filter((t) => (t.cat === 'image' && t.id !== 'html-to-image' && t.id !== id) || t.id === 'jpg-to-pdf');
  const tools = TOOLS.filter((t) => !t.server && t.id !== id && !NON_PDF_INPUT.includes(t.id) && t.cat !== 'image');
  const finish = (outputs, note) => {
    body.replaceChildren(resultView(outputs, {
      note, tools, imgTools,
      onRestart: () => start([]),
      onChain: (tid, files) => { handoff = files; location.hash = '#/tool/' + tid; }
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function start(files) {
    body.replaceChildren();
    if (impl.server) { body.append(impl.render()); return; }
    if (impl.standalone) { impl.mount(body, { ...ctxBase, finish }); return; }
    if (!files.length && !impl.optionalFiles) {
      body.append(dropzone({ accept: impl.accept, multiple: impl.multiple, label: impl.label || 'Select files', capture: impl.capture, onFiles: (f) => start(f) }),
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

async function route() {
  const m = location.hash.match(/^#\/tool\/([\w-]+)/);
  app.replaceChildren(header());
  renderInstall();
  if (m) {
    const page = await toolPage(m[1]);
    app.append(page);
  } else {
    document.title = 'EditSupreme – Your Complete PDF Editing Solution';
    app.append(home());
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
