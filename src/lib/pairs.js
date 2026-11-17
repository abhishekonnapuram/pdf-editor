// Font pairs and colour palettes chosen by hand, shared by the Font pairing tool, the resume builder
// and the AI video ad maker. Every font is a free Google font (loaded on demand through lib/fonts.js).

// Design needs used to filter the pairs (and to pick pairs from a brief's tone).
export const NEEDS = [
  ['modern', 'Modern'], ['minimal', 'Minimal'], ['corporate', 'Corporate'], ['elegant', 'Elegant'], ['luxury', 'Luxury'],
  ['editorial', 'Editorial & blog'], ['bold', 'Bold ads & sales'], ['tech', 'Tech & startup'], ['playful', 'Playful'],
  ['kids', 'Kids & education'], ['food', 'Food & café'], ['fashion', 'Fashion & beauty'], ['wedding', 'Wedding & events'],
  ['fitness', 'Fitness & sports'], ['vintage', 'Vintage & retro'], ['realestate', 'Real estate'], ['health', 'Health & wellness'],
  ['indian', 'Indian (Hindi ready)'], ['resume', 'Resume & documents']
];

/**
 * head / body: Google families. hw: heading weight (bold = 700, regular = 400). up: show headings in capitals.
 * ls: heading letter spacing (em). tags: design needs. why: one line on why the pair works.
 */
