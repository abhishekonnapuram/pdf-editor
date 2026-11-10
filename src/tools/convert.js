// Conversions between PDF and Office/HTML/Markdown/Text formats, all done in the browser.
import { PDFDocument } from '@cantoo/pdf-lib';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, PageBreak } from 'docx';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import mammoth from 'mammoth/mammoth.browser.min.js';
import {
  readBytes, pdfBlob, stem, openPdfjs, renderPage, canvasToBlob, blobToBytes, textLines, extractPageText
} from '../lib/core.js';
import { pageImages } from '../lib/pdfimages.js';

const PDF = '.pdf,application/pdf';
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 11; };

async function openWithPassword(f) {
  try { return await openPdfjs(await readBytes(f)); }
  catch (e) {
    if (e.name === 'PasswordException') throw new Error(`${f.name} is password-protected. Unlock it first with Unlock PDF.`);
    throw e;
  }
}

// Paragraph blocks from text lines: merges wrapped lines, tags headings and list items.
function blocksFromLines(lines, bodySize) {
  const blocks = [];
  for (const ln of lines) {
    const ratio = ln.size / bodySize;
    const level = ratio >= 1.8 ? 1 : ratio >= 1.35 ? 2 : ratio >= 1.15 && ln.text.length < 90 ? 3 : 0;
    const bullet = /^[•◦▪●○■\-–*]\s+/.test(ln.text);
    const numbered = /^\d{1,3}[.)]\s+/.test(ln.text);
    const prev = blocks[blocks.length - 1];
    const gap = prev ? ln.y - prev.lastY : Infinity;
    // A wrapped line continues the previous paragraph when it is close below it and the same size.
    const row = ln.cells?.length >= 2 ? ln.cells : null;
    if (row) { blocks.push({ y: ln.y, lastY: ln.y, size: ln.size, text: ln.text, cells: row, level: 0, kind: 'text' }); continue; }
    if (prev && !prev.cells && !level && !prev.level && !bullet && !numbered && gap < ln.size * 1.6 && Math.abs(ln.size - prev.size) < 1.2) {
      prev.text = prev.text.endsWith('-') ? prev.text.slice(0, -1) + ln.text : prev.text + ' ' + ln.text;
      prev.lastY = ln.y;
      continue;
    }
    blocks.push({ y: ln.y, lastY: ln.y, size: ln.size, text: bullet ? ln.text.replace(/^[•◦▪●○■\-–*]\s+/, '') : ln.text, level, bullet, numbered, kind: 'text' });
  }
  return blocks;
}

async function docStats(doc) {
  const sizes = [];
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
    const { lines } = await extractPageText(doc, i);
    lines.forEach((l) => { for (let k = 0; k < Math.min(l.text.length, 200); k += 20) sizes.push(l.size); });
  }
  return { bodySize: median(sizes) };
}

// ---------- HTML -> PDF (shared by Word, Excel and HTML tools) ----------
const PAGE_PX = { a4: [794, 1123], letter: [816, 1056], legal: [816, 1344] };

