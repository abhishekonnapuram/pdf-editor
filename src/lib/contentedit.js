// Low-level page content editing: really removes text glyphs and images from a page's
// content stream (instead of hiding them under a box), keeping everything else byte-identical.
import { PDFName, PDFArray, PDFDict, PDFRawStream, PDFNumber, PDFRef, PDFStream, decodePDFRawStream, PDFDocument } from '@cantoo/pdf-lib';
import { Font, FontNames, Encodings } from '@cantoo/pdf-lib/standard-fonts';

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

// ---------- tokenizer ----------
function* tokens(b) {
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; } // comment
    const start = i;
    if (c === 40) { // literal string
      const out = [];
      let depth = 1;
      i++;
      while (i < n && depth) {
        let ch = b[i++];
        if (ch === 92) {
          const e = b[i++];
          if (e === 110) out.push(10); else if (e === 114) out.push(13); else if (e === 116) out.push(9);
          else if (e === 98) out.push(8); else if (e === 102) out.push(12);
          else if (e === 13) { if (b[i] === 10) i++; }
          else if (e === 10) { /* line continuation */ }
          else if (e >= 48 && e <= 55) {
            let v = e - 48;
            for (let k = 0; k < 2 && b[i] >= 48 && b[i] <= 55; k++) v = v * 8 + (b[i++] - 48);
            out.push(v & 255);
          } else out.push(e);
          continue;
        }
        if (ch === 40) depth++;
        else if (ch === 41 && --depth === 0) break;
        out.push(ch);
      }
      yield { t: 'str', v: Uint8Array.from(out), start, end: i };
      continue;
    }
    if (c === 60 && b[i + 1] === 60) { i += 2; yield { t: '<<', start, end: i }; continue; }
    if (c === 62 && b[i + 1] === 62) { i += 2; yield { t: '>>', start, end: i }; continue; }
    if (c === 60) { // hex string
      i++;
      let hex = '';
      while (i < n && b[i] !== 62) { if (!WS.has(b[i])) hex += String.fromCharCode(b[i]); i++; }
      i++;
      if (hex.length % 2) hex += '0';
      const v = new Uint8Array(hex.length / 2);
      for (let k = 0; k < v.length; k++) v[k] = parseInt(hex.substr(k * 2, 2), 16);
      yield { t: 'str', v, start, end: i };
      continue;
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) { i++; yield { t: String.fromCharCode(c), start, end: i }; continue; }
    if (c === 47) { // name
      i++;
      while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
      yield { t: 'name', v: String.fromCharCode(...b.subarray(start + 1, i)), start, end: i };
      continue;
    }
    while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
    if (i === start) { i++; continue; } // stray delimiter
    const word = String.fromCharCode(...b.subarray(start, i));
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield { t: 'num', v: parseFloat(word), start, end: i };
    else yield { t: 'op', v: word, start, end: i };
    if (word === 'ID') {
      // Inline image data: skip binary until whitespace + EI + whitespace.
      i++;
      while (i < n - 2 && !(WS.has(b[i - 1]) && b[i] === 69 && b[i + 1] === 73 && (i + 2 >= n || WS.has(b[i + 2])))) i++;
      i += 2;
      yield { t: 'op', v: 'EI', start: i - 2, end: i };
    }
  }
}

// Parse into operations: [{op, args, start, end}] where start is the first operand's offset.
function parseOps(bytes) {
  const ops = [];
  const stack = [];
  let argStart = null;
  const arrays = [];
  let dictDepth = 0;
  for (const tk of tokens(bytes)) {
    if (argStart == null) argStart = tk.start;
    if (tk.t === '<<') { dictDepth++; continue; }
    if (tk.t === '>>') { dictDepth--; if (!dictDepth) (arrays.length ? arrays[arrays.length - 1] : stack).push({ t: 'dict' }); continue; }
    if (dictDepth) continue;
    if (tk.t === '[') { arrays.push([]); continue; }
    if (tk.t === ']') { const a = arrays.pop() || []; (arrays.length ? arrays[arrays.length - 1] : stack).push({ t: 'arr', v: a }); continue; }
    if (tk.t === 'op' && !arrays.length) {
      ops.push({ op: tk.v, args: stack.splice(0), start: argStart, end: tk.end });
      argStart = null;
      continue;
    }
    (arrays.length ? arrays[arrays.length - 1] : stack).push(tk);
  }
  return ops;
}

