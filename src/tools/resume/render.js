// Draws a resume as a PDF with pdf-lib. Every template is a mix of a few building blocks (layout,
// header, heading style, how dates and tags are shown), so the visitor's colour, fonts and sizes
// work with all of them. "Fit to one page" measures the resume at smaller sizes without drawing it.
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { col, tintOf, INK, GREY, WHITE, pdfFonts, safe, wrap } from '../../lib/docpdf.js';
import { newCanvas, encode } from '../../lib/imgio.js';
import { templateOf, SIDE_TYPES, splitTags, splitLines, dateRange, contactsOf, sectionHasContent } from './model.js';

export const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGIN = { narrow: 28, normal: 40, wide: 54 };
const NOPAGE = new Proxy({}, { get: () => () => {} }); // a page that draws nothing (for measuring)

// The photo cut to the chosen shape, as PNG bytes (kept between edits).
const photoCache = new Map();
function photoPng(url, shape) {
  const key = shape + '|' + url;
  if (!photoCache.has(key)) {
    photoCache.set(key, new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const S = 420, c = newCanvas(S, S), g = c.getContext('2d');
        const k = Math.max(S / img.width, S / img.height);
        g.beginPath();
        if (shape === 'circle') g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
        else if (shape === 'rounded') g.roundRect(0, 0, S, S, S * 0.14);
        else g.rect(0, 0, S, S);
        g.clip();
        // Portraits: keep the top (the face) rather than the middle.
        g.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) * 0.25, img.width * k, img.height * k);
        encode(c, 'png').then((b) => b.arrayBuffer()).then((a) => res(new Uint8Array(a)), () => res(null));
      };
      img.onerror = () => res(null);
      img.src = url;
    }));
  }
  return photoCache.get(key);
}

