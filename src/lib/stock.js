// Free stock photos and icons.
// Photos: Pexels, Pixabay and Unsplash through the site's own keys (kept on the web server by api/stock.php),
// or a visitor's own free key (kept on their device); Wikimedia Commons and Openverse need no key.
// Icons: Iconify (200,000+ open-source icons, no key).
import { h, toast } from './ui.js';

const KEY_STORE = 'editsupreme.stockkeys';
export function stockKeys() { try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}'); } catch { return {}; } }
export function setStockKey(source, key) { const k = stockKeys(); if (key) k[source] = key.trim(); else delete k[source]; try { localStorage.setItem(KEY_STORE, JSON.stringify(k)); } catch { /* blocked */ } }

export const PHOTO_SOURCES = [
  { id: 'pexels', name: 'Pexels', needsKey: true, keyUrl: 'https://www.pexels.com/api/new/', terms: 'Photos provided by Pexels. Free to use; credit the photographer when you can.' },
  { id: 'pixabay', name: 'Pixabay', needsKey: true, keyUrl: 'https://pixabay.com/api/docs/', terms: 'Free to use under the Pixabay Content License.' },
  { id: 'unsplash', name: 'Unsplash', needsKey: true, keyUrl: 'https://unsplash.com/developers', terms: 'Free to use under the Unsplash License. Credit the photographer and Unsplash.' },
  { id: 'wikimedia', name: 'Wikimedia Commons', needsKey: false, terms: 'Each picture has its own free licence (often CC BY or CC BY-SA): check it and credit the author.' },
  { id: 'openverse', name: 'Openverse', needsKey: false, terms: 'Openly licensed pictures from many sites (Creative Commons): check each licence and credit the author.' }
];
export const ALL_SOURCE = { id: 'all', name: 'All free photo sites', needsKey: false, terms: 'Each photo shows its site and licence when you point at it. Credit the photographer when you can.' };

// Which key sites the web server can search for everyone (empty when api/stock.php isn't there, e.g. in development).
const API = './api/stock.php';
let serverP = null;
export function serverSources() {
  serverP ||= fetch(API + '?action=status', { cache: 'no-store' })
    .then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : { sources: [] }))
    .then((d) => new Set(Array.isArray(d.sources) ? d.sources : []))
    .catch(() => new Set());
  return serverP;
}
/** Sources that can be searched right now (no key needed, the visitor's key, or the server's key). */
export async function readySources() {
  const keys = stockKeys(), srv = await serverSources();
  return PHOTO_SOURCES.filter((s) => !s.needsKey || keys[s.id] || srv.has(s.id)).map((s) => s.id);
}
export async function sourceReady(id) { return id === 'all' || (await readySources()).includes(id); }

const strip = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const getJson = async (url, init) => {
  let r;
  try { r = await fetch(url, init); } catch { throw new Error('The photo service is not answering right now. Try again later.'); }
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).error; } catch { /* not json */ }
    if (typeof msg !== 'string') msg = '';
    const usesKey = !!init?.headers || /[?&]key=/.test(url);
    throw new Error(msg || (usesKey && (r.status === 401 || r.status === 403) ? 'The API key was not accepted.'
      : r.status >= 500 || r.status === 401 ? 'The photo service is not answering right now. Try again later.' : `The photo service answered ${r.status}.`));
  }
  return r.json();
};