async function htmlToPdf(html, { size = 'a4', landscape = false, margin = 48, css = '' } = {}, ctx) {
  let [W, H] = PAGE_PX[size] || PAGE_PX.a4;
  if (landscape) [W, H] = [H, W];
  const contentW = W - 2 * margin, contentH = H - 2 * margin;
  // Sandboxed frame without scripts: the document's own scripts and event handlers never run.
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: contentW + 'px', height: contentH + 'px', border: '0' });
  document.body.append(frame);
  try {
    const base = `<style>html,body{margin:0;padding:0;background:#fff;color:#111;font:14px/1.5 Calibri,Carlito,Arial,sans-serif;width:${contentW}px}
      img{max-width:100%;height:auto} table{border-collapse:collapse;max-width:100%} td,th{border:1px solid #bbb;padding:3px 6px;vertical-align:top}
      h1{font-size:26px}h2{font-size:21px}h3{font-size:17px} p{margin:0 0 .7em} ${css}</style>`;
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`;
    await new Promise((r) => { frame.onload = r; });
    const d = frame.contentDocument;
    await Promise.all([...d.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    // Push blocks that would be cut by a page boundary onto the next page.
    const blocks = [...d.body.children];
    for (const b of blocks) {
      const top = b.getBoundingClientRect().top + d.defaultView.scrollY;
      const bh = b.getBoundingClientRect().height;
      const pageEnd = Math.ceil((top + 1) / contentH) * contentH;
      if (bh < contentH * 0.9 && top + bh > pageEnd) b.style.marginTop = (parseFloat(getComputedStyle(b).marginTop) || 0) + (pageEnd - top) + 'px';
    }
    const totalH = Math.max(d.body.scrollHeight, 10);
    frame.style.height = totalH + 'px';
    ctx?.progress?.(0.4, 'Rendering pages…');
    const canvas = await html2canvas(d.body, { scale: 2, backgroundColor: '#fff', windowWidth: contentW, width: contentW, height: totalH, useCORS: true, logging: false });
    const pdf = await PDFDocument.create();
    const ptW = W * 0.75, ptH = H * 0.75, s = 2;
    const pages = Math.max(1, Math.ceil(totalH / contentH - 0.02));
    for (let i = 0; i < pages; i++) {
      ctx?.progress?.(0.5 + 0.5 * (i / pages), `Page ${i + 1} of ${pages}`);
      const slice = document.createElement('canvas');
      slice.width = contentW * s;
      slice.height = Math.min(contentH * s, canvas.height - i * contentH * s);
      if (slice.height <= 0) break;
      const sx = slice.getContext('2d');
      sx.fillStyle = '#fff'; sx.fillRect(0, 0, slice.width, slice.height);
      sx.drawImage(canvas, 0, -i * contentH * s);
      const img = await pdf.embedJpg(await blobToBytes(await canvasToBlob(slice, 'image/jpeg', 0.9)));
      const p = pdf.addPage([ptW, ptH]);
      const wPt = contentW * 0.75, hPt = (slice.height / s) * 0.75;
      p.drawImage(img, { x: margin * 0.75, y: ptH - margin * 0.75 - hPt, width: wPt, height: hPt });
    }
    return pdf.save();
  } finally {
    frame.remove();
  }
}

function printHtml(html, css = '') {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12pt/1.5 Calibri,Arial,sans-serif}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:3px 6px}${css}</style></head><body>${html}</body></html>`;
  document.body.append(frame);
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60_000); };
}

const pageOpts = [
  { key: 'size', label: 'Page size', type: 'select', default: 'a4', options: [['a4', 'A4'], ['letter', 'US Letter'], ['legal', 'US Legal']] },
  { key: 'landscape', label: 'Landscape', type: 'checkbox', default: false },
  { key: 'margin', label: 'Margin', type: 'seg', default: '48', options: [['0', 'None'], ['24', 'Small'], ['48', 'Normal'], ['80', 'Wide']] }
];
const methodOpt = { key: 'method', label: 'Output', type: 'seg', default: 'file', options: [['file', 'PDF file'], ['print', 'Print to PDF']], hint: '"PDF file" downloads directly. "Print to PDF" uses your device\'s print dialog and keeps text selectable.' };

async function finishHtml(name, html, o, ctx, css) {
  if (o.method === 'print') {
    printHtml(html, css);
    return { outputs: [], note: 'The print dialog is open. Choose "Save as PDF" as the printer.' };
  }
  const bytes = await htmlToPdf(html, { size: o.size, landscape: o.landscape, margin: +o.margin, css }, ctx);
  return [{ name: name + '.pdf', blob: pdfBlob(bytes) }];
}

