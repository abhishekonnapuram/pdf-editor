// AI tools that run on the visitor's device, free: passport photos, audio/video to text, chat with a PDF.
import { h, toast } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { stem, PDFDocument, readBytes, openPdfjs, extractPageText } from '../lib/core.js';
import { readPicture, newCanvas, ctx2d, resizeCanvas, fitToSize, IMG_ACCEPT } from '../lib/imgio.js';
import { transcribe, listen, VOICE_LANGS, hasLiveSpeech, canRecord } from '../lib/voice.js';
import { transformers, builtinAI, builtinAIStatus } from '../lib/ai.js';

const MM = 25.4;

// ===================== Passport photo =====================
// [id, name, width mm, height mm, head height (chin to top of hair) as a share of the photo height]
export const PASSPORT_SPECS = [
  ['in', 'India passport (35 × 45 mm)', 35, 45, 0.75],
  ['in-visa', 'India visa / OCI (2 × 2 in)', 50.8, 50.8, 0.6],
  ['pan', 'India PAN card (25 × 35 mm)', 25, 35, 0.7],
  ['us', 'USA passport / visa (2 × 2 in)', 50.8, 50.8, 0.6],
  ['uk', 'United Kingdom (35 × 45 mm)', 35, 45, 0.7],
  ['eu', 'Schengen / EU (35 × 45 mm)', 35, 45, 0.76],
  ['ca', 'Canada (50 × 70 mm)', 50, 70, 0.48],
  ['au', 'Australia (35 × 45 mm)', 35, 45, 0.76],
  ['cn', 'China (33 × 48 mm)', 33, 48, 0.64],
  ['jp', 'Japan (35 × 45 mm)', 35, 45, 0.76],
  ['ae', 'UAE (43 × 55 mm)', 43, 55, 0.7],
  ['sg', 'Singapore (35 × 45 mm)', 35, 45, 0.7],
  ['custom', 'Custom size', 35, 45, 0.72]
];
const specById = (id) => PASSPORT_SPECS.find((s) => s[0] === id) || PASSPORT_SPECS[0];
const PASSPORT_BG = [['#ffffff', 'White'], ['#f2f2f2', 'Off-white'], ['#dfe9f5', 'Light blue'], ['#d9d9d9', 'Light grey'], ['#3a6ea5', 'Blue'], ['#c8102e', 'Red']];
const PAPERS = { '4x6': ['4 × 6 in (10 × 15 cm photo paper)', 101.6, 152.4], a4: ['A4 sheet', 210, 297], '5x7': ['5 × 7 in', 127, 177.8], letter: ['US Letter', 215.9, 279.4] };

/** Write the print size into a JPG (JFIF density), so printers and forms read it as e.g. 300 dpi. */
async function jpegWithDpi(blob, dpi) {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && String.fromCharCode(...b.slice(6, 10)) === 'JFIF') {
    b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  }
  return new Blob([b], { type: 'image/jpeg' });
}
const jpg = (c, q = 0.95) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));

/** Find the face, cut the person out and measure the head. Returns everything compose() needs. */
export async function analysePortrait(file, { removeBg = true, onStatus = () => {} } = {}) {
  const pic = await readPicture(file);
  let src = pic.frames[0].canvas;
  const k = Math.min(1, 2400 / Math.max(src.width, src.height));
  if (k < 1) src = resizeCanvas(src, src.width * k, src.height * k);
  onStatus('Finding your face…');
  const { findFaces } = await import('./imagestudio.js');
  const faces = await findFaces(src, onStatus);
  if (!faces.length) throw new Error('No face was found. Use a clear photo looking straight at the camera, with your whole head in the picture.');
  const f = faces.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  let subject = src, mask = null;
  if (removeBg) {
    onStatus('Removing the background (AI model, 7 MB, downloaded once)…');
    const { cutoutMask, applyMask } = await import('./images.js');
    mask = await cutoutMask(src, 'people', onStatus);
    subject = applyMask(src, mask, { bg: 'transparent' });
  }
  // Chin: the face detector's box ends a little below the chin. Top of the head: the highest part of the person above the face.
  const chin = f.y + f.h * 0.9;
  let crown = Math.max(0, f.y - f.h * 0.5);
  if (mask) {
    const d = ctx2d(mask).getImageData(0, 0, mask.width, mask.height).data;
    const x0 = Math.max(0, Math.round(f.x + f.w * 0.2)), x1 = Math.min(mask.width - 1, Math.round(f.x + f.w * 0.8));
    const yStart = Math.max(0, Math.round(f.y - f.h * 1.2)), yEnd = Math.round(f.y + f.h * 0.2);
    for (let y = yStart; y < yEnd; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x += 2) if (d[(y * mask.width + x) * 4 + 3] > 140) n++;
      if (n > (x1 - x0) / 2 * 0.15) { crown = y; break; }
    }
  }
  return { name: pic.name, src, subject, face: f, chin, crown, cx: f.x + f.w / 2, cutOff: crown <= 2, faces: faces.length };
}

