// The open-source Craft apps by Storyteller (MIT / Apache-2.0), each served unmodified from this site's own
// folder (/photocraft/, /vectorcraft/ …, fetched by `npm run fetch-crafts`) and shown inside the page.
import { h } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

export const CRAFT_APPS = [
  { id: 'photo-studio', dir: 'photocraft', app: 'PhotoCraft', title: 'Photo Studio', icon: 'image', what: 'Photo editor: layers, masks, adjustment layers, filters, layer styles, type, vectors, brushes and PSD files.', how: 'Open a photo from the File menu, then Save or Export to download it.' },
  { id: 'vectorcraft', dir: 'vectorcraft', app: 'VectorCraft', title: 'VectorCraft', icon: 'pen', what: 'Vector art: logos, illustrations and icons with paths, shapes, gradients and type; SVG and more.', how: 'Start a new document or open an SVG/AI/EPS file, then Save or Export it.' },
  { id: 'lightcraft', dir: 'lightcraft', app: 'LightCraft', title: 'LightCraft', icon: 'filter', what: 'Non-destructive photo developing: RAW and JPG editing, exposure, colour, tone curves, presets and batch looks.', how: 'Import your photos, edit them, then Export.' },
  { id: 'filmcraft', dir: 'filmcraft', app: 'FilmCraft', title: 'FilmCraft', icon: 'scan', what: 'Video editor: a multi-track timeline for cutting, trimming, titles, transitions and audio.', how: 'Import your clips, edit on the timeline, then Export the video.' },
  { id: 'effectcraft', dir: 'effectcraft', app: 'EffectCraft', title: 'EffectCraft', icon: 'ai', what: 'Motion graphics and compositing: animated text, shapes, layers, keyframes and effects.', how: 'Create a composition, animate it, then render or export.' },
  { id: 'soundcraft', dir: 'soundcraft', app: 'SoundCraft', title: 'SoundCraft', icon: 'workflow', what: 'Audio workstation (DAW): record, arrange, mix and edit music, voice-overs and podcasts.', how: 'Add tracks or import audio, mix, then export your audio file.' },
  { id: 'pdfcraft', dir: 'pdfcraft', app: 'PdfCraft', title: 'PdfCraft', icon: 'page', what: 'PDF reader and editor: read, annotate, edit and search PDFs (with built-in text recognition).', how: 'Open a PDF from the File menu, then Save it.' }
];

function embed(el, a) {
  const url = `./${a.dir}/index.html`;
  const frame = h('iframe', { src: url, title: `${a.app}`, class: 'pcframe', allow: 'fullscreen; clipboard-read; clipboard-write; microphone; autoplay', allowfullscreen: true });
  const box = h('div', { class: 'pcbox' }, frame);
  el.replaceChildren(
    h('div', { class: 'pcbar' },
      h('span', { class: 'status' }, `${a.what} Everything runs on your device. ${a.how}`),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => (box.requestFullscreen ? box.requestFullscreen() : frame.requestFullscreen?.()) }, 'Full screen'),
        h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, h('span', { html: icon('right') }), 'Open in a new tab'))),
    box,
    h('p', { class: 'hint', style: { marginTop: '8px' } },
      `${a.title === a.app ? '' : a.title + ' is '}`, h('a', { href: `https://github.com/storytold/${a.dir}`, target: '_blank', rel: 'noopener' }, a.app),
      ', open-source software by Storyteller (ArtCraft), used under the MIT / Apache-2.0 licence (',
      h('a', { href: `./${a.dir}/LICENSE-APACHE`, target: '_blank', rel: 'noopener' }, 'licence'), ', ',
      h('a', { href: `./${a.dir}/NOTICE`, target: '_blank', rel: 'noopener' }, 'notice'),
      '). It is an early version and needs a current browser with WebGPU or WebGL2; it downloads once (it can be large), then works offline. Save your work before closing the page.'));
}

// Hub page listing all of them.
function hub(el) {
  el.replaceChildren(h('div', { class: 'studio' },
    h('p', { class: 'status', style: { marginTop: 0 } }, 'Full creative apps that run in your browser, for photos, vector art, video, motion graphics, audio and PDFs. Nothing is uploaded.'),
    h('div', { class: 'startrow' }, ...CRAFT_APPS.map((a) => h('a', { class: 'startcard', href: '#/tool/' + a.id, style: { textDecoration: 'none' } },
      h('div', { class: 'ticon', style: { '--tc': 'var(--c-photo)' }, html: icon(a.icon) }),
      h('div', {}, h('b', {}, a.title + (a.title === a.app ? '' : ` (${a.app})`)), h('span', {}, a.what)))))));
}

export const tools = {
  'creative-apps': { standalone: true, mount: (el) => hub(el) },
  ...Object.fromEntries(CRAFT_APPS.map((a) => [a.id, { standalone: true, mount: (el) => embed(el, a) }]))
};