/** Search photos. Returns [{id, thumb, full, w, h, credit, link, license, source, ping?, pingUrl?, viaServer?}]. */
export async function searchPhotos(source, q, page = 1) {
  if (source === 'all') {
    const ids = await readySources();
    const lists = await Promise.all(ids.map((id) => searchPhotos(id, q, page).catch(() => [])));
    // Interleave so every site is represented near the top.
    const out = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
    if (!out.length && !ids.length) throw new Error('No photo site is available right now.');
    return out;
  }
  const keys = stockKeys();
  const src = PHOTO_SOURCES.find((x) => x.id === source);
  if (src?.needsKey && !keys[source]) {
    if ((await serverSources()).has(source)) return (await getJson(`${API}?action=search&source=${source}&q=${encodeURIComponent(q)}&page=${page}`)).photos || [];
    throw new Error(`Add your free ${src.name} API key first, or choose "All free photo sites".`);
  }
  if (source === 'pexels') {
    const d = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=30&page=${page}`, { headers: { Authorization: keys.pexels } });
    return d.photos.map((p) => ({ id: 'px' + p.id, thumb: p.src.medium, full: p.src.large2x, w: p.width, h: p.height, credit: `Photo by ${p.photographer} on Pexels`, link: p.url, license: 'Pexels License', source }));
  }
  if (source === 'pixabay') {
    const d = await getJson(`https://pixabay.com/api/?key=${encodeURIComponent(keys.pixabay)}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&per_page=30&page=${page}`);
    return d.hits.map((p) => ({ id: 'pb' + p.id, thumb: p.webformatURL, full: p.largeImageURL, w: p.imageWidth, h: p.imageHeight, credit: `Image by ${p.user} on Pixabay`, link: p.pageURL, license: 'Pixabay Content License', source }));
  }
  if (source === 'unsplash') {
    const key = keys.unsplash;
    const d = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=30&page=${page}`, { headers: { Authorization: `Client-ID ${key}` } });
    return d.results.map((p) => ({ id: 'us' + p.id, thumb: p.urls.small, full: p.urls.regular, w: p.width, h: p.height, credit: `Photo by ${p.user.name} on Unsplash`, link: p.links.html, license: 'Unsplash License', source, ping: { url: p.links.download_location, headers: { Authorization: `Client-ID ${key}` } } }));
  }
  if (source === 'wikimedia') {
    const off = (page - 1) * 30;
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=30&gsroffset=${off}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter((p) => p.imageinfo?.[0]?.thumburl).map((p) => {
      const i = p.imageinfo[0], m = i.extmetadata || {};
      // Thumbnails can be requested at any width by changing the size in the URL.
      // Commons only makes thumbnails in standard widths (1280, 1920…); 1920 keeps big photos sharp but light.
      const full = i.width > 1920 ? i.thumburl.replace(/\/\d+px-/, '/1920px-').replace(/\?.*$/, '') : i.url;
      return { id: 'wm' + p.pageid, thumb: i.thumburl, full, w: i.width, h: i.height, credit: `${strip(m.Artist?.value) || 'Unknown author'} / Wikimedia Commons`, link: i.descriptionurl, license: strip(m.LicenseShortName?.value) || 'see source', source };
    });
  }
  if (source === 'openverse') {
    const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=30&page=${page}`);
    return d.results.map((p) => ({ id: 'ov' + p.id, thumb: p.thumbnail, full: `https://api.openverse.org/v1/images/${p.id}/thumb/?full_size=true`, w: p.width, h: p.height, credit: `${p.creator || 'Unknown author'} (${p.source})`, link: p.foreign_landing_url, license: `${(p.license || '').toUpperCase()} ${p.license_version || ''}`.trim(), source }));
  }
  throw new Error('Unknown photo source');
}

/** Download a photo as a Blob. */
export async function fetchPhotoBlob(p) {
  // Unsplash asks to be told when a photo is used.
  if (p.ping) fetch(p.ping.url, { headers: p.ping.headers }).catch(() => {});
  if (p.pingUrl) fetch(`${API}?action=ping&url=${encodeURIComponent(p.pingUrl)}`).catch(() => {});
  let r = await fetch(p.viaServer ? `${API}?action=img&url=${encodeURIComponent(p.full)}` : p.full).catch(() => null);
  // Pixabay doesn't allow downloads straight from its site: go through the server when it can.
  if ((!r || !r.ok) && p.source === 'pixabay' && !p.viaServer && (await serverSources()).has('pixabay')) r = await fetch(`${API}?action=img&url=${encodeURIComponent(p.full)}`).catch(() => null);
  if (!r || !r.ok) throw new Error('Could not download that picture.');
  return r.blob();
}

/** Download a photo for use in a design, as a data URL. */
export async function fetchPhoto(p) {
  const blob = await fetchPhotoBlob(p);
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}

/**
 * A window to search the free photo sites and pick one picture. Resolves to a File (or null).
 */