// ---------- PowerPoint -> PDF ----------
const EMU = 12700;
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PNS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function pptxToPdf(bytes, ctx) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = async (p) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async('text'), 'application/xml') : null; };
  const rels = async (p) => {
    const dir = p.substring(0, p.lastIndexOf('/'));
    const doc = await xml(`${dir}/_rels/${p.substring(p.lastIndexOf('/') + 1)}.rels`);
    const map = {};
    if (doc) for (const r of doc.getElementsByTagName('Relationship')) map[r.getAttribute('Id')] = resolve(dir, r.getAttribute('Target'));
    return map;
  };
  const resolve = (dir, t) => { const parts = (t.startsWith('/') ? t.slice(1) : dir + '/' + t).split('/'); const out = []; for (const s of parts) s === '..' ? out.pop() : out.push(s); return out.join('/'); };
  const pres = await xml('ppt/presentation.xml');
  if (!pres) throw new Error('This is not a .pptx file. Older .ppt files must be saved as .pptx first.');
  const sz = pres.getElementsByTagNameNS(PNS, 'sldSz')[0];
  const W = +sz.getAttribute('cx') / EMU, H = +sz.getAttribute('cy') / EMU;
  const presRels = await rels('ppt/presentation.xml');
  const ids = [...pres.getElementsByTagNameNS(PNS, 'sldId')].map((s) => presRels[s.getAttributeNS(RNS, 'id')]);
  const pdf = await PDFDocument.create();
  const S = 2;
  const xfrmOf = (el) => {
    const x = el.getElementsByTagNameNS(A, 'xfrm')[0];
    if (!x) return null;
    const off = x.getElementsByTagNameNS(A, 'off')[0], ext = x.getElementsByTagNameNS(A, 'ext')[0];
    if (!off || !ext) return null;
    return { x: +off.getAttribute('x') / EMU, y: +off.getAttribute('y') / EMU, w: +ext.getAttribute('cx') / EMU, h: +ext.getAttribute('cy') / EMU };
  };
  const phKey = (sp) => { const ph = sp.getElementsByTagNameNS(PNS, 'ph')[0]; return ph ? (ph.getAttribute('type') || 'body') + ':' + (ph.getAttribute('idx') || '') : null; };
  const colorOf = (el) => { const c = el && el.getElementsByTagNameNS(A, 'srgbClr')[0]; return c ? '#' + c.getAttribute('val') : null; };

  for (let si = 0; si < ids.length; si++) {
    ctx.progress(si / ids.length, `Slide ${si + 1} of ${ids.length}`);
    const path = ids[si];
    const slide = await xml(path);
    const srels = await rels(path);
    const layoutPath = Object.values(srels).find((p) => /slideLayouts\//.test(p));
    const layout = layoutPath ? await xml(layoutPath) : null;
    const lrels = layoutPath ? await rels(layoutPath) : {};
    const masterPath = Object.values(lrels).find((p) => /slideMasters\//.test(p));
    const master = masterPath ? await xml(masterPath) : null;
    const findPh = (key) => {
      if (!key) return null;
      const [type, idx] = key.split(':');
      for (const d of [layout, master]) {
        if (!d) continue;
        for (const sp of d.getElementsByTagNameNS(PNS, 'sp')) {
          const k = phKey(sp);
          if (!k) continue;
          const [t2, i2] = k.split(':');
          if ((idx && i2 === idx) || t2 === type || (type === 'ctrTitle' && t2 === 'title') || (type === 'subTitle' && t2 === 'body')) { const x = xfrmOf(sp); if (x) return x; }
        }
      }
      return null;
    };
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    const g = c.getContext('2d');
    g.scale(S, S);
    const bg = slide.getElementsByTagNameNS(PNS, 'bg')[0] || (layout && layout.getElementsByTagNameNS(PNS, 'bg')[0]) || (master && master.getElementsByTagNameNS(PNS, 'bg')[0]);
    g.fillStyle = colorOf(bg) || '#ffffff';
    g.fillRect(0, 0, W, H);
    const tree = slide.getElementsByTagNameNS(PNS, 'spTree')[0];
    for (const el of tree ? tree.children : []) {
      const local = el.localName;
      if (local === 'pic') {
        const box = xfrmOf(el);
        const blip = el.getElementsByTagNameNS(A, 'blip')[0];
        const target = blip && srels[blip.getAttributeNS(RNS, 'embed')];
        const file = target && zip.file(target);
        if (box && file) {
          try {
            const ext = target.split('.').pop().toLowerCase();
            const blob = new Blob([await file.async('uint8array')], { type: ext === 'svg' ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext) });
            const bmp = await createImageBitmap(blob);
            g.drawImage(bmp, box.x, box.y, box.w, box.h);
          } catch { /* unsupported picture format (e.g. EMF) */ }
        }
      } else if (local === 'sp') {
        const key = phKey(el);
        const box = xfrmOf(el) || findPh(key);
        if (!box) continue;
        const spPr = el.getElementsByTagNameNS(PNS, 'spPr')[0];
        const fill = spPr && [...spPr.children].find((n) => n.localName === 'solidFill');
        if (fill) { g.fillStyle = colorOf(fill) || '#ddd'; g.fillRect(box.x, box.y, box.w, box.h); }
        const body = el.getElementsByTagNameNS(PNS, 'txBody')[0];
        if (!body) continue;
        const isTitle = key && /title|ctrTitle/i.test(key);
        let y = box.y + 6;
        const bodyPr = body.getElementsByTagNameNS(A, 'bodyPr')[0];
        const paras = [...body.getElementsByTagNameNS(A, 'p')];
        const lines = [];
        for (const p of paras) {
          const runs = [...p.getElementsByTagNameNS(A, 'r')];
          const text = runs.map((r) => r.getElementsByTagNameNS(A, 't')[0]?.textContent || '').join('');
          const rPr = runs[0]?.getElementsByTagNameNS(A, 'rPr')[0];
          const size = rPr?.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : isTitle ? 36 : 18;
          const bold = rPr?.getAttribute('b') === '1' || isTitle;
          const color = colorOf(rPr) || '#222222';
          const algn = p.getElementsByTagNameNS(A, 'pPr')[0]?.getAttribute('algn');
          const lvl = +(p.getElementsByTagNameNS(A, 'pPr')[0]?.getAttribute('lvl') || 0);
          const bullet = !isTitle && key && /body|:\d/.test(key) && text && !p.getElementsByTagNameNS(A, 'buNone')[0];
          lines.push({ text: (bullet ? '•  ' : '') + text, size, bold, color, algn: algn || (key && /ctrTitle|subTitle/.test(key) ? 'ctr' : 'l'), indent: lvl * 24 });
        }
        const total = lines.reduce((s, l) => s + l.size * 1.25, 0);
        if (bodyPr?.getAttribute('anchor') === 'ctr' || isTitle) y = box.y + Math.max(4, (box.h - total) / 2);
        for (const l of lines) {
          g.font = `${l.bold ? 'bold ' : ''}${l.size}px Calibri, Carlito, Arial, sans-serif`;
          g.fillStyle = l.color;
          g.textBaseline = 'top';
          const maxW = box.w - 12 - l.indent;
          for (const row of wrap(g, l.text, maxW)) {
            const tw = g.measureText(row).width;
            const x = l.algn === 'ctr' ? box.x + (box.w - tw) / 2 : l.algn === 'r' ? box.x + box.w - 6 - tw : box.x + 6 + l.indent;
            g.fillText(row, x, y);
            y += l.size * 1.2;
          }
          if (!l.text) y += l.size * 0.6;
        }
      }
    }
    const img = await pdf.embedJpg(await blobToBytes(await canvasToBlob(c, 'image/jpeg', 0.9)));
    pdf.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return pdf.save();
}

function wrap(g, text, maxW) {
  if (!text) return [''];
  const words = text.split(/(\s+)/);
  const rows = [];
  let cur = '';
  for (const w of words) {
    if (g.measureText(cur + w).width > maxW && cur.trim()) { rows.push(cur.trimEnd()); cur = w.trimStart(); }
    else cur += w;
  }
  if (cur) rows.push(cur);
  return rows;
}

// ---------- Excel helpers ----------
function rowsToCells(lines) {
  // Split each visual line into cells at wide gaps, then align cells to shared column starts.
  const rows = lines.map((ln) => {
    const cells = [];
    let cur = null;
    for (const it of ln.items) {
      if (cur && it.x - (cur.x + cur.w) < it.size * 0.9) { cur.str += (it.x - (cur.x + cur.w) > it.size * 0.2 ? ' ' : '') + it.str; cur.w = it.x + it.w - cur.x; }
      else { cur = { x: it.x, w: it.w, str: it.str, size: it.size }; cells.push(cur); }
    }
    return cells;
  });
  const starts = [];
  for (const r of rows) for (const c of r) if (!starts.some((s) => Math.abs(s - c.x) < 10)) starts.push(c.x);
  starts.sort((a, b) => a - b);
  return rows.map((r) => {
    const out = [];
    for (const c of r) {
      let col = 0, best = Infinity;
      starts.forEach((s, i) => { const d = Math.abs(s - c.x); if (d < best) { best = d; col = i; } });
      while (out[col] != null) col++;
      const t = c.str.trim();
      const num = t.replace(/[,\s]/g, '');
      out[col] = /^-?\(?\$?€?£?₹?\d+(\.\d+)?\)?%?$/.test(num) && num.length < 16 && !/^0\d/.test(num) ? Number(num.replace(/[()$€£₹%]/g, '')) * (/^\(.*\)$/.test(num) ? -1 : 1) / (num.endsWith('%') ? 100 : 1) : t;
    }
    return Array.from(out, (v) => v ?? '');
  });
}

// ---------- tools ----------
export const tools = {
  'pdf-to-word': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to Word',
    options: [
      { key: 'layout', label: 'Conversion', type: 'seg', default: 'flow', options: [['flow', 'Editable text'], ['exact', 'Exact look']], hint: 'Editable text rebuilds headings, paragraphs, lists and images. Exact look puts each page in as a picture.' },
      { key: 'images', label: 'Include images', type: 'checkbox', default: true, showIf: (v) => v.layout === 'flow' }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const doc = await openWithPassword(f);
        const { bodySize } = await docStats(doc);
        const children = [];
        let pageW = 595, pageH = 842;
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: page ${i} of ${doc.numPages}`);
          const { page, vp, lines } = await extractPageText(doc, i);
          if (i === 1) { pageW = vp.width; pageH = vp.height; }
          if (i > 1) children.push(new Paragraph({ children: [new PageBreak()] }));
          if (o.layout === 'exact') {
            const c = await renderPage(page, 1.5);
            children.push(new Paragraph({ children: [new ImageRun({ type: 'jpg', data: await blobToBytes(await canvasToBlob(c, 'image/jpeg', 0.88)), transformation: { width: vp.width * 0.86 * (96 / 72), height: vp.height * 0.86 * (96 / 72) } })] }));
            continue;
          }
          const blocks = blocksFromLines(lines, bodySize);
          if (o.images) {
            for (const im of await pageImages(page, vp)) {
              if (im.box.w < 24 || im.box.h < 24) continue;
              const cv = await im.getCanvas();
              if (!cv) continue;
              const maxW = (pageW - 144) * (96 / 72);
              const w = Math.min(maxW, im.box.w * (96 / 72)), hh = w * (im.box.h / im.box.w);
              blocks.push({ kind: 'image', y: im.box.y, data: await blobToBytes(await canvasToBlob(cv, 'image/png')), w, h: hh });
            }
          }
          blocks.sort((a, b) => a.y - b.y);
          for (const b of blocks) {
            if (b.kind === 'image') { children.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: b.data, transformation: { width: b.w, height: b.h } })] })); continue; }
            const run = new TextRun({ text: b.text, size: Math.round(Math.min(Math.max(b.size, 7), 48) * 2) });
            if (b.level) children.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level], children: [new TextRun({ text: b.text })] }));
            else if (b.bullet) children.push(new Paragraph({ bullet: { level: 0 }, children: [run] }));
            else children.push(new Paragraph({ children: [run], spacing: { after: 120 } }));
          }
          page.cleanup();
        }
        const twip = (pt) => Math.round(pt * 20);
        const margin = o.layout === 'exact' ? twip(28) : twip(72);
        const d = new Document({ creator: 'EditSupreme', sections: [{ properties: { page: { size: { width: twip(pageW), height: twip(pageH) }, margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children }] });
        outputs.push({ name: stem(f.name) + '.docx', blob: await Packer.toBlob(d) });
        doc.destroy();
      }
      return outputs;
    }
  },

  'pdf-to-ppt': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to PowerPoint',
    options: [
      { key: 'mode', label: 'Slides', type: 'seg', default: 'image', options: [['image', 'Exact look'], ['editable', 'Editable text']], hint: 'Exact look keeps every page pixel-perfect. Editable text rebuilds text boxes and pictures you can change in PowerPoint.' },
      { key: 'notes', label: 'Put page text in speaker notes', type: 'checkbox', default: true }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const doc = await openWithPassword(f);
        const pptx = new PptxGenJS();
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        pptx.defineLayout({ name: 'PDF', width: first.width / 72, height: first.height / 72 });
        pptx.layout = 'PDF';
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: slide ${i} of ${doc.numPages}`);
          const { page, vp, lines } = await extractPageText(doc, i);
          const slide = pptx.addSlide();
          const sx = (first.width / vp.width) / 72;
          if (o.mode === 'image') {
            const c = await renderPage(page, 2);
            slide.addImage({ data: c.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w: first.width / 72, h: first.height / 72 });
          } else {
            for (const im of await pageImages(page, vp)) {
              const cv = await im.getCanvas();
              if (cv) slide.addImage({ data: cv.toDataURL('image/png'), x: im.box.x * sx, y: im.box.y * sx, w: im.box.w * sx, h: im.box.h * sx });
            }
            for (const ln of lines) {
              const w = Math.max(...ln.items.map((it) => it.x + it.w)) - ln.x;
              slide.addText(ln.text, { x: ln.x * sx, y: (ln.y - ln.size) * sx, w: Math.max(w * sx * 1.08, 0.3), h: ln.size * 1.35 * sx, fontSize: ln.size, margin: 0, fontFace: 'Calibri', color: '222222', valign: 'top' });
            }
          }
          if (o.notes) slide.addNotes(lines.map((l) => l.text).join('\n'));
          page.cleanup();
        }
        const blob = await pptx.write({ outputType: 'blob' });
        outputs.push({ name: stem(f.name) + '.pptx', blob });
        doc.destroy();
      }
      return outputs;
    }
  },

  'pdf-to-excel': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to Excel',
    options: [
      { key: 'sheets', label: 'Sheets', type: 'seg', default: 'page', options: [['page', 'One sheet per page'], ['one', 'All in one sheet']] },
      { key: 'format', label: 'Format', type: 'seg', default: 'xlsx', options: [['xlsx', 'XLSX'], ['csv', 'CSV']] }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const doc = await openWithPassword(f);
        const wb = XLSX.utils.book_new();
        let all = [];
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: page ${i}`);
          const { lines } = await extractPageText(doc, i);
          const rows = rowsToCells(lines);
          if (o.sheets === 'page' && o.format === 'xlsx') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(no text on this page)']]), `Page ${i}`);
          else { all = all.concat(rows); if (i < doc.numPages) all.push([]); }
        }
        if (o.format === 'csv') {
          const ws = XLSX.utils.aoa_to_sheet(all);
          outputs.push({ name: stem(f.name) + '.csv', blob: new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' }) });
        } else {
          if (o.sheets === 'one') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'PDF');
          const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
          outputs.push({ name: stem(f.name) + '.xlsx', blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) });
        }
        doc.destroy();
      }
      return outputs;
    }
  },

  'word-to-pdf': {
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple: true, label: 'Select Word files (.docx)', runLabel: 'Convert to PDF',
    options: [methodOpt, ...pageOpts],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        if (!/\.docx$/i.test(f.name)) throw new Error(`${f.name}: only .docx is supported. Open old .doc files in Word or LibreOffice and save as .docx.`);
        ctx.progress(0.1, `Reading ${f.name}`);
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        const res = await finishHtml(stem(f.name), value, o, ctx);
        if (!Array.isArray(res)) return res;
        outputs.push(...res);
      }
      return outputs;
    }
  },

  'ppt-to-pdf': {
    accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', multiple: true, label: 'Select PowerPoint files (.pptx)', runLabel: 'Convert to PDF',
    notice: 'Slides are rebuilt with their text, pictures and colours. Charts, SmartArt and special effects are simplified.',
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) outputs.push({ name: stem(f.name) + '.pdf', blob: pdfBlob(await pptxToPdf(await readBytes(f), ctx)) });
      return outputs;
    }
  },

  'excel-to-pdf': {
    accept: '.xlsx,.xls,.csv,.ods', multiple: true, label: 'Select spreadsheets', runLabel: 'Convert to PDF',
    options: [methodOpt, ...pageOpts.map((p) => (p.key === 'landscape' ? { ...p, default: true } : p)), { key: 'gridlines', label: 'Show gridlines', type: 'checkbox', default: true }],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const wb = XLSX.read(await readBytes(f), { type: 'array', cellDates: true });
        const html = wb.SheetNames.map((n, i) => {
          const t = XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' });
          return `${wb.SheetNames.length > 1 ? `<h3 style="${i ? 'page-break-before:always' : ''}">${n.replace(/</g, '&lt;')}</h3>` : ''}${t.replace(/^[\s\S]*?<table/, '<table').replace(/<\/table>[\s\S]*$/, '</table>')}`;
        }).join('');
        const css = `table{font-size:11px}${o.gridlines ? '' : 'td,th{border:none}'}`;
        const res = await finishHtml(stem(f.name), html, o, ctx, css);
        if (!Array.isArray(res)) return res;
        outputs.push(...res);
      }
      return outputs;
    }
  },

  'html-to-pdf': {
    accept: '.html,.htm,text/html', multiple: false, label: 'Select an HTML file', optionalFiles: true, runLabel: 'Convert to PDF',
    optionalHint: 'Upload an .html file, paste HTML on the right, or enter a web address.',
    options: (files) => [
      ...(files.length ? [] : [
        { key: 'src', label: 'Source', type: 'seg', default: 'paste', options: [['paste', 'Paste HTML'], ['url', 'Web address']] },
        { key: 'html', label: 'HTML', type: 'textarea', default: '<h1>Hello</h1>\n<p>Paste your HTML here.</p>', showIf: (v) => v.src === 'paste' },
        { key: 'url', label: 'Web address', default: 'https://', showIf: (v) => v.src === 'url', hint: 'Many websites block other apps from loading them. If that happens, save the page from your browser (Ctrl+S) and upload the .html file.' }
      ]),
      methodOpt, ...pageOpts
    ],
    async process(files, o, ctx) {
      let html, name = 'page';
      if (files.length) { html = await files[0].text(); name = stem(files[0].name); }
      else if (o.src === 'url') {
        try {
          const r = await fetch(o.url);
          html = await r.text();
          html = `<base href="${o.url.replace(/"/g, '')}">` + html;
          name = new URL(o.url).hostname;
        } catch { throw new Error('That website does not allow loading from other apps. Save the page as HTML (Ctrl+S or Share → Save) and upload the file instead.'); }
      } else html = o.html;
      if (!html?.trim()) throw new Error('There is no HTML to convert.');
      return finishHtml(name, html, o, ctx);
    }
  },

  'pdf-to-md': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to Markdown',
    options: [{ key: 'breaks', label: 'Mark page breaks with ---', type: 'checkbox', default: false }],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const doc = await openWithPassword(f);
        const { bodySize } = await docStats(doc);
        const parts = [];
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: page ${i}`);
          const { page, vp, items } = await extractPageText(doc, i);
          const links = (await page.getAnnotations()).filter((a) => a.subtype === 'Link' && a.url).map((a) => {
            const [x1, y1, x2, y2] = a.rect; return { url: a.url, x1, x2, y1: vp.height - y2, y2: vp.height - y1 };
          });
          // Wrap text items that sit inside a link rectangle.
          const linked = items.map((it) => {
            const x = it.transform[4] + it.width / 2, y = vp.height - it.transform[5] - 2;
            const l = links.find((L) => x >= L.x1 && x <= L.x2 && y >= L.y1 - 2 && y <= L.y2 + 2);
            return l && it.str.trim() ? { ...it, str: `[${it.str.trim()}](${l.url})` } : it;
          });
          const blocks = blocksFromLines(textLines(linked, vp.height), bodySize);
          for (const b of blocks) {
            // Neighbouring pieces of one link become a single link.
            const t = b.text.replace(/\[([^\]]*)\]\(([^)]+)\)\s*\[([^\]]*)\]\(\2\)/g, '[$1 $3]($2)');
            if (b.cells) {
              const prev = parts[parts.length - 1];
              const cells = b.cells.map((c) => c.replace(/\|/g, '\\|'));
              if (prev?.table) prev.rows.push(cells);
              else parts.push({ table: true, rows: [cells] });
            } else if (b.level) parts.push({ t: '#'.repeat(b.level) + ' ' + t });
            else if (b.bullet) parts.push({ t: '- ' + t, list: true });
            else if (b.numbered) parts.push({ t: t.replace(/^(\d+)[.)]\s*/, '$1. '), list: true });
            else parts.push({ t });
          }
          if (o.breaks && i < doc.numPages) parts.push({ t: '---' });
          page.cleanup();
        }
        for (const p of parts) {
          if (!p.table) continue;
          const n = Math.max(...p.rows.map((r) => r.length));
          const line = (r) => '| ' + Array.from({ length: n }, (_, i) => r[i] ?? '').join(' | ') + ' |';
          p.t = p.rows.length > 1 ? [line(p.rows[0]), '|' + ' --- |'.repeat(n), ...p.rows.slice(1).map(line)].join('\n') : p.rows[0].join(' ');
        }
        // List items sit on consecutive lines; everything else is separated by a blank line.
        const md = parts.map((p, k) => (k === 0 ? '' : p.list && parts[k - 1].list ? '\n' : '\n\n') + p.t).join('') + '\n';
        outputs.push({ name: stem(f.name) + '.md', blob: new Blob([md], { type: 'text/markdown' }), preview: md.slice(0, 4000) });
        doc.destroy();
      }
      return outputs;
    }
  },

  'pdf-to-text': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Extract text',
    options: [{ key: 'pages', label: 'Label each page', type: 'checkbox', default: true }],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        const doc = await openWithPassword(f);
        const parts = [];
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: page ${i}`);
          const { lines } = await extractPageText(doc, i);
          parts.push((o.pages ? `===== Page ${i} =====\n` : '') + lines.map((l) => l.text).join('\n'));
        }
        const txt = parts.join('\n\n');
        outputs.push({ name: stem(f.name) + '.txt', blob: new Blob([txt], { type: 'text/plain' }), preview: txt.trim() ? txt.slice(0, 4000) : 'No text found. If this is a scan, run OCR PDF first.' });
        doc.destroy();
      }
      return outputs;
    }
  }
};

export { htmlToPdf };
