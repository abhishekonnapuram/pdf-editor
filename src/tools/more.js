// Everyday tools: exam-form photo & signature, ID card print, QR codes, image to text, video/audio to MP3
// and photo collages. Everything runs on the device.
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { h, toast } from '../lib/ui.js';
import { stem, fmtSize } from '../lib/core.js';
import { IMG_ACCEPT, readPicture, newCanvas, resizeCanvas, encode, fitToSize } from '../lib/imgio.js';

const firstCanvas = async (f) => (await readPicture(f)).frames[0].canvas;
const KB = 1024;

// ===================== Exam photo & signature =====================
// [id, name, photo {w, h, min KB, max KB}, signature {…}]. Rules change between notices: the tool says so.
const EXAMS = [
  ['ibps', 'IBPS / SBI / RBI bank exams', { w: 200, h: 230, min: 20, max: 50 }, { w: 140, h: 60, min: 10, max: 20 }],
  ['ssc', 'SSC (CGL, CHSL, MTS, GD, CPO…)', { w: 276, h: 354, min: 20, max: 50 }, { w: 315, h: 157, min: 10, max: 20 }],
  ['upsc', 'UPSC (OTR / civil services)', { w: 550, h: 550, min: 20, max: 300 }, { w: 700, h: 350, min: 20, max: 300 }],
  ['nta', 'NTA: NEET, JEE Main, CUET', { w: 350, h: 450, min: 10, max: 200 }, { w: 350, h: 150, min: 4, max: 30 }],
  ['custom', 'Other exam / custom size', null, null]
];

// JPEG comment blocks add bytes without changing the picture (for forms that also have a minimum size).
async function padJpeg(blob, target) {
  const b = new Uint8Array(await blob.arrayBuffer());
  let need = target - b.length + 64;
  if (need <= 0) return blob;
  const parts = [b.slice(0, 2)];
  while (need > 0) {
    const n = Math.min(65533, Math.max(16, need));
    const seg = new Uint8Array(n + 4);
    seg[0] = 0xff; seg[1] = 0xfe; seg[2] = (n + 2) >> 8; seg[3] = (n + 2) & 255;
    seg.fill(32, 4);
    parts.push(seg); need -= seg.length;
  }
  parts.push(b.slice(2));
  return new Blob(parts, { type: 'image/jpeg' });
}

