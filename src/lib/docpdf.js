// Shared helpers for documents made from forms (invoices, resumes): storage in this browser, pictures,
// fonts for pdf-lib (Google fonts with a Helvetica fallback) and text wrapping.
import { StandardFonts, rgb } from '@cantoo/pdf-lib';
import { hexToRgb01 } from './core.js';
import { IMG_ACCEPT, readPicture, resizeCanvas, encode } from './imgio.js';
import { pickFiles } from './ui.js';

export const store = {
  get(k, d) { try { const v = localStorage.getItem('editsupreme.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('editsupreme.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('editsupreme.' + k); } catch { /* blocked */ } }
};
export const col = (hex) => { const [r, g, b] = hexToRgb01(hex || '#000000'); return rgb(r, g, b); };
/** The colour mixed with white: amount 0 = colour, 1 = white. */
export const tintOf = (hex, amount) => { const [r, g, b] = hexToRgb01(hex || '#000000'); const m = (v) => v + (1 - v) * amount; return rgb(m(r), m(g), m(b)); };
export const GREY = rgb(0.38, 0.4, 0.45), INK = rgb(0.1, 0.11, 0.14), LINE = rgb(0.86, 0.87, 0.9), WHITE = rgb(1, 1, 1);

/** A picture chosen by the visitor, made small, as a data URL (so it can be remembered). */
export async function pictureDataUrl(maxSide = 500, file = null) {
  const f = file || (await pickFiles(IMG_ACCEPT, false))[0];
  if (!f) return null;
  const c = (await readPicture(f)).frames[0].canvas;
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  const blob = await encode(resizeCanvas(c, c.width * k, c.height * k), 'png');
  return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
}
export const dataUrlBytes = (u) => Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));

// Font files are fetched once per page visit and kept in memory (documents are re-made on every edit).
const fontFiles = new Map();
let fontkitP = null;
function fontFile(family, bold) {
  const key = family + '|' + bold;
  if (!fontFiles.has(key)) {
    fontFiles.set(key, (async () => {
      const { fontCatalog, fontInfo, fontFileUrl } = await import('./fonts.js');
      await fontCatalog();
      const f = fontInfo(family);
      if (!f) return null;
      const ws = f.weights || [400], want = bold ? 700 : 400;
      const w = ws.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), ws[0]);
      const r = await fetch(fontFileUrl(f, w, 'normal', 'ttf'));
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    })().catch(() => null));
  }
  return fontFiles.get(key);
}

/** Regular and bold fonts for a PDF: the Google font when it can be fetched, else Helvetica. */
export async function pdfFonts(doc, family) {
  try {
    const [rb, bb] = await Promise.all([fontFile(family, false), fontFile(family, true)]);
    if (rb && bb) {
      fontkitP ||= import('@cantoo/fontkit').then((m) => m.default || m);
      doc.registerFontkit(await fontkitP);
      const [reg, bold] = await Promise.all([doc.embedFont(rb, { subset: true }), doc.embedFont(bb, { subset: true })]);
      // The web fonts hold the common Latin letters; other characters are swapped for ones they have.
      const set = new Set(reg.getCharacterSet?.() || []);
      return { reg, bold, unicode: true, has: (ch) => !set.size || set.has(ch.codePointAt(0)) };
    }
  } catch { /* offline or a broken file: standard fonts */ }
  return { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), unicode: false, has: () => true };
}

/** Text the font can draw (₹ becomes Rs., unknown characters a question mark). */
export function safe(F, s) {
  s = String(s ?? '');
  if (F.unicode) return [...s].map((ch) => (ch === '\n' || F.has(ch) ? ch : ch === '₹' ? 'Rs. ' : ch === '•' ? '-' : '?')).join('');
  return s.replace(/₹/g, 'Rs. ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

/** Lines of `text` that fit in maxW at this size (long words are broken). */
export function wrap(font, text, size, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (font.widthOfTextAtSize(t.trimEnd(), size) <= maxW || !line.trim()) {
        if (!line.trim() && font.widthOfTextAtSize(w, size) > maxW) {
          let part = '';
          for (const ch of w) { if (part && font.widthOfTextAtSize(part + ch, size) > maxW) { out.push(part); part = ''; } part += ch; }
          line = part;
        } else line = t;
      } else { out.push(line.trimEnd()); line = w.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}