/** Draw the passport photo for one spec. st: analysis + { bg, zoom, dx, dy, bright }. */
export function composePassport(st, spec, dpi, { guides = false } = {}) {
  const [, , wmm, hmm, head] = spec;
  const W = Math.round(wmm / MM * dpi), H = Math.round(hmm / MM * dpi);
  const c = newCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = st.bg; g.fillRect(0, 0, W, H);
  const headPx = head * H * (st.zoom || 1);
  const s = headPx / Math.max(1, st.chin - st.crown);
  const top = (H - headPx) * 0.4 + (st.dy || 0) * H;
  const x = W / 2 - st.cx * s + (st.dx || 0) * W, y = top - st.crown * s;
  g.imageSmoothingQuality = 'high';
  if (st.bright && st.bright !== 100) g.filter = `brightness(${st.bright}%) contrast(${100 + (st.bright - 100) / 3}%)`;
  g.drawImage(st.subject, x, y, st.subject.width * s, st.subject.height * s);
  g.filter = 'none';
  if (guides) {
    g.save();
    g.strokeStyle = 'rgba(230,57,70,.9)'; g.lineWidth = Math.max(1, W / 300); g.setLineDash([W / 60, W / 90]);
    g.beginPath(); g.moveTo(0, top); g.lineTo(W, top); g.moveTo(0, top + headPx); g.lineTo(W, top + headPx); g.stroke();
    g.strokeStyle = 'rgba(37,99,235,.85)';
    g.beginPath(); g.ellipse(W / 2 + (st.dx || 0) * W, top + headPx * 0.52, headPx * 0.36, headPx * 0.52, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  return { canvas: c, bottomGap: (y + st.subject.height * s) < H - 2 };
}

/** Copies of one photo on a sheet of paper, with thin cut lines. */
function printSheet(photo, spec, paperId, dpi) {
  const [, pw, ph] = PAPERS[paperId] || PAPERS['4x6'];
  const [, , wmm, hmm] = spec;
  const gap = 2, margin = 4;
  let W = pw, H = ph, cols = Math.floor((W - 2 * margin + gap) / (wmm + gap)), rows = Math.floor((H - 2 * margin + gap) / (hmm + gap));
  // Turn the paper sideways when more photos fit that way.
  const c2 = Math.floor((H - 2 * margin + gap) / (wmm + gap)), r2 = Math.floor((W - 2 * margin + gap) / (hmm + gap));
  if (c2 * r2 > cols * rows) { [W, H] = [H, W]; cols = c2; rows = r2; }
  const px = (mm) => Math.round(mm / MM * dpi);
  const c = newCanvas(px(W), px(H)), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const ox = (W - (cols * wmm + (cols - 1) * gap)) / 2, oy = (H - (rows * hmm + (rows - 1) * gap)) / 2;
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 1;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = px(ox + q * (wmm + gap)), y = px(oy + r * (hmm + gap));
    g.drawImage(photo, x, y, px(wmm), px(hmm));
    g.strokeRect(x - 0.5, y - 0.5, px(wmm) + 1, px(hmm) + 1);
  }
  return { canvas: c, count: cols * rows, wmm: W, hmm: H };
}

async function passportOutputs(st, spec, o) {
  const dpi = 300, base = stem(st.name) + '-passport';
  const { canvas } = composePassport(st, spec, dpi);
  const outputs = [], notes = [];
  if (+o.maxKB > 0) {
    const r = await fitToSize(canvas, 'jpg', Math.round(+o.maxKB * 1024), { allowShrink: true });
    outputs.push({ name: base + '.jpg', blob: await jpegWithDpi(r.blob, dpi) });
    notes.push(`Photo: ${canvas.width} × ${canvas.height} px${r.width !== canvas.width ? ` (made ${r.width} × ${r.height} px to fit)` : ''}, ${Math.round(r.blob.size / 1024)} KB${r.fits ? '' : ` (could not get under ${o.maxKB} KB)`}.`);
  } else {
    outputs.push({ name: base + '.jpg', blob: await jpegWithDpi(await jpg(canvas), dpi) });
    notes.push(`Photo: ${canvas.width} × ${canvas.height} px at 300 dpi (${spec[2]} × ${spec[3]} mm when printed).`);
  }
  if (o.sheet && o.sheet !== 'none') {
    const sh = printSheet(canvas, spec, o.sheet, dpi);
    const sblob = await jpegWithDpi(await jpg(sh.canvas, 0.93), dpi);
    outputs.push({ name: `${base}-sheet-${o.sheet}.jpg`, blob: sblob });
    const doc = await PDFDocument.create();
    const page = doc.addPage([sh.wmm / MM * 72, sh.hmm / MM * 72]);
    const img = await doc.embedJpg(await sblob.arrayBuffer());
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    outputs.push({ name: `${base}-sheet-${o.sheet}.pdf`, blob: new Blob([await doc.save()], { type: 'application/pdf' }) });
    notes.push(`Print sheet: ${sh.count} copies on ${PAPERS[o.sheet][0]}. Print at 100% / "actual size", not "fit to page".`);
  }
  return { outputs, note: notes.join('\n') };
}

function passportMount(body, files, ctx) {
  const st = { bg: '#ffffff', zoom: 1, dx: 0, dy: 0, bright: 100 };
  const o = { spec: 'in', sheet: '4x6', maxKB: 0, removeBg: true, guides: true, cw: 35, ch: 45 };
  let data = null, file = files[0];
  const spec = () => o.spec === 'custom' ? ['custom', 'Custom', +o.cw || 35, +o.ch || 45, 0.72] : specById(o.spec);
  const stage = h('div', { class: 'ppstage' }, h('p', { class: 'status' }, 'Getting your photo ready…'));
  const warn = h('div', { class: 'ppwarn' });
  const status = h('p', { class: 'status' });
  const side = h('div', { class: 'panel sidepanel' });
  body.replaceChildren(h('div', { class: 'layout' }, h('div', { class: 'panel' }, stage, warn, h('p', { class: 'hint' }, 'Red lines: top of the head and chin. Blue oval: where the face should be. Rules change; check the latest photo rules of the office you are applying to.')), side));

  const draw = () => {
    if (!data) return;
    const s = spec();
    const view = composePassport({ ...data, ...st }, s, 160, { guides: o.guides });
    view.canvas.className = 'ppcanvas';
    stage.replaceChildren(view.canvas, h('div', { class: 'ppsize' }, `${s[2]} × ${s[3]} mm`));
    const w = [];
    if (data.faces > 1) w.push('More than one face was found; the biggest one is used.');
    if (data.cutOff) w.push('The top of the head touches the edge of your photo. A photo with some space above the head works best.');
    if (view.bottomGap) w.push('Your photo ends above the bottom of the passport photo. Use a photo that shows your shoulders, or zoom in a little.');
    warn.replaceChildren(...w.map((t) => h('div', { class: 'notice warn' }, t)));
  };

  const analyse = async () => {
    stage.replaceChildren(h('div', { class: 'ppbusy' }, h('span', { class: 'spinner' }), status));
    status.textContent = 'Getting your photo ready…';
    try { data = await analysePortrait(file, { removeBg: o.removeBg, onStatus: (m) => { status.textContent = m; } }); draw(); }
    catch (e) { console.error(e); stage.replaceChildren(h('div', { class: 'error' }, e.message || String(e))); }
  };

  const row = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint && h('div', { class: 'hint' }, hint));
  const range = (key, min, max, step, fmt) => {
    const out = h('span', { class: 'rv' }, fmt(st[key]));
    const inp = h('input', { type: 'range', min, max, step, value: st[key], oninput: () => { st[key] = +inp.value; out.textContent = fmt(st[key]); draw(); } });
    return h('div', { class: 'rangerow' }, inp, out);
  };
  const drawSide = () => {
    const sel = h('select', { class: 'inp', onchange: () => { o.spec = sel.value; drawSide(); draw(); } }, PASSPORT_SPECS.map(([id, name]) => h('option', { value: id, selected: id === o.spec }, name)));
    const swatches = h('div', { class: 'swatches' }, PASSPORT_BG.map(([c, n]) => h('button', { type: 'button', class: 'sw' + (st.bg === c ? ' on' : ''), title: n, style: { background: c }, onclick: () => { st.bg = c; drawSide(); draw(); } })),
      h('input', { type: 'color', value: st.bg, title: 'Other colour', oninput: (e) => { st.bg = e.target.value; draw(); } }));
    const custom = o.spec !== 'custom' ? null : h('div', { class: 'row2' },
      h('input', { class: 'inp', type: 'number', min: 10, max: 200, value: o.cw, title: 'Width (mm)', oninput: (e) => { o.cw = e.target.value; draw(); } }),
      h('span', {}, '×'),
      h('input', { class: 'inp', type: 'number', min: 10, max: 200, value: o.ch, title: 'Height (mm)', oninput: (e) => { o.ch = e.target.value; draw(); } }), h('span', {}, 'mm'));
    const paper = h('select', { class: 'inp', onchange: () => { o.sheet = paper.value; } }, h('option', { value: 'none', selected: o.sheet === 'none' }, 'No print sheet'),
      Object.entries(PAPERS).map(([id, [n]]) => h('option', { value: id, selected: id === o.sheet }, n)));
    const kb = h('input', { class: 'inp', type: 'number', min: 0, step: 1, value: o.maxKB || '', placeholder: 'No limit', oninput: () => { o.maxKB = +kb.value || 0; } });
    const err = h('div', { class: 'error' });
    const go = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
      if (!data) return;
      go.disabled = true; err.textContent = '';
      try { const r = await passportOutputs({ ...data, ...st }, spec(), o); ctx.finish(r.outputs, r.note); go.disabled = false; }
      catch (e) { err.textContent = e.message || String(e); go.disabled = false; }
    } }, 'Create passport photo');
    side.replaceChildren(h('h3', {}, 'Passport photo'),
      row('Country / document', sel), custom,
      row('Background', swatches, 'Most countries ask for white or off-white. Some visas ask for light blue.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.removeBg, onchange: (e) => { o.removeBg = e.target.checked; analyse(); } }), ' Replace the background (AI)'),
      row('Head size', range('zoom', 0.85, 1.15, 0.01, (v) => Math.round(v * 100) + '%')),
      row('Move up / down', range('dy', -0.12, 0.12, 0.005, (v) => (v > 0 ? '↓ ' : v < 0 ? '↑ ' : '') + Math.round(Math.abs(v) * 100))),
      row('Move left / right', range('dx', -0.15, 0.15, 0.005, (v) => (v > 0 ? '→ ' : v < 0 ? '← ' : '') + Math.round(Math.abs(v) * 100))),
      row('Brightness', range('bright', 80, 130, 1, (v) => v + '%')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.guides, onchange: (e) => { o.guides = e.target.checked; draw(); } }), ' Show guides'),
      row('Print sheet', paper, 'Copies laid out with cut lines, as JPG and PDF.'),
      row('Largest file size (KB)', kb, 'For online forms that say e.g. "under 50 KB". Leave empty for best quality.'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => ctx.restart() }, 'Use another photo'),
      go, err);
  };
  drawSide();
  analyse();
}

