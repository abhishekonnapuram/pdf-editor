// Free stock photos and icons for Design Studio.
// Photos: Wikimedia Commons and Openverse need no key; Pexels, Pixabay and Unsplash need a free API key,
// which the user pastes once (kept on this device). Icons: Iconify (200,000+ open-source icons, no key).

const KEY_STORE = 'editsupreme.stockkeys';
export function stockKeys() { try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}'); } catch { return {}; } }
export function setStockKey(source, key) { const k = stockKeys(); if (key) k[source] = key.trim(); else delete k[source]; try { localStorage.setItem(KEY_STORE, JSON.stringify(k)); } catch { /* blocked */ } }

export const PHOTO_SOURCES = [
  { id: 'pexels', name: 'Pexels', needsKey: true, keyUrl: 'https://www.pexels.com/api/new/', terms: 'Free to use. Credit the photographer and Pexels when you can.' },
  { id: 'pixabay', name: 'Pixabay', needsKey: true, keyUrl: 'https://pixabay.com/api/docs/', terms: 'Free to use under the Pixabay Content License.' },
  { id: 'unsplash', name: 'Unsplash', needsKey: true, keyUrl: 'https://unsplash.com/developers', terms: 'Free to use under the Unsplash License. Credit the photographer and Unsplash.' },
  { id: 'wikimedia', name: 'Wikimedia Commons', needsKey: false, terms: 'Each picture has its own free licence (often CC BY or CC BY-SA): check it and credit the author.' },
  { id: 'openverse', name: 'Openverse', needsKey: false, terms: 'Openly licensed pictures from many sites (Creative Commons): check each licence and credit the author.' }
];

const strip = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Search photos. Returns [{id, thumb, full, w, h, credit, link, license, source, ping?}]. */
export async function searchPhotos(source, q, page = 1) {
  const keys = stockKeys();
  const need = (s) => { if (!keys[s]) throw new Error(`Add your free ${PHOTO_SOURCES.find((x) => x.id === s).name} API key first.`); return keys[s]; };
  const get = async (url, init) => { const r = await fetch(url, init); if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The API key was not accepted.' : `The photo service answered ${r.status}.`); return r.json(); };
  if (source === 'pexels') {
    const d = await get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=30&page=${page}`, { headers: { Authorization: need('pexels') } });
    return d.photos.map((p) => ({ id: 'px' + p.id, thumb: p.src.medium, full: p.src.large2x, w: p.width, h: p.height, credit: `Photo by ${p.photographer} on Pexels`, link: p.url, license: 'Pexels License', source }));
  }
  if (source === 'pixabay') {
    const d = await get(`https://pixabay.com/api/?key=${encodeURIComponent(need('pixabay'))}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&per_page=30&page=${page}`);
    return d.hits.map((p) => ({ id: 'pb' + p.id, thumb: p.webformatURL, full: p.largeImageURL, w: p.imageWidth, h: p.imageHeight, credit: `Image by ${p.user} on Pixabay`, link: p.pageURL, license: 'Pixabay Content License', source }));
  }
  if (source === 'unsplash') {
    const key = need('unsplash');
    const d = await get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=30&page=${page}`, { headers: { Authorization: `Client-ID ${key}` } });
    return d.results.map((p) => ({ id: 'us' + p.id, thumb: p.urls.small, full: p.urls.regular, w: p.width, h: p.height, credit: `Photo by ${p.user.name} on Unsplash`, link: p.links.html, license: 'Unsplash License', source, ping: { url: p.links.download_location, headers: { Authorization: `Client-ID ${key}` } } }));
  }
  if (source === 'wikimedia') {
    const off = (page - 1) * 30;
    const d = await get(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=30&gsroffset=${off}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter((p) => p.imageinfo?.[0]?.thumburl).map((p) => {
      const i = p.imageinfo[0], m = i.extmetadata || {};
      // Thumbnails can be requested at any width by changing the size in the URL.
      const full = i.width > 1600 ? i.thumburl.replace(/\/\d+px-/, '/1600px-') : i.url;
      return { id: 'wm' + p.pageid, thumb: i.thumburl, full, w: i.width, h: i.height, credit: `${strip(m.Artist?.value) || 'Unknown author'} / Wikimedia Commons`, link: i.descriptionurl, license: strip(m.LicenseShortName?.value) || 'see source', source };
    });
  }
  if (source === 'openverse') {
    const d = await get(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=30&page=${page}`);
    return d.results.map((p) => ({ id: 'ov' + p.id, thumb: p.thumbnail, full: `https://api.openverse.org/v1/images/${p.id}/thumb/?full_size=true`, w: p.width, h: p.height, credit: `${p.creator || 'Unknown author'} (${p.source})`, link: p.foreign_landing_url, license: `${(p.license || '').toUpperCase()} ${p.license_version || ''}`.trim(), source }));
  }
  throw new Error('Unknown photo source');
}

/** Download a photo for use in a design, as a data URL. */
export async function fetchPhoto(p) {
  if (p.ping) fetch(p.ping.url, { headers: p.ping.headers }).catch(() => {}); // Unsplash asks to be told when a photo is used.
  const r = await fetch(p.full);
  if (!r.ok) throw new Error('Could not download that picture.');
  const blob = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
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
