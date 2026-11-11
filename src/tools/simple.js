// Batch tools: pick files, set options, run.
import { PDFDocument, StandardFonts, degrees, rgb, PDFName, PDFRawStream, PDFNumber } from '@cantoo/pdf-lib';
import {
  readBytes, pdfBlob, stem, loadPdfLib, openPdfjs, renderPage, canvasToBlob, blobToBytes,
  parseRanges, selectPages, hexToRgb01, imageFileToEmbeddable, embedImage, fmtSize
} from '../lib/core.js';
import { pageImages } from '../lib/pdfimages.js';

const PDF = '.pdf,application/pdf';
const IMG = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp';

const applyOpts = [
  { key: 'apply', label: 'Pages', type: 'select', default: 'all', options: [['all', 'All pages'], ['odd', 'Odd pages'], ['even', 'Even pages'], ['range', 'Custom pages…']] },
  { key: 'range', label: 'Page numbers', placeholder: 'e.g. 1-3, 6, 9-', default: '', showIf: (v) => v.apply === 'range' }
];

const fontOpt = { key: 'font', label: 'Font', type: 'select', default: 'Helvetica', options: [['Helvetica', 'Sans (Helvetica)'], ['HelveticaBold', 'Sans bold'], ['TimesRoman', 'Serif (Times)'], ['TimesRomanBold', 'Serif bold'], ['Courier', 'Mono (Courier)']] };
const gfontOpt = { key: 'gfont', label: 'Or any Google font', type: 'gfont', default: '', standardLabel: 'No, use the font above', hint: 'The font is embedded in the PDF (only the characters used).' };
// A Google font when one is chosen (bold if the built-in choice was bold), otherwise the built-in font.
async function pickFont(doc, o) {
  if (o.gfont) {
    const { embedGoogleFont } = await import('../lib/fonts.js');
    const f = await embedGoogleFont(doc, o.gfont, { bold: /Bold/.test(o.font || '') });
    if (f) return f;
  }
  return doc.embedFont(StandardFonts[o.font] || StandardFonts.Helvetica);
}

export async function mergeFiles(files, ctx) {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    ctx?.progress?.(i / files.length, `Adding ${files[i].name}`);
    const src = await loadPdfLib(await readBytes(files[i]));
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out;
}

async function eachPdf(files, ctx, fn) {
  const outputs = [];
  for (let i = 0; i < files.length; i++) {
    ctx?.progress?.(i / files.length, `Processing ${files[i].name}`);
    const doc = await loadPdfLib(await readBytes(files[i]));
    const res = await fn(doc, files[i], i);
    outputs.push({ name: stem(files[i].name) + (res?.suffix || '') + '.pdf', blob: pdfBlob(await (res?.doc || doc).save()) });
  }
  return outputs;
}