export const FONT_PAIRS = [
  { id: 'playfair-source', head: 'Playfair Display', body: 'Source Sans 3', hw: 700, tags: ['elegant', 'editorial', 'luxury', 'resume'], why: 'High-contrast serif headlines over a calm, clear sans.' },
  { id: 'montserrat-merriweather', head: 'Montserrat', body: 'Merriweather', hw: 700, tags: ['corporate', 'editorial', 'resume'], why: 'Geometric sans headings with a sturdy, readable serif for long text.' },
  { id: 'oswald-opensans', head: 'Oswald', body: 'Open Sans', hw: 600, up: true, tags: ['bold', 'fitness', 'corporate'], why: 'Tall condensed headlines that fit big words in small spaces.' },
  { id: 'poppins-lora', head: 'Poppins', body: 'Lora', hw: 600, tags: ['modern', 'editorial', 'health'], why: 'Friendly round sans with a warm book serif.' },
  { id: 'bebas-montserrat', head: 'Bebas Neue', body: 'Montserrat', hw: 400, up: true, ls: 0.03, tags: ['bold', 'fitness', 'modern'], why: 'Poster-style capitals that shout, with a clean geometric partner.' },
  { id: 'raleway-lato', head: 'Raleway', body: 'Lato', hw: 700, tags: ['minimal', 'modern', 'corporate', 'resume'], why: 'Light, airy and professional; both stay clear at small sizes.' },
  { id: 'abril-lato', head: 'Abril Fatface', body: 'Lato', hw: 400, tags: ['editorial', 'fashion', 'bold'], why: 'Magazine-cover drama with a neutral body text.' },
  { id: 'cormorant-proza', head: 'Cormorant Garamond', body: 'Proza Libre', hw: 600, tags: ['luxury', 'wedding', 'elegant'], why: 'Refined classic serif with a soft humanist sans.' },
  { id: 'dmserif-dmsans', head: 'DM Serif Display', body: 'DM Sans', hw: 400, tags: ['modern', 'elegant', 'tech', 'resume'], why: 'A matched family: serif character with a modern sans.' },
  { id: 'spacegrotesk-inter', head: 'Space Grotesk', body: 'Inter', hw: 700, tags: ['tech', 'modern', 'minimal'], why: 'Quirky techy headings on the most readable screen font.' },
  { id: 'archivoblack-archivo', head: 'Archivo Black', body: 'Archivo', hw: 400, up: true, tags: ['bold', 'modern', 'fitness'], why: 'Heavy, punchy headlines from the same family as the body.' },
  { id: 'fraunces-inter', head: 'Fraunces', body: 'Inter', hw: 700, tags: ['food', 'editorial', 'modern'], why: 'Soft, characterful serif that feels warm and crafted.' },
  { id: 'baskerville-source', head: 'Libre Baskerville', body: 'Source Sans 3', hw: 700, tags: ['corporate', 'elegant', 'resume'], why: 'Traditional and trustworthy: law, finance, consulting.' },
  { id: 'robotoslab-roboto', head: 'Roboto Slab', body: 'Roboto', hw: 700, tags: ['corporate', 'tech', 'resume'], why: 'Solid slab headings with their own sans sister.' },
  { id: 'anton-roboto', head: 'Anton', body: 'Roboto', hw: 400, up: true, tags: ['bold', 'fitness'], why: 'Impact-style headlines for sales, offers and thumbnails.' },
  { id: 'pacifico-quicksand', head: 'Pacifico', body: 'Quicksand', hw: 400, tags: ['playful', 'food', 'vintage'], why: 'Relaxed brush script with a rounded, friendly sans.' },
  { id: 'fredoka-nunito', head: 'Fredoka', body: 'Nunito', hw: 600, tags: ['kids', 'playful', 'health'], why: 'Round and cheerful, easy for young readers.' },
  { id: 'greatvibes-cormorant', head: 'Great Vibes', body: 'Cormorant Garamond', hw: 400, tags: ['wedding', 'luxury', 'elegant'], why: 'Flowing calligraphy for names, with a classic serif.' },
  { id: 'cinzel-lato', head: 'Cinzel', body: 'Lato', hw: 600, up: true, ls: 0.06, tags: ['luxury', 'realestate', 'elegant'], why: 'Roman capitals that feel premium and timeless.' },
  { id: 'josefin-lora', head: 'Josefin Sans', body: 'Lora', hw: 600, up: true, ls: 0.08, tags: ['vintage', 'fashion', 'elegant'], why: 'Art-deco geometric capitals with a gentle serif.' },
  { id: 'lobster-cabin', head: 'Lobster', body: 'Cabin', hw: 400, tags: ['vintage', 'food', 'playful'], why: 'Retro signage script; keep it for short words.' },
  { id: 'alfaslab-roboto', head: 'Alfa Slab One', body: 'Roboto', hw: 400, tags: ['vintage', 'bold', 'food'], why: 'Chunky slab posters, great for menus and events.' },
  { id: 'syne-inter', head: 'Syne', body: 'Inter', hw: 700, tags: ['modern', 'tech', 'fashion'], why: 'Edgy, wide display for agencies and creative brands.' },
  { id: 'sora-inter', head: 'Sora', body: 'Inter', hw: 600, tags: ['tech', 'minimal', 'modern'], why: 'Clean SaaS look with crisp, open shapes.' },
  { id: 'prata-lato', head: 'Prata', body: 'Lato', hw: 400, tags: ['fashion', 'luxury', 'elegant'], why: 'Didone serif with beauty-brand polish.' },
  { id: 'yeseva-josefin', head: 'Yeseva One', body: 'Josefin Sans', hw: 400, tags: ['fashion', 'wedding', 'vintage'], why: 'Feminine, bold serif with a slim geometric sans.' },
  { id: 'bodoni-montserrat', head: 'Bodoni Moda', body: 'Montserrat', hw: 700, tags: ['fashion', 'luxury', 'editorial'], why: 'Vogue-style contrast with a modern sans.' },
  { id: 'garamond-inter', head: 'EB Garamond', body: 'Inter', hw: 600, tags: ['editorial', 'elegant', 'resume'], why: 'Bookish elegance with screen-friendly text.' },
  { id: 'merriweather-opensans', head: 'Merriweather', body: 'Open Sans', hw: 700, tags: ['editorial', 'kids', 'resume'], why: 'Readable everywhere: blogs, schools, reports.' },
  { id: 'lexend-sourceserif', head: 'Lexend', body: 'Source Serif 4', hw: 600, tags: ['kids', 'health', 'minimal'], why: 'Lexend was designed to make reading easier.' },
  { id: 'jakarta-lora', head: 'Plus Jakarta Sans', body: 'Lora', hw: 700, tags: ['modern', 'realestate', 'corporate'], why: 'Contemporary sans with a classic serif balance.' },
  { id: 'righteous-poppins', head: 'Righteous', body: 'Poppins', hw: 400, tags: ['playful', 'bold', 'tech'], why: 'Retro-future display for gaming, music and events.' },
  { id: 'teko-barlow', head: 'Teko', body: 'Barlow', hw: 600, up: true, tags: ['fitness', 'bold'], why: 'Athletic condensed numbers and headlines.' },
  { id: 'staatliches-robotocond', head: 'Staatliches', body: 'Roboto Condensed', hw: 400, up: true, ls: 0.04, tags: ['bold', 'vintage', 'fitness'], why: 'Industrial stencil-like capitals with a narrow sans.' },
  { id: 'caveat-karla', head: 'Caveat', body: 'Karla', hw: 700, tags: ['playful', 'food', 'health'], why: 'Handwritten notes feel personal and honest.' },
  { id: 'marker-rubik', head: 'Permanent Marker', body: 'Rubik', hw: 400, tags: ['playful', 'bold', 'kids'], why: 'Street-style marker for youthful brands.' },
  { id: 'zilla-worksans', head: 'Zilla Slab', body: 'Work Sans', hw: 700, tags: ['editorial', 'modern', 'tech'], why: 'Modern slab with personality; great for blogs.' },
  { id: 'spectral-karla', head: 'Spectral', body: 'Karla', hw: 600, tags: ['editorial', 'elegant', 'minimal'], why: 'Literary serif made for screens.' },
  { id: 'unbounded-inter', head: 'Unbounded', body: 'Inter', hw: 700, tags: ['tech', 'bold', 'modern'], why: 'Wide, futuristic headings for apps and crypto.' },
  { id: 'crimson-worksans', head: 'Crimson Text', body: 'Work Sans', hw: 600, tags: ['editorial', 'elegant', 'resume'], why: 'Old-style book serif with a neutral sans.' },
  { id: 'marcellus-lato', head: 'Marcellus', body: 'Lato', hw: 400, up: true, ls: 0.05, tags: ['health', 'luxury', 'realestate'], why: 'Calm flared capitals for spas, hotels and wellness.' },
  { id: 'kaushan-montserrat', head: 'Kaushan Script', body: 'Montserrat', hw: 400, tags: ['food', 'fitness', 'playful'], why: 'Energetic brush script with a strong sans.' },
  { id: 'barlowcond-barlow', head: 'Barlow Condensed', body: 'Barlow', hw: 700, up: true, tags: ['bold', 'corporate', 'realestate'], why: 'Automotive and industrial: compact and strong.' },
  { id: 'bricolage-inter', head: 'Bricolage Grotesque', body: 'Inter', hw: 700, tags: ['modern', 'tech', 'playful'], why: 'Trendy grotesque with quirky details.' },
  { id: 'plexsans-plexserif', head: 'IBM Plex Sans', body: 'IBM Plex Serif', hw: 600, tags: ['corporate', 'tech', 'resume'], why: 'A matched superfamily for serious, technical work.' },
  { id: 'poppins-hind', head: 'Poppins', body: 'Hind', hw: 700, tags: ['indian', 'modern', 'corporate'], why: 'Both draw Hindi (Devanagari) and English well.' },
  { id: 'yatra-mukta', head: 'Yatra One', body: 'Mukta', hw: 400, tags: ['indian', 'playful', 'food'], why: 'Festive Devanagari display with a clean partner.' },
  { id: 'teko-hind', head: 'Teko', body: 'Hind', hw: 600, up: true, tags: ['indian', 'bold', 'fitness'], why: 'Condensed headlines that also cover Hindi.' },
  { id: 'inter-inter', head: 'Inter', body: 'Inter', hw: 800, tags: ['minimal', 'tech', 'resume'], why: 'One family, two weights: the safest clean look.' },
  { id: 'lato-lato', head: 'Lato', body: 'Lato', hw: 900, tags: ['minimal', 'corporate', 'resume'], why: 'Single family with heavy headings; ATS-friendly.' }
];
export const pairById = (id) => FONT_PAIRS.find((p) => p.id === id);
export const pairsFor = (need) => (need ? FONT_PAIRS.filter((p) => p.tags.includes(need)) : FONT_PAIRS);