// ===================== Chat with PDF =====================
let embedP = null;
export function embedder(onStatus = () => {}) {
  embedP ||= (async () => {
    const { pipeline } = await transformers();
    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { progress_callback: (p) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) onStatus(`Downloading the search AI model ${Math.round(p.progress || 0)}% (23 MB, once)`); } });
  })();
  embedP.catch(() => { embedP = null; });
  return embedP;
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const words = (t) => (t.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
const STOP = new Set('the and for are was were with that this from have has had not but you your what which when where who why how does did can could would should about into than then them they their there these those its our out also any all more most such some very will shall may might upon per'.split(' '));

async function indexPdf(file, onStatus) {
  const doc = await openPdfjs(await readBytes(file));
  const passages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onStatus(`Reading page ${i} of ${doc.numPages}…`);
    const { lines } = await extractPageText(doc, i);
    let buf = '';
    const flush = () => { if (buf.trim().length > 20) passages.push({ page: i, text: buf.trim() }); buf = ''; };
    for (const l of lines) { buf += (buf ? ' ' : '') + l.text; if (buf.length > 650) flush(); }
    flush();
  }
  if (!passages.length) return { pages: doc.numPages, passages };
  const ex = await embedder(onStatus);
  for (let i = 0; i < passages.length; i += 16) {
    onStatus(`Understanding the document… ${Math.round(i / passages.length * 100)}%`);
    const t = await ex(passages.slice(i, i + 16).map((p) => p.text), { pooling: 'mean', normalize: true });
    t.tolist().forEach((v, k) => { passages[i + k].vec = v; passages[i + k].words = new Set(words(passages[i + k].text)); });
  }
  return { pages: doc.numPages, passages };
}