// Signature photos: plain white paper and dark, even ink.
function cleanSignature(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  const paper = sum / (d.length / 4), cut = paper * 0.72;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    if (l > cut) { d[i] = d[i + 1] = d[i + 2] = 255; }
    else { const k = Math.max(0, l / cut) * 0.35; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Fill the w×h frame from the picture: crop (keeping the top, where the head is) or fit with white bars.
function frame(src, w, hh, fit, topBias = 0.3) {
  const c = newCanvas(w, hh), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh);
  g.imageSmoothingQuality = 'high';
  if (fit === 'pad') {
    const k = Math.min(w / src.width, hh / src.height);
    const r = resizeCanvas(src, src.width * k, src.height * k);
    g.drawImage(r, Math.round((w - r.width) / 2), Math.round((hh - r.height) / 2));
  } else {
    const k = Math.max(w / src.width, hh / src.height), cw = w / k, ch = hh / k;
    const sx = (src.width - cw) / 2, sy = (src.height - ch) * topBias;
    const crop = newCanvas(Math.round(cw), Math.round(ch));
    crop.getContext('2d').drawImage(src, sx, sy, cw, ch, 0, 0, crop.width, crop.height);
    g.drawImage(resizeCanvas(crop, w, hh), 0, 0);
  }
  return c;
}

function nameStrip(c, name, date) {
  const lines = [name, date].filter((s) => s && s.trim());
  if (!lines.length) return c;
  const fs = Math.max(9, Math.round(c.height * 0.065)), strip = Math.round(fs * 1.3 * lines.length + fs * 0.5);
  const out = newCanvas(c.width, c.height), g = out.getContext('2d');
  g.drawImage(c, 0, 0, c.width, c.height - strip, 0, 0, c.width, c.height - strip);
  g.fillStyle = '#fff'; g.fillRect(0, c.height - strip, c.width, strip);
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${fs}px Arial, sans-serif`;
  lines.forEach((t, i) => g.fillText(t.trim(), c.width / 2, c.height - strip + fs * 0.4 + fs * 1.3 * (i + 0.5), c.width - 6));
  return out;
}

const examPhoto = {
  accept: IMG_ACCEPT, multiple: true, label: 'Select your photo and/or signature', capture: true, runLabel: 'Make it ready for the form',
  options: () => [
    { key: 'exam', label: 'Exam or form', type: 'select', default: 'ibps', options: EXAMS.map(([v, l]) => [v, l]),
      hint: 'Sizes are taken from recent notices, but they can change. Always check your exam’s latest instructions and pick “Other exam” to type them yourself if they differ.' },
    { key: 'what', label: 'These pictures are', type: 'seg', default: 'photo', options: [['photo', 'Photo'], ['sign', 'Signature']] },
    { key: 'w', label: 'Width (pixels)', type: 'number', default: 200, min: 20, showIf: (v) => v.exam === 'custom' },
    { key: 'h', label: 'Height (pixels)', type: 'number', default: 230, min: 20, showIf: (v) => v.exam === 'custom' },
    { key: 'min', label: 'Smallest file size (KB)', type: 'number', default: 0, min: 0, showIf: (v) => v.exam === 'custom' },
    { key: 'max', label: 'Largest file size (KB)', type: 'number', default: 50, min: 2, showIf: (v) => v.exam === 'custom' },
    { key: 'fit', label: 'Shape', type: 'seg', default: 'crop', options: [['crop', 'Crop to fit'], ['pad', 'Keep all (white edges)']] },
    { key: 'clean', label: 'Clean up: white paper, dark ink', type: 'checkbox', default: true, showIf: (v) => v.what === 'sign' },
    { key: 'addName', label: 'Print name and date under the photo', type: 'checkbox', default: false, showIf: (v) => v.what === 'photo', hint: 'Only if your form asks for it.' },
    { key: 'name', label: 'Name', placeholder: 'Your name', default: '', showIf: (v) => v.what === 'photo' && v.addName },
    { key: 'date', label: 'Date', placeholder: 'e.g. 17-11-2026', default: '', showIf: (v) => v.what === 'photo' && v.addName }
  ],
  async process(files, o, ctx) {
    const ex = EXAMS.find((e) => e[0] === o.exam);
    const spec = ex[2] ? (o.what === 'sign' ? ex[3] : ex[2]) : { w: +o.w, h: +o.h, min: +o.min || 0, max: +o.max };
    if (!(spec.w > 0 && spec.h > 0 && spec.max > 0)) throw new Error('Enter the width, height and largest file size from the form.');
    if (spec.min >= spec.max) throw new Error('The smallest file size must be less than the largest.');
    const outputs = [], notes = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress(i / files.length, 'Preparing ' + files[i].name);
      let c = await firstCanvas(files[i]);
      if (o.what === 'sign' && o.clean) c = cleanSignature(resizeCanvas(c, c.width, c.height));
      c = frame(c, spec.w, spec.h, o.fit, o.what === 'sign' ? 0.5 : 0.3);
      if (o.what === 'photo' && o.addName) c = nameStrip(c, o.name, o.date);
      let r = await fitToSize(c, 'jpg', spec.max * KB, { allowShrink: false });
      let blob = r.blob;
      if (blob.size < spec.min * KB) {
        const best = await encode(c, 'jpg', { quality: 1 });
        blob = best.size <= spec.max * KB ? best : blob;
        if (blob.size < spec.min * KB) blob = await padJpeg(blob, spec.min * KB + 512);
      }
      const ok = blob.size <= spec.max * KB && blob.size >= spec.min * KB;
      notes.push(`${files[i].name}: ${spec.w} × ${spec.h} px, ${fmtSize(blob.size)}${ok ? ' ✓' : ` (could not get under ${spec.max} KB)`}`);
      outputs.push({ name: `${stem(files[i].name)}-${o.what === 'sign' ? 'signature' : 'photo'}.jpg`, blob });
    }
    const label = ex[2] ? ex[1] : 'your form';
    notes.unshift(`Ready for ${label}: ${o.what === 'sign' ? 'signature' : 'photo'} ${spec.w} × ${spec.h} px, ${spec.min ? spec.min + '–' : 'under '}${spec.max} KB, JPG.`);
    return { outputs, note: notes.join('\n') };
  }
};

// ===================== ID card print =====================
const MM = 72 / 25.4;
const PAPER = { a4: [210, 297], letter: [215.9, 279.4] };

function cardCanvas(src, wmm, hmm, fit) {
  const dpi = 300, w = Math.round(wmm / 25.4 * dpi), hh = Math.round(hmm / 25.4 * dpi);
  const c = frame(src, w, hh, fit === 'contain' ? 'pad' : 'crop', 0.5);
  // Rounded corners like a real card.
  const out = newCanvas(w, hh), g = out.getContext('2d');
  const r = Math.round(3.18 / 25.4 * dpi);
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh);
  g.beginPath(); g.roundRect(0, 0, w, hh, r); g.clip();
  g.drawImage(c, 0, 0);
  return out;
}

const idCard = {
  accept: IMG_ACCEPT, multiple: true, minFiles: 1, label: 'Select the front and back of your card (in that order)', capture: true, runLabel: 'Make print page',
  notice: 'Add the front first, then the back. For several cards, add front, back, front, back… Crop each photo to the card’s edges first (Crop image) for the best result.',
  options: [
    { key: 'paper', label: 'Paper', type: 'seg', default: 'a4', options: [['a4', 'A4'], ['letter', 'US Letter']] },
    { key: 'layout', label: 'Layout', type: 'seg', default: 'stack', options: [['stack', 'Back below front'], ['side', 'Side by side']] },
    { key: 'size', label: 'Card size', type: 'seg', default: 'real', options: [['real', 'Real size (85.6 × 54 mm)'], ['big', 'Bigger (1.4×)']] },
    { key: 'fit', label: 'Photo', type: 'seg', default: 'cover', options: [['cover', 'Fill the card'], ['contain', 'Show all of it']] },
    { key: 'cut', label: 'Thin cut lines around each card', type: 'checkbox', default: true }
  ],
  async process(files, o, ctx) {
    const [PW, PH] = PAPER[o.paper];
    const k = o.size === 'big' ? 1.4 : 1;
    const doc = await PDFDocument.create();
    const gap = 8, margin = 15;
    const cards = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress(i / files.length * 0.8, 'Adding ' + files[i].name);
      const src = await firstCanvas(files[i]);
      const portrait = src.height > src.width * 1.1;
      const w = (portrait ? 54 : 85.6) * k, hh = (portrait ? 85.6 : 54) * k;
      const c = cardCanvas(src, w, hh, o.fit);
      const jpg = await encode(c, 'jpg', { quality: 0.93 });
      cards.push({ w, h: hh, img: await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer())) });
    }
    // Pairs (front, back) placed in rows, centred on the page.
    let page = null, y = 0;
    const newPage = () => { page = doc.addPage([PW * MM, PH * MM]); y = margin; };
    const draw = (cd, x, top) => {
      page.drawImage(cd.img, { x: x * MM, y: (PH - top - cd.h) * MM, width: cd.w * MM, height: cd.h * MM });
      if (o.cut) page.drawRectangle({ x: x * MM, y: (PH - top - cd.h) * MM, width: cd.w * MM, height: cd.h * MM, borderWidth: 0.5, borderColor: rgb(0.55, 0.55, 0.55), borderDashArray: [3, 3], opacity: 0 });
    };
    newPage();
    for (let i = 0; i < cards.length; i += 2) {
      const pair = cards.slice(i, i + 2);
      if (o.layout === 'side') {
        const rowW = pair.reduce((s, c) => s + c.w, 0) + gap * (pair.length - 1), rowH = Math.max(...pair.map((c) => c.h));
        if (y + rowH > PH - margin) newPage();
        let x = (PW - rowW) / 2;
        for (const c of pair) { draw(c, x, y); x += c.w + gap; }
        y += rowH + gap * 2;
      } else {
        const blockH = pair.reduce((s, c) => s + c.h, 0) + gap * (pair.length - 1);
        if (y + blockH > PH - margin) newPage();
        for (const c of pair) { draw(c, (PW - c.w) / 2, y); y += c.h + gap; }
        y += gap * 2;
      }
    }
    ctx.progress(0.95, 'Saving');
    const bytes = await doc.save();
    return { outputs: [{ name: 'id-card-print.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }],
      note: `Print at 100% (“Actual size”, not “Fit to page”) so the card comes out at ${o.size === 'big' ? '1.4 times the' : 'its real'} size.` };
  }
};

// ===================== QR code generator =====================
const QR_TYPES = [
  ['url', 'Link'], ['text', 'Text'], ['upi', 'UPI payment'], ['wifi', 'Wi-Fi'], ['contact', 'Contact'],
  ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['phone', 'Phone'], ['sms', 'SMS']
];
const QR_FIELDS = {
  url: [['url', 'Website address', 'https://example.com']],
  text: [['text', 'Text', 'Any text', 'textarea']],
  upi: [['pa', 'UPI ID', 'name@bank'], ['pn', 'Name shown to the payer', 'Your name or shop'], ['am', 'Amount (optional)', 'e.g. 250'], ['tn', 'Note (optional)', 'e.g. Order 15']],
  wifi: [['ssid', 'Network name (SSID)', 'MyWiFi'], ['pass', 'Password', ''], ['enc', 'Security', 'WPA', 'select', [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'No password']]]],
  contact: [['name', 'Name', 'Full name'], ['org', 'Company', ''], ['tel', 'Phone', '+91 …'], ['email', 'Email', ''], ['web', 'Website', ''], ['adr', 'Address', '']],
  whatsapp: [['num', 'WhatsApp number with country code', '91XXXXXXXXXX'], ['msg', 'Message (optional)', 'Hi!']],
  email: [['to', 'Email address', ''], ['sub', 'Subject', ''], ['body', 'Message', '', 'textarea']],
  phone: [['tel', 'Phone number', '+91 …']],
  sms: [['tel', 'Phone number', '+91 …'], ['msg', 'Message', '']]
};
const wifiEsc = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1');
function qrData(type, v) {
  const e = encodeURIComponent;
  switch (type) {
    case 'url': { const u = (v.url || '').trim(); return u && !/^[a-z][\w+.-]*:/i.test(u) ? 'https://' + u : u; }
    case 'text': return v.text || '';
    case 'upi': {
      if (!v.pa) return '';
      const q = [`pa=${e(v.pa.trim())}`, v.pn && `pn=${e(v.pn)}`, +v.am > 0 && `am=${(+v.am).toFixed(2)}`, 'cu=INR', v.tn && `tn=${e(v.tn)}`].filter(Boolean);
      return 'upi://pay?' + q.join('&');
    }
    case 'wifi': return v.ssid ? `WIFI:T:${v.enc || 'WPA'};S:${wifiEsc(v.ssid)};${v.enc === 'nopass' ? '' : `P:${wifiEsc(v.pass)};`};` : '';
    case 'contact': return v.name || v.tel ? ['BEGIN:VCARD', 'VERSION:3.0', `FN:${v.name || ''}`, `N:${(v.name || '').split(' ').reverse().join(';')}`, v.org && `ORG:${v.org}`, v.tel && `TEL:${v.tel}`, v.email && `EMAIL:${v.email}`, v.web && `URL:${v.web}`, v.adr && `ADR:;;${v.adr}`, 'END:VCARD'].filter(Boolean).join('\n') : '';
    case 'whatsapp': { const n = (v.num || '').replace(/\D/g, ''); return n ? `https://wa.me/${n}${v.msg ? '?text=' + e(v.msg) : ''}` : ''; }
    case 'email': return v.to ? `mailto:${v.to}${v.sub || v.body ? '?' + [v.sub && 'subject=' + e(v.sub), v.body && 'body=' + e(v.body)].filter(Boolean).join('&') : ''}` : '';
    case 'phone': return v.tel ? 'tel:' + v.tel.replace(/[^\d+]/g, '') : '';
    case 'sms': return v.tel ? `SMSTO:${v.tel.replace(/[^\d+]/g, '')}:${v.msg || ''}` : '';
  }
  return '';
}

