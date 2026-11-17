// Documents from a form: GST invoices / quotations and resumes. Made as PDF (and Word for resumes) on the
// device. What people type is remembered in this browser only, so the next invoice or edit is quick.
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { h, toast, pickFiles } from '../lib/ui.js';
import { hexToRgb01 } from '../lib/core.js';
import { IMG_ACCEPT, readPicture, newCanvas, resizeCanvas, encode } from '../lib/imgio.js';

// ---------- shared ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('editsupreme.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('editsupreme.' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
};
const col = (hex) => { const [r, g, b] = hexToRgb01(hex); return rgb(r, g, b); };
const GREY = rgb(0.38, 0.4, 0.45), INK = rgb(0.1, 0.11, 0.14), LINE = rgb(0.86, 0.87, 0.9);

/** Small picture (logo, signature, photo) as a data URL, so it can be remembered. */
async function pictureDataUrl(maxSide = 500) {
  const [f] = await pickFiles(IMG_ACCEPT, false);
  if (!f) return null;
  const c = (await readPicture(f)).frames[0].canvas;
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  const r = resizeCanvas(c, c.width * k, c.height * k);
  const blob = await encode(r, 'png');
  return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
}
const dataUrlBytes = (u) => Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));

/** Fonts for a PDF: a Google font (any language, ₹) when it can be fetched, else Helvetica. */
async function pdfFonts(doc, family) {
  try {
    const { embedGoogleFont } = await import('../lib/fonts.js');
    const [reg, bold] = await Promise.all([embedGoogleFont(doc, family), embedGoogleFont(doc, family, { bold: true })]);
    // The web fonts hold the common Latin letters; other characters are swapped for ones they have.
    if (reg && bold) { const set = new Set(reg.getCharacterSet?.() || []); return { reg, bold, unicode: true, has: (ch) => !set.size || set.has(ch.codePointAt(0)) }; }
  } catch { /* offline: standard fonts */ }
  return { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), unicode: false };
}
// Standard fonts only know Western characters.
const safe = (F, s) => {
  s = String(s ?? '');
  if (F.unicode) return [...s].map((ch) => (ch === '\n' || F.has(ch) ? ch : ch === '₹' ? 'Rs. ' : ch === '•' ? '-' : '?')).join('');
  return s.replace(/₹/g, 'Rs. ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
};
function wrap(font, text, size, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (font.widthOfTextAtSize(t.trimEnd(), size) <= maxW || !line.trim()) {
        // A single word longer than the line is broken by characters.
        if (!line.trim() && font.widthOfTextAtSize(w, size) > maxW) {
          let part = '';
          for (const ch of w) { if (font.widthOfTextAtSize(part + ch, size) > maxW) { out.push(part); part = ''; } part += ch; }
          line = part;
        } else line = t;
      } else { out.push(line.trimEnd()); line = w.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}
const field = (label, input, cls = '') => h('div', { class: 'field ' + cls }, h('div', { class: 'lbl' }, label), input);
function inp(obj, key, { ph = '', type = 'text', onchange, area = false } = {}) {
  const on = (e) => { obj[key] = type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value; onchange?.(); };
  return area ? h('textarea', { placeholder: ph, oninput: on }, obj[key] || '')
    : h('input', { type, value: obj[key] ?? '', placeholder: ph, autocomplete: 'off', step: type === 'number' ? 'any' : undefined, oninput: on });
}

// ---------- amounts ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const under1000 = (n) => {
  const hd = Math.floor(n / 100), r = n % 100;
  const t = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ' ' + ONES[r % 10] : '');
  return [hd ? ONES[hd] + ' Hundred' : '', t].filter(Boolean).join(' ');
};
function words(n, indian) {
  n = Math.floor(n);
  if (!n) return 'Zero';
  const parts = [];
  const units = indian ? [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']] : [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  for (const [v, name] of units) if (n >= v) { const q = Math.floor(n / v); parts.push((q >= 1000 ? words(q, indian) : under1000(q)) + ' ' + name); n %= v; }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
const CURRENCIES = { INR: ['₹', 'Rupees', 'Paise', 'en-IN'], USD: ['$', 'Dollars', 'Cents', 'en-US'], EUR: ['€', 'Euros', 'Cents', 'en-IE'], GBP: ['£', 'Pounds', 'Pence', 'en-GB'], AED: ['AED ', 'Dirhams', 'Fils', 'en-AE'] };
const money = (v, cur) => CURRENCIES[cur][0] + (+v || 0).toLocaleString(CURRENCIES[cur][3], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function amountWords(v, cur) {
  const [, main, sub] = CURRENCIES[cur];
  const whole = Math.floor(v + 1e-9), cents = Math.round((v - whole) * 100);
  return `${main} ${words(whole, cur === 'INR')}${cents ? ` and ${words(cents, false)} ${sub}` : ''} Only`;
}

// ===================== Invoice =====================
const DOC_TYPES = [['Tax Invoice', 'Tax invoice'], ['Invoice', 'Invoice'], ['Quotation', 'Quotation'], ['Proforma Invoice', 'Proforma'], ['Bill of Supply', 'Bill of supply'], ['Receipt', 'Receipt']];
const today = () => new Date().toISOString().slice(0, 10);
const nextNo = (no) => { const m = String(no || '').match(/^(.*?)(\d+)(\D*)$/); return m ? m[1] + String(+m[2] + 1).padStart(m[2].length, '0') + m[3] : no || 'INV-001'; };

function invoiceTotals(inv) {
  let sub = 0, tax = 0;
  const lines = inv.items.filter((it) => it.desc || +it.rate).map((it) => {
    const amt = (+it.qty || 0) * (+it.rate || 0);
    const t = inv.tax === 'none' ? 0 : amt * (+it.gst || 0) / 100;
    sub += amt; tax += t;
    return { ...it, amt, t };
  });
  const disc = Math.min(sub, +inv.discount || 0);
  // Tax on the discounted value, spread in proportion.
  const taxAfter = sub ? tax * (sub - disc) / sub : 0;
  const total = Math.round((sub - disc + taxAfter) * 100) / 100;
  return { lines, sub, disc, tax: taxAfter, total };
}

async function invoicePdf(inv) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${inv.type} ${inv.no}`); doc.setCreator('EditSupreme');
  const F = await pdfFonts(doc, 'Noto Sans');
  const cur = F.unicode ? inv.currency : inv.currency;
  const m = (v) => safe(F, money(v, cur));
  const A = col(inv.accent || '#1f4fd1');
  const W = 595.28, H = 841.89, M = 40;
  let page = doc.addPage([W, H]), y = H - M;
  const text = (s, x, yy, { size = 10, font = F.reg, color = INK, align = 'left', maxW } = {}) => {
    s = safe(F, s);
    if (maxW) while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -2) + '…';
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y: yy, size, font, color });
  };
  const para = (s, x, yy, maxW, opt = {}) => { const size = opt.size || 9.5; let n = 0; for (const l of wrap(opt.font || F.reg, safe(F, s), size, maxW)) { text(l, x, yy - n * size * 1.35, opt); n++; } return n * size * 1.35; };

  // Header: seller on the left, document title on the right.
  let logoH = 0;
  if (inv.logo) {
    try {
      const img = await doc.embedPng(dataUrlBytes(inv.logo));
      const k = Math.min(150 / img.width, 54 / img.height);
      page.drawImage(img, { x: M, y: y - img.height * k, width: img.width * k, height: img.height * k });
      logoH = img.height * k + 8;
    } catch { /* not a picture we can use */ }
  }
  const s = inv.seller;
  let ly = y - logoH - 12;
  text(s.name || 'Your business name', M, ly, { size: 15, font: F.bold }); ly -= 15;
  ly -= para(s.address, M, ly, 260, { color: GREY });
  for (const l of [s.gstin && `GSTIN: ${s.gstin}`, s.state && `State: ${s.state}`, [s.phone, s.email].filter(Boolean).join('  ·  ')].filter(Boolean)) { text(l, M, ly, { size: 9.5, color: GREY }); ly -= 13; }

  text(inv.type.toUpperCase(), W - M, y - 14, { size: 20, font: F.bold, color: A, align: 'right' });
  let ry = y - 36;
  for (const [k, v] of [[inv.type === 'Quotation' ? 'Quotation no.' : 'Invoice no.', inv.no], ['Date', fmtDate(inv.date)], [inv.type === 'Quotation' ? 'Valid until' : 'Due date', fmtDate(inv.due)]]) {
    if (!v) continue;
    text(k, W - M - 110, ry, { size: 9.5, color: GREY }); text(v, W - M, ry, { size: 9.5, font: F.bold, align: 'right' }); ry -= 14;
  }
  y = Math.min(ly, ry) - 14;

  // Bill to.
  const b = inv.buyer;
  page.drawRectangle({ x: M, y: y - 74, width: W - 2 * M, height: 74, color: rgb(0.965, 0.97, 0.98) });
  text('BILL TO', M + 12, y - 16, { size: 8.5, font: F.bold, color: A });
  text(b.name || '—', M + 12, y - 31, { size: 11, font: F.bold, maxW: 300 });
  para(b.address, M + 12, y - 45, 300, { size: 9, color: GREY });
  let by = y - 16;
  for (const l of [b.gstin && `GSTIN: ${b.gstin}`, b.state && `Place of supply: ${b.state}`, b.phone && `Phone: ${b.phone}`].filter(Boolean)) { text(l, W - M - 12, by, { size: 9, color: GREY, align: 'right' }); by -= 13; }
  y -= 92;

  // Items table.
  const T = invoiceTotals(inv);
  const gst = inv.tax !== 'none';
  const cols = gst
    ? [['#', 22, 'left'], ['Item / description', 0, 'left'], ['HSN/SAC', 58, 'left'], ['Qty', 40, 'right'], ['Rate', 70, 'right'], ['GST', 40, 'right'], ['Amount', 82, 'right']]
    : [['#', 22, 'left'], ['Item / description', 0, 'left'], ['Qty', 50, 'right'], ['Rate', 85, 'right'], ['Amount', 95, 'right']];
  const fixed = cols.reduce((s2, c) => s2 + c[1], 0);
  cols[1][1] = W - 2 * M - fixed;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 22, color: A });
    let x = M;
    for (const [t, w, al] of cols) { text(t, al === 'right' ? x + w - 6 : x + 6, y - 15, { size: 9, font: F.bold, color: rgb(1, 1, 1), align: al }); x += w; }
    y -= 22;
  };
  head();
  T.lines.forEach((it, i) => {
    const descLines = wrap(F.reg, safe(F, it.desc || ''), 9.5, cols[1][1] - 12);
    const rowH = Math.max(1, descLines.length) * 12.5 + 10;
    if (y - rowH < 150) { page = doc.addPage([W, H]); y = H - M; head(); }
    const vals = gst ? [String(i + 1), null, it.hsn || '', fmtQty(it.qty), m(it.rate), (+it.gst || 0) + '%', m(it.amt)] : [String(i + 1), null, fmtQty(it.qty), m(it.rate), m(it.amt)];
    let x = M;
    cols.forEach(([, w, al], ci) => {
      if (ci === 1) descLines.forEach((l, li) => text(l, x + 6, y - 15 - li * 12.5, { size: 9.5 }));
      else text(vals[ci], al === 'right' ? x + w - 6 : x + 6, y - 15, { size: 9.5, align: al, maxW: w - 8 });
      x += w;
    });
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  });

  // Totals.
  if (y < 260) { page = doc.addPage([W, H]); y = H - M; }
  y -= 10;
  const tx = W - M - 220;
  const trow = (k, v, bold) => { text(k, tx, y - 12, { size: bold ? 11 : 9.5, font: bold ? F.bold : F.reg, color: bold ? INK : GREY }); text(v, W - M, y - 12, { size: bold ? 11 : 9.5, font: bold ? F.bold : F.reg, align: 'right' }); y -= bold ? 20 : 15; };
  const topY = y;
  trow('Subtotal', m(T.sub));
  if (T.disc) trow('Discount', '– ' + m(T.disc));
  if (inv.tax === 'cgst') { trow('CGST', m(T.tax / 2)); trow('SGST / UTGST', m(T.tax / 2)); }
  if (inv.tax === 'igst') trow('IGST', m(T.tax));
  page.drawLine({ start: { x: tx, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 1, color: A });
  y -= 6;
  trow('Total', m(T.total), true);

  // Amount in words, on the left beside the totals.
  let wy = topY - 12;
  text('Amount in words', M, wy, { size: 8.5, font: F.bold, color: A }); wy -= 13;
  wy -= para(amountWords(T.total, inv.currency), M, wy, W - 2 * M - 240, { size: 9.5 });
  y = Math.min(y, wy) - 16;

  // Bank details (+ a UPI QR code with the amount), notes and signature.
  const bk = inv.bank;
  let leftY = y, qrDrawn = false;
  if (bk.upi && inv.currency === 'INR' && T.total > 0) {
    try {
      const QR = (await import('qrcode')).default;
      const url = `upi://pay?pa=${encodeURIComponent(bk.upi)}&pn=${encodeURIComponent(s.name || '')}&am=${T.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.no || '')}`;
      const png = await QR.toDataURL(url, { margin: 1, width: 300 });
      const img = await doc.embedPng(dataUrlBytes(png));
      page.drawImage(img, { x: W - M - 84, y: y - 84, width: 84, height: 84 });
      text('Scan to pay (UPI)', W - M - 42, y - 95, { size: 8, color: GREY, align: 'center' });
      qrDrawn = true;
    } catch { /* no QR */ }
  }
  if (bk.name || bk.acc || bk.ifsc || bk.upi) {
    text('Bank details', M, leftY, { size: 8.5, font: F.bold, color: A }); leftY -= 14;
    for (const l of [bk.holder && `Account name: ${bk.holder}`, bk.name && `Bank: ${bk.name}`, bk.acc && `Account no.: ${bk.acc}`, bk.ifsc && `IFSC: ${bk.ifsc}`, bk.upi && `UPI: ${bk.upi}`].filter(Boolean)) { text(l, M, leftY, { size: 9.5 }); leftY -= 13; }
    leftY -= 8;
  }
  if (inv.notes) {
    text('Notes / terms', M, leftY, { size: 8.5, font: F.bold, color: A }); leftY -= 13;
    leftY -= para(inv.notes, M, leftY, qrDrawn ? W - 2 * M - 230 : W - 2 * M - 200, { size: 9, color: GREY });
  }
  // Signature block, bottom right.
  const sy = Math.min(leftY, y - (qrDrawn ? 110 : 0)) - 10;
  let sigY = Math.max(70, sy);
  if (sigY - 70 < 40) { page = doc.addPage([W, H]); sigY = H - M - 60; }
  if (inv.sign) {
    try {
      const img = await doc.embedPng(dataUrlBytes(inv.sign));
      const k = Math.min(130 / img.width, 42 / img.height);
      page.drawImage(img, { x: W - M - 65 - img.width * k / 2, y: sigY - 46, width: img.width * k, height: img.height * k });
    } catch { /* skip */ }
  }
  text(`For ${s.name || ''}`, W - M - 65, sigY, { size: 9, font: F.bold, align: 'center', maxW: 190 });
  page.drawLine({ start: { x: W - M - 140, y: sigY - 52 }, end: { x: W - M, y: sigY - 52 }, thickness: 0.6, color: GREY });
  text('Authorised signatory', W - M - 65, sigY - 63, { size: 8.5, color: GREY, align: 'center' });
  for (const p of doc.getPages()) p.drawText(safe(F, 'This is a computer-generated document.'), { x: M, y: 24, size: 7.5, font: F.reg, color: GREY });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
const fmtQty = (q) => (+q || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00');
  return isNaN(t) ? d : t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mountInvoice(el, ctx) {
  const saved = store.get('invoice', {});
  const inv = {
    type: saved.type || 'Tax Invoice', currency: saved.currency || 'INR', tax: saved.tax || 'cgst', accent: saved.accent || '#1f4fd1',
    seller: { name: '', address: '', gstin: '', state: '', phone: '', email: '', ...saved.seller },
    bank: { holder: '', name: '', acc: '', ifsc: '', upi: '', ...saved.bank },
    logo: saved.logo || null, sign: saved.sign || null, notes: saved.notes ?? 'Thank you for your business!',
    buyer: { name: '', address: '', gstin: '', state: '', phone: '' },
    no: saved.no ? nextNo(saved.no) : 'INV-001', date: today(), due: '', discount: '',
    items: [{ desc: '', hsn: '', qty: 1, rate: '', gst: 18 }]
  };
  const summary = h('div', { class: 'invsum' });
  const refresh = () => {
    const T = invoiceTotals(inv);
    summary.replaceChildren(...[
      h('div', {}, h('span', {}, 'Subtotal'), h('b', {}, money(T.sub, inv.currency))),
      T.disc ? h('div', {}, h('span', {}, 'Discount'), h('b', {}, '– ' + money(T.disc, inv.currency))) : null,
      inv.tax !== 'none' ? h('div', {}, h('span', {}, inv.tax === 'cgst' ? 'CGST + SGST' : 'IGST'), h('b', {}, money(T.tax, inv.currency))) : null,
      h('div', { class: 'tot' }, h('span', {}, 'Total'), h('b', {}, money(T.total, inv.currency)))].filter(Boolean));
  };
  const itemsBox = h('div', { class: 'invitems' });
  function drawItems() {
    const gst = inv.tax !== 'none';
    itemsBox.replaceChildren(
      h('div', { class: 'invrow invhead' + (gst ? '' : ' nogst') }, h('span', {}, 'Item / description'), gst && h('span', {}, 'HSN/SAC'), h('span', {}, 'Qty'), h('span', {}, 'Rate'), gst && h('span', {}, 'GST %'), h('span')),
      ...inv.items.map((it, i) => h('div', { class: 'invrow' + (gst ? '' : ' nogst') },
        inp(it, 'desc', { ph: 'Product or service', onchange: refresh }),
        gst && inp(it, 'hsn', { ph: 'Code' }),
        inp(it, 'qty', { type: 'number', onchange: refresh }),
        inp(it, 'rate', { type: 'number', ph: '0.00', onchange: refresh }),
        gst && h('select', { onchange: (e) => { it.gst = +e.target.value; refresh(); } }, [0, 0.25, 3, 5, 12, 18, 28].map((r) => h('option', { value: r, selected: +it.gst === r }, r + '%'))),
        h('button', { class: 'olx', type: 'button', title: 'Remove this item', onclick: () => { inv.items.splice(i, 1); if (!inv.items.length) inv.items.push({ desc: '', hsn: '', qty: 1, rate: '', gst: 18 }); drawItems(); refresh(); } }, '×'))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { inv.items.push({ desc: '', hsn: '', qty: 1, rate: '', gst: inv.items.at(-1)?.gst ?? 18 }); drawItems(); } }, '+ Add item'));
  }
  const picBtn = (key, label, max) => {
    const name = h('span', { class: 'status' }, inv[key] ? ' added' : ' none');
    return field(label, h('div', {},
      h('button', { class: 'btn small', type: 'button', onclick: async () => { const u = await pictureDataUrl(max); if (u) { inv[key] = u; name.textContent = ' added'; } } }, 'Choose…'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { inv[key] = null; name.textContent = ' none'; } }, 'Remove'), name));
  };
  const seg = (opts, get, set) => { const s2 = h('div', { class: 'seg' }); for (const [v, l] of opts) { const b = h('button', { type: 'button', class: get() === v ? 'on' : '', onclick: () => { set(v); [...s2.children].forEach((x) => x.classList.toggle('on', x === b)); } }, l); s2.append(b); } return s2; };
  const sec = (title, ...kids) => h('section', { class: 'formsec' }, h('h3', {}, title), ...kids);
  const grid = (...kids) => h('div', { class: 'formgrid' }, ...kids);
  const S = inv.seller, B = inv.buyer, K = inv.bank;

  const go = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
    if (!invoiceTotals(inv).lines.length) { toast('Add at least one item with a price.'); return; }
    go.disabled = true; go.textContent = 'Making PDF…';
    try {
      const blob = await invoicePdf(inv);
      store.set('invoice', { type: inv.type, currency: inv.currency, tax: inv.tax, accent: inv.accent, seller: inv.seller, bank: inv.bank, logo: inv.logo, sign: inv.sign, notes: inv.notes, no: inv.no });
      const safeNo = String(inv.no || 'invoice').replace(/[^\w.-]+/g, '-');
      ctx.finish([{ name: `${inv.type.toLowerCase().replace(/\s+/g, '-')}-${safeNo}.pdf`, blob }], 'Your business details are remembered in this browser for the next one.');
    } catch (e) { console.error(e); toast('Could not make the PDF: ' + e.message); }
    finally { go.disabled = false; go.textContent = 'Create PDF'; }
  } }, 'Create PDF');

  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel docform' },
      sec('Your business',
        grid(field('Business name', inp(S, 'name', { ph: 'e.g. Sharma Traders' })), field('GSTIN', inp(S, 'gstin', { ph: '15 characters' }))),
        field('Address', inp(S, 'address', { area: true, ph: 'Street, city, PIN' })),
        grid(field('State', inp(S, 'state', { ph: 'e.g. Telangana' })), field('Phone', inp(S, 'phone')), field('Email', inp(S, 'email'))),
        grid(picBtn('logo', 'Logo (optional)', 500), picBtn('sign', 'Signature or stamp (optional)', 500))),
      sec('Bill to',
        grid(field('Customer name', inp(B, 'name')), field('GSTIN (if any)', inp(B, 'gstin'))),
        field('Address', inp(B, 'address', { area: true })),
        grid(field('Place of supply (state)', inp(B, 'state')), field('Phone', inp(B, 'phone')))),
      sec('Details',
        grid(field('Number', inp(inv, 'no')), field('Date', inp(inv, 'date', { type: 'date' })), field('Due / valid until', inp(inv, 'due', { type: 'date' })))),
      sec('Items', itemsBox, grid(field('Discount (amount)', inp(inv, 'discount', { type: 'number', ph: '0', onchange: refresh })))),
      sec('Payment and notes',
        grid(field('Account holder', inp(K, 'holder')), field('Bank name', inp(K, 'name')), field('Account number', inp(K, 'acc')), field('IFSC', inp(K, 'ifsc'))),
        field('UPI ID (adds a “scan to pay” QR code)', inp(K, 'upi', { ph: 'business@bank' })),
        field('Notes / terms', inp(inv, 'notes', { area: true })))),
    h('div', { class: 'panel sidepanel' },
      h('h3', {}, 'Document'),
      field('Type', h('select', { onchange: (e) => { inv.type = e.target.value; } }, DOC_TYPES.map(([v, l]) => h('option', { value: v, selected: inv.type === v }, l)))),
      field('GST', seg([['cgst', 'CGST + SGST'], ['igst', 'IGST'], ['none', 'No GST']], () => inv.tax, (v) => { inv.tax = v; drawItems(); refresh(); })),
      h('p', { class: 'hint', style: { marginTop: '-6px' } }, 'Same state as the customer: CGST + SGST. Other state: IGST.'),
      grid(field('Currency', h('select', { onchange: (e) => { inv.currency = e.target.value; refresh(); } }, Object.keys(CURRENCIES).map((c) => h('option', { value: c, selected: inv.currency === c }, c)))),
        field('Colour', h('input', { type: 'color', value: inv.accent, oninput: (e) => { inv.accent = e.target.value; } }))),
      summary, go,
      h('p', { class: 'hint' }, 'Made on your device. Your business and bank details are saved only in this browser.'))));
  drawItems(); refresh();
}