// ---- shared operations (also used by workflows) ----
export const ops = {
  async rotate(doc, o) {
    const idx = selectPages(o.apply, o.range, doc.getPageCount());
    for (const i of idx) {
      const p = doc.getPage(i);
      p.setRotation(degrees((p.getRotation().angle + +o.angle + 360) % 360));
    }
  },

  async watermark(doc, o) {
    const pages = selectPages(o.apply, o.range, doc.getPageCount()).map((i) => doc.getPage(i));
    const [r, g, b] = hexToRgb01(o.color || '#c2412d');
    let font, img;
    if (o.kind === 'image') {
      if (!o.image) throw new Error('Choose an image for the watermark.');
      img = await embedImage(doc, await imageFileToEmbeddable(o.image));
    } else {
      if (!o.text) throw new Error('Type the watermark text.');
      font = await pickFont(doc, o);
    }
    const ang = (+o.rotation || 0) * Math.PI / 180;
    for (const p of pages) {
      const { width: W, height: H } = p.getSize();
      let w, hgt;
      if (img) { const s = (+o.scale || 30) / 100 * Math.min(W, H) / Math.max(img.width, img.height); w = img.width * s; hgt = img.height * s; }
      else { w = font.widthOfTextAtSize(o.text, +o.size); hgt = font.heightAtSize(+o.size, { descender: false }); }
      const centers = [];
      if (o.mosaic) {
        const stepX = Math.max(w, hgt) * 1.5 + 40, stepY = Math.max(w * Math.abs(Math.sin(ang)), hgt) + hgt * 3 + 40;
        for (let y = stepY / 2; y < H + stepY; y += stepY) for (let x = stepX / 2; x < W + stepX; x += stepX) centers.push([x, y]);
      } else {
        // Half the rotated bounding box, so corner placements stay inside the page.
        const bw = (Math.abs(w * Math.cos(ang)) + Math.abs(hgt * Math.sin(ang))) / 2;
        const bh = (Math.abs(w * Math.sin(ang)) + Math.abs(hgt * Math.cos(ang))) / 2;
        const cx = { l: 36 + bw, c: W / 2, r: W - 36 - bw }[o.position[1]];
        const cy = { t: H - 36 - bh, m: H / 2, b: 36 + bh }[o.position[0]];
        centers.push([cx ?? W / 2, cy ?? H / 2]);
      }
      for (const [cx, cy] of centers) {
        const dx = (w / 2) * Math.cos(ang) - (hgt / 2) * Math.sin(ang);
        const dy = (w / 2) * Math.sin(ang) + (hgt / 2) * Math.cos(ang);
        const x = cx - dx, y = cy - dy;
        if (img) p.drawImage(img, { x, y, width: w, height: hgt, rotate: degrees(+o.rotation || 0), opacity: o.opacity / 100 });
        else p.drawText(o.text, { x, y, size: +o.size, font, color: rgb(r, g, b), rotate: degrees(+o.rotation || 0), opacity: o.opacity / 100 });
      }
    }
  },

  async pageNumbers(doc, o) {
    const total = doc.getPageCount();
    const font = await pickFont(doc, o);
    const [r, g, b] = hexToRgb01(o.color || '#333333');
    const idx = new Set(selectPages(o.apply, o.range, total));
    const counted = [...Array(total).keys()].filter((i) => !(o.skipFirst && i === 0));
    counted.forEach((i, k) => {
      if (!idx.has(i)) return;
      const n = (+o.start || 1) + k;
      const label = o.format.replace('{n}', n).replace('{total}', counted.length + (+o.start || 1) - 1);
      const p = doc.getPage(i);
      const { width: W, height: H } = p.getSize();
      const size = +o.size || 11, w = font.widthOfTextAtSize(label, size), m = +o.margin || 28;
      let pos = o.position;
      if (o.mirror && pos[1] !== 'c' && n % 2 === 0) pos = pos[0] + (pos[1] === 'l' ? 'r' : 'l');
      const x = { l: m, c: (W - w) / 2, r: W - m - w }[pos[1]];
      const y = pos[0] === 't' ? H - m - size : m;
      p.drawText(label, { x, y, size, font, color: rgb(r, g, b) });
    });
  },

  async compress(doc, o, ctx) {
    // Re-encode embedded JPEG photos at a lower size/quality; text and vectors stay untouched.
    const { maxSide, quality } = o.maxSide ? o : ({ low: { maxSide: 2400, quality: 0.8 }, recommended: { maxSide: 1600, quality: 0.62 } }[o.level] || { maxSide: 1600, quality: 0.62 });
    const minBytes = o.minBytes ?? 30_000;
    const objs = doc.context.enumerateIndirectObjects();
    let k = 0;
    for (const [ref, obj] of objs) {
      k++;
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
      const filter = d.get(PDFName.of('Filter'));
      const fname = filter instanceof PDFName ? filter : (filter?.asArray?.().length === 1 ? filter.asArray()[0] : null);
      if (fname !== PDFName.of('DCTDecode')) continue;
      const cs = d.get(PDFName.of('ColorSpace'));
      if (cs === PDFName.of('DeviceCMYK') || d.get(PDFName.of('Decode'))) continue;
      const bytes = obj.contents;
      if (bytes.length < minBytes) continue;
      try {
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(bmp, 0, 0, c.width, c.height);
        const nb = await blobToBytes(await canvasToBlob(c, 'image/jpeg', quality));
        if (nb.length >= bytes.length * 0.95) continue;
        const nd = d.clone(doc.context);
        nd.set(PDFName.of('Width'), PDFNumber.of(c.width));
        nd.set(PDFName.of('Height'), PDFNumber.of(c.height));
        nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        nd.delete(PDFName.of('DecodeParms'));
        nd.set(PDFName.of('Length'), PDFNumber.of(nb.length));
        doc.context.assign(ref, PDFRawStream.of(nd, nb));
      } catch { /* leave images the browser can't decode */ }
      if (k % 20 === 0) ctx?.progress?.(0.2 + 0.6 * (k / objs.length), 'Recompressing images…');
    }
  }
};