function mountQr(el, ctx) {
  const st = { type: 'url', vals: {}, fg: '#000000', bg: '#ffffff', size: 1024, margin: 2, ecl: 'M', logo: null, round: false };
  let QR = null;
  const preview = h('canvas', { class: 'qrprev', width: 320, height: 320 });
  const msg = h('p', { class: 'hint' });
  const fieldsBox = h('div');
  const tabs = h('div', { class: 'seg qrtabs' });

  async function build(size) {
    QR ||= (await import('qrcode')).default;
    const data = qrData(st.type, st.vals);
    if (!data) return null;
    const ecl = st.logo ? 'H' : st.ecl;
    const qr = QR.create(data, { errorCorrectionLevel: ecl });
    const n = qr.modules.size, m = st.margin, cell = size / (n + 2 * m);
    const c = newCanvas(size, size), g = c.getContext('2d');
    g.fillStyle = st.bg; g.fillRect(0, 0, size, size);
    g.fillStyle = st.fg;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!qr.modules.get(y, x)) continue;
      const px = (x + m) * cell, py = (y + m) * cell;
      if (st.round) { g.beginPath(); g.arc(px + cell / 2, py + cell / 2, cell * 0.48, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(Math.floor(px), Math.floor(py), Math.ceil(cell), Math.ceil(cell));
    }
    if (st.logo) {
      const L = size * 0.22, x = (size - L) / 2;
      g.fillStyle = st.bg; g.beginPath(); g.roundRect(x - cell, x - cell, L + 2 * cell, L + 2 * cell, cell * 2); g.fill();
      const k = Math.min(L / st.logo.width, L / st.logo.height), w = st.logo.width * k, hh = st.logo.height * k;
      g.drawImage(st.logo, (size - w) / 2, (size - hh) / 2, w, hh);
    }
    return { canvas: c, data, qr, n, m };
  }
  function svgOf(r) {
    const { qr, n, m } = r, S = n + 2 * m;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) path += st.round ? `M${x + m + 0.5},${y + m + 0.02}a0.48,0.48 0 1,0 0.001,0z` : `M${x + m},${y + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${st.size}" height="${st.size}" shape-rendering="crispEdges"><rect width="${S}" height="${S}" fill="${st.bg}"/><path fill="${st.fg}" d="${path}"/></svg>`;
  }
  let timer = 0;
  const redraw = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try {
      const r = await build(640);
      const g = preview.getContext('2d');
      g.clearRect(0, 0, 320, 320);
      if (!r) { msg.textContent = 'Fill in the details to see your QR code.'; return; }
      g.drawImage(r.canvas, 0, 0, 320, 320);
      msg.textContent = st.type === 'upi' ? 'Scan it with any UPI app to test before printing.' : 'Scan it with your phone camera to test it.';
    } catch (e) { msg.textContent = /too big|amount of data/i.test(e.message) ? 'That is too much text for one QR code. Make it shorter.' : e.message; }
  }, 120); };

  function drawFields() {
    fieldsBox.replaceChildren(...QR_FIELDS[st.type].map(([k, label, ph, type, opts]) => h('div', { class: 'field' }, h('div', { class: 'lbl' }, label),
      type === 'textarea' ? h('textarea', { placeholder: ph, oninput: (e) => { st.vals[k] = e.target.value; redraw(); } }, st.vals[k] || '')
        : type === 'select' ? h('select', { onchange: (e) => { st.vals[k] = e.target.value; redraw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: (st.vals[k] || opts[0][0]) === v }, l)))
          : h('input', { type: 'text', value: st.vals[k] || '', placeholder: ph, autocomplete: 'off', oninput: (e) => { st.vals[k] = e.target.value; redraw(); } }))));
  }
  for (const [v, l] of QR_TYPES) {
    const b = h('button', { type: 'button', class: v === st.type ? 'on' : '', onclick: () => { st.type = v; [...tabs.children].forEach((x) => x.classList.toggle('on', x === b)); drawFields(); redraw(); } }, l);
    tabs.append(b);
  }
  const row = (label, input) => h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), input);
  const logoName = h('span', { class: 'status' }, ' none');
  const go = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
    const r = await build(st.size).catch((e) => { toast(e.message); return null; });
    if (!r) { toast('Fill in the details first.'); return; }
    const png = await encode(r.canvas, 'png');
    const outs = [{ name: `qr-code-${st.type}.png`, blob: png }];
    if (!st.logo) outs.push({ name: `qr-code-${st.type}.svg`, blob: new Blob([svgOf(r)], { type: 'image/svg+xml' }) });
    ctx.finish(outs, 'PNG for sharing and printing' + (st.logo ? '.' : '; SVG stays sharp at any size (for print and design).'));
  } }, 'Create QR code');

  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, h('div', { class: 'lbl', style: { fontWeight: 700, marginBottom: '8px' } }, 'What should it open?'), tabs, fieldsBox),
    h('div', { class: 'panel sidepanel' },
      h('div', { class: 'qrbox' }, preview), msg,
      h('div', { class: 'qrrow' },
        row('Colour', h('input', { type: 'color', value: st.fg, oninput: (e) => { st.fg = e.target.value; redraw(); } })),
        row('Background', h('input', { type: 'color', value: st.bg, oninput: (e) => { st.bg = e.target.value; redraw(); } }))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { st.round = e.target.checked; redraw(); } }), ' Round dots'),
      row('Logo in the middle (optional)', h('div', {},
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const { pickFiles } = await import('../lib/ui.js');
          const [f] = await pickFiles(IMG_ACCEPT, false);
          if (!f) return;
          st.logo = await firstCanvas(f); logoName.textContent = ' ' + f.name; redraw();
        } }, 'Choose…'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { st.logo = null; logoName.textContent = ' none'; redraw(); } }, 'Remove'), logoName)),
      row('Size', h('select', { onchange: (e) => { st.size = +e.target.value; } }, [[512, 'Small (512 px)'], [1024, 'Medium (1024 px)'], [2048, 'Large for print (2048 px)']].map(([v, l]) => h('option', { value: v, selected: v === st.size }, l)))),
      go)));
  drawFields();
  redraw();
}