const textW = (font, t, size, ls = 0) => font.widthOfTextAtSize(t, size) + ls * Math.max(0, [...t].length - 1);
/** Items joined by a separator, wrapped so a line never starts or ends with the separator. */
function joinWrap(font, items, size, maxW, sep = '   |   ') {
  const lines = [];
  let cur = '';
  for (const it of items) {
    const t = cur ? cur + sep + it : it;
    if (cur && font.widthOfTextAtSize(t, size) > maxW) { lines.push(cur); cur = it; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const isDark = (hex) => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 150; };

/** Lays out the whole resume at scale s. With dry set nothing is drawn; the page count is returned. */
function layout(doc, F, HF, r, s, dry, photoImg) {
  const d = r.design, T = templateOf(d.template), b = r.basics;
  const [W, H] = PAPER[d.paper] || PAPER.a4;
  const M = (MARGIN[d.margin] ?? 40) * Math.min(1, 0.6 + s * 0.4);
  const A = T.plain ? INK : col(d.accent);
  const base = (+d.size || 10) * s;
  const gap = 1.32 * (+d.spacing || 1);
  const secGap = 12 * (+d.spacing || 1) * s;
  const side = T.layout === 'side-left' || T.layout === 'side-right';
  const sideW = side ? Math.round(W * 0.32) : 0;
  const sideX = T.layout === 'side-left' ? 0 : W - sideW;
  // Colour scheme: an optional fill colour (sidebar and header band) and text colour.
  const INKC = d.ink && !T.plain ? col(d.ink) : INK;
  const fillHex = !T.plain && d.fill ? d.fill : null;
  const fillDark = fillHex ? isDark(fillHex) : true;
  const sideFill = !side ? null : fillHex ? col(fillHex) : T.side === 'solid' ? A : tintOf(d.accent, 0.9);
  const sideLight = fillHex ? fillDark : T.side === 'solid';
  const pages = [];
  function newPage() {
    const p = dry ? NOPAGE : doc.addPage([W, H]);
    if (sideFill) p.drawRectangle({ x: sideX, y: 0, width: sideW, height: H, color: sideFill });
    pages.push(p);
    return p;
  }
  newPage();

  function draw(p, t, x, y, size, font, color, ls = 0) {
    if (t) p.drawText(t, { x, y, size, font, color, ...(ls ? { characterSpacing: ls } : {}) });
  }

  // A column of text that flows onto new pages.
  function column(x, w, top, { light = false } = {}) {
    const c = { x, w, y: top, pi: 0, light };
    c.ink = light ? WHITE : INKC;
    c.grey = light ? rgb(0.88, 0.9, 0.94) : GREY;
    c.acc = light ? WHITE : A;
    c.page = () => pages[c.pi];
    c.need = (hh) => { if (c.y - hh < M) { c.pi++; if (!pages[c.pi]) newPage(); c.y = H - M; } };
    c.space = (v) => { c.y -= v; };
    c.para = (t, { size = base, font = F.reg, color = c.ink, align = 'left', g = gap, ls = 0 } = {}) => {
      if (!String(t || '').trim()) return;
      for (const l of wrap(font, safe(font === HF.bold || font === HF.reg ? HF : F, t), size, c.w)) {
        c.need(size * g);
        const tw = textW(font, l, size, ls);
        draw(c.page(), l, align === 'center' ? c.x + (c.w - tw) / 2 : align === 'right' ? c.x + c.w - tw : c.x, c.y - size, size, font, color, ls);
        c.y -= size * g;
      }
    };
    // Bold text on the left, smaller grey text on the right (job title and dates).
    c.lr = (left, right, { size = base, font = F.bold } = {}) => {
      right = safe(F, right || '');
      const rs = size * 0.9, rw = right ? F.reg.widthOfTextAtSize(right, rs) : 0;
      const lines = wrap(font, safe(F, left), size, c.w - (rw ? rw + 10 : 0));
      c.need(size * gap * Math.min(2, lines.length));
      if (right) draw(c.page(), right, c.x + c.w - rw, c.y - size, rs, F.reg, c.grey);
      for (const l of lines) { c.need(size * gap); draw(c.page(), l, c.x, c.y - size, size, font, c.ink); c.y -= size * gap; }
    };
    // "Label: value" with the label in bold (personal details).
    c.kv = (label, value) => {
      const lab = safe(F, label) + ': ', lw = F.bold.widthOfTextAtSize(lab, base);
      if (lw > c.w * 0.6) return c.para(label + ': ' + value);
      wrap(F.reg, safe(F, value), base, c.w - lw).forEach((l, i) => {
        c.need(base * gap);
        if (!i) draw(c.page(), lab, c.x, c.y - base, base, F.bold, c.ink);
        draw(c.page(), l, c.x + lw, c.y - base, base, F.reg, c.ink);
        c.y -= base * gap;
      });
    };
    c.bullets = (items, { size = base } = {}) => {
      const ind = size * 1.1;
      for (const p of items) {
        wrap(F.reg, safe(F, p), size, c.w - ind).forEach((l, i) => {
          c.need(size * gap);
          if (!i) c.page().drawCircle({ x: c.x + size * 0.3, y: c.y - size * 0.64, size: size * 0.15, color: c.light ? WHITE : A });
          draw(c.page(), l, c.x + ind, c.y - size, size, F.reg, c.ink);
          c.y -= size * gap;
        });
      }
    };
    c.heading = (title) => {
      c.y -= secGap;
      const size = base * 1.12;
      c.need(size * 2 + base * gap * 3); // keep a heading with its first lines
      const p = c.page(), t = safe(HF, title), up = t.toUpperCase();
      const hc = c.light ? WHITE : A;
      const style = T.heading;
      if (style === 'box') {
        const bh = size * 1.75;
        p.drawRectangle({ x: c.x, y: c.y - bh, width: c.w, height: bh, color: c.light ? rgb(1, 1, 1) : A, opacity: c.light ? 0.15 : 1 });
        draw(p, up, c.x + size * 0.6, c.y - bh / 2 - size * 0.36, size, HF.bold, WHITE, size * 0.08);
        c.y -= bh + base * 0.6;
      } else if (style === 'lines') {
        const tw = textW(HF.bold, up, size, size * 0.15), mid = c.x + c.w / 2, ly = c.y - size * 0.62;
        draw(p, up, mid - tw / 2, c.y - size, size, HF.bold, hc, size * 0.15);
        if (c.w - tw > 40) {
          p.drawLine({ start: { x: c.x, y: ly }, end: { x: mid - tw / 2 - 10, y: ly }, thickness: 0.7, color: hc });
          p.drawLine({ start: { x: mid + tw / 2 + 10, y: ly }, end: { x: c.x + c.w, y: ly }, thickness: 0.7, color: hc });
        }
        c.y -= size + base * 0.8;
      } else if (style === 'smallcaps') {
        draw(p, up, c.x, c.y - size * 0.9, size * 0.9, HF.bold, c.light ? WHITE : GREY, size * 0.22);
        c.y -= size * 0.9 + 4;
        p.drawLine({ start: { x: c.x, y: c.y }, end: { x: c.x + c.w, y: c.y }, thickness: 0.5, color: c.light ? WHITE : rgb(0.8, 0.81, 0.84) });
        c.y -= base * 0.7;
      } else if (style === 'bar') {
        p.drawRectangle({ x: c.x, y: c.y - size * 1.05, width: 3.2 * s, height: size * 1.15, color: hc });
        draw(p, up, c.x + 9 * s, c.y - size, size, HF.bold, c.ink, size * 0.06);
        c.y -= size + base * 0.75;
      } else if (style === 'short') {
        draw(p, up, c.x, c.y - size, size, HF.bold, c.ink, size * 0.08);
        c.y -= size + 4;
        p.drawRectangle({ x: c.x, y: c.y - 1.6, width: 26 * s, height: 2.2, color: hc });
        c.y -= base * 0.75;
      } else if (style === 'plain') {
        draw(p, t, c.x, c.y - size * 1.2, size * 1.2, HF.bold, hc);
        c.y -= size * 1.2 + base * 0.55;
      } else if (style === 'caps') {
        draw(p, up, c.x, c.y - size, size, HF.bold, hc, size * 0.12);
        c.y -= size + 3;
        if (T.plain) { p.drawLine({ start: { x: c.x, y: c.y }, end: { x: c.x + c.w, y: c.y }, thickness: 0.8, color: INK }); c.y -= 2; }
        c.y -= base * 0.55;
      } else { // rule
        draw(p, up, c.x, c.y - size, size, HF.bold, hc, size * 0.06);
        c.y -= size + 4;
        p.drawLine({ start: { x: c.x, y: c.y }, end: { x: c.x + c.w, y: c.y }, thickness: 0.8, color: hc, opacity: c.light ? 0.55 : 1 });
        c.y -= base * 0.7;
      }
    };
    c.tags = (list, style) => {
      if (style === 'inline') return c.para(list.join('  ·  '));
      if (style === 'bullets') return c.bullets(list);
      const size = base * 0.9, padX = size * 0.65, hh = size * 1.75, g2 = size * 0.45;
      let x = c.x;
      c.need(hh + g2);
      for (const t0 of list) {
        const t = safe(F, t0);
        const tw = Math.min(F.reg.widthOfTextAtSize(t, size) + padX * 2, c.w);
        if (x > c.x && x + tw > c.x + c.w) { x = c.x; c.y -= hh + g2; c.need(hh + g2); }
        const rr = hh / 2, wpx = tw;
        c.page().drawSvgPath(`M ${rr} 0 H ${wpx - rr} A ${rr} ${rr} 0 0 1 ${wpx - rr} ${hh} H ${rr} A ${rr} ${rr} 0 0 1 ${rr} 0 Z`,
          { x, y: c.y, color: c.light || c.tinted ? WHITE : tintOf(d.accent, T.plain ? 0.93 : 0.86), opacity: c.light ? 0.18 : 1 });
        draw(c.page(), wrap(F.reg, t, size, c.w - padX * 2)[0], x + padX, c.y - hh / 2 - size * 0.35, size, F.reg, c.ink);
        x += tw + g2;
      }
      c.y -= hh + g2;
    };
    c.entry = (e, mode) => {
      const dates = dateRange(e);
      const title = e.title || e.subtitle || '';
      const sub = e.title ? [e.subtitle, e.place].filter(Boolean).join(', ') : e.place;
      c.need(base * gap * 2.5);
      const gut = mode === 'gutter' || mode === 'timeline' ? 76 * s : 0;
      const y0 = c.y, p0 = c.pi;
      if (gut) {
        wrap(F.reg, safe(F, dates), base * 0.85, gut - 16 * s).forEach((l, i) => draw(c.page(), l, c.x, c.y - base - i * base * 1.15, base * 0.85, F.reg, c.grey));
        if (mode === 'timeline') c.page().drawCircle({ x: c.x + gut - 9 * s, y: c.y - base * 0.6, size: 3.2 * s, color: A });
        c.x += gut; c.w -= gut;
      }
      if (mode === 'right' && !gut) c.lr(title, dates); else c.para(title, { font: F.bold });
      if (sub) c.para(sub, { color: c.light ? c.grey : A, size: base * 0.95 });
      if (mode === 'below' && dates) c.para(dates, { color: c.grey, size: base * 0.86 });
      if (e.link) c.para(e.link, { color: c.grey, size: base * 0.86 });
      if (e.note) c.para(e.note, { color: c.grey, size: base * 0.92 });
      const bl = splitLines(e.bullets);
      if (bl.length) { c.space(base * 0.15); c.bullets(bl); }
      if (gut) {
        c.x -= gut; c.w += gut;
        if (mode === 'timeline' && c.pi === p0) c.page().drawLine({ start: { x: c.x + gut - 9 * s, y: y0 - base * 0.6 - 4 * s }, end: { x: c.x + gut - 9 * s, y: c.y - base * 0.2 }, thickness: 1, color: tintOf(d.accent, 0.6) });
      }
    };
    c.section = (sec) => {
      c.heading(sec.title || '');
      if (sec.kind === 'text') c.para(sec.text);
      else if (sec.kind === 'tags') c.tags(splitTags(sec.text), c.narrow && T.tags === 'inline' ? 'bullets' : T.tags);
      else if (sec.kind === 'list') {
        const lines = splitLines(sec.text);
        if (sec.type === 'personal') for (const l of lines) { const m = l.match(/^([^:]{1,30}):\s*(.*)$/); if (m) c.kv(m[1], m[2]); else c.para(l); }
        else c.bullets(lines);
      } else {
        const mode = c.narrow ? 'below' : T.dates;
        sec.items.filter((e) => e.title || e.subtitle || e.bullets).forEach((e, i) => { if (i) c.space(base * 0.65 * (+d.spacing || 1)); c.entry(e, mode); });
      }
    };
    return c;
  }

  const contacts = contactsOf(b);
  const photoOn = photoImg && d.photo !== 'none' && !T.plain;
  const top = H - M;
  const NAME = base * 2.4;
  const drawPhoto = (x, y, size) => { if (photoOn) pages[0].drawImage(photoImg, { x, y, width: size, height: size }); };

  // Columns: main, and the narrow one for sidebar / two-column designs.
  let main, narrow = null;
  if (side) {
    const pad = 22 * s;
    narrow = column(sideX + pad, sideW - pad * 2, top, { light: sideLight });
    main = column(T.layout === 'side-left' ? sideW + 26 * s : M, W - sideW - 26 * s - M, top);
  } else main = column(M, W - 2 * M, top);
  if (narrow) { narrow.narrow = true; narrow.tinted = fillHex ? !sideLight : T.side === 'tint'; }

  // ----- header -----
  const name = b.name || 'Your Name';
  const hdr = T.header;
  if (hdr === 'band' || hdr === 'block') {
    const pad = 24 * s, ps = photoOn ? 78 * s : 0;
    const tx = M + (ps ? ps + 18 * s : 0), tw = W - M - tx;
    const nm = wrap(HF.bold, safe(HF, hdr === 'block' ? name.toUpperCase() : name), NAME * (hdr === 'block' ? 1.08 : 1), tw);
    const ns = NAME * (hdr === 'block' ? 1.08 : 1);
    const cl = hdr === 'band' ? joinWrap(F.reg, contacts.map((x) => safe(F, x)), base * 0.88, tw) : [];
    let bh = pad * 2 + nm.length * ns * 1.15 + (b.title ? base * 1.25 * 1.5 : 0) + cl.length * base * 0.88 * 1.45;
    bh = Math.max(bh, ps + pad * 1.6);
    const fill = fillHex ? col(fillHex) : hdr === 'block' ? col(d.accent) : A;
    const onFill = fillDark ? WHITE : INKC, onFill2 = fillDark ? rgb(0.93, 0.95, 0.97) : GREY;
    pages[0].drawRectangle({ x: 0, y: H - bh, width: W, height: bh, color: fill });
    drawPhoto(M, H - bh / 2 - ps / 2, ps);
    let y = H - pad;
    for (const l of nm) { draw(pages[0], l, tx, y - ns, ns, HF.bold, onFill, hdr === 'block' ? ns * 0.06 : 0); y -= ns * 1.15; }
    if (b.title) { draw(pages[0], safe(F, b.title), tx, y - base * 1.25 - 2, base * 1.25, F.reg, onFill); y -= base * 1.25 * 1.5; }
    for (const l of cl) { draw(pages[0], l, tx, y - base * 0.88 - 2, base * 0.88, F.reg, onFill2); y -= base * 0.88 * 1.45; }
    main.y = H - bh - 6 * s;
    if (hdr === 'block' && contacts.length) { main.space(8 * s); for (const l of joinWrap(F.reg, contacts.map((x) => safe(F, x)), base * 0.9, main.w)) main.para(l, { size: base * 0.9, color: GREY }); }
  } else if (hdr === 'side' || hdr === 'main-name') {
    const ps = photoOn ? Math.min(narrow.w, 112 * s) : 0;
    if (ps) { drawPhoto(narrow.x + (narrow.w - ps) / 2, top - ps, ps); narrow.space(ps + 14 * s); }
    const into = hdr === 'side' ? narrow : main;
    into.para(name, { size: hdr === 'side' ? NAME * 0.85 : NAME, font: HF.bold, color: hdr === 'side' ? (narrow.light ? WHITE : A) : INKC, g: 1.15, align: hdr === 'side' && ps ? 'center' : 'left' });
    if (b.title) into.para(b.title, { size: base * 1.2, color: hdr === 'side' ? narrow.ink : A, align: hdr === 'side' && ps ? 'center' : 'left' });
    if (hdr === 'main-name') main.space(2 * s);
    if (contacts.length) { narrow.heading('Contact'); for (const l of contacts) narrow.para(l, { size: base * 0.9 }); }
  } else if (hdr === 'split') {
    const ps = photoOn ? 62 * s : 0;
    if (ps) drawPhoto(M, top - ps, ps);
    const lw = main.w * 0.56, rx = M + main.w * 0.58, rw = main.w * 0.42;
    const L = column(M + (ps ? ps + 12 * s : 0), lw - (ps ? ps + 12 * s : 0), top), R = column(rx, rw, top);
    L.para(name, { size: NAME * 0.9, font: HF.bold, g: 1.15 });
    if (b.title) L.para(b.title, { size: base * 1.15, color: A });
    for (const l of contacts) R.para(l, { size: base * 0.88, color: GREY, align: 'right', g: 1.35 });
    main.y = Math.min(L.y, R.y, top - ps) - 4 * s;
    main.page().drawLine({ start: { x: M, y: main.y }, end: { x: W - M, y: main.y }, thickness: 1.2, color: A });
    main.space(2 * s);
  } else {
    const center = hdr === 'center';
    const ps = photoOn ? (center ? 66 : 74) * s : 0;
    if (ps && center) { drawPhoto((W - ps) / 2, top - ps, ps); main.space(ps + 8 * s); }
    const fullW = main.w;
    if (ps && !center) { drawPhoto(main.x + main.w - ps, top - ps, ps); main.w -= ps + 14 * s; }
    main.para(name, { size: NAME, font: HF.bold, align: center ? 'center' : 'left', g: 1.15 });
    if (b.title) main.para(b.title, { size: base * 1.25, color: A, align: center ? 'center' : 'left' });
    main.space(2 * s);
    if (contacts.length && !(side && hdr !== 'left')) for (const l of joinWrap(F.reg, contacts.map((x) => safe(F, x)), base * 0.88, main.w)) main.para(l, { size: base * 0.88, color: GREY, align: center ? 'center' : 'left' });
    if (ps && !center) { main.y = Math.min(main.y, top - ps - 4 * s); main.w = fullW; }
  }

  // Two-column designs split under the header.
  if (T.layout === 'twocol') {
    const g = 20 * s, mw = (W - 2 * M - g) * 0.64;
    const y = main.y - 4 * s;
    narrow = column(M + mw + g, W - 2 * M - mw - g, y);
    narrow.narrow = true;
    main.w = mw; main.y = y;
    if (!dry) pages[0].drawLine({ start: { x: M + mw + g / 2, y: y - 6 * s }, end: { x: M + mw + g / 2, y: M }, thickness: 0.6, color: rgb(0.85, 0.86, 0.89) });
  }

  // ----- sections -----
  for (const sec of r.sections) {
    if (!sectionHasContent(sec)) continue;
    const toSide = narrow && (sec.column === 'side' || (sec.column !== 'main' && SIDE_TYPES.has(sec.type)));
    (toSide ? narrow : main).section(sec);
  }
  return pages.length;
}

/** The resume as a PDF: { blob, pages, scale }. */
export async function renderResume(r, { fit = r.design.fit } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.basics.name || 'Resume'} – Resume`); doc.setAuthor(r.basics.name || ''); doc.setCreator('EditSupreme');
  const d = r.design;
  const T = templateOf(d.template);
  const F = await pdfFonts(doc, d.font || T.font);
  const HF = d.headFont && d.headFont !== d.font ? await pdfFonts(doc, d.headFont) : F;
  let photoImg = null;
  if (r.basics.photo && d.photo !== 'none' && !T.plain) {
    const png = await photoPng(r.basics.photo, d.photo);
    if (png) photoImg = await doc.embedPng(png);
  }
  let s = 1;
  if (fit) {
    for (const k of [1, 0.96, 0.92, 0.88, 0.85, 0.82, 0.79, 0.76]) { s = k; if (layout(doc, F, HF, r, k, true, photoImg) === 1) break; }
  }
  const pages = layout(doc, F, HF, r, s, false, photoImg);
  return { blob: new Blob([await doc.save()], { type: 'application/pdf' }), pages, scale: s };
}