// Colour palettes for designs: [background, text, accent, accent 2, soft].
export const PALETTES = [
  { id: 'navy-gold', name: 'Navy & gold', c: ['#0f1b33', '#ffffff', '#d4a64a', '#3b5b92', '#f4ead5'], tags: ['luxury', 'corporate'] },
  { id: 'cream-ink', name: 'Cream & ink', c: ['#f7f1e5', '#1d1b18', '#b4532a', '#3f4b3b', '#e7dcc7'], tags: ['editorial', 'vintage'] },
  { id: 'mint-fresh', name: 'Mint fresh', c: ['#e8f7f0', '#0d3b2e', '#14b87f', '#ffb84d', '#c8eedd'], tags: ['health', 'food'] },
  { id: 'sunset', name: 'Sunset', c: ['#fff4ec', '#2b1b17', '#ff6b35', '#f7c548', '#ffd9c2'], tags: ['playful', 'food', 'bold'] },
  { id: 'electric', name: 'Electric', c: ['#0b0b1a', '#ffffff', '#7c3aed', '#22d3ee', '#1e1b4b'], tags: ['tech', 'bold'] },
  { id: 'blush', name: 'Blush', c: ['#fdf0f0', '#3a2a2e', '#d86c84', '#b48a5a', '#f6d6dc'], tags: ['fashion', 'wedding'] },
  { id: 'forest', name: 'Forest', c: ['#f2f5ef', '#1e2b1f', '#2f6b3b', '#c2a35a', '#d9e4d3'], tags: ['health', 'realestate'] },
  { id: 'mono', name: 'Black & white', c: ['#ffffff', '#111111', '#111111', '#777777', '#eeeeee'], tags: ['minimal', 'fashion'] },
  { id: 'red-sale', name: 'Red sale', c: ['#c8102e', '#ffffff', '#ffd400', '#111111', '#ff5a6e'], tags: ['bold'] },
  { id: 'ocean', name: 'Ocean', c: ['#eaf4fb', '#0b2545', '#1c7ed6', '#13b2a6', '#cfe6f6'], tags: ['corporate', 'tech', 'health'] },
  { id: 'charcoal-lime', name: 'Charcoal & lime', c: ['#1c1c1e', '#f5f5f5', '#c6f432', '#5e5ce6', '#2c2c2e'], tags: ['fitness', 'tech', 'bold'] },
  { id: 'terracotta', name: 'Terracotta', c: ['#f6eee6', '#3b2416', '#c1663f', '#6b8f71', '#ead7c4'], tags: ['food', 'vintage', 'realestate'] },
  { id: 'lavender', name: 'Lavender', c: ['#f4f1fb', '#2a2340', '#7a5cd6', '#f08fb3', '#e2dbf6'], tags: ['playful', 'fashion', 'kids'] },
  { id: 'sky-kids', name: 'Primary fun', c: ['#fffbea', '#1f2937', '#2563eb', '#f43f5e', '#fde68a'], tags: ['kids', 'playful'] },
  { id: 'saffron', name: 'Saffron festive', c: ['#fff7e6', '#3d1f0b', '#e8740c', '#b3122b', '#ffe0b3'], tags: ['indian', 'food', 'wedding'] },
  { id: 'emerald-lux', name: 'Emerald luxe', c: ['#0d2b24', '#f5efe0', '#c9a45c', '#1f6f5c', '#16443a'], tags: ['luxury', 'wedding'] },
  { id: 'peach-tech', name: 'Peach & plum', c: ['#fff1ea', '#2d1e2f', '#ff7a59', '#5b2a86', '#ffd5c7'], tags: ['modern', 'tech'] },
  { id: 'steel', name: 'Steel blue', c: ['#f3f5f8', '#1b2430', '#41658a', '#9aa9bb', '#dde3ea'], tags: ['corporate', 'minimal'] }
];