// ===================== Image to text =====================
const LANGS = [
  ['eng', 'English'], ['hin', 'Hindi'], ['tel', 'Telugu'], ['tam', 'Tamil'], ['kan', 'Kannada'], ['mar', 'Marathi'], ['ben', 'Bengali'], ['guj', 'Gujarati'],
  ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['por', 'Portuguese'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)']
];
const imageToText = {
  accept: IMG_ACCEPT, multiple: true, label: 'Select photos, screenshots or scans', capture: true, runLabel: 'Get the text',
  options: [
    { key: 'lang', label: 'Language', type: 'select', default: 'eng', options: LANGS },
    { key: 'lang2', label: 'Second language (optional)', type: 'select', default: '', options: [['', 'None'], ...LANGS] },
    { key: 'join', label: 'Also put all the text in one file', type: 'checkbox', default: true }
  ],
  async process(files, o, ctx) {
    const langs = [o.lang, o.lang2].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('+');
    const { createWorker } = await import('tesseract.js');
    let base = 0;
    const worker = await createWorker(langs, 1, { logger: (m) => { if (m.status) ctx.progress(Math.min(0.98, base + (m.progress || 0) / files.length * 0.9), m.status.replace(/^./, (c) => c.toUpperCase()) + '…'); } });
    const outputs = [], all = [];
    let words = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        base = i / files.length;
        const c = await firstCanvas(files[i]);
        // Small screenshots read better a little larger.
        const src = Math.max(c.width, c.height) < 1200 ? resizeCanvas(c, c.width * 2, c.height * 2) : c;
        const { data } = await worker.recognize(src);
        const text = (data.text || '').replace(/\n{3,}/g, '\n\n').trim();
        words += text ? text.split(/\s+/).length : 0;
        all.push(files.length > 1 ? `----- ${files[i].name} -----\n${text}` : text);
        outputs.push({ name: stem(files[i].name) + '.txt', blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) });
      }
    } finally { await worker.terminate(); }
    if (files.length > 1 && o.join) outputs.unshift({ name: 'all-text.txt', blob: new Blob([all.join('\n\n')], { type: 'text/plain;charset=utf-8' }) });
    const preview = all.join('\n\n');
    try { await navigator.clipboard.writeText(preview); } catch { /* not allowed here: the files have it */ }
    return { outputs, note: words ? `Found ${words} words (copied to the clipboard). Open “Preview” to read it.\n\n${preview.slice(0, 600)}${preview.length > 600 ? '…' : ''}` : 'No text was found. Try a sharper picture, or choose the right language.' };
  }
};

