// Design Studio data: canvas sizes, fonts, icons, colour palettes, gradients, templates, brand kit and
// drafts saved on the device. (The renderer and the editing UI live in tools/editor.js.)

// ---------- sizes (pixels) ----------
export const SIZES = [
  ['Social media', [
    ['ig-post', 'Instagram post', 1080, 1080], ['ig-portrait', 'Instagram portrait', 1080, 1350], ['ig-story', 'Instagram / WhatsApp story', 1080, 1920],
    ['fb-post', 'Facebook post', 1200, 630], ['fb-cover', 'Facebook cover', 1640, 624], ['x-post', 'X (Twitter) post', 1600, 900],
    ['li-post', 'LinkedIn post', 1200, 1200], ['li-banner', 'LinkedIn banner', 1584, 396], ['pin', 'Pinterest pin', 1000, 1500]
  ]],
  ['Video & web', [
    ['yt-thumb', 'YouTube thumbnail', 1280, 720], ['yt-banner', 'YouTube channel art', 2560, 1440], ['web-banner', 'Website banner', 1920, 600],
    ['email', 'Email header', 1200, 400], ['ad-square', 'Display ad (square)', 1200, 1200], ['slide', 'Presentation slide', 1920, 1080]
  ]],
  ['Print', [
    ['a4', 'A4 poster / flyer', 2480, 3508], ['a5', 'A5 flyer', 1748, 2480], ['letter', 'US Letter flyer', 2550, 3300],
    ['card', 'Business card', 1050, 600], ['invite', 'Invitation (5×7 in)', 1500, 2100], ['logo', 'Logo', 1000, 1000]
  ]]
];
export const sizeById = (id) => SIZES.flatMap(([, list]) => list).find((s) => s[0] === id);

// ---------- fonts: every Google font, loaded on demand (see lib/fonts.js) ----------
import { fontCatalog, fontsFor } from './fonts.js';
export function ensureFonts() { fontCatalog(); }
/** Wait until the fonts used by these objects are ready (needed before drawing them on a canvas). */
export async function fontsReady(objs) { await fontsFor(objs.filter((o) => o.type === 'text')); }

// ---------- colours ----------
export const PALETTE = ['#ffffff', '#f5f6fa', '#fdf3e7', '#ffe8e8', '#e8f4ff', '#eafaf1', '#14213d', '#1d3557', '#0b132b', '#2b2d42', '#000000',
  '#d7191f', '#e63946', '#ff6b6b', '#f4a300', '#ffb703', '#ffd166', '#2a9d8f', '#06d6a0', '#118ab2', '#3a86ff', '#7b2cbf', '#c77dff', '#ff70a6'];
export const GRADIENTS = [
  ['#ff512f', '#dd2476', 135], ['#f7971e', '#ffd200', 135], ['#11998e', '#38ef7d', 135], ['#2193b0', '#6dd5ed', 135],
  ['#8e2de2', '#4a00e0', 135], ['#14213d', '#d7191f', 135], ['#fc5c7d', '#6a82fb', 135], ['#0f2027', '#2c5364', 160],
  ['#fdfbfb', '#ebedee', 180], ['#ffecd2', '#fcb69f', 135], ['#a1c4fd', '#c2e9fb', 135], ['#000000', '#434343', 180]
];
export const gradientCss = (g) => `linear-gradient(${g[2]}deg, ${g[0]}, ${g[1]})`;
/** A canvas gradient over the box (x, y, w, h) matching CSS linear-gradient(angle, a, b). */
export function canvasGradient(ctx, g, x, y, w, h) {
  const a = ((g[2] - 90) * Math.PI) / 180;
  const half = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
  const cx = x + w / 2, cy = y + h / 2;
  const grd = ctx.createLinearGradient(cx - Math.cos(a) * half, cy - Math.sin(a) * half, cx + Math.cos(a) * half, cy + Math.sin(a) * half);
  grd.addColorStop(0, g[0]); grd.addColorStop(1, g[1]);
  return grd;
}

