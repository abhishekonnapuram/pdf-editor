// OCR (tesseract.js) and on-device summarising.
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { readBytes, pdfBlob, stem, openPdfjs, renderPage, loadPdfLib, extractPageText, loadImage } from '../lib/core.js';

const PDF = '.pdf,application/pdf';
const LANGS = [
  ['eng', 'English'], ['hin', 'Hindi'], ['tel', 'Telugu'], ['tam', 'Tamil'], ['kan', 'Kannada'], ['mar', 'Marathi'],
  ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['por', 'Portuguese'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)']
];

export const tools = {
  ocr: {
    accept: PDF + ',image/*', multiple: false, label: 'Select a scanned PDF or image', runLabel: 'Run OCR',
    notice: 'The text-recognition engine and each language (2–15 MB) download the first time you use them, then work offline.',
    options: [
      { key: 'lang', label: 'Document language', type: 'select', default: 'eng', options: LANGS },
      { key: 'lang2', label: 'Second language (optional)', type: 'select', default: '', options: [['', 'None'], ...LANGS] },
      { key: 'skip', label: 'Skip pages that already contain text', type: 'checkbox', default: true },
      { key: 'quality', label: 'Accuracy', type: 'seg', default: '2.5', options: [['1.8', 'Fast'], ['2.5', 'Balanced'], ['3.5', 'Best']] }
    ],
    async process([f], o, ctx) {
      const { createWorker } = await import('tesseract.js');
      const langs = [o.lang, o.lang2].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('+');
      let stage = 'Loading OCR engine';
      ctx.progress(0.02, stage + '…');
      const worker = await createWorker(langs, 1, {
        logger: (m) => { if (m.status && m.status !== 'recognizing text') ctx.progress(0.05, `${stage}: ${m.status}${m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''}`); }
      });
      try {
        const isImg = !/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name);
        let srcBytes;
        if (isImg) {
          const { tools: simple } = await import('./simple.js');
          const [out] = await simple['jpg-to-pdf'].process([f], { size: 'fit', margin: '0', merge: true }, { progress: () => {} });
          srcBytes = new Uint8Array(await out.blob.arrayBuffer());
        } else srcBytes = await readBytes(f);
        const view = await openPdfjs(srcBytes);
        const out = await loadPdfLib(srcBytes);
        const texts = [];
        let done = 0;
        for (let i = 1; i <= view.numPages; i++) {
          stage = `Page ${i} of ${view.numPages}`;
          ctx.progress((i - 1) / view.numPages, `Reading page ${i} of ${view.numPages}…`);
          const { page, lines } = await extractPageText(view, i);
          if (o.skip && lines.reduce((n, l) => n + l.text.length, 0) > 40) { texts.push(lines.map((l) => l.text).join('\n')); continue; }
          const vp = page.getViewport({ scale: 1 });
          const scale = Math.min(+o.quality, 4200 / Math.max(vp.width, vp.height));
          const canvas = await renderPage(page, scale);
          const { data } = await worker.recognize(canvas, { pdfTitle: 'ocr', pdfTextOnly: true }, { text: true, pdf: true });
          texts.push(data.text);
          if (data.pdf) {
            // Lay the invisible text layer from tesseract over the original page.
            const layer = await PDFDocument.load(new Uint8Array(data.pdf));
            const [emb] = await out.embedPdf(layer, [0]);
            const target = out.getPage(i - 1);
            const box = target.getCropBox();
            const rot = target.getRotation().angle % 360;
            if (rot === 0) target.drawPage(emb, { x: box.x, y: box.y, width: box.width, height: box.height });
            else {
              // Render was done in the rotated view; undo that rotation for the overlay.
              const map = { 90: [box.x + box.width, box.y, 90], 180: [box.x + box.width, box.y + box.height, 180], 270: [box.x, box.y + box.height, 270] }[rot];
              const sw = rot === 180 ? box.width : box.height, sh = rot === 180 ? box.height : box.width;
              target.drawPage(emb, { x: map[0], y: map[1], width: sw, height: sh, rotate: degrees(map[2]) });
            }
            done++;
          }
          page.cleanup();
        }
        view.destroy();
        const txt = texts.join('\n\n');
        return {
          outputs: [
            { name: stem(f.name) + '-ocr.pdf', blob: pdfBlob(await out.save()) },
            { name: stem(f.name) + '-ocr.txt', blob: new Blob([txt], { type: 'text/plain' }), preview: txt.trim().slice(0, 3000) || '(no text recognised)' }
          ],
          note: done ? `Recognised text on ${done} page(s). The PDF is now searchable and its text can be selected and copied.` : 'Every page already had text, so nothing needed OCR. Untick "Skip pages that already contain text" to force it.'
        };
      } finally {
        await worker.terminate();
      }
    }
  },

  'image-to-editable': {
    accept: PDF + ',image/*', multiple: false, label: 'Select a resume or document picture (JPG, PNG) or a scanned PDF', runLabel: 'Make it editable',
    notice: 'The text is read on your device and put back as real, editable text in the same place, size and colour; photos, lines and shapes stay exactly as they are. The text-recognition engine downloads the first time.',
    options: [
      { key: 'lang', label: 'Document language', type: 'select', default: 'eng', options: LANGS },
      { key: 'lang2', label: 'Second language (optional)', type: 'select', default: '', options: [['', 'None'], ...LANGS] },
      { key: 'out', label: 'Create', type: 'seg', default: 'both', options: [['both', 'PDF + Word'], ['pdf', 'Editable PDF'], ['docx', 'Word (.docx)']] },
      { key: 'font', label: 'Font', type: 'select', default: 'match', options: [['match', 'Find the closest Google font (recommended)'], ['', 'Built-in fonts only'], ['sans', 'Sans (Arial / Helvetica)'], ['serif', 'Serif (Times)'], ['mono', 'Mono (Courier)']] },
      { key: 'size', label: 'Page size (pictures)', type: 'seg', default: 'a4', options: [['a4', 'A4 width'], ['letter', 'Letter width']] }
    ],
    async process([f], o, ctx) {
      const { rebuildPage, buildEditablePdf, buildEditableDocx } = await import('../lib/rebuild.js');
      const langs = [o.lang, o.lang2].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('+');
      const isImg = !/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name);
      // Collect page pictures with their page size in points.
      const sources = [];
      if (isImg) {
        const url = URL.createObjectURL(f);
        try {
          const img = await loadImage(url);
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0);
          const width = o.size === 'letter' ? 612 : 595.28;
          sources.push({ canvas: c, width, height: (width * c.height) / c.width });
        } finally { URL.revokeObjectURL(url); }
      } else {
        const view = await openPdfjs(await readBytes(f));
        const n = Math.min(view.numPages, 30);
        for (let i = 1; i <= n; i++) {
          ctx.progress(0.02, `Preparing page ${i} of ${n}…`);
          const page = await view.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          sources.push({ canvas: await renderPage(page, Math.min(200 / 72, 3600 / Math.max(vp.width, vp.height))), width: vp.width, height: vp.height });
        }
        view.destroy();
      }
      const pages = [];
      let kept = 0, lines = 0;
      for (const [i, s] of sources.entries()) {
        const at = `Page ${i + 1} of ${sources.length}`;
        ctx.progress(0.05 + (i / sources.length) * 0.85, `${at}: reading text…`);
        const st = (m) => ctx.progress(0.05 + (i / sources.length) * 0.85, `${at}: ${m}`);
        const r = await rebuildPage(s.canvas, { langs, fontOverride: o.font === 'match' ? '' : o.font, onStatus: st });
        if (o.font === 'match') { const { matchLineFonts } = await import('../lib/rebuild.js'); await matchLineFonts(s.canvas, r.lines, st); }
        pages.push({ bg: r.bg, lines: r.lines, width: s.width, height: s.height });
        kept += r.kept; lines += r.lines.length;
      }
      if (!lines) throw new Error('No text could be read in this file. Try another language, or a sharper picture.');
      ctx.progress(0.93, 'Building your editable document…');
      const outputs = [];
      if (o.out !== 'docx') outputs.push({ name: stem(f.name) + '-editable.pdf', blob: pdfBlob(await buildEditablePdf(pages, stem(f.name))) });
      if (o.out !== 'pdf') outputs.push({ name: stem(f.name) + '-editable.docx', blob: await buildEditableDocx(pages) });
      return {
        outputs,
        note: `${lines} line${lines > 1 ? 's' : ''} of text are now editable${kept ? ` (${kept} unclear line${kept > 1 ? 's were' : ' was'} left as part of the picture so nothing looks wrong)` : ''}. Open the PDF in Edit PDF ("Edit existing text") to change any line, or open the .docx in Word, where every line is its own text box over the original background.`
      };
    }
  },

  'image-to-layers': {
    accept: 'image/*,' + PDF, multiple: false, label: 'Select any photo, design, poster or social post (JPG, PNG, WEBP or PDF)',
    async mount(el, [f], ctx) {
      const { h } = await import('../lib/ui.js');
      el.replaceChildren(h('p', { class: 'status' }, 'Opening your picture…'));
      let canvas, choice;
      try {
        canvas = await fileToCanvas(f);
        const { looksLikeDesign } = await import('../lib/layers.js');
        const { pickObjects } = await import('./layerpick.js');
        choice = await pickObjects(el, canvas, { design: looksLikeDesign(canvas) });
      } catch (e) {
        console.error(e);
        el.replaceChildren(h('p', { class: 'error' }, 'Could not open this picture: ' + e.message));
        return;
      }
      const msg = h('div', { class: 'status' }, 'Starting…');
      const bar = h('div', { class: 'progress' }, h('div', { style: { width: '4%' } }));
      el.replaceChildren(h('div', { class: 'card', style: { padding: '28px', textAlign: 'center' } },
        h('h3', { style: { margin: '0 0 8px' } }, 'Splitting your picture into layers…'), msg, bar,
        h('p', { class: 'hint' }, 'Objects, text, photos, shapes and graphics are separated on your device. The AI models download the first time.')));
      const steps = ['reading text', 'finding photos', 'finding shapes', 'reading text on coloured', 'matching fonts', 'separating graphics', 'cutting out', 'downloading the fill', 'filling in', 'enhancing'];
      const onStatus = (m) => { msg.textContent = m[0].toUpperCase() + m.slice(1) + '…'; const i = steps.findIndex((s) => m.startsWith(s)); if (i >= 0) bar.firstChild.style.width = 8 + i * 9 + '%'; };
      try {
        const d = await pictureToDesign(f, onStatus, { canvas, ...choice, enhance: ctx.meta?.id === 'screenshot-to-template' ? 'always' : choice.objects.length ? 'never' : 'auto' });
        onStatus('opening the Design Studio editor');
        // A page the size of the picture (1pt per pixel), so downloads come out at the original size.
        const doc = await PDFDocument.create();
        doc.addPage([d.W, d.H]);
        const file = new File([await doc.save()], stem(f.name) + '.pdf', { type: 'application/pdf' });
        const { mountEditor } = await import('./editor.js');
        await mountEditor(el, file, ctx, 'design', { initial: [d.objs], name: stem(f.name) });
      } catch (e) {
        console.error(e);
        el.replaceChildren(h('p', { class: 'error' }, 'Could not split this picture: ' + e.message));
      }
    }
  },

  // The same flow, always enhancing first: made for screenshots of other designs and website graphics.
  get 'screenshot-to-template'() { return this['image-to-layers']; },

  'image-hd': {
    accept: 'image/*', multiple: false, label: 'Select a picture (JPG, PNG, WEBP)', runLabel: 'Recreate in HD',
    notice: 'Runs on your device with a small AI model (about 1 MB, downloaded once). Large pictures at 4× can take a minute or two.',
    options: [
      { key: 'scale', label: 'Enlarge', type: 'seg', default: '2', options: [['2', '2×'], ['3', '3×'], ['4', '4×']] },
      { key: 'mode', label: 'Method', type: 'seg', default: 'recreate', options: [['recreate', 'Recreate (sharp text & shapes + AI)'], ['ai', 'AI only (photos)']] },
      { key: 'lang', label: 'Text language (Recreate)', type: 'select', default: 'eng', options: LANGS, showIf: (o) => o.mode === 'recreate' },
      { key: 'fmt', label: 'Save as', type: 'seg', default: 'png', options: [['png', 'PNG'], ['jpg', 'JPG']] }
    ],
    async process([f], o, ctx) {
      const canvas = await fileToCanvas(f);
      let scale = +o.scale;
      // Keep the result within what browsers can hold (about 64 megapixels, 8000 px a side).
      const fit = Math.min(scale, 8000 / Math.max(canvas.width, canvas.height), Math.sqrt(64e6 / (canvas.width * canvas.height)));
      const note = fit < scale ? `This picture is large, so it was enlarged ${fit.toFixed(1)}× instead of ${scale}× (the most a browser can hold). ` : '';
      scale = Math.max(1, fit);
      const { recreateHD } = await import('../lib/hd.js');
      let stage = 'Starting';
      ctx.progress(0.02, 'Starting…');
      const { canvas: out } = await recreateHD(canvas, scale, {
        mode: o.mode, langs: o.lang,
        onStatus: (m) => { stage = m[0].toUpperCase() + m.slice(1); ctx.progress(0.1, stage + '…'); },
        onProgress: (p) => ctx.progress(0.15 + p * 0.8, `${stage}… ${Math.round(p * 100)}%`)
      });
      ctx.progress(0.97, 'Saving…');
      const { canvasToBlob } = await import('../lib/core.js');
      const blob = await canvasToBlob(out, o.fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.93);
      return {
        outputs: [{ name: `${stem(f.name)}-hd-${out.width}x${out.height}.${o.fmt}`, blob }],
        note: `${note}Recreated at ${out.width} × ${out.height} pixels (was ${canvas.width} × ${canvas.height}).${o.mode === 'recreate' ? ' Text, the background and solid shapes were redrawn perfectly sharp; photos and graphics were enlarged with AI. Check the text, since it was re-typed from what the reader saw.' : ''}`
      };
    }
  },

  summarize: {
    accept: PDF, multiple: false, label: 'Select a PDF', runLabel: 'Summarise',
    notice: 'Made on your device: Chrome and Edge use their built-in AI to write the summary in their own words; other browsers pick the most important sentences. Scanned PDFs need OCR first.',
    options: [
      { key: 'len', label: 'Summary length', type: 'seg', default: 'medium', options: [['short', 'Short'], ['medium', 'Medium'], ['long', 'Detailed']] },
      { key: 'fmt', label: 'Download as', type: 'seg', default: 'md', options: [['md', 'Markdown'], ['txt', 'Text']] }
    ],
    async process([f], o, ctx) {
      const doc = await openPdfjs(await readBytes(f));
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        ctx.progress(i / doc.numPages * 0.8, `Reading page ${i}`);
        const { lines } = await extractPageText(doc, i);
        text += lines.map((l) => l.text).join('\n') + '\n\n';
      }
      const pages = doc.numPages;
      doc.destroy();
      if (text.replace(/\s/g, '').length < 200) throw new Error('This PDF has almost no text to summarise. If it is a scan, run OCR PDF on it first.');
      const s = summarise(text, { short: 5, medium: 10, long: 18 }[o.len]);
      const words = text.split(/\s+/).filter(Boolean).length;
      const head = `# Summary of ${stem(f.name)}\n\n${pages} pages · ${words.toLocaleString()} words · about ${Math.max(1, Math.round(words / 230))} min read\n\n`;
      let md = null;
      try { md = await aiSummary(text, o.len, (m) => ctx.progress(0.85, m)); } catch (e) { console.warn('built-in AI summary unavailable', e); }
      md = md
        ? head + md + `\n\n## Main topics\n\n${s.keywords.join(', ')}\n\n_Summarised with your browser's built-in on-device AI._\n`
        : head + `## Key points\n\n${s.points.map((p) => '- ' + p).join('\n')}\n\n## Summary\n\n${s.summary.join(' ')}\n\n## Main topics\n\n${s.keywords.join(', ')}\n\n_Your browser has no built-in AI, so these are the most important sentences of the document._\n`;
      const body = o.fmt === 'txt' ? md.replace(/^#+ /gm, '').replace(/^- /gm, '• ') : md;
      return [{ name: `${stem(f.name)}-summary.${o.fmt}`, blob: new Blob([body], { type: o.fmt === 'md' ? 'text/markdown' : 'text/plain' }), preview: md.replace(/^#+ /gm, '').replace(/^- /gm, '• ') }];
    }
  }
};

// A summary from the browser's built-in on-device model (Chrome / Edge Summarizer API), or null if there is none.
// Long documents are summarised in parts first, then those summaries are summarised together.
async function aiSummary(text, len, onStatus) {
  if (typeof self === 'undefined' || !('Summarizer' in self)) return null;
  const length = { short: 'short', medium: 'medium', long: 'long' }[len];
  const opts = { format: 'markdown', length, outputLanguage: 'en' };
  // Some browsers expose the API but never answer: give each step a deadline, then fall back.
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);
  const av = await within(self.Summarizer.availability({ ...opts, type: 'key-points' }), 6000);
  if (av === 'unavailable') return null;
  const make = (type) => within(self.Summarizer.create({ ...opts, type, monitor(m) { m.addEventListener('downloadprogress', (e) => onStatus(`Downloading the browser's AI model ${Math.round((e.loaded || 0) * 100)}% (once)…`)); } }), av === 'available' ? 20000 : 300000);
  const kp = await make('key-points'), tldr = await make('tldr');
  const quota = Math.min(kp.inputQuota || 4000, 12000);
  const clean = text.replace(/\s+/g, ' ').trim();
  let source = clean;
  if (clean.length > quota) {
    const parts = [];
    for (let i = 0; i < clean.length && parts.length < 12; i += quota) parts.push(clean.slice(i, i + quota));
    const sums = [];
    for (const [k, p] of parts.entries()) { onStatus(`Reading part ${k + 1} of ${parts.length} with on-device AI…`); sums.push(await within(tldr.summarize(p), 120000)); }
    source = sums.join('\n');
  }
  onStatus('Writing the summary with on-device AI…');
  const points = await within(kp.summarize(source.slice(0, quota)), 120000);
  const overview = await within(tldr.summarize(source.slice(0, quota)), 120000);
  kp.destroy?.(); tldr.destroy?.();
  return `## Key points\n\n${points.trim()}\n\n## Summary\n\n${overview.trim()}`;
}

// A picture file (or the first page of a PDF) as a canvas on white.
async function fileToCanvas(f) {
  if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
    const view = await openPdfjs(await readBytes(f));
    const page = await view.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const c = await renderPage(page, Math.min(200 / 72, 3000 / Math.max(vp.width, vp.height)));
    view.destroy();
    return c;
  }
  const url = URL.createObjectURL(f);
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/** A picture (or the first page of a PDF) split into editable design layers: {W, H, objs}. */
export async function pictureToDesign(f, onStatus, { enhance = 'auto', canvas = null, objects = [], withText = true, fill = true } = {}) {
  canvas ||= await fileToCanvas(f);
  const { analyseLayers } = await import('../lib/layers.js');
  // Layers are found at the picture's own size (enlarging first would also enlarge JPEG noise).
  const L = await analyseLayers(canvas, { onStatus, withText });
  L.objects = [];
  if (objects.length) await addObjectLayers(L, objects, { onStatus, fill });
  // Screenshots and small pictures are then rebuilt larger: text and shapes are redrawn sharp at the
  // new size, and only photos and graphics are enlarged with the AI model.
  const long = Math.max(L.W, L.H);
  if (enhance === 'always' ? long < 3000 : enhance === 'auto' && long < 1400) {
    const S = Math.min(long < 900 ? 4 : 2, 6000 / long);
    await scaleLayers(L, S, onStatus);
  }
  const objs = await layersToObjects(L);
  if (objs[0]) objs[0].isBg = true;
  return { W: L.W, H: L.H, objs };
}

// Objects chosen by the user (soft masks at the picture's size) become their own see-through layers. What they
// covered is filled in on the background and photo layers, so moving an object leaves no hole.
async function addObjectLayers(L, objects, { onStatus, fill }) {
  const { cutObject, holeMask } = await import('../lib/objlayers.js');
  const { inpaint } = await import('../lib/inpaint.js');
  const W = L.W, H = L.H;
  onStatus?.('cutting out the objects');
  for (const o of objects) {
    const c = cutObject(L.clean, o.alpha);
    if (c) L.objects.push({ ...c, name: o.name });
  }
  // Back to front: things lower in the picture are usually nearer, so they go on top.
  L.objects.sort((a, b) => a.y1 - b.y1 || (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  const hole = holeMask(objects.map((o) => o.alpha), W, H, Math.max(2, Math.round(Math.max(W, H) / 250)));
  const inside = (b) => {
    let n = 0, m = 0;
    const step = Math.max(1, Math.round(Math.min(b.x1 - b.x0, b.y1 - b.y0) / 20));
    for (let y = Math.floor(b.y0); y < Math.min(H, b.y1); y += step) for (let x = Math.floor(b.x0); x < Math.min(W, b.x1); x += step) { m++; n += hole[y * W + x]; }
    return m ? n / m : 0;
  };
  // Graphics the objects now cover would show twice.
  L.graphics = L.graphics.filter((g) => inside(g) < 0.5);
  if (!fill) return;
  if (L.bg.canvas) await inpaint(L.bg.canvas, hole, { onStatus });
  for (const p of L.pictures) {
    const x0 = Math.floor(p.x0), y0 = Math.floor(p.y0), w = p.canvas.width, hh = p.canvas.height;
    const sub = new Uint8Array(w * hh);
    let any = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const X = x + x0, Y = y + y0; if (X < W && Y < H && hole[Y * W + X]) { sub[y * w + x] = 1; any++; } }
    if (any) await inpaint(p.canvas, sub, { onStatus });
  }
}

// Enlarge a layer analysis S times: geometry and text sizes scale, picture layers go through the AI.
async function scaleLayers(L, S, onStatus) {
  const { aiUpscale } = await import('../lib/hd.js');
  const bgColor = L.bg.color || '#ffffff';
  const sc = (b) => { b.x0 *= S; b.y0 *= S; b.x1 *= S; b.y1 *= S; };
  const jobs = [...L.pictures.map((p) => ['p', p]), ...L.graphics.map((g) => ['g', g]), ...(L.objects || []).map((o) => ['g', o]), ...(L.bg.canvas ? [['b', L.bg]] : [])];
  let n = 0;
  for (const [kind, it] of jobs) {
    onStatus?.(`enhancing pictures with AI (${++n} of ${jobs.length})`);
    const src = it.canvas;
    if (kind === 'g') {
      // Graphics have see-through edges: enlarge their colours over the background, then re-apply a smooth outline.
      const flat = document.createElement('canvas');
      flat.width = src.width; flat.height = src.height;
      const fg = flat.getContext('2d');
      fg.fillStyle = bgColor; fg.fillRect(0, 0, flat.width, flat.height); fg.drawImage(src, 0, 0);
      const big = await aiUpscale(flat, S);
      const g = big.getContext('2d');
      g.globalCompositeOperation = 'destination-in';
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, big.width, big.height);
      it.canvas = big;
    } else it.canvas = await aiUpscale(src, S);
  }
  L.W = Math.round(L.W * S); L.H = Math.round(L.H * S);
  for (const s of L.shapes) sc(s);
  for (const p of L.pictures) sc(p);
  for (const g of L.graphics) sc(g);
  for (const o of L.objects || []) sc(o);
  for (const l of L.lines) {
    sc(l.bbox);
    l.baseline *= S; l.size *= S; if (l.ls) l.ls *= S;
    for (const sg of l.segs || []) { sg.x0 *= S; sg.x1 *= S; }
  }
}

// How far below the top of a text box its baseline sits, as a fraction of the size (matches the editor's CSS).
function baseFrom(family, font, bold, italic) {
  const ASC = { sans: 0.945, serif: 0.9375, mono: 0.866 };
  if (!family) return ASC[font];
  const g = document.createElement('canvas').getContext('2d');
  g.font = `${italic ? 'italic ' : ''}${bold ? 700 : 400} 100px "${family}"`;
  const m = g.measureText('Hg');
  const a = (m.fontBoundingBoxAscent ?? 90) / 100, d = (m.fontBoundingBoxDescent ?? 25) / 100;
  return (1.2 - (a + d)) / 2 + a;
}

// Layers from analyseLayers -> editor objects, back to front.
async function layersToObjects(L) {
  const { textWidth } = await import('../lib/imagetext.js');
  const ASC = { sans: 0.945, serif: 0.9375, mono: 0.866 };
  const clampv = (v, a, b) => Math.max(a, Math.min(b, v));
  const img = (c, png) => ({ src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.93), natW: c.width, natH: c.height, jpeg: !png });
  const objs = [];
  if (L.bg.color) objs.push({ type: 'rect', layer: 'Background', locked: true, x: 0, y: 0, w: L.W, h: L.H, fill: L.bg.color, stroke: L.bg.color, sw: 0, opacity: 100 });
  else objs.push({ type: 'image', layer: 'Background', locked: true, x: 0, y: 0, w: L.W, h: L.H, opacity: 100, filters: {}, ...img(L.bg.canvas, false) });
  for (const s of L.shapes) objs.push({ type: s.kind, layer: s.kind === 'ellipse' ? 'Circle' : (s.y1 - s.y0 <= 6 || s.x1 - s.x0 <= 6) ? 'Line' : 'Shape', x: s.x0, y: s.y0, w: s.x1 - s.x0, h: s.y1 - s.y0, fill: s.color, stroke: s.color, sw: 0, opacity: 100 });
  for (const g of L.graphics) objs.push({ type: 'image', layer: 'Graphic', x: g.x0, y: g.y0, w: g.x1 - g.x0, h: g.y1 - g.y0, opacity: 100, filters: {}, ...img(g.canvas, true) });
  for (const p of L.pictures) objs.push({ type: 'image', layer: 'Photo', x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0, opacity: 100, filters: {}, clip: p.shape === 'ellipse' ? 'ellipse' : undefined, ...img(p.canvas, false) });
  for (const o of L.objects || []) objs.push({ type: 'image', layer: o.name || 'Object', x: o.x0, y: o.y0, w: o.x1 - o.x0, h: o.y1 - o.y0, opacity: 100, filters: {}, ...img(o.canvas, true) });
  for (const l of L.lines) {
    for (const sg of l.segs) {
      const font = l.font || 'sans', size = Math.round(l.size * 10) / 10;
      const n = [...sg.text].length, target = sg.x1 - sg.x0;
      const natural = textWidth({ text: sg.text, size, font, family: l.family, bold: sg.bold, italic: l.italic, ls: 0 });
      const ls = n > 1 ? clampv((target - natural) / (n - 1), -0.08 * size, 0.8 * size) : 0;
      objs.push({ type: 'text', layer: 'Text', text: sg.text, family: l.family, x: sg.x0, y: l.baseline - baseFrom(l.family, font, sg.bold, l.italic) * size, w: target, h: size * 1.2, size, font, bold: sg.bold, italic: l.italic, color: l.color, opacity: 100, align: 'left', ls: Math.round(ls * 100) / 100 });
    }
  }
  return objs;
}