// ===================== Resume =====================
const RFONTS = ['Inter', 'Roboto', 'Lato', 'Open Sans', 'Poppins', 'Merriweather'];
const blankJob = () => ({ role: '', company: '', place: '', from: '', to: '', points: '' });
const blankEdu = () => ({ degree: '', school: '', year: '', score: '' });
const blankProj = () => ({ name: '', link: '', desc: '' });

function circlePhoto(dataUrl) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const S = 400, c = newCanvas(S, S), g = c.getContext('2d');
      const k = Math.max(S / img.width, S / img.height);
      g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) * 0.3, img.width * k, img.height * k);
      encode(c, 'png').then((b) => b.arrayBuffer()).then((a) => res(new Uint8Array(a)));
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

async function resumePdf(r) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.name || 'Resume'} – Resume`); doc.setAuthor(r.name || ''); doc.setCreator('EditSupreme');
  const F = await pdfFonts(doc, r.font || 'Inter');
  const A = col(r.accent || '#1f4fd1');
  const W = 595.28, H = 841.89, M = r.template === 'compact' ? 34 : 42;
  const modern = r.template === 'modern', compact = r.template === 'compact';
  const SB = modern ? 190 : 0; // sidebar width
  const pages = [];
  const newPage = () => {
    const p = doc.addPage([W, H]);
    if (modern) p.drawRectangle({ x: 0, y: 0, width: SB, height: H, color: A });
    pages.push(p);
    return p;
  };
  newPage();
  const base = compact ? 9.3 : 10;

  // A column of text that flows onto new pages.
  function column(x, w, top, light = false) {
    const c = { x, w, y: top, pi: 0, light };
    c.page = () => pages[c.pi];
    c.need = (hh) => { if (c.y - hh < M) { c.pi++; if (!pages[c.pi]) newPage(); c.y = H - M; } };
    c.line = (s, { size = base, font = F.reg, color, align = 'left', gap = 1.38 } = {}) => {
      color ||= light ? rgb(1, 1, 1) : INK;
      for (const l of wrap(font, safe(F, s), size, c.w)) {
        c.need(size * gap);
        const tw = font.widthOfTextAtSize(l, size);
        c.page().drawText(l, { x: align === 'center' ? c.x + (c.w - tw) / 2 : c.x, y: c.y - size, size, font, color });
        c.y -= size * gap;
      }
    };
    c.lr = (left, right, { size = base, font = F.bold } = {}) => {
      const rw = right ? F.reg.widthOfTextAtSize(safe(F, right), size - 0.5) : 0;
      const lines = wrap(font, safe(F, left), size, c.w - rw - 10);
      c.need(size * 1.4 * lines.length);
      if (right) c.page().drawText(safe(F, right), { x: c.x + c.w - rw, y: c.y - size, size: size - 0.5, font: F.reg, color: light ? rgb(1, 1, 1) : GREY });
      for (const l of lines) { c.page().drawText(l, { x: c.x, y: c.y - size, size, font, color: light ? rgb(1, 1, 1) : INK }); c.y -= size * 1.4; }
    };
    c.bullets = (text) => {
      for (const p of String(text || '').split('\n').map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)) {
        const lines = wrap(F.reg, safe(F, p), base, c.w - 12);
        lines.forEach((l, i) => {
          c.need(base * 1.38);
          if (!i) c.page().drawCircle({ x: c.x + 3, y: c.y - base * 0.62, size: 1.5, color: light ? rgb(1, 1, 1) : A });
          c.page().drawText(l, { x: c.x + 12, y: c.y - base, size: base, font: F.reg, color: light ? rgb(1, 1, 1) : INK });
          c.y -= base * 1.38;
        });
      }
    };
    c.heading = (s) => {
      c.y -= compact ? 8 : 12;
      c.need(30);
      const size = compact ? 10.5 : 11.5;
      c.page().drawText(safe(F, s.toUpperCase()), { x: c.x, y: c.y - size, size, font: F.bold, color: light ? rgb(1, 1, 1) : A });
      c.y -= size + 5;
      c.page().drawLine({ start: { x: c.x, y: c.y }, end: { x: c.x + c.w, y: c.y }, thickness: light ? 0.6 : 0.8, color: light ? rgb(1, 1, 1) : A, opacity: light ? 0.5 : 1 });
      c.y -= 7;
    };
    c.space = (v) => { c.y -= v; };
    return c;
  }

  const contacts = [r.email, r.phone, r.location, ...String(r.links || '').split('\n')].map((s) => (s || '').trim()).filter(Boolean);
  const skills = String(r.skills || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const langs = String(r.languages || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const photo = r.photo ? await circlePhoto(r.photo) : null;

  const main = modern ? column(SB + 28, W - SB - 28 - M, H - M) : column(M, W - 2 * M, H - M);
  if (modern) {
    const side = column(22, SB - 44, H - M, true);
    if (photo) { const img = await doc.embedPng(photo); const s = 110; pages[0].drawImage(img, { x: (SB - s) / 2, y: H - M - s, width: s, height: s }); side.space(s + 16); }
    side.heading('Contact');
    for (const l of contacts) side.line(l, { size: 9 });
    if (skills.length) { side.heading('Skills'); side.bullets(skills.join('\n')); }
    if (langs.length) { side.heading('Languages'); for (const l of langs) side.line(l, { size: 9.5 }); }
    if (r.certs) { side.heading('Certifications'); side.bullets(r.certs); }
    main.line(r.name || 'Your Name', { size: 24, font: F.bold });
    if (r.title) main.line(r.title, { size: 12.5, color: A });
    main.space(4);
  } else {
    if (photo && !compact) { const img = await doc.embedPng(photo); const s = 76; pages[0].drawImage(img, { x: W - M - s, y: H - M - s, width: s, height: s }); main.w -= s + 14; }
    main.line(r.name || 'Your Name', { size: compact ? 20 : 24, font: F.bold, align: compact || photo ? 'left' : 'center' });
    if (r.title) main.line(r.title, { size: compact ? 11 : 12.5, color: A, align: compact || photo ? 'left' : 'center' });
    main.line(contacts.join('   ·   '), { size: 9, color: GREY, align: compact || photo ? 'left' : 'center' });
    if (photo && !compact) { main.y = Math.min(main.y, H - M - 86); main.w = W - 2 * M; }
  }
  if (r.summary) { main.heading(modern ? 'Profile' : 'Summary'); main.line(r.summary); }
  const jobs = (r.jobs || []).filter((j) => j.role || j.company);
  if (jobs.length) {
    main.heading('Experience');
    jobs.forEach((j, i) => {
      if (i) main.space(compact ? 4 : 7);
      main.lr(j.role || j.company, [j.from, j.to].filter(Boolean).join(' – '));
      if (j.role && j.company) main.line([j.company, j.place].filter(Boolean).join(', '), { size: base - 0.3, color: A });
      main.bullets(j.points);
    });
  }
  const projs = (r.projects || []).filter((p) => p.name);
  if (projs.length) {
    main.heading('Projects');
    projs.forEach((p, i) => { if (i) main.space(5); main.lr(p.name, p.link); if (p.desc) main.bullets(p.desc); });
  }
  const edus = (r.edu || []).filter((e) => e.degree || e.school);
  if (edus.length) {
    main.heading('Education');
    edus.forEach((e, i) => {
      if (i) main.space(5);
      main.lr(e.degree || e.school, e.year);
      const sub = [e.degree && e.school, e.score].filter(Boolean).join('  ·  ');
      if (sub) main.line(sub, { size: base - 0.3, color: GREY });
    });
  }
  if (!modern) {
    if (skills.length) { main.heading('Skills'); main.line(skills.join('  ·  ')); }
    if (langs.length) { main.heading('Languages'); main.line(langs.join('  ·  ')); }
    if (r.certs) { main.heading('Certifications'); main.bullets(r.certs); }
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

async function resumeDocx(r) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType } = await import('docx');
  const accent = (r.accent || '#1f4fd1').replace('#', '');
  const font = r.font || 'Calibri';
  const P = (runs, o = {}) => new Paragraph({ children: runs, ...o });
  const T = (text, o = {}) => new TextRun({ text, font, ...o });
  const kids = [];
  const contacts = [r.email, r.phone, r.location, ...String(r.links || '').split('\n')].map((s) => (s || '').trim()).filter(Boolean);
  kids.push(P([T(r.name || 'Your Name', { bold: true, size: 44 })], { alignment: AlignmentType.CENTER }));
  if (r.title) kids.push(P([T(r.title, { size: 24, color: accent })], { alignment: AlignmentType.CENTER }));
  if (contacts.length) kids.push(P([T(contacts.join('   ·   '), { size: 18, color: '555555' })], { alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
  const head = (t) => kids.push(P([T(t.toUpperCase(), { bold: true, size: 22, color: accent })], { spacing: { before: 240, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 2 } } }));
  const lr = (left, right) => kids.push(P([T(left, { bold: true, size: 21 }), ...(right ? [T('\t' + right, { size: 19, color: '666666' })] : [])], { tabStops: [{ type: TabStopType.RIGHT, position: 9600 }], spacing: { before: 100 } }));
  const bullets = (text) => String(text || '').split('\n').map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).forEach((p) => kids.push(P([T(p, { size: 20 })], { bullet: { level: 0 } })));
  if (r.summary) { head('Summary'); kids.push(P([T(r.summary, { size: 20 })])); }
  const jobs = (r.jobs || []).filter((j) => j.role || j.company);
  if (jobs.length) { head('Experience'); for (const j of jobs) { lr(j.role || j.company, [j.from, j.to].filter(Boolean).join(' – ')); if (j.role && j.company) kids.push(P([T([j.company, j.place].filter(Boolean).join(', '), { size: 20, color: accent })])); bullets(j.points); } }
  const projs = (r.projects || []).filter((p) => p.name);
  if (projs.length) { head('Projects'); for (const p of projs) { lr(p.name, p.link); bullets(p.desc); } }
  const edus = (r.edu || []).filter((e) => e.degree || e.school);
  if (edus.length) { head('Education'); for (const e of edus) { lr(e.degree || e.school, e.year); const sub = [e.degree && e.school, e.score].filter(Boolean).join('  ·  '); if (sub) kids.push(P([T(sub, { size: 19, color: '666666' })])); } }
  const list = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (list(r.skills).length) { head('Skills'); kids.push(P([T(list(r.skills).join('  ·  '), { size: 20 })])); }
  if (list(r.languages).length) { head('Languages'); kids.push(P([T(list(r.languages).join('  ·  '), { size: 20 })])); }
  if (r.certs) { head('Certifications'); bullets(r.certs); }
  const d = new Document({ creator: 'EditSupreme', title: `${r.name || ''} Resume`, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }] });
  return Packer.toBlob(d);
}

function mountResume(el, ctx) {
  const r = { name: '', title: '', email: '', phone: '', location: '', links: '', summary: '', skills: '', languages: '', certs: '', photo: null,
    jobs: [blankJob()], edu: [blankEdu()], projects: [], template: 'classic', accent: '#1f4fd1', font: 'Inter', ...store.get('resume', {}) };
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set('resume', r), 400); };
  const sec = (title, ...kids) => h('section', { class: 'formsec' }, h('h3', {}, title), ...kids);
  const grid = (...kids) => h('div', { class: 'formgrid' }, ...kids);
  const I = (obj, key, o = {}) => inp(obj, key, { ...o, onchange: save });

  // Repeating groups (jobs, education, projects).
  function group(listKey, blank, render, addLabel) {
    const box = h('div', { class: 'rgroup' });
    const draw = () => {
      box.replaceChildren(...r[listKey].map((item, i) => h('div', { class: 'rcard' },
        h('button', { class: 'olx rdel', type: 'button', title: 'Remove', onclick: () => { r[listKey].splice(i, 1); draw(); save(); } }, '×'),
        ...render(item))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { r[listKey].push(blank()); draw(); save(); } }, addLabel));
    };
    draw();
    return box;
  }
  const photoName = h('span', { class: 'status' }, r.photo ? ' added' : ' none');
  const seg = (opts, key) => { const s2 = h('div', { class: 'seg' }); for (const [v, l] of opts) { const b = h('button', { type: 'button', class: r[key] === v ? 'on' : '', onclick: () => { r[key] = v; save(); [...s2.children].forEach((x) => x.classList.toggle('on', x === b)); } }, l); s2.append(b); } return s2; };

  const make = async (kind) => {
    if (!r.name) { toast('Add your name first.'); return; }
    const btns = [goPdf, goDoc];
    btns.forEach((b) => { b.disabled = true; });
    try {
      store.set('resume', r);
      const base = (r.name || 'resume').trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-resume';
      const outs = [];
      if (kind !== 'docx') outs.push({ name: base + '.pdf', blob: await resumePdf(r) });
      if (kind !== 'pdf') outs.push({ name: base + '.docx', blob: await resumeDocx(r) });
      ctx.finish(outs, 'Your resume is saved in this browser, so you can come back and update it any time.');
    } catch (e) { console.error(e); toast('Could not make the resume: ' + e.message); }
    finally { btns.forEach((b) => { b.disabled = false; }); }
  };
  const goPdf = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: () => make('both') }, 'Create resume (PDF + Word)');
  const goDoc = h('button', { class: 'btn', type: 'button', style: { width: '100%', marginTop: '8px' }, onclick: () => make('pdf') }, 'PDF only');

  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel docform' },
      sec('About you',
        grid(field('Full name', I(r, 'name', { ph: 'e.g. Priya Sharma' })), field('Job title', I(r, 'title', { ph: 'e.g. Software Engineer' }))),
        grid(field('Email', I(r, 'email')), field('Phone', I(r, 'phone')), field('City', I(r, 'location', { ph: 'e.g. Hyderabad, India' }))),
        field('Links (one per line)', I(r, 'links', { area: true, ph: 'linkedin.com/in/…\ngithub.com/…' })),
        field('Photo (optional)', h('div', {},
          h('button', { class: 'btn small', type: 'button', onclick: async () => { const u = await pictureDataUrl(600); if (u) { r.photo = u; photoName.textContent = ' added'; save(); } } }, 'Choose…'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { r.photo = null; photoName.textContent = ' none'; save(); } }, 'Remove'), photoName))),
      sec('Summary', field('2–4 lines about you', I(r, 'summary', { area: true, ph: 'What you do, your strengths and what you are looking for.' }))),
      sec('Experience', group('jobs', blankJob, (j) => [
        grid(field('Role', I(j, 'role')), field('Company', I(j, 'company'))),
        grid(field('Place', I(j, 'place')), field('From', I(j, 'from', { ph: 'Jan 2023' })), field('To', I(j, 'to', { ph: 'Present' }))),
        field('What you did (one point per line)', I(j, 'points', { area: true, ph: 'Built …\nImproved … by 30%' }))], '+ Add job')),
      sec('Education', group('edu', blankEdu, (e) => [
        grid(field('Degree / class', I(e, 'degree', { ph: 'B.Tech, Computer Science' })), field('College / school', I(e, 'school'))),
        grid(field('Year', I(e, 'year', { ph: '2020 – 2024' })), field('Marks / CGPA', I(e, 'score', { ph: 'CGPA 8.4' })))], '+ Add education')),
      sec('Projects (optional)', group('projects', blankProj, (p) => [
        grid(field('Project name', I(p, 'name')), field('Link', I(p, 'link'))),
        field('About it (one point per line)', I(p, 'desc', { area: true }))], '+ Add project')),
      sec('Skills and more',
        field('Skills (separate with commas)', I(r, 'skills', { area: true, ph: 'Excel, Python, Communication, Tally' })),
        grid(field('Languages', I(r, 'languages', { ph: 'English, Hindi, Telugu' }))),
        field('Certifications (one per line)', I(r, 'certs', { area: true })))),
    h('div', { class: 'panel sidepanel' },
      h('h3', {}, 'Design'),
      field('Template', seg([['classic', 'Classic'], ['modern', 'Modern'], ['compact', 'Compact']], 'template')),
      grid(field('Font', h('select', { onchange: (e) => { r.font = e.target.value; save(); } }, RFONTS.map((f) => h('option', { value: f, selected: r.font === f }, f)))),
        field('Colour', h('input', { type: 'color', value: r.accent, oninput: (e) => { r.accent = e.target.value; save(); } }))),
      goPdf, goDoc,
      h('p', { class: 'hint' }, 'Saved automatically in this browser only. Use “Back to editing” after creating it to make changes.'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (confirm('Clear everything and start a new resume?')) { store.set('resume', {}); mountResume(el, ctx); } } }, 'Start a new resume'))));
}

export const tools = {
  'invoice-generator': { standalone: true, mount: (el, ctx) => mountInvoice(el, ctx) },
  'resume-builder': { standalone: true, mount: (el, ctx) => mountResume(el, ctx) }
};