// ===================== Video / audio to MP3 =====================
const MEDIA = 'video/*,audio/*,.mp4,.m4v,.mov,.webm,.mkv,.3gp,.m4a,.aac,.mp3,.wav,.ogg,.oga,.opus,.flac,.wma';
const parseTime = (s) => {
  if (!s || !String(s).trim()) return null;
  const p = String(s).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  return p.reduce((a, v) => a * 60 + v, 0);
};
const videoToMp3 = {
  accept: MEDIA, multiple: true, label: 'Select videos or audio files', runLabel: 'Convert to MP3',
  options: [
    { key: 'kbps', label: 'Quality', type: 'seg', default: '192', options: [['128', 'Normal (128 kbps)'], ['192', 'High (192 kbps)'], ['320', 'Best (320 kbps)']] },
    { key: 'mono', label: 'Mono (half the size; good for speech)', type: 'checkbox', default: false },
    { key: 'from', label: 'Start at (optional)', placeholder: 'e.g. 0:30', default: '', hint: 'Minutes:seconds. Leave empty to keep the whole file.' },
    { key: 'to', label: 'End at (optional)', placeholder: 'e.g. 3:45', default: '' }
  ],
  async process(files, o, ctx) {
    const { Mp3Encoder } = await import('@breezystack/lamejs');
    const outputs = [], notes = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi], part = (p) => (fi + p) / files.length;
      ctx.progress(part(0.02), 'Reading ' + f.name);
      let buf;
      try {
        const ac = new OfflineAudioContext(2, 1, 44100);
        buf = await ac.decodeAudioData(await f.arrayBuffer());
      } catch {
        throw new Error(`${f.name}: this browser can not read the sound in this file. MP4, WEBM, M4A, WAV and OGG work everywhere; for MOV or MKV try Chrome or Edge.`);
      }
      const rate = buf.sampleRate;
      const a = Math.max(0, Math.floor((parseTime(o.from) || 0) * rate));
      const b = Math.min(buf.length, Math.floor((parseTime(o.to) ?? buf.duration) * rate));
      if (b <= a) throw new Error('The end time must be after the start time.');
      const chans = o.mono || buf.numberOfChannels === 1 ? 1 : 2;
      const L = buf.getChannelData(0).subarray(a, b), R = buf.numberOfChannels > 1 ? buf.getChannelData(1).subarray(a, b) : L;
      const toI16 = (src, mix) => {
        const out = new Int16Array(src.length);
        for (let i = 0; i < src.length; i++) {
          const v = Math.max(-1, Math.min(1, mix ? (src[i] + mix[i]) / 2 : src[i]));
          out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        return out;
      };
      const enc = new Mp3Encoder(chans, rate, +o.kbps);
      const chunks = [], BLOCK = 1152 * 64;
      for (let i = 0; i < L.length; i += BLOCK) {
        const l = L.subarray(i, i + BLOCK), r = R.subarray(i, i + BLOCK);
        const mp3 = chans === 1 ? enc.encodeBuffer(toI16(l, buf.numberOfChannels > 1 ? r : null)) : enc.encodeBuffer(toI16(l), toI16(r));
        if (mp3.length) chunks.push(mp3);
        if ((i / BLOCK) % 8 === 0) { ctx.progress(part(0.1 + 0.9 * i / L.length), `Making ${f.name.replace(/\.[^.]+$/, '')}.mp3`); await new Promise((r2) => setTimeout(r2, 0)); }
      }
      const end = enc.flush();
      if (end.length) chunks.push(end);
      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      const secs = (b - a) / rate;
      notes.push(`${stem(f.name)}.mp3: ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} min, ${fmtSize(blob.size)}`);
      outputs.push({ name: stem(f.name) + '.mp3', blob });
    }
    return { outputs, note: notes.join('\n') };
  }
};