// ---------- matrices (PDF row-vector convention: p' = p × M) ----------
const mm = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
];
const ap = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

// ---------- fonts ----------
function lookup(ctx, v) { return v instanceof PDFRef ? ctx.lookup(v) : v; }

function fontInfo(doc, fontDict) {
  const ctx = doc.context;
  const get = (d, k) => lookup(ctx, d.get(PDFName.of(k)));
  const sub = get(fontDict, 'Subtype')?.asString?.() || String(get(fontDict, 'Subtype'));
  if (/Type0/.test(sub)) {
    const enc = String(get(fontDict, 'Encoding') || '');
    if (!/Identity-[HV]/.test(enc)) return null; // other CMaps have variable-length codes
    const desc = lookup(ctx, get(fontDict, 'DescendantFonts')?.get(0));
    if (!(desc instanceof PDFDict)) return null;
    const dw = get(desc, 'DW')?.asNumber?.() ?? 1000;
    const widths = new Map();
    const W = get(desc, 'W');
    if (W instanceof PDFArray) {
      const arr = W.asArray().map((x) => lookup(ctx, x));
      for (let k = 0; k < arr.length;) {
        const first = arr[k].asNumber();
        const next = arr[k + 1];
        if (next instanceof PDFArray) { next.asArray().forEach((w, j) => widths.set(first + j, lookup(ctx, w).asNumber())); k += 2; }
        else { const last = next.asNumber(), w = arr[k + 2].asNumber(); for (let c = first; c <= last; c++) widths.set(c, w); k += 3; }
      }
    }
    return { bytes: 2, width: (c) => widths.get(c) ?? dw };
  }
  if (/Type3/.test(sub)) return null;
  const W = get(fontDict, 'Widths');
  if (!(W instanceof PDFArray)) return standardFontInfo(ctx, fontDict);
  const first = get(fontDict, 'FirstChar')?.asNumber?.() ?? 0;
  const arr = W.asArray().map((x) => lookup(ctx, x)?.asNumber?.() ?? 0);
  const missing = lookup(ctx, lookup(ctx, get(fontDict, 'FontDescriptor'))?.get?.(PDFName.of('MissingWidth')))?.asNumber?.() ?? 0;
  return { bytes: 1, width: (c) => arr[c - first] ?? missing };
}