// Try stronger and stronger settings until the PDF fits under maxBytes.
async function compressToSize(bytes, maxBytes, o, ctx) {
  if (bytes.length <= maxBytes) return { bytes, note: 'It was already small enough, so it was kept as it was.' };
  let best = bytes;
  const steps = [[2400, 0.8], [1800, 0.68], [1400, 0.58], [1100, 0.48], [900, 0.4], [700, 0.32], [520, 0.25]];
  for (let i = 0; i < steps.length; i++) {
    ctx?.progress?.(0.05 + 0.5 * i / steps.length, `Trying photo quality ${Math.round(steps[i][1] * 100)}%…`);
    const doc = await loadPdfLib(bytes);
    await ops.compress(doc, { maxSide: steps[i][0], quality: steps[i][1], minBytes: 6000 });
    if (!o.meta) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator(''); }
    const out = await doc.save({ useObjectStreams: true });
    if (out.length < best.length) best = out;
    if (out.length <= maxBytes) return { bytes: out, note: 'Text stays selectable.' };
    if (i >= 1 && out.length > best.length * 0.98 && out.length >= bytes.length * 0.97) break; // photos aren't what makes it big
  }
  if (o.allowRaster) {
    for (const [dpi, q] of [[150, 0.7], [130, 0.6], [110, 0.5], [96, 0.42], [80, 0.36], [72, 0.3], [60, 0.26], [50, 0.22]]) {
      const out = await (await rasterize(bytes, dpi, q, { progress: (p) => ctx?.progress?.(0.55 + 0.4 * p, `Pages as images at ${dpi} DPI…`) })).save({ useObjectStreams: true });
      if (out.length < best.length) best = out;
      if (out.length <= maxBytes) return { bytes: out, note: `Pages were turned into images (${dpi} DPI) to reach the size, so text can't be selected.` };
    }
  }
  return { bytes: best, note: `Could not get under ${fmtSize(maxBytes)}; this is the smallest it can go${o.allowRaster ? '' : ' while keeping text selectable. Allow turning pages into images to go smaller'}.` };
}