async function searchPdf(index, q) {
  const ex = await embedder(() => {});
  const qv = (await ex([q], { pooling: 'mean', normalize: true })).tolist()[0];
  const qw = words(q).filter((w) => !STOP.has(w));
  return index.passages.map((p) => {
    const hits = qw.filter((w) => p.words.has(w)).length;
    return { ...p, score: dot(qv, p.vec) + (qw.length ? 0.15 * hits / qw.length : 0) };
  }).sort((a, b) => b.score - a.score).slice(0, 4);
}

/** The sentence of a passage that matches the question best. */
function bestSentence(text, q) {
  const qw = new Set(words(q).filter((w) => !STOP.has(w)));
  const sents = text.split(/(?<=[.!?;])\s+/);
  let best = sents[0], bs = -1;
  for (const s of sents) { const n = words(s).filter((w) => qw.has(w)).length; if (n > bs) { bs = n; best = s; } }
  return best;
}

function chatPdfMount(body, files, ctx) {
  const file = files[0];
  let index = null, lm = null, lmTried = false;
  const log = h('div', { class: 'chatlog' });
  const status = h('p', { class: 'status' }, 'Reading your PDF…');
  const input = h('textarea', { class: 'inp chatinp', rows: 1, placeholder: 'Ask a question about this PDF…', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } } });
  const mic = micButton((t) => { input.value = t; }, (t) => { if (t) { input.value = t; ask(); } }, (m) => { status.textContent = m; });
  const send = h('button', { class: 'btn primary', type: 'button', onclick: () => ask(), html: icon('send') });
  const aiNote = h('div', { class: 'hint' });
  body.replaceChildren(h('div', { class: 'panel chatpanel' },
    h('div', { class: 'chathead' }, h('strong', {}, file.name), h('button', { class: 'btn ghost small', type: 'button', onclick: () => ctx.restart() }, 'Use another PDF')),
    log, status, h('div', { class: 'chatbar' }, mic.el, input, send), aiNote));
  const say = (who, ...kids) => { const b = h('div', { class: 'bubble ' + who }, ...kids); log.append(b); log.scrollTop = log.scrollHeight; return b; };

  (async () => {
    try {
      index = await indexPdf(file, (m) => { status.textContent = m; });
      if (!index.passages.length) {
        status.textContent = '';
        say('bot', 'This PDF has no text I can read: it is probably a scan. Make it searchable first, then ask again.',
          h('div', {}, h('button', { class: 'btn small primary', type: 'button', onclick: () => ctx.openTool?.('ocr', [file]) }, 'Open OCR PDF')));
        return;
      }
      status.textContent = '';
      const st = await builtinAIStatus();
      aiNote.textContent = st === 'available' ? 'Answers are written by the AI built into your browser, from the parts of the PDF shown under each answer.'
        : 'Answers quote the most relevant parts of the PDF, with page numbers. In Chrome or Edge with built-in AI turned on, you also get written answers.';
      say('bot', `Ready: ${index.pages} page${index.pages > 1 ? 's' : ''}. Ask anything, for example "What is the deadline?" or "Summarise page 2".`);
      input.focus();
    } catch (e) { console.error(e); status.textContent = ''; say('bot err', 'Could not read this PDF: ' + (e.message || e)); }
  })();

  async function ask() {
    const q = input.value.trim();
    if (!q || !index?.passages.length) return;
    input.value = '';
    say('me', q);
    const b = say('bot', h('span', { class: 'spinner' }), ' Looking through the PDF…');
    try {
      const hits = await searchPdf(index, q);
      const pageRef = (p) => h('span', { class: 'pgref' }, 'Page ' + p.page);
      const sources = h('details', { class: 'sources' }, h('summary', {}, 'Where this comes from'),
        hits.map((p) => h('div', { class: 'src' }, pageRef(p), ' ', p.text.length > 420 ? p.text.slice(0, 420) + '…' : p.text)));
      if (!lmTried) { lmTried = true; lm = await builtinAI('You answer questions about a document using only the excerpts given. Be brief and exact. Mention page numbers like (page 3). If the excerpts do not contain the answer, say so.'); }
      if (lm) {
        const ctxText = hits.map((p) => `[page ${p.page}] ${p.text}`).join('\n\n');
        const ans = await (await lm.clone()).prompt(`Excerpts:\n${ctxText}\n\nQuestion: ${q}`);
        b.replaceChildren(h('div', { class: 'answer' }, ans), sources);
      } else {
        const top = hits[0], more = hits.slice(1, 3).filter((p) => p.score > top.score * 0.8);
        b.replaceChildren(h('div', { class: 'answer' }, h('mark', {}, bestSentence(top.text, q)), ' ', pageRef(top)),
          ...(more.length ? [h('div', { class: 'hint' }, 'Other places that may answer it:'), ...more.map((p) => h('div', { class: 'src' }, pageRef(p), ' ', bestSentence(p.text, q)))] : []), sources);
      }
    } catch (e) { console.error(e); b.replaceChildren('Sorry, that did not work: ' + (e.message || e)); b.classList.add('err'); }
    log.scrollTop = log.scrollHeight;
  }
}