// ===================== Collage maker =====================
const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], landscape: [1920, 1080], a4: [2480, 3508], a4l: [3508, 2480] };

// Cells [{x, y, w, h}] in a W×H area.
function collageCells(n, W, H, layout, gap, aspects) {
  const cells = [];
  if (layout === 'feature' && n >= 2) {
    const portrait = H >= W;
    const rest = n - 1;
    if (portrait) {
      const bigH = (H - gap) * 0.62;
      cells.push({ x: 0, y: 0, w: W, h: bigH });
      const cw = (W - gap * (rest - 1)) / rest;
      for (let i = 0; i < rest; i++) cells.push({ x: i * (cw + gap), y: bigH + gap, w: cw, h: H - bigH - gap });
    } else {
      const bigW = (W - gap) * 0.62;
      cells.push({ x: 0, y: 0, w: bigW, h: H });
      const ch = (H - gap * (rest - 1)) / rest;
      for (let i = 0; i < rest; i++) cells.push({ x: bigW + gap, y: i * (ch + gap), w: W - bigW - gap, h: ch });
    }
    return cells;
  }
  if (layout === 'rows') {
    // Rows that keep each photo's shape, as even as possible.
    const rowsN = Math.max(1, Math.round(Math.sqrt(n * (H / W) / (aspects.reduce((s, a) => s + a, 0) / n) )));
    const per = Math.ceil(n / rowsN), rows = [];
    for (let i = 0; i < n; i += per) rows.push(aspects.slice(i, i + per).map((a, j) => [i + j, a]));
    const rh = (H - gap * (rows.length - 1)) / rows.length;
    rows.forEach((row, ri) => {
      const sum = row.reduce((s, [, a]) => s + a, 0);
      let x = 0;
      row.forEach(([, a], j) => {
        const w = j === row.length - 1 ? W - x : (W - gap * (row.length - 1)) * a / sum;
        cells.push({ x, y: ri * (rh + gap), w, h: rh });
        x += w + gap;
      });
    });
    return cells;
  }
  // Grid: the column count that makes cells closest to square.
  let best = 1, bestScore = Infinity;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c), cw = W / c, ch = H / r;
    const score = Math.abs(Math.log(cw / ch)) + (c * r - n) * 0.35;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  const cols = best, rows = Math.ceil(n / cols);
  const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols;
    // The last row is centred when it is not full.
    const off = (cols - inRow) * (cw + gap) / 2;
    cells.push({ x: off + (i % cols) * (cw + gap), y: r * (ch + gap), w: cw, h: ch });
  }
  return cells;
}