const STOP = new Set('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves may might must shall one two also however thus therefore page pages'.split(' '));

export function summarise(text, n) {
  const clean = text.replace(/-\n(\w)/g, '$1').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ');
  let sentences;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(clean)].map((s) => s.segment.trim());
  else sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  sentences = sentences.filter((s) => s.length > 30 && s.length < 600 && /[a-zA-Zऀ-෿]/.test(s));
  const tokens = (s) => s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const tf = new Map();
  for (const s of sentences) for (const t of tokens(s)) if (!STOP.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
  const max = Math.max(1, ...tf.values());
  const scored = sentences.map((s, i) => {
    const ts = tokens(s).filter((t) => !STOP.has(t));
    const score = ts.reduce((a, t) => a + tf.get(t) / max, 0) / Math.pow(Math.max(ts.length, 1), 0.55);
    const pos = 1 + 0.35 * Math.max(0, 1 - i / Math.max(8, sentences.length * 0.15));
    return { s, i, score: score * pos };
  });
  // Pick high scorers but avoid near-duplicates.
  const picked = [];
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= n) break;
    const ct = new Set(tokens(c.s));
    if (picked.some((p) => { const pt = tokens(p.s); const inter = pt.filter((t) => ct.has(t)).length; return inter / Math.max(1, Math.min(pt.length, ct.size)) > 0.6; })) continue;
    picked.push(c);
  }
  const summary = [...picked].sort((a, b) => a.i - b.i).map((p) => p.s);
  const points = picked.slice(0, Math.min(6, Math.ceil(n / 2))).sort((a, b) => a.i - b.i).map((p) => p.s.length > 220 ? p.s.slice(0, 217).replace(/\s\S*$/, '') + '…' : p.s);
  const keywords = [...tf.entries()].filter(([t]) => !/^\d+$/.test(t)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  return { summary, points, keywords };
}