async function rasterize(bytes, dpi, quality, ctx) {
  const src = await openPdfjs(bytes);
  const out = await PDFDocument.create();
  for (let i = 1; i <= src.numPages; i++) {
    ctx?.progress?.(i / src.numPages, `Page ${i} of ${src.numPages}`);
    const page = await src.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const c = await renderPage(page, dpi / 72);
    const jpg = await out.embedJpg(await blobToBytes(await canvasToBlob(c, 'image/jpeg', quality)));
    const p = out.addPage([vp1.width, vp1.height]);
    p.drawImage(jpg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
  }
  src.destroy();
  return out;
}

export const tools = {
  merge: {
    accept: PDF, multiple: true, minFiles: 2, label: 'Select PDF files', runLabel: 'Merge PDF',
    notice: 'Drag the files on the left to set their order.',
    async process(files, o, ctx) {
      const doc = await mergeFiles(files, ctx);
      return [{ name: 'merged.pdf', blob: pdfBlob(await doc.save()) }];
    }
  },

  split: {
    accept: PDF, multiple: false, label: 'Select a PDF file', runLabel: 'Split PDF',
    options: [
      { key: 'mode', label: 'Split mode', type: 'seg', default: 'ranges', options: [['ranges', 'By ranges'], ['every', 'Every page'], ['fixed', 'Every N pages'], ['extract', 'Extract pages']] },
      { key: 'ranges', label: 'Ranges (one file each)', default: '1-2, 3-', placeholder: '1-3, 4-6, 7-', showIf: (v) => v.mode === 'ranges' },
      { key: 'n', label: 'Pages per file', type: 'number', default: 2, min: 1, showIf: (v) => v.mode === 'fixed' },
      { key: 'pages', label: 'Pages to extract (into one PDF)', default: '1', placeholder: '1, 3, 5-7', showIf: (v) => v.mode === 'extract' }
    ],
    async process([f], o, ctx) {
      const src = await loadPdfLib(await readBytes(f));
      const n = src.getPageCount();
      let groups;
      if (o.mode === 'every') groups = [...Array(n).keys()].map((i) => [i]);
      else if (o.mode === 'fixed') { groups = []; for (let i = 0; i < n; i += Math.max(1, o.n)) groups.push([...Array(Math.min(o.n, n - i)).keys()].map((k) => i + k)); }
      else if (o.mode === 'extract') groups = [[...new Set(parseRanges(o.pages, n).flat())]];
      else groups = parseRanges(o.ranges, n);
      const outputs = [];
      for (let g = 0; g < groups.length; g++) {
        ctx.progress(g / groups.length, `File ${g + 1} of ${groups.length}`);
        const out = await PDFDocument.create();
        (await out.copyPages(src, groups[g])).forEach((p) => out.addPage(p));
        const a = groups[g][0] + 1, b = groups[g][groups[g].length - 1] + 1;
        const label = o.mode === 'extract' ? 'extracted' : a === b ? `page-${a}` : `pages-${a}-${b}`;
        outputs.push({ name: `${stem(f.name)}-${label}.pdf`, blob: pdfBlob(await out.save()) });
      }
      return outputs;
    }
  },

  compress: {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Compress PDF',
    options: [
      { key: 'level', label: 'Compression level', type: 'seg', default: 'recommended', options: [['low', 'Light'], ['recommended', 'Recommended'], ['extreme', 'Extreme'], ['target', 'Exact file size']],
        hint: 'Light and Recommended shrink photos and keep text selectable. Extreme turns each page into an image: smallest file, but text is no longer selectable. Exact file size: type the size a form or email asks for.' },
      { key: 'target', label: 'Largest file size', type: 'number', default: 1, min: 0.01, step: 'any', showIf: (v) => v.level === 'target' },
      { key: 'unitKB', label: 'Unit', type: 'seg', default: 'mb', options: [['kb', 'KB'], ['mb', 'MB']], showIf: (v) => v.level === 'target' },
      { key: 'allowRaster', label: 'If needed, turn pages into images to reach the size', type: 'checkbox', default: true, showIf: (v) => v.level === 'target', hint: 'Only used when shrinking the photos is not enough. Text then can no longer be selected.' },
      { key: 'meta', label: 'Keep document info (title, author…)', type: 'checkbox', default: true, showIf: (v) => v.level !== 'extreme' }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      const notes = [];
      for (const f of files) {
        const bytes = await readBytes(f);
        let outBytes;
        if (o.level === 'target') {
          const max = Math.round(+o.target * (o.unitKB === 'kb' ? 1024 : 1024 * 1024));
          if (!(max > 0)) throw new Error('Enter the largest file size, for example 1 MB.');
          const r = await compressToSize(bytes, max, o, ctx);
          outputs.push({ name: stem(f.name) + '-compressed.pdf', blob: pdfBlob(r.bytes) });
          notes.push(`${f.name}: ${fmtSize(bytes.length)} → ${fmtSize(r.bytes.length)}. ${r.note}`);
          continue;
        }
        if (o.level === 'extreme') {
          outBytes = await (await rasterize(bytes, 96, 0.5, ctx)).save({ useObjectStreams: true });
        } else {
          const doc = await loadPdfLib(bytes);
          await ops.compress(doc, o, ctx);
          if (!o.meta) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator(''); }
          outBytes = await doc.save({ useObjectStreams: true });
        }
        if (outBytes.length >= bytes.length) { outBytes = bytes; notes.push(`${f.name}: already optimised (${fmtSize(bytes.length)}), kept as is.`); }
        else notes.push(`${f.name}: ${fmtSize(bytes.length)} → ${fmtSize(outBytes.length)} (−${Math.round((1 - outBytes.length / bytes.length) * 100)}%)`);
        outputs.push({ name: stem(f.name) + '-compressed.pdf', blob: pdfBlob(outBytes) });
      }
      return { outputs, note: notes.join('\n') };
    }
  },

  rotate: {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Rotate PDF',
    notice: 'To rotate individual pages visually, use Organize PDF.',
    options: [
      { key: 'angle', label: 'Rotation', type: 'seg', default: '90', options: [['90', '90° right'], ['180', '180°'], ['270', '90° left']] },
      ...applyOpts
    ],
    process: (files, o, ctx) => eachPdf(files, ctx, async (doc) => { await ops.rotate(doc, o); return { suffix: '-rotated' }; })
  },

  watermark: {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Add watermark',
    options: [
      { key: 'kind', label: 'Watermark type', type: 'seg', default: 'text', options: [['text', 'Text'], ['image', 'Image']] },
      { key: 'text', label: 'Text', default: 'CONFIDENTIAL', showIf: (v) => v.kind === 'text' },
      { ...fontOpt, showIf: (v) => v.kind === 'text' },
      { ...gfontOpt, showIf: (v) => v.kind === 'text' },
      { key: 'size', label: 'Font size', type: 'range', min: 8, max: 160, default: 56, unit: 'pt', showIf: (v) => v.kind === 'text' },
      { key: 'color', label: 'Colour', type: 'color', default: '#c2412d', showIf: (v) => v.kind === 'text' },
      { key: 'image', label: 'Image', type: 'file', accept: IMG, showIf: (v) => v.kind === 'image' },
      { key: 'scale', label: 'Image size', type: 'range', min: 5, max: 100, default: 35, unit: '%', showIf: (v) => v.kind === 'image' },
      { key: 'opacity', label: 'Transparency (opacity)', type: 'range', min: 5, max: 100, default: 30, unit: '%' },
      { key: 'rotation', label: 'Rotation', type: 'select', default: '45', options: [['0', 'None'], ['45', '45°'], ['-45', '−45°'], ['90', '90°']] },
      { key: 'mosaic', label: 'Repeat across the page (mosaic)', type: 'checkbox', default: false },
      { key: 'position', label: 'Position', type: 'position', default: 'mc', showIf: (v) => !v.mosaic },
      ...applyOpts
    ],
    process: (files, o, ctx) => eachPdf(files, ctx, async (doc) => { await ops.watermark(doc, o); return { suffix: '-watermarked' }; })
  },

  'page-numbers': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Add page numbers',
    options: [
      { key: 'position', label: 'Position', type: 'position', default: 'bc', only: ['tl', 'tc', 'tr', 'bl', 'bc', 'br'] },
      { key: 'mirror', label: 'Mirror left/right on facing pages', type: 'checkbox', default: false },
      { key: 'format', label: 'Format', type: 'select', default: '{n}', options: [['{n}', '1'], ['Page {n}', 'Page 1'], ['Page {n} of {total}', 'Page 1 of 10'], ['{n} / {total}', '1 / 10'], ['- {n} -', '- 1 -']] },
      { key: 'start', label: 'First number', type: 'number', default: 1, min: 0 },
      { key: 'skipFirst', label: 'Skip the first page (cover)', type: 'checkbox', default: false },
      fontOpt, gfontOpt,
      { key: 'size', label: 'Font size', type: 'range', min: 6, max: 36, default: 11, unit: 'pt' },
      { key: 'color', label: 'Colour', type: 'color', default: '#333333' },
      { key: 'margin', label: 'Distance from edge', type: 'range', min: 10, max: 80, default: 28, unit: 'pt' },
      ...applyOpts
    ],
    process: (files, o, ctx) => eachPdf(files, ctx, async (doc) => { await ops.pageNumbers(doc, o); return { suffix: '-numbered' }; })
  },

  'pdf-to-jpg': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to images',
    options: [
      { key: 'mode', label: 'What to save', type: 'seg', default: 'pages', options: [['pages', 'Each page'], ['images', 'Embedded images']] },
      { key: 'format', label: 'Format', type: 'seg', default: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']] },
      { key: 'dpi', label: 'Resolution', type: 'select', default: '150', options: [['72', 'Screen (72 dpi)'], ['150', 'Normal (150 dpi)'], ['300', 'High (300 dpi)']], showIf: (v) => v.mode === 'pages' },
      { key: 'quality', label: 'Quality', type: 'range', min: 40, max: 100, default: 88, unit: '%', showIf: (v) => v.format !== 'png' }
    ],
    async process(files, o, ctx) {
      const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[o.format];
      const outputs = [];
      for (const f of files) {
        const doc = await openPdfjs(await readBytes(f));
        for (let i = 1; i <= doc.numPages; i++) {
          ctx.progress(i / doc.numPages, `${f.name}: page ${i} of ${doc.numPages}`);
          const page = await doc.getPage(i);
          if (o.mode === 'pages') {
            const c = await renderPage(page, +o.dpi / 72);
            outputs.push({ name: `${stem(f.name)}-page-${i}.${o.format}`, blob: await canvasToBlob(c, type, o.quality / 100) });
          } else {
            const vp = page.getViewport({ scale: 1 });
            const seen = new Set();
            let k = 0;
            for (const im of await pageImages(page, vp)) {
              if (im.name && seen.has(im.name)) continue;
              seen.add(im.name);
              const c = await im.getCanvas();
              if (!c || c.width < 16 || c.height < 16) continue;
              if (type !== 'image/png') { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, t.width, t.height); x.drawImage(c, 0, 0); outputs.push({ name: `${stem(f.name)}-p${i}-img${++k}.${o.format}`, blob: await canvasToBlob(t, type, o.quality / 100) }); }
              else outputs.push({ name: `${stem(f.name)}-p${i}-img${++k}.png`, blob: await canvasToBlob(c, type) });
            }
          }
          page.cleanup();
        }
        doc.destroy();
      }
      if (!outputs.length) throw new Error('No embedded images were found in this PDF. Try "Each page" instead.');
      return outputs;
    }
  },

  'jpg-to-pdf': {
    accept: IMG, multiple: true, label: 'Select images', capture: true, runLabel: 'Convert to PDF',
    options: [
      { key: 'size', label: 'Page size', type: 'select', default: 'fit', options: [['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'US Letter'], ['legal', 'US Legal'], ['a5', 'A5']] },
      { key: 'orient', label: 'Orientation', type: 'seg', default: 'auto', options: [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], showIf: (v) => v.size !== 'fit' },
      { key: 'margin', label: 'Margin', type: 'seg', default: '0', options: [['0', 'None'], ['20', 'Small'], ['50', 'Big']] },
      { key: 'merge', label: 'Merge all images into one PDF', type: 'checkbox', default: true },
      { key: 'shrink', label: 'Reduce file size (re-encode large photos)', type: 'checkbox', default: false }
    ],
    async process(files, o, ctx) {
      const sizes = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a5: [419.53, 595.28] };
      const outputs = [];
      let doc = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        ctx.progress(i / files.length, `Adding ${files[i].name}`);
        const data = await imageFileToEmbeddable(files[i], o.shrink);
        const img = await embedImage(doc, data);
        const m = +o.margin;
        let W, H;
        if (o.size === 'fit') { W = data.width * 0.75 + 2 * m; H = data.height * 0.75 + 2 * m; }
        else {
          [W, H] = sizes[o.size];
          const land = o.orient === 'landscape' || (o.orient === 'auto' && data.width > data.height);
          if (land) [W, H] = [H, W];
        }
        const s = Math.min((W - 2 * m) / data.width, (H - 2 * m) / data.height);
        const w = data.width * s, hh = data.height * s;
        doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - hh) / 2, width: w, height: hh });
        if (!o.merge) {
          outputs.push({ name: stem(files[i].name) + '.pdf', blob: pdfBlob(await doc.save()) });
          doc = await PDFDocument.create();
        }
      }
      if (o.merge) outputs.push({ name: files.length === 1 ? stem(files[0].name) + '.pdf' : 'images.pdf', blob: pdfBlob(await doc.save()) });
      return outputs;
    }
  },

  protect: {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Protect PDF',
    options: [
      { key: 'pw', label: 'Password to open the file', type: 'password', default: '' },
      { key: 'pw2', label: 'Repeat password', type: 'password', default: '' },
      { key: 'owner', label: 'Owner password (optional)', type: 'password', default: '', hint: 'Needed to change permissions later. Leave blank to generate a random one.' },
      { key: 'print', label: 'Allow printing', type: 'checkbox', default: true },
      { key: 'copy', label: 'Allow copying text and images', type: 'checkbox', default: true },
      { key: 'modify', label: 'Allow editing', type: 'checkbox', default: false },
      { key: 'annot', label: 'Allow comments and form filling', type: 'checkbox', default: true }
    ],
    async process(files, o, ctx) {
      if (!o.pw) throw new Error('Enter a password.');
      if (o.pw !== o.pw2) throw new Error('The two passwords do not match.');
      const owner = o.owner || crypto.getRandomValues(new Uint32Array(4)).join('-');
      return eachPdf(files, ctx, async (doc) => {
        doc.encrypt({
          userPassword: o.pw, ownerPassword: owner,
          permissions: { printing: o.print ? 'highResolution' : false, copying: o.copy, modifying: o.modify, annotating: o.annot, fillingForms: o.annot, contentAccessibility: true, documentAssembly: o.modify }
        });
        return { suffix: '-protected' };
      });
    }
  },

  unlock: {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Unlock PDF',
    notice: 'Only unlock files you own or are allowed to open. Files with only print/copy restrictions unlock without a password.',
    options: [{ key: 'pw', label: 'Password (if the file asks for one)', type: 'password', default: '' }],
    async process(files, o, ctx) {
      const outputs = [];
      for (const f of files) {
        ctx.progress(0.3, `Unlocking ${f.name}`);
        const bytes = await readBytes(f);
        let doc;
        try { doc = await PDFDocument.load(bytes, { password: o.pw || '' }); }
        catch (e) {
          if (!o.pw) throw new Error(`${f.name} needs its password. Type it in the Password box.`);
          throw new Error(`Wrong password for ${f.name}.`);
        }
        outputs.push({ name: stem(f.name) + '-unlocked.pdf', blob: pdfBlob(await doc.save()) });
      }
      return outputs;
    }
  },

  repair: {
    accept: PDF, multiple: true, label: 'Select damaged PDF files', runLabel: 'Repair PDF',
    async process(files, o, ctx) {
      const outputs = [], notes = [];
      for (const f of files) {
        const bytes = await readBytes(f);
        let out, how;
        try {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
          out = await PDFDocument.create();
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
          how = 'structure rebuilt';
          // Make sure the rebuilt file is actually readable.
          const test = await openPdfjs(await out.save());
          if (test.numPages !== pages.length) throw new Error('page mismatch');
          test.destroy();
        } catch {
          ctx.progress(0.3, 'Structure is broken; recovering pages visually…');
          try { out = await rasterize(bytes, 150, 0.85, ctx); how = 'pages recovered as images (text is no longer selectable)'; }
          catch (e) { throw new Error(`${f.name} is too damaged to recover (${e.message}).`); }
        }
        notes.push(`${f.name}: ${how}, ${out.getPageCount()} page(s).`);
        outputs.push({ name: stem(f.name) + '-repaired.pdf', blob: pdfBlob(await out.save()) });
      }
      return { outputs, note: notes.join('\n') };
    }
  }
};