// ---------- icons (original, 24×24, filled) ----------
export const ICONS = {
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.3 1.8-2.1 3.3-3.3 5.4-3.3 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z',
  check: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-1.4 14.2l-4.3-4.3 1.4-1.4 2.9 2.9 6.1-6.1 1.4 1.4z',
  phone: 'M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.6 3.6a1 1 0 01-.25 1z',
  mail: 'M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm9 7.5L20 7H4zm0 2.2L4 9.2V17h16V9.2z',
  pin: 'M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z',
  globe: 'M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 9h-3a15 15 0 00-1.4-6 8 8 0 014.4 6zM12 4c.9 1.2 1.7 3.6 1.9 7h-3.8c.2-3.4 1-5.8 1.9-7zM9.5 5a15 15 0 00-1.4 6h-3a8 8 0 014.4-6zM5.1 13h3a15 15 0 001.4 6 8 8 0 01-4.4-6zM12 20c-.9-1.2-1.7-3.6-1.9-7h3.8c-.2 3.4-1 5.8-1.9 7zm2.5-1a15 15 0 001.4-6h3a8 8 0 01-4.4 6z',
  clock: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.6l3.5 2.1-1 1.7L11 13.5V6h2z',
  calendar: 'M7 2h2v2h6V2h2v2h3a1 1 0 011 1v15a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h3zm12 8H5v9h14zM5 8h14V6H5z',
  cart: 'M7 18a2 2 0 110 4 2 2 0 010-4zm10 0a2 2 0 110 4 2 2 0 010-4zM1 3h3.3l.9 2H21a1 1 0 011 1.2l-1.6 7A1 1 0 0119.4 14H8.1l-.9 2H19v2H5.6a1 1 0 01-.9-1.5L6.2 13.4 3 5H1z',
  gift: 'M20 7h-2.2A3 3 0 0012 3.8 3 3 0 006.2 7H4a1 1 0 00-1 1v3a1 1 0 001 1h1v8a1 1 0 001 1h12a1 1 0 001-1v-8h1a1 1 0 001-1V8a1 1 0 00-1-1zm-5-2a1 1 0 010 2h-2a1 1 0 011-2zm-6 0h1a1 1 0 011 2H9a1 1 0 010-2zm2 15H7v-8h4zm0-10H5V9h6zm6 10h-4v-8h4zm2-10h-6V9h6z',
  tag: 'M21.4 11.6l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7a2 2 0 00.6 1.4l9 9a2 2 0 002.8 0l7-7a2 2 0 000-2.8zM6.5 8A1.5 1.5 0 116.5 5a1.5 1.5 0 010 3z',
  bolt: 'M13 2L4 14h6.5L9 22l11-13h-7z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5zm2 12h14v2H5z',
  play: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-2 14.5v-9l7 4.5z',
  camera: 'M9 4h6l1.5 2H20a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h3.5zm3 4.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
  user: 'M12 2a5 5 0 110 10 5 5 0 010-10zm0 12c5 0 9 2.5 9 5.5V22H3v-2.5C3 16.5 7 14 12 14z',
  home: 'M12 3l10 9h-3v9h-5v-6h-4v6H5v-9H2z',
  thumb: 'M2 10h4v12H2zm6 11V10l5.5-8c1.4 0 2.5 1.1 2.5 2.5L15 9h5.5a2 2 0 012 2.3l-1.3 8A2 2 0 0119.2 21z',
  arrow: 'M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z',
  sparkle: 'M12 1l2.3 7.7L22 11l-7.7 2.3L12 21l-2.3-7.7L2 11l7.7-2.3zM19 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
  percent: 'M7 3a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4zm10 8a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4zM18.6 3.6l1.8 1.8L5.4 20.4l-1.8-1.8z',
  megaphone: 'M3 10v4a1 1 0 001 1h2l3 6h2.5l-2-6H10l8 4V5l-8 4H4a1 1 0 00-1 1zm17-1v6a3 3 0 000-6z',
  quote: 'M4 17h5l2-4V7H4v6h3zm9 0h5l2-4V7h-7v6h3z',
  flame: 'M12 2s5 4.5 5 10a5 5 0 01-10 0c0-2 .9-3.6 2-4.8-.1 1.5.4 2.8 1.5 3.3C10 7.5 12 2 12 2zm0 20a7 7 0 01-7-7c0-1 .2-2 .6-2.9A7 7 0 0012 17a7 7 0 006.4-4.9c.4.9.6 1.9.6 2.9a7 7 0 01-7 7z',
  music: 'M20 3v12.5a3.5 3.5 0 11-2-3.2V7.4L10 9v8.5A3.5 3.5 0 118 14.3V5z',
  wifi: 'M12 18a2 2 0 110 4 2 2 0 010-4zm0-5c2 0 3.8.8 5.1 2.1l-1.4 1.4A5.2 5.2 0 0012 15c-1.4 0-2.7.6-3.7 1.5l-1.4-1.4A7.2 7.2 0 0112 13zm0-4.5c3.2 0 6.2 1.3 8.3 3.4l-1.4 1.4A9.8 9.8 0 0012 10.5a9.8 9.8 0 00-6.9 2.8l-1.4-1.4A11.8 11.8 0 0112 8.5zM12 4c4.5 0 8.6 1.8 11.6 4.8l-1.4 1.4A14.4 14.4 0 0012 6 14.4 14.4 0 001.8 10.2L.4 8.8A16.4 16.4 0 0112 4z'
};
export function iconSrc(name, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512"><path fill="${color}" d="${ICONS[name]}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ---------- placeholder photo for templates ----------
export function placeholderPhoto(w = 800, h = 800, tint = ['#cfd8e3', '#9fb0c6']) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, tint[0]); grd.addColorStop(1, tint[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.85)';
  const s = Math.min(w, h) / 24 * 5;
  g.save(); g.translate(w / 2 - s / 2, h / 2 - s * 0.62); g.scale(s / 24, s / 24); g.fill(new Path2D(ICONS.camera)); g.restore();
  g.font = `600 ${Math.round(Math.min(w, h) / 16)}px Poppins, Arial, sans-serif`;
  g.textAlign = 'center';
  g.fillText('Replace with your photo', w / 2, h / 2 + s * 0.75);
  return c.toDataURL('image/jpeg', 0.9);
}