// Colour schemes for resumes: accent (headings, lines), fill (sidebar / header band), ink (text).
export const RESUME_SCHEMES = [
  { id: 'navy', name: 'Navy', accent: '#1f3a5f', fill: '#1f3a5f', ink: '#1a1c23' },
  { id: 'navy-gold', name: 'Navy & gold', accent: '#b8862b', fill: '#13223d', ink: '#1a1c23' },
  { id: 'teal', name: 'Teal', accent: '#0e7490', fill: '#e6f3f6', ink: '#14303a' },
  { id: 'forest', name: 'Forest', accent: '#2f6b3b', fill: '#1e3a26', ink: '#1d261f' },
  { id: 'sage', name: 'Sage', accent: '#5b7f63', fill: '#edf3ee', ink: '#252b26' },
  { id: 'burgundy', name: 'Burgundy', accent: '#8c1c3b', fill: '#3b0f1d', ink: '#231a1d' },
  { id: 'blush', name: 'Blush', accent: '#c2577a', fill: '#fbecef', ink: '#2e2226' },
  { id: 'plum', name: 'Plum', accent: '#6b3fa0', fill: '#f1ebf8', ink: '#251f2e' },
  { id: 'charcoal-orange', name: 'Charcoal & orange', accent: '#e8590c', fill: '#2b2d31', ink: '#1f2023' },
  { id: 'slate-blue', name: 'Slate & blue', accent: '#2563eb', fill: '#1e293b', ink: '#1e293b' },
  { id: 'sand', name: 'Sand', accent: '#8a5a2b', fill: '#f4ece1', ink: '#2c241c' },
  { id: 'mono', name: 'Black & grey', accent: '#111111', fill: '#2a2a2a', ink: '#161616' },
  { id: 'ocean', name: 'Ocean', accent: '#0369a1', fill: '#e8f2fa', ink: '#102a3c' },
  { id: 'red', name: 'Red', accent: '#b91c1c', fill: '#b91c1c', ink: '#1f1a1a' },
  { id: 'emerald-gold', name: 'Emerald & gold', accent: '#b08d3c', fill: '#0f3d33', ink: '#17251f' },
  { id: 'lavender', name: 'Lavender', accent: '#7c3aed', fill: '#f3effc', ink: '#231e30' }
];