/** Mic button: live text while talking, then the final text. */
export function micButton(onText, onEnd, onStatus, { lang = () => 'en', priv = () => false } = {}) {
  let session = null;
  const el = h('button', { class: 'btn micbtn', type: 'button', title: 'Speak', html: icon('mic'), onclick: () => {
    if (session) { session.stop(); return; }
    if (!hasLiveSpeech && !canRecord) { onStatus('This browser cannot use the microphone. Type instead.'); return; }
    el.classList.add('live');
    session = listen({ lang: lang(), priv: priv(), onText, onStatus, onError: (m) => m && onStatus(m),
      onEnd: (t) => { session = null; el.classList.remove('live'); onStatus(''); onEnd(t); } });
  } });
  return { el, stop: () => session?.stop() };
}

// ===================== tool definitions =====================
const AUDIO_ACCEPT = 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba,.webm,.mp4,.m4v,.mov,.mkv,.3gp,.amr';
const ts = (s, sep = ',') => { const ms = Math.round(s * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`; };

export const tools = {
  'passport-photo': {
    accept: IMG_ACCEPT, multiple: false, label: 'Select a photo of your face', capture: 'user',
    mount: passportMount,
    // Used by the AI assistant: no screen, just the files.
    async quick(files, o = {}, ctx = {}) {
      const st = { bg: o.bg || '#ffffff', zoom: 1, dx: 0, dy: 0, bright: 100 };
      const data = await analysePortrait(files[0], { removeBg: o.removeBg !== false, onStatus: (m) => ctx.progress?.(0.4, m) });
      return passportOutputs({ ...data, ...st }, specById(o.spec || 'in'), { sheet: o.sheet || 'none', maxKB: o.maxKB || 0 });
    }
  },

  'audio-to-text': {
    accept: AUDIO_ACCEPT, multiple: true, label: 'Select audio or video files', runLabel: 'Turn speech into text',
    notice: 'The Whisper AI model runs on your device: nothing is uploaded. It is downloaded once (40 MB, or 75 MB for "More accurate"). About as long as the recording to process, often faster.',
    options: [
      { key: 'lang', label: 'Spoken language', type: 'select', default: '', options: [['', 'Detect automatically'], ...VOICE_LANGS.map(([c, n]) => [c, n])] },
      { key: 'task', label: 'Write it in', type: 'seg', default: 'transcribe', options: [['transcribe', 'Same language'], ['translate', 'English (translate)']] },
      { key: 'size', label: 'Model', type: 'seg', default: 'tiny', options: [['tiny', 'Fast'], ['base', 'More accurate']] },
      { key: 'out', label: 'Save as', type: 'seg', default: 'txt', options: [['txt', 'Text (.txt)'], ['srt', 'Subtitles (.srt)'], ['vtt', 'Subtitles (.vtt)'], ['all', 'All three']] }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const set = (m) => ctx.progress((i + 0.5) / files.length, `${f.name}: ${m}`);
        const r = await transcribe(f, { size: o.size, language: o.lang, task: o.task, timestamps: o.out !== 'txt', onStatus: set });
        if (!r.text) throw new Error(`No speech was found in ${f.name}.`);
        const base = stem(f.name);
        const chunks = r.chunks.filter((c) => c.text.trim());
        if (o.out === 'txt' || o.out === 'all') {
          const text = chunks.length ? chunks.map((c) => c.text.trim()).join(' ') : r.text;
          outputs.push({ name: base + '.txt', blob: new Blob([text], { type: 'text/plain' }), preview: i === 0 ? text.slice(0, 3000) : undefined });
        }
        const at = (c, k) => c.timestamp?.[k] ?? (k ? (c.timestamp?.[0] ?? 0) + 3 : 0);
        if (o.out === 'srt' || o.out === 'all') {
          const srt = chunks.map((c, k) => `${k + 1}\n${ts(at(c, 0))} --> ${ts(at(c, 1))}\n${c.text.trim()}\n`).join('\n');
          outputs.push({ name: base + '.srt', blob: new Blob([srt], { type: 'text/plain' }), preview: i === 0 && o.out === 'srt' ? srt.slice(0, 3000) : undefined });
        }
        if (o.out === 'vtt' || o.out === 'all') {
          const vtt = 'WEBVTT\n\n' + chunks.map((c) => `${ts(at(c, 0), '.')} --> ${ts(at(c, 1), '.')}\n${c.text.trim()}\n`).join('\n');
          outputs.push({ name: base + '.vtt', blob: new Blob([vtt], { type: 'text/vtt' }), preview: i === 0 && o.out === 'vtt' ? vtt.slice(0, 3000) : undefined });
        }
      }
      return outputs;
    }
  },

  'chat-pdf': {
    accept: '.pdf,application/pdf', multiple: false, label: 'Select a PDF to ask about',
    mount: chatPdfMount
  }
};