// ---------- templates (original layouts) ----------
// Each builds editor objects for a W×H canvas. Units are pixels; text sizes scale with the canvas.
const T = (o) => ({ opacity: 100, align: 'left', ...o });
const txt = (text, x, y, size, family, color, extra = {}) => T({ type: 'text', text, x, y, size, family, font: 'sans', color, bold: false, italic: false, ls: 0, w: size * text.length * 0.5, h: size * 1.2, ...extra });
const rect = (x, y, w, h, fill, extra = {}) => T({ type: 'rect', x, y, w, h, fill, stroke: fill, sw: 0, ...extra });
const ell = (x, y, w, h, fill, extra = {}) => T({ type: 'ellipse', x, y, w, h, fill, stroke: fill, sw: 0, ...extra });
const bg = (fill, grad) => T({ type: 'rect', layer: 'Background', locked: true, x: 0, y: 0, w: 1, h: 1, fill, stroke: fill, sw: 0, grad, isBg: true });
const photo = (x, y, w, h, clip, tint) => T({ type: 'image', layer: 'Photo', x, y, w, h, filters: {}, src: placeholderPhoto(Math.round(w), Math.round(h), tint), natW: Math.round(w), natH: Math.round(h), jpeg: true, clip });
const icon = (name, x, y, s, color) => T({ type: 'image', layer: 'Icon', icon: name, iconColor: color, x, y, w: s, h: s, filters: {}, src: iconSrc(name, color), natW: 512, natH: 512 });