// The 14 standard PDF fonts carry no widths in the file; use their built-in metrics.
const STD_ALIASES = {
  arial: 'Helvetica', arialmt: 'Helvetica', 'arial,bold': 'Helvetica-Bold', 'arial-boldmt': 'Helvetica-Bold', 'arial-italicmt': 'Helvetica-Oblique', 'arial-bolditalicmt': 'Helvetica-BoldOblique',
  timesnewroman: 'Times-Roman', timesnewromanpsmt: 'Times-Roman', 'timesnewroman,bold': 'Times-Bold', 'timesnewromanps-boldmt': 'Times-Bold', 'timesnewromanps-italicmt': 'Times-Italic',
  couriernew: 'Courier', couriernewpsmt: 'Courier', 'couriernew,bold': 'Courier-Bold', 'couriernewps-boldmt': 'Courier-Bold'
};
let codeNames = null;
function winAnsiNames() {
  if (codeNames) return codeNames;
  codeNames = {};
  for (const enc of ['WinAnsi', 'Symbol', 'ZapfDingbats']) {
    const map = new Map();
    for (const [, v] of Object.entries(Encodings[enc].unicodeMappings)) map.set(v[0], v[1]);
    codeNames[enc] = map;
  }
  return codeNames;
}
function standardFontInfo(ctx, fontDict) {
  const raw = String(lookup(ctx, fontDict.get(PDFName.of('BaseFont'))) || '').replace(/^\//, '').replace(/^[A-Z]{6}\+/, '');
  const name = Object.values(FontNames).includes(raw) ? raw : STD_ALIASES[raw.toLowerCase()];
  if (!name) return null;
  let metrics;
  try { metrics = Font.load(name); } catch { return null; }
  const names = winAnsiNames();
  const base = new Map(names[name === 'Symbol' ? 'Symbol' : name === 'ZapfDingbats' ? 'ZapfDingbats' : 'WinAnsi']);
  const enc = lookup(ctx, fontDict.get(PDFName.of('Encoding')));
  if (enc instanceof PDFDict) {
    const diff = lookup(ctx, enc.get(PDFName.of('Differences')));
    if (diff instanceof PDFArray) {
      let code = 0;
      for (const x of diff.asArray().map((v) => lookup(ctx, v))) {
        if (x instanceof PDFNumber) code = x.asNumber();
        else base.set(code++, String(x).replace(/^\//, ''));
      }
    }
  }
  return { bytes: 1, width: (c) => { const g = base.get(c); return (g && metrics.getWidthOfGlyph(g)) || (c === 32 ? 250 : 500); } };
}

function pageResources(page) {
  return page.node.Resources() || null;
}

function decodeContents(doc, page) {
  const ctx = doc.context;
  let c = lookup(ctx, page.node.get(PDFName.of('Contents')));
  const parts = c instanceof PDFArray ? c.asArray().map((x) => lookup(ctx, x)) : c ? [c] : [];
  const chunks = parts.map((s) => (s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s instanceof PDFStream ? s.getContents() : new Uint8Array()));
  const total = chunks.reduce((a, x) => a + x.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const ch of chunks) { out.set(ch, o); o += ch.length; out[o++] = 10; }
  return out;
}

function setContents(doc, page, bytes) {
  const stream = doc.context.flateStream(bytes);
  page.node.set(PDFName.of('Contents'), doc.context.register(stream));
}

const hex = (codes, nb) => '<' + codes.map((c) => c.toString(16).padStart(nb * 2, '0')).join('') + '>';
const fmt = (x) => (Math.abs(x) < 1e-6 ? '0' : (+x.toFixed(3)).toString());

/**
 * Remove every glyph whose centre lies inside one of `rects` (PDF user space {x0,y0,x1,y1}).
 * Removed glyphs are replaced by equal kerning so the rest of the line stays exactly where it was.
 * Returns the number of glyphs removed.
 */
export function removeTextInRects(doc, pageIndex, rects) {
  if (!rects.length) return 0;
  const page = doc.getPage(pageIndex);
  const res = pageResources(page);
  const fonts = res && lookup(doc.context, res.get(PDFName.of('Font')));
  const bytes = decodeContents(doc, page);
  const ops = parseOps(bytes);
  const inside = ([x, y]) => rects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

  const fontCache = new Map();
  const st = { ctm: [1, 0, 0, 1, 0, 0], Tc: 0, Tw: 0, Th: 1, TL: 0, size: 0, rise: 0, font: null };
  const stack = [];
  let Tm = [1, 0, 0, 1, 0, 0], Tlm = Tm;
  const edits = []; // {start, end, text}
  let removed = 0;

  const showString = (strBytes, collect) => {
    const f = st.font;
    const nb = f.bytes;
    for (let k = 0; k + nb <= strBytes.length; k += nb) {
      const code = nb === 2 ? (strBytes[k] << 8) | strBytes[k + 1] : strBytes[k];
      const w0 = f.width(code) / 1000;
      const trm = mm([st.size * st.Th, 0, 0, st.size, 0, st.rise], mm(Tm, st.ctm));
      const centre = ap(trm, w0 / 2, 0.3);
      const adv = (w0 * st.size + st.Tc + (nb === 1 && code === 32 ? st.Tw : 0)) * st.Th;
      collect(code, inside(centre), adv);
      Tm = mm([1, 0, 0, 1, adv, 0], Tm);
    }
  };

  const rewriteShow = (items, op) => {
    // items: array of {str: Uint8Array} | {num}
    if (!st.font || !st.size) return null;
    const parts = [];
    let run = [];
    let any = false;
    const flush = () => { if (run.length) { parts.push(hex(run, st.font.bytes)); run = []; } };
    for (const it of items) {
      if (it.num != null) {
        flush();
        parts.push(fmt(it.num));
        Tm = mm([1, 0, 0, 1, (-it.num / 1000) * st.size * st.Th, 0], Tm);
        continue;
      }
      showString(it.str, (code, gone, adv) => {
        if (gone) { flush(); parts.push(fmt(-(adv / st.Th / st.size) * 1000)); any = true; removed++; }
        else run.push(code);
      });
    }
    flush();
    return any ? `[${parts.join(' ')}] TJ` : null;
  };

  for (const o of ops) {
    const a = o.args;
    const num = (k) => a[k]?.v ?? 0;
    switch (o.op) {
      case 'q': stack.push({ ...st, ctm: st.ctm }); break;
      case 'Q': Object.assign(st, stack.pop() || {}); break;
      case 'cm': st.ctm = mm([num(0), num(1), num(2), num(3), num(4), num(5)], st.ctm); break;
      case 'BT': Tm = Tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'Tc': st.Tc = num(0); break;
      case 'Tw': st.Tw = num(0); break;
      case 'Tz': st.Th = num(0) / 100; break;
      case 'TL': st.TL = num(0); break;
      case 'Ts': st.rise = num(0); break;
      case 'Tf': {
        const name = a[0]?.v;
        st.size = num(1);
        if (!fontCache.has(name)) {
          const fd = fonts && lookup(doc.context, fonts.get(PDFName.of(name)));
          fontCache.set(name, fd instanceof PDFDict ? fontInfo(doc, fd) : null);
        }
        st.font = fontCache.get(name);
        break;
      }
      case 'Td': Tlm = mm([1, 0, 0, 1, num(0), num(1)], Tlm); Tm = Tlm; break;
      case 'TD': st.TL = -num(1); Tlm = mm([1, 0, 0, 1, num(0), num(1)], Tlm); Tm = Tlm; break;
      case 'Tm': Tm = Tlm = [num(0), num(1), num(2), num(3), num(4), num(5)]; break;
      case 'T*': Tlm = mm([1, 0, 0, 1, 0, -st.TL], Tlm); Tm = Tlm; break;
      case 'Tj': case 'TJ': case "'": case '"': {
        let prefix = '';
        if (o.op === '"') { st.Tw = num(0); st.Tc = num(1); prefix = `${fmt(st.Tw)} Tw ${fmt(st.Tc)} Tc `; }
        if (o.op === "'" || o.op === '"') { Tlm = mm([1, 0, 0, 1, 0, -st.TL], Tlm); Tm = Tlm; prefix += 'T* '; }
        const strArg = o.op === 'TJ' ? a[0] : a[a.length - 1];
        if (!strArg) break;
        const items = o.op === 'TJ' ? (strArg.v || []).map((x) => (x.t === 'num' ? { num: x.v } : { str: x.v })) : [{ str: strArg.v }];
        if (!st.font) {
          // Unknown font metrics: can't keep positions exact, so leave this text alone.
          break;
        }
        const out = rewriteShow(items, o.op);
        if (out) edits.push({ start: o.start, end: o.end, text: prefix + out });
        break;
      }
      default: break;
    }
  }
  if (!edits.length) return 0;
  const enc = new TextEncoder();
  const pieces = [];
  let last = 0;
  for (const e of edits) { pieces.push(bytes.subarray(last, e.start), enc.encode(e.text)); last = e.end; }
  pieces.push(bytes.subarray(last));
  const out = new Uint8Array(pieces.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const pc of pieces) { out.set(pc, p); p += pc.length; }
  setContents(doc, page, out);
  return removed;
}

/**
 * Stop a named image XObject from being drawn on this page (only this page) and drop its data
 * from the page. Returns false if it can't be done safely (e.g. drawn more than once here).
 */
export function removeImageOnPage(doc, pageIndex, name, occurrences = 1) {
  if (!name || occurrences !== 1) return false;
  const page = doc.getPage(pageIndex);
  const bytes = decodeContents(doc, page);
  const ops = parseOps(bytes);
  const hits = ops.filter((o) => o.op === 'Do' && o.args[0]?.v === name);
  if (hits.length !== 1) return false;
  const res = pageResources(page);
  const xo = res && lookup(doc.context, res.get(PDFName.of('XObject')));
  const target = xo && lookup(doc.context, xo.get(PDFName.of(name)));
  if (!(target instanceof PDFRawStream) || String(target.dict.get(PDFName.of('Subtype'))) !== '/Image') return false;
  const h = hits[0];
  const out = new Uint8Array(bytes.length - (h.end - h.start));
  out.set(bytes.subarray(0, h.start));
  out.set(bytes.subarray(h.end), h.start);
  setContents(doc, page, out);
  return true;
}

const isStream = (o) => o instanceof PDFRawStream || o instanceof PDFStream;
const subtypeOf = (o) => String(o.dict.get(PDFName.of('Subtype')));
const streamBytes = (s) => (s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents());
const cut = (bytes, a, b) => { const out = new Uint8Array(bytes.length - (b - a)); out.set(bytes.subarray(0, a)); out.set(bytes.subarray(b), a); return out; };

// Copy a resource dictionary with one XObject entry pointing somewhere else (copy-on-write, so
// resources shared with other pages or objects are never changed).
function withXObject(doc, res, name, ref) {
  const ctx = doc.context;
  const copy = res ? res.clone(ctx) : ctx.obj({});
  const xo = lookup(ctx, copy.get(PDFName.of('XObject')));
  const xcopy = xo instanceof PDFDict ? xo.clone(ctx) : ctx.obj({});
  xcopy.set(PDFName.of(name), ref);
  copy.set(PDFName.of('XObject'), xcopy);
  return copy;
}

// Walk a content stream (and the forms it draws, in drawing order) and cut out image draw number st.target.
// Returns {bytes, res} with the changed content/resources, or null if it was not in this stream.
function cutImage(doc, bytes, res, st, depth = 0) {
  const ctx = doc.context;
  const xo = res && lookup(ctx, res.get(PDFName.of('XObject')));
  const ops = parseOps(bytes);
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.op === 'BI') {
      const ei = ops.findIndex((x, j) => j > i && x.op === 'EI');
      if (st.n++ === st.target && ei > 0) return { bytes: cut(bytes, o.start, ops[ei].end), res };
      continue;
    }
    if (o.op !== 'Do') continue;
    const name = o.args[0]?.v;
    const obj = xo && lookup(ctx, xo.get(PDFName.of(name)));
    if (!isStream(obj)) continue;
    const sub = subtypeOf(obj);
    if (sub === '/Image') {
      if (st.n++ === st.target) return { bytes: cut(bytes, o.start, o.end), res };
    } else if (sub === '/Form' && depth < 12) {
      const fres = lookup(ctx, obj.dict.get(PDFName.of('Resources'))) || res;
      const inner = cutImage(doc, streamBytes(obj), fres, st, depth + 1);
      if (inner) {
        // Give this page its own edited copy of the form; other users of the form stay untouched.
        const dict = {};
        for (const [k, v] of obj.dict.entries()) if (!['/Length', '/Filter', '/DecodeParms'].includes(String(k))) dict[String(k).slice(1)] = v;
        const copy = ctx.flateStream(inner.bytes, dict);
        if (inner.res) copy.dict.set(PDFName.of('Resources'), inner.res);
        return { bytes, res: withXObject(doc, res, name, ctx.register(copy)) };
      }
    }
    if (st.n > st.target && st.target >= 0) return null;
  }
  return null;
}

/** Number of image draws on the page, counted the way pdf.js reports them (forms included). */
export function countImageDraws(doc, pageIndex) {
  const page = doc.getPage(pageIndex);
  const st = { n: 0, target: -1 };
  cutImage(doc, decodeContents(doc, page), pageResources(page), st);
  return st.n;
}

/**
 * Remove image draw number `seq` (pdf.js draw order, including images inside form XObjects and
 * inline images) from one page only. Returns true when it was removed.
 */
export function removeNthImage(doc, pageIndex, seq) {
  const page = doc.getPage(pageIndex);
  const res = pageResources(page);
  const r = cutImage(doc, decodeContents(doc, page), res, { n: 0, target: seq });
  if (!r) return false;
  setContents(doc, page, r.bytes);
  if (r.res !== res) page.node.set(PDFName.of('Resources'), doc.context.register(r.res));
  return true;
}

// pdf.js names images on a page like "img_p0_1"; map them to XObject resource names by draw order.
export function imageNamesInOrder(doc, pageIndex) {
  const page = doc.getPage(pageIndex);
  const res = pageResources(page);
  const xo = res && lookup(doc.context, res.get(PDFName.of('XObject')));
  const ops = parseOps(decodeContents(doc, page));
  const names = [];
  for (const o of ops) {
    if (o.op === 'BI') names.push(null);
    if (o.op !== 'Do') continue;
    const n = o.args[0]?.v;
    const obj = xo && lookup(doc.context, xo.get(PDFName.of(n)));
    if (obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of('Subtype'))) === '/Image') names.push(n);
    else if (obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of('Subtype'))) === '/Form') names.push('form:' + n);
  }
  return names;
}

export { PDFDocument, PDFNumber };