export function pickStockPhoto({ title = 'Free stock photos', suggestion = '' } = {}) {
  return new Promise((resolve) => {
    let source = 'all', page = 1, results = [], q = suggestion;
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', esc);
    const grid = h('div', { class: 'stockgrid big' });
    const msg = h('p', { class: 'status' }, 'Search millions of free photos from Pexels, Pixabay, Unsplash, Wikimedia Commons and Openverse.');
    const terms = h('p', { class: 'hint' });
    const more = h('button', { class: 'btn small hidden', type: 'button', onclick: () => go(true) }, 'More photos');
    const input = h('input', { class: 'inp', type: 'search', placeholder: 'Search, e.g. coffee, office, beach, birthday', value: q });
    const sel = h('select', { class: 'inp', style: { width: 'auto' }, onchange: () => { source = sel.value; if (input.value.trim()) go(false); } });
    (async () => {
      const ready = await readySources();
      sel.replaceChildren(h('option', { value: 'all' }, ALL_SOURCE.name), ...PHOTO_SOURCES.filter((s) => ready.includes(s.id)).map((s) => h('option', { value: s.id }, s.name)));
    })();
    async function go(add) {
      q = input.value.trim();
      if (!q) { input.focus(); return; }
      page = add ? page + 1 : 1;
      if (!add) { results = []; grid.replaceChildren(); }
      msg.textContent = 'Searching…'; more.classList.add('hidden');
      try {
        const r = await searchPhotos(source, q, page);
        results.push(...r);
        msg.textContent = results.length ? `${results.length} photos. Click one to use it.` : 'No photos found. Try other words.';
        for (const p of r) grid.append(h('button', { type: 'button', class: 'stockimg', title: `${p.credit} · ${p.license}`, onclick: (e) => choose(p, e.currentTarget) }, h('img', { src: p.thumb, alt: '', loading: 'lazy' })));
        more.classList.toggle('hidden', !r.length);
        terms.textContent = (source === 'all' ? ALL_SOURCE : PHOTO_SOURCES.find((s) => s.id === source)).terms;
      } catch (e) { msg.textContent = e.message; }
    }
    async function choose(p, btn) {
      btn.classList.add('busy');
      try {
        const blob = await fetchPhotoBlob(p);
        const ext = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : 'jpg';
        const name = `${q.replace(/[^\w-]+/g, '-').slice(0, 40) || 'photo'}-${p.source}.${ext}`;
        toast(`${p.credit} (${p.license}).`, 4500);
        close(new File([blob], name, { type: blob.type || 'image/jpeg' }));
      } catch (e) { btn.classList.remove('busy'); toast(e.message); }
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(false); });
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(null); } },
      h('div', { class: 'modal stockmodal', role: 'dialog', 'aria-label': title },
        h('h3', {}, title),
        h('div', { class: 'stockbar' }, input, sel, h('button', { class: 'btn primary', type: 'button', onclick: () => go(false) }, 'Search')),
        msg, grid, more, terms,
        h('div', { class: 'foot' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'))));
    document.body.append(bg);
    setTimeout(() => input.focus(), 30);
    if (q) go(false);
  });
}

// ---------- icons (Iconify) ----------
export const ICON_SETS = [
  ['', 'All sets'], ['mdi', 'Material Design'], ['material-symbols', 'Material Symbols'], ['tabler', 'Tabler'], ['lucide', 'Lucide'], ['ph', 'Phosphor'],
  ['solar', 'Solar'], ['fa6-solid', 'Font Awesome (solid)'], ['fa6-regular', 'Font Awesome (regular)'], ['fa6-brands', 'Brand logos (Font Awesome)'], ['ri', 'Remix'],
  ['bi', 'Bootstrap'], ['carbon', 'Carbon'], ['fluent', 'Fluent'], ['heroicons', 'Heroicons'], ['iconoir', 'Iconoir'], ['mingcute', 'MingCute'],
  ['streamline', 'Streamline'], ['logos', 'Tech logos (colour)'], ['flat-color-icons', 'Flat colour'], ['twemoji', 'Emoji (Twemoji)'], ['noto', 'Emoji (Noto)']
];
// Sets whose icons have their own colours (the colour option doesn't apply).
export const MULTICOLOR = new Set(['logos', 'flat-color-icons', 'twemoji', 'noto', 'fluent-emoji', 'emojione', 'openmoji']);

export async function searchIcons(q, prefix = '', limit = 96) {
  const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}${prefix ? '&prefix=' + prefix : ''}`);
  if (!r.ok) throw new Error('The icon library could not be reached.');
  return (await r.json()).icons || [];
}
export const iconPreviewUrl = (id) => `https://api.iconify.design/${id.replace(':', '/')}.svg?height=48`;
/** An icon as an SVG data URL, recoloured unless it is a multicolour icon. */
export async function iconifySrc(id, color) {
  const [prefix, name] = id.split(':');
  const url = `https://api.iconify.design/${prefix}/${name}.svg?width=512&height=512${MULTICOLOR.has(prefix) ? '' : '&color=' + encodeURIComponent(color)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not download that icon.');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await r.text());
}