/** Relative brightness 0..255 of a #hex colour. */
export const lumOf = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
/** Black or white text, whichever reads better on this colour. */
export const textOn = (hex) => (lumOf(hex) > 150 ? '#111111' : '#ffffff');

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function samplePixels(src, max = 96) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

/** The main colours of a picture (canvas, image or video frame), most used first, as #hex. */
export function imagePalette(src, k = 5) {
  const d = samplePixels(src);
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  // k-means, started from colours spread over the picture.
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let lab = new Uint8Array(px.length);
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      let best = 0, bd = Infinity;
      cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } });
      lab[i] = best; const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    cs = cs.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  const n = cs.map((_, j) => lab.filter((l) => l === j).length);
  return cs.map((c, j) => ({ hex: toHex(...c), n: n[j] })).filter((x) => x.n).sort((a, b) => b.n - a.n).map((x) => x.hex)
    .filter((hx, i, a) => a.indexOf(hx) === i);
}

/** Brightness, colourfulness and warmth of a picture, and the design needs that suit it. */
export function imageMood(src) {
  const d = samplePixels(src, 64);
  let L = 0, S = 0, warm = 0, pink = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L += 0.2126 * r + 0.7152 * g + 0.0722 * b; S += mx ? (mx - mn) / mx : 0; warm += (r - b) / 255;
    if (r > 180 && b > 140 && g < r - 30) pink++;
    n++;
  }
  L /= n; S /= n; warm /= n; pink /= n;
  const tags = [];
  if (L < 80) tags.push(S > 0.35 ? 'bold' : 'luxury', 'elegant');
  else if (L > 190 && S < 0.18) tags.push('minimal', 'modern', 'editorial');
  if (S > 0.45 && warm > 0.12) tags.push('food', 'playful', 'bold');
  if (S > 0.35 && warm < -0.05) tags.push('tech', 'modern');
  if (pink > 0.08) tags.push('fashion', 'wedding');
  if (S < 0.25 && L >= 80 && L <= 190) tags.push('corporate', 'editorial', 'vintage');
  if (!tags.length) tags.push('modern', 'minimal');
  return { lum: L, sat: S, warm, tags: [...new Set(tags)] };
}

/** Pairs ranked for a set of design needs (best first). */
export function rankPairs(tags, list = FONT_PAIRS) {
  return list.map((p, i) => ({ p, s: tags.reduce((a, t, j) => a + (p.tags.includes(t) ? (tags.length - j) : 0), 0) - i * 0.001 }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p);
}