export const TEMPLATES = [
  { id: 'sale', name: 'Big sale post', size: 'ig-post', build: (W, H) => [
    bg('#ff512f', GRADIENTS[0]),
    ell(W * 0.62, -H * 0.12, W * 0.55, W * 0.55, 'rgba(255,255,255,0.15)'),
    txt('MEGA', W * 0.08, H * 0.16, W * 0.17, 'Bebas Neue', '#ffffff', { ls: W * 0.006 }),
    txt('SALE', W * 0.08, H * 0.31, W * 0.27, 'Bebas Neue', '#ffffff', { ls: W * 0.008 }),
    txt('UP TO 50% OFF ON EVERYTHING', W * 0.085, H * 0.58, W * 0.036, 'Poppins', '#ffffff', { bold: true }),
    rect(W * 0.085, H * 0.7, W * 0.36, H * 0.09, '#ffffff', { radius: H * 0.045, grp: 'Button' }),
    txt('SHOP NOW', W * 0.145, H * 0.718, W * 0.04, 'Poppins', '#dd2476', { bold: true, grp: 'Button' }),
    txt('www.yourstore.com', W * 0.085, H * 0.88, W * 0.03, 'Poppins', '#ffffff'),
    icon('tag', W * 0.68, H * 0.68, W * 0.22, '#ffffff')
  ] },
  { id: 'quote', name: 'Quote post', size: 'ig-post', build: (W, H) => [
    bg('#fdf3e7'),
    icon('quote', W * 0.1, H * 0.12, W * 0.16, '#d7191f'),
    txt('Small steps every day\nlead to big results.', W * 0.1, H * 0.34, W * 0.075, 'Playfair Display', '#14213d', { italic: true, lh: 1.25 }),
    rect(W * 0.1, H * 0.66, W * 0.12, H * 0.008, '#d7191f'),
    txt('YOUR NAME', W * 0.1, H * 0.7, W * 0.035, 'Montserrat', '#14213d', { bold: true, ls: W * 0.004 }),
    txt('@yourhandle', W * 0.1, H * 0.76, W * 0.03, 'Montserrat', '#5a6275')
  ] },
  { id: 'event', name: 'Event poster', size: 'a4', build: (W, H) => [
    bg('#0b132b'),
    rect(0, H * 0.78, W, H * 0.22, '#d7191f'),
    photo(W * 0.08, H * 0.06, W * 0.84, H * 0.36, 'rounded', ['#3a506b', '#1c2541']),
    txt('MARKETING', W * 0.08, H * 0.46, W * 0.13, 'Anton', '#ffffff', { ls: W * 0.004 }),
    txt('SUMMIT 2026', W * 0.08, H * 0.54, W * 0.13, 'Anton', '#ffb703', { ls: W * 0.004 }),
    { ...icon('calendar', W * 0.08, H * 0.655, W * 0.045, '#ffb703'), grp: 'Details/Date' }, txt('Saturday, 12 December', W * 0.145, H * 0.655, W * 0.034, 'Poppins', '#ffffff', { grp: 'Details/Date' }),
    { ...icon('clock', W * 0.08, H * 0.7, W * 0.045, '#ffb703'), grp: 'Details/Time' }, txt('10:00 AM – 5:00 PM', W * 0.145, H * 0.7, W * 0.034, 'Poppins', '#ffffff', { grp: 'Details/Time' }),
    { ...icon('pin', W * 0.08, H * 0.745, W * 0.045, '#ffb703'), grp: 'Details/Place' }, txt('City Convention Centre', W * 0.145, H * 0.745, W * 0.034, 'Poppins', '#ffffff', { grp: 'Details/Place' }),
    txt('REGISTER FREE', W * 0.08, H * 0.83, W * 0.06, 'Poppins', '#ffffff', { bold: true }),
    txt('yourevent.com/register', W * 0.08, H * 0.9, W * 0.034, 'Poppins', '#ffffff')
  ] },
  { id: 'yt', name: 'YouTube thumbnail', size: 'yt-thumb', build: (W, H) => [
    bg('#ffd166', ['#f7971e', '#ffd200', 135]),
    photo(W * 0.58, H * 0.1, H * 0.8, H * 0.8, 'ellipse', ['#ffe8cc', '#f4a261']),
    txt('10 TIPS', W * 0.05, H * 0.12, H * 0.26, 'Anton', '#14213d', { outline: { color: '#ffffff', width: H * 0.012 } }),
    txt('TO GROW', W * 0.05, H * 0.42, H * 0.2, 'Anton', '#ffffff', { shadow: { color: 'rgba(0,0,0,0.45)', blur: H * 0.02, x: H * 0.008, y: H * 0.008 } }),
    rect(W * 0.05, H * 0.7, W * 0.42, H * 0.15, '#d7191f', { radius: H * 0.03 }),
    txt('FAST!', W * 0.085, H * 0.705, H * 0.13, 'Anton', '#ffffff'),
    icon('arrow', W * 0.47, H * 0.64, H * 0.22, '#14213d')
  ] },
  { id: 'story', name: 'New arrivals story', size: 'ig-story', build: (W, H) => [
    bg('#a1c4fd', GRADIENTS[10]),
    photo(W * 0.1, H * 0.12, W * 0.8, H * 0.48, 'rounded', ['#e0eafc', '#cfdef3']),
    txt('NEW', W * 0.1, H * 0.63, W * 0.2, 'Bebas Neue', '#14213d', { ls: W * 0.01 }),
    txt('ARRIVALS', W * 0.1, H * 0.72, W * 0.2, 'Bebas Neue', '#14213d', { ls: W * 0.01 }),
    txt('Fresh styles are here. Tap to shop.', W * 0.1, H * 0.84, W * 0.045, 'Poppins', '#14213d'),
    icon('sparkle', W * 0.74, H * 0.62, W * 0.16, '#ffffff')
  ] },
  { id: 'hiring', name: "We're hiring", size: 'li-post', build: (W, H) => [
    bg('#14213d'),
    rect(0, 0, W * 0.04, H, '#d7191f'),
    txt("WE'RE", W * 0.1, H * 0.12, W * 0.12, 'Montserrat', '#ffffff', { bold: true }),
    txt('HIRING!', W * 0.1, H * 0.25, W * 0.15, 'Montserrat', '#ffb703', { bold: true }),
    icon('check', W * 0.1, H * 0.5, W * 0.05, '#ffb703'), txt('Digital Marketing Executive', W * 0.17, H * 0.5, W * 0.04, 'Poppins', '#ffffff'),
    icon('check', W * 0.1, H * 0.58, W * 0.05, '#ffb703'), txt('Graphic Designer', W * 0.17, H * 0.58, W * 0.04, 'Poppins', '#ffffff'),
    icon('check', W * 0.1, H * 0.66, W * 0.05, '#ffb703'), txt('Content Writer', W * 0.17, H * 0.66, W * 0.04, 'Poppins', '#ffffff'),
    txt('Send your CV to jobs@yourcompany.com', W * 0.1, H * 0.84, W * 0.033, 'Poppins', '#cfd6e6'),
    icon('megaphone', W * 0.7, H * 0.1, W * 0.2, '#d7191f')
  ] },
  { id: 'webinar', name: 'Webinar banner', size: 'fb-post', build: (W, H) => [
    bg('#ffffff'),
    rect(W * 0.55, 0, W * 0.45, H, '#118ab2'),
    photo(W * 0.62, H * 0.15, W * 0.31, H * 0.7, 'rounded', ['#d6eaf8', '#85c1e9']),
    txt('FREE WEBINAR', W * 0.06, H * 0.14, W * 0.028, 'Poppins', '#118ab2', { bold: true, ls: W * 0.003 }),
    txt('Grow your brand\nwith social media', W * 0.06, H * 0.24, W * 0.05, 'Montserrat', '#14213d', { bold: true, lh: 1.15 }),
    icon('calendar', W * 0.06, H * 0.6, W * 0.03, '#d7191f'), txt('Thursday · 7 PM IST', W * 0.1, H * 0.6, W * 0.025, 'Poppins', '#14213d'),
    rect(W * 0.06, H * 0.74, W * 0.2, H * 0.12, '#d7191f', { radius: H * 0.06, grp: 'Button' }),
    txt('Join now', W * 0.105, H * 0.765, W * 0.026, 'Poppins', '#ffffff', { bold: true, grp: 'Button' })
  ] },
  { id: 'card', name: 'Business card', size: 'card', build: (W, H) => [
    bg('#ffffff'),
    rect(0, 0, W * 0.36, H, '#14213d'),
    icon('crown', W * 0.09, H * 0.32, W * 0.18, '#ffb703'),
    txt('YOUR NAME', W * 0.42, H * 0.16, W * 0.06, 'Montserrat', '#14213d', { bold: true }),
    txt('Marketing Manager', W * 0.42, H * 0.29, W * 0.034, 'Montserrat', '#d7191f'),
    icon('phone', W * 0.42, H * 0.5, W * 0.035, '#14213d'), txt('+91 98765 43210', W * 0.47, H * 0.5, W * 0.03, 'Poppins', '#14213d'),
    icon('mail', W * 0.42, H * 0.62, W * 0.035, '#14213d'), txt('you@company.com', W * 0.47, H * 0.62, W * 0.03, 'Poppins', '#14213d'),
    icon('globe', W * 0.42, H * 0.74, W * 0.035, '#14213d'), txt('www.company.com', W * 0.47, H * 0.74, W * 0.03, 'Poppins', '#14213d')
  ] }
];

// ---------- brand kit (kept on this device) ----------
const BRAND_KEY = 'editsupreme.brand';
export function loadBrand() {
  try { return { colors: [], logo: null, heading: 'Montserrat', body: 'Poppins', ...JSON.parse(localStorage.getItem(BRAND_KEY) || '{}') }; } catch { return { colors: [], logo: null, heading: 'Montserrat', body: 'Poppins' }; }
}
export function saveBrand(b) { try { localStorage.setItem(BRAND_KEY, JSON.stringify(b)); } catch { /* storage full or blocked */ } }

// ---------- drafts (IndexedDB: designs can hold large images) ----------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('editsupreme-designs', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('designs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveDraft(design) {
  try {
    const d = await db();
    await new Promise((res, rej) => { const t = d.transaction('designs', 'readwrite'); t.objectStore('designs').put({ ...design, savedAt: Date.now() }, 'last'); t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch { /* private mode or storage blocked: drafts just aren't kept */ }
}
export async function loadDraft() {
  try {
    const d = await db();
    return await new Promise((res) => { const r = d.transaction('designs').objectStore('designs').get('last'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  } catch { return null; }
}