const collage = {
  accept: IMG_ACCEPT, multiple: true, minFiles: 2, label: 'Select 2 or more photos', runLabel: 'Make collage',
  options: [
    { key: 'layout', label: 'Layout', type: 'seg', default: 'grid', options: [['grid', 'Grid'], ['rows', 'Rows'], ['feature', 'One big + small']] },
    { key: 'size', label: 'Size', type: 'select', default: 'square', options: [['square', 'Square 1080 × 1080 (Instagram post)'], ['portrait', 'Portrait 1080 × 1350 (Instagram)'], ['story', 'Story / Status 1080 × 1920'], ['landscape', 'Landscape 1920 × 1080'], ['a4', 'A4 print, portrait'], ['a4l', 'A4 print, landscape']] },
    { key: 'gap', label: 'Space between photos', type: 'range', min: 0, max: 60, default: 12, unit: ' px' },
    { key: 'radius', label: 'Rounded corners', type: 'range', min: 0, max: 60, default: 0, unit: ' px' },
    { key: 'bg', label: 'Background colour', type: 'color', default: '#ffffff' },
    { key: 'fmt', label: 'Save as', type: 'seg', default: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG']] }
  ],
  async process(files, o, ctx) {
    const [W, H] = SIZES[o.size];
    const scale = W / 1080, gap = Math.round(o.gap * scale), pad = gap;
    const pics = [];
    for (let i = 0; i < files.length; i++) { ctx.progress(i / files.length * 0.7, 'Opening ' + files[i].name); pics.push(await firstCanvas(files[i])); }
    const cells = collageCells(pics.length, W - 2 * pad, H - 2 * pad, o.layout, gap, pics.map((p) => p.width / p.height));
    const c = newCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = o.bg; g.fillRect(0, 0, W, H);
    g.imageSmoothingQuality = 'high';
    cells.forEach((cell, i) => {
      const p = pics[i], x = Math.round(cell.x + pad), y = Math.round(cell.y + pad), w = Math.round(cell.w), hh = Math.round(cell.h);
      // Shrink big photos first (sharper), then crop the middle to the cell's shape.
      const k = Math.max(w / p.width, hh / p.height);
      const src = k < 1 ? resizeCanvas(p, p.width * k, p.height * k) : p;
      const k2 = Math.max(w / src.width, hh / src.height), sw = w / k2, sh = hh / k2;
      g.save();
      g.beginPath(); g.roundRect(x, y, w, hh, Math.round(o.radius * scale)); g.clip();
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, hh);
      g.restore();
    });
    ctx.progress(0.95, 'Saving');
    const blob = await encode(c, o.fmt, { quality: 0.92 });
    return { outputs: [{ name: `collage.${o.fmt}`, blob }], note: `${W} × ${H} px, ${pics.length} photos, ${fmtSize(blob.size)}.` };
  }
};

export const tools = {
  'exam-photo': examPhoto,
  'id-card-print': idCard,
  'qr-code': { standalone: true, mount: (el, ctx) => mountQr(el, ctx) },
  'image-to-text': imageToText,
  'video-to-mp3': videoToMp3,
  'collage-maker': collage
};
