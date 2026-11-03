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
      { key: 'font', label: 'Font', type: 'select', default: '', options: [['', 'Match automatically'], ['sans', 'Sans (Arial / Helvetica)'], ['serif', 'Serif (Times)'], ['mono', 'Mono (Courier)']] },
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
        const r = await rebuildPage(s.canvas, { langs, fontOverride: o.font, onStatus: (m) => ctx.progress(0.05 + (i / sources.length) * 0.85, `${at}: ${m}`) });
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

  summarize: {
    accept: PDF, multiple: false, label: 'Select a PDF', runLabel: 'Summarise',
    notice: 'The summary is made on your device by picking the most important sentences. Scanned PDFs need OCR first.',
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
      const md = `# Summary of ${stem(f.name)}\n\n${pages} pages · ${words.toLocaleString()} words · about ${Math.max(1, Math.round(words / 230))} min read\n\n## Key points\n\n${s.points.map((p) => '- ' + p).join('\n')}\n\n## Summary\n\n${s.summary.join(' ')}\n\n## Main topics\n\n${s.keywords.join(', ')}\n`;
      const body = o.fmt === 'txt' ? md.replace(/^#+ /gm, '').replace(/^- /gm, '• ') : md;
      return [{ name: `${stem(f.name)}-summary.${o.fmt}`, blob: new Blob([body], { type: o.fmt === 'md' ? 'text/markdown' : 'text/plain' }), preview: md.replace(/^#+ /gm, '').replace(/^- /gm, '• ') }];
    }
  }
};

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
