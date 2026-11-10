// Font Finder: identify the Google font used in a picture of text (a logo, poster, screenshot, menu…).
import { h, toast } from '../lib/ui.js';
import { matchFont, MATCH_SET, POPULAR, fontStack, loadFont, CATEGORY_LABEL, fontInfo } from '../lib/fonts.js';
import { loadImage } from '../lib/core.js';

async function fileToCanvas(f) {
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

async function mount(el, [file], ctx) {
  const canvas = await fileToCanvas(file);
  const view = h('div', { class: 'ffview' });
  const shown = h('img', { src: canvas.toDataURL('image/png'), alt: '', draggable: 'false' });
  view.append(shown);
  const side = h('div', { class: 'ffside' });
  const status = h('p', { class: 'status' }, 'Reading the text in your picture…');
  el.replaceChildren(h('div', { class: 'ffwrap' }, h('div', {}, h('p', { class: 'hint', style: { marginTop: 0 } }, 'Click a line of text, or drag a box around the text you want to identify.'), view), side));
  side.append(status);

  let lines = [];
  let pick = null; // {box, text}
  const k = () => shown.clientWidth / canvas.width;
  const drawBoxes = () => {
    view.querySelectorAll('.ffbox').forEach((n) => n.remove());
    lines.forEach((l, i) => view.append(h('div', { class: 'ffbox' + (pick?.i === i ? ' on' : ''), title: l.text, style: { left: l.bbox.x0 * k() + 'px', top: l.bbox.y0 * k() + 'px', width: (l.bbox.x1 - l.bbox.x0) * k() + 'px', height: (l.bbox.y1 - l.bbox.y0) * k() + 'px' }, onclick: () => choose({ i, box: l.bbox, text: l.text, italic: l.italic }) })));
    if (pick && pick.i == null) view.append(h('div', { class: 'ffbox on', style: { left: pick.box.x0 * k() + 'px', top: pick.box.y0 * k() + 'px', width: (pick.box.x1 - pick.box.x0) * k() + 'px', height: (pick.box.y1 - pick.box.y0) * k() + 'px' } }));
  };
  new ResizeObserver(drawBoxes).observe(shown);

  // Drag a box for text the reader didn't find (or a single word of a line).
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('ffbox')) return;
    const r = shown.getBoundingClientRect();
    drag = { x: (e.clientX - r.left) / k(), y: (e.clientY - r.top) / k(), el: h('div', { class: 'ffbox on' }) };
    view.append(drag.el);
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = shown.getBoundingClientRect();
    const x = (e.clientX - r.left) / k(), y = (e.clientY - r.top) / k();
    drag.box = { x0: Math.max(0, Math.min(x, drag.x)), y0: Math.max(0, Math.min(y, drag.y)), x1: Math.min(canvas.width, Math.max(x, drag.x)), y1: Math.min(canvas.height, Math.max(y, drag.y)) };
    Object.assign(drag.el.style, { left: drag.box.x0 * k() + 'px', top: drag.box.y0 * k() + 'px', width: (drag.box.x1 - drag.box.x0) * k() + 'px', height: (drag.box.y1 - drag.box.y0) * k() + 'px' });
  });
  view.addEventListener('pointerup', async () => {
    const d = drag; drag = null;
    if (!d?.box || d.box.x1 - d.box.x0 < 6 || d.box.y1 - d.box.y0 < 6) { d?.el.remove(); return; }
    d.el.remove();
    // Text inside the box: from the lines found there, else ask.
    const inside = lines.filter((l) => l.bbox.x0 >= d.box.x0 - 4 && l.bbox.x1 <= d.box.x1 + 4 && l.bbox.y0 >= d.box.y0 - 4 && l.bbox.y1 <= d.box.y1 + 4);
    choose({ box: d.box, text: inside.map((l) => l.text).join(' ') });
  });

  function choose(p) {
    pick = p;
    drawBoxes();
    const txt = h('input', { class: 'inp', value: p.text || '', placeholder: 'Type exactly the text in the box' });
    const results = h('div', { class: 'ffresults' });
    const run = async (candidates, label) => {
      const text = txt.value.trim();
      if (text.replace(/\s/g, '').length < 2) { toast('Type the text that is in the box first (at least 2 letters).'); return; }
      results.replaceChildren(h('p', { class: 'status' }, `${label}…`));
      const prog = h('div', { class: 'progress' }, h('div'));
      results.append(prog);
      const r = await matchFont([{ canvas, box: p.box, text }], { candidates, italic: !!p.italic, top: 10, onProgress: (f) => { prog.firstChild.style.width = Math.round(f * 100) + '%'; } });
      results.replaceChildren(h('div', { class: 'lbl' }, 'Closest Google fonts'));
      if (!r.length) { results.append(h('p', { class: 'status' }, 'No match found. Try a tighter box around the letters.')); return; }
      for (const m of r) {
        await loadFont(m.family, { bold: m.bold, italic: m.italic });
        const css = `font-family: '${m.family}', ${fontStack(m.family).split(', ').slice(1).join(', ')};${m.bold ? ' font-weight: 700;' : ''}`;
        results.append(h('div', { class: 'ffmatch' },
          h('div', { class: 'ffsample', style: { fontFamily: fontStack(m.family), fontWeight: m.bold ? 700 : 400, fontStyle: m.italic ? 'italic' : 'normal' } }, text),
          h('div', { class: 'ffmeta' }, h('b', {}, `${m.family}${m.bold ? ' Bold' : ''}`), h('span', { class: 'status' }, ` ${Math.round(m.score * 100)}% match · ${CATEGORY_LABEL[fontInfo(m.family)?.category] || ''}`)),
          h('div', { class: 'ffbtns' },
            h('a', { class: 'btn small', href: `https://fonts.google.com/specimen/${m.family.replace(/ /g, '+')}`, target: '_blank', rel: 'noopener' }, 'Get it (Google Fonts)'),
            h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(css); toast('CSS copied'); } catch { toast(css, 6000); } } }, 'Copy CSS'))));
      }
    };
    side.replaceChildren(
      h('div', { class: 'lbl' }, 'Text in the box (fix it if it was misread)'), txt,
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0' } },
        h('button', { class: 'btn primary', type: 'button', onclick: () => run(MATCH_SET, 'Comparing with popular fonts') }, 'Find the font'),
        h('button', { class: 'btn', type: 'button', onclick: () => run([...new Set([...MATCH_SET, ...Object.values(POPULAR).flat()])], 'Comparing with more fonts (slower)') }, 'Search more fonts')),
      results);
    run(MATCH_SET, 'Comparing with popular fonts');
  }

  try {
    const { findText } = await import('../lib/imagetext.js');
    lines = (await findText(canvas.toDataURL('image/png'), 'eng', (m) => { status.textContent = 'Reading text: ' + m; })).filter((l) => l.text.replace(/[^\p{L}]/gu, '').length >= 2);
    drawBoxes();
    status.textContent = lines.length ? `Found ${lines.length} line${lines.length > 1 ? 's' : ''} of text. Click one to identify its font.` : 'No text found automatically. Drag a box around the text and type what it says.';
    if (lines.length) choose({ i: 0, box: lines[0].bbox, text: lines[0].text, italic: lines[0].italic });
  } catch (e) {
    console.error(e);
    status.textContent = 'Could not read the text (' + e.message + '). Drag a box around the text and type what it says.';
  }
}

export const tools = {
  'font-finder': { accept: 'image/*', multiple: false, label: 'Select a picture with text (logo, poster, screenshot…)', mount: (el, files, ctx) => mount(el, files, ctx).catch((e) => el.replaceChildren(h('p', { class: 'error' }, e.message))) }
};
