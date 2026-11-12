// Interactive image tools: Crop image, Rotate image, Photo editor, Meme generator and Blur face.
import { h, toast } from '../lib/ui.js';
import { stem } from '../lib/core.js';
import { IMG_ACCEPT, readPicture, savePicture, keepFormat, mapFrames, cropCanvas, newCanvas, svgCrop, svgBlob, encode, rotateCanvas, svgRotate, hasAlpha } from '../lib/imgio.js';
import { icon } from '../lib/icons.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const loading = (el, msg) => el.replaceChildren(h('div', { class: 'panel', style: { textAlign: 'center', padding: '32px' } }, h('p', { class: 'status' }, msg)));

// Pointer position on a canvas/img in its own pixels.
function posOn(elm, e, W, H) {
  const r = elm.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

function sideButton(label, onclick, cls = 'btn primary big') {
  return h('button', { class: cls, type: 'button', style: { width: '100%' }, onclick }, label);
}

async function runSave(btn, err, fn, ctx) {
  err.textContent = '';
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Working…';
  try { const out = await fn(); ctx.finish(Array.isArray(out) ? out : out.outputs, out.note); btn.disabled = false; btn.textContent = old; }
  catch (e) { console.error(e); err.textContent = e.message || String(e); btn.disabled = false; btn.textContent = old; }
}

// ---------------- Rotate image (drag with mouse or finger) ----------------
const norm = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return Math.abs(a) < 1e-9 ? 0 : a; };
const isQuarter = (a) => Math.abs(a / 90 - Math.round(a / 90)) < 1e-6;

// Largest upright rectangle inside a w×h picture turned by `deg` (so no empty corners).
function innerRect(w, h, deg) {
  const a = Math.abs(deg) * Math.PI / 180, s = Math.abs(Math.sin(a)), c = Math.abs(Math.cos(a));
  const long = Math.max(w, h), short = Math.min(w, h);
  if (short <= 2 * s * c * long || Math.abs(s - c) < 1e-10) {
    const x = short / 2;
    return w >= h ? { w: x / s, h: x / c } : { w: x / c, h: x / s };
  }
  const c2 = c * c - s * s;
  return { w: (w * c - h * s) / c2, h: (h * c - w * s) / c2 };
}

// Size of the result for each corner mode.
function outSize(w, h, deg, mode) {
  const a = deg * Math.PI / 180, s = Math.abs(Math.sin(a)), c = Math.abs(Math.cos(a));
  if (mode === 'crop') { const r = innerRect(w, h, deg); return { w: Math.max(1, Math.floor(r.w)), h: Math.max(1, Math.floor(r.h)) }; }
  if (mode === 'keep') return { w, h };
  return { w: Math.ceil(w * c + h * s), h: Math.ceil(w * s + h * c) };
}

function rotateFree(src, deg, flip, mode, bg) {
  const { w, h } = outSize(src.width, src.height, deg, mode);
  const c = newCanvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.imageSmoothingQuality = 'high';
  g.translate(w / 2, h / 2);
  g.scale(flip.h ? -1 : 1, flip.v ? -1 : 1);
  g.rotate(deg * Math.PI / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

async function rotateTool(el, files, ctx) {
  loading(el, 'Opening the pictures…');
  let pics;
  try { pics = []; for (const f of files) pics.push(await readPicture(f)); }
  catch (e) { el.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
  const states = pics.map(() => ({ angle: 0, flip: { h: false, v: false } }));
  let cur = 0, mode = 'expand', bgMode = 'auto', bgColor = '#ffffff', fmt = 'same';
  const same = pics.length > 1 ? h('input', { type: 'checkbox', checked: true }) : null;
  const S = () => states[cur];
  const each = (fn) => (same?.checked ? states : [S()]).forEach(fn);

  // Preview: a downscaled copy turned with CSS, inside a square stage big enough for any angle.
  const preview = (pic) => {
    const src = pic.frames[0].canvas, k = Math.min(1, 1000 / Math.max(src.width, src.height));
    const c = newCanvas(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    c.className = 'rotimg'; c.draggable = false;
    return c;
  };
  let img = preview(pics[0]);
  const frame = h('div', { class: 'rotframe' });
  const knob = h('div', { class: 'rotknob', title: 'Drag to rotate', html: icon('rotate') });
  const ring = h('div', { class: 'rotring' }, knob);
  const badge = h('div', { class: 'rotbadge' }, '0°');
  const stage = h('div', { class: 'rotstage', tabindex: 0, 'aria-label': 'Rotation area. Drag to rotate, or use the arrow keys.' }, img, frame, ring, badge);

  const num = h('input', { class: 'inp', type: 'number', step: 'any', min: -180, max: 180, style: { width: '90px' }, oninput: (e) => { set(+e.target.value || 0, false); } });
  const slider = h('input', { type: 'range', min: -180, max: 180, step: 0.1, value: 0, style: { flex: 1 }, oninput: (e) => set(+e.target.value, true, true) });
  const btn = (ic, label, fn) => h('button', { class: 'btn small', type: 'button', title: label, onclick: () => { fn(); draw(); } }, h('span', { html: icon(ic) }), label);
  const quick = h('div', { class: 'rotquick' },
    btn('undo', '90° left', () => each((s) => { s.angle = norm(s.angle - 90); })),
    btn('redo', '90° right', () => each((s) => { s.angle = norm(s.angle + 90); })),
    btn('flip', 'Mirror', () => each((s) => { s.flip.h = !s.flip.h; })),
    h('button', { class: 'btn small', type: 'button', onclick: () => { each((s) => { s.flip.v = !s.flip.v; }); draw(); } }, h('span', { html: icon('flip'), style: { display: 'inline-grid', rotate: '90deg' } }), 'Upside down'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { each((s) => { s.angle = 0; s.flip = { h: false, v: false }; }); draw(); } }, 'Reset'));
  const fine = h('div', { class: 'rotfine' },
    h('button', { class: 'btn small', type: 'button', onclick: () => nudge(-1) }, '−1°'),
    h('button', { class: 'btn small', type: 'button', onclick: () => nudge(-0.1) }, '−0.1°'),
    h('button', { class: 'btn small', type: 'button', onclick: () => nudge(0.1) }, '+0.1°'),
    h('button', { class: 'btn small', type: 'button', onclick: () => nudge(1) }, '+1°'));
  const segOf = (opts, val, onpick) => {
    const s = h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', class: v === val ? 'on' : '', onclick: (e) => {
      [...s.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); onpick(v); draw();
    } }, l)));
    return s;
  };
  const corners = h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Corners (for angles that are not 90°)'),
    segOf([['expand', 'Show the whole picture'], ['crop', 'Crop the empty corners'], ['keep', 'Keep the original size']], mode, (v) => { mode = v; }));
  const colorIn = h('input', { type: 'color', value: bgColor, oninput: (e) => { bgColor = e.target.value; draw(); } });
  const bgField = h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Empty corners'),
    segOf([['auto', 'Transparent'], ['color', 'Colour']], bgMode, (v) => { bgMode = v; }), h('div', { style: { marginTop: '8px' } }, colorIn),
    h('div', { class: 'hint' }, 'JPG pictures can\'t be transparent, so their corners use the colour.'));
  const fmtField = h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Save as'),
    segOf([['same', 'Same format'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], fmt, (v) => { fmt = v; }));
  const info = h('p', { class: 'status' });
  const thumbs = pics.length > 1 ? h('div', { class: 'rotthumbs' }, pics.map((p, i) => {
    const t = preview(p); t.className = '';
    return h('button', { type: 'button', class: 'rotthumb' + (i === 0 ? ' on' : ''), title: p.name, onclick: (e) => {
      cur = i; [...thumbs.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      const n = preview(pics[i]); img.replaceWith(n); img = n; draw();
    } }, t);
  })) : null;

  const err = h('div', { class: 'error' });
  const run = sideButton(pics.length > 1 ? `Rotate ${pics.length} images` : 'Rotate image', () => runSave(run, err, async () => {
    const out = [];
    for (let i = 0; i < pics.length; i++) {
      const p = pics[i], s = same?.checked ? S() : states[i];
      const a = norm(s.angle), flipName = s.flip.h && s.flip.v ? 'none' : s.flip.h ? 'h' : s.flip.v ? 'v' : 'none';
      if (!a && !s.flip.h && !s.flip.v) { out.push({ name: p.name, blob: p.file }); continue; }
      // Exact quarter turns never lose quality (and SVGs stay vectors).
      if (isQuarter(a)) {
        const q = s.flip.h && s.flip.v ? a + 180 : a;
        if (p.kind === 'svg' && fmt === 'same') { out.push({ name: stem(p.name) + '-rotated.svg', blob: svgBlob(svgRotate(p.svg, ((q % 360) + 360) % 360, flipName)) }); continue; }
        const frames = await mapFrames(p.frames, (c) => rotateCanvas(c, ((q % 360) + 360) % 360, flipName));
        out.push(...await savePicture(p, frames, fmt === 'same' ? keepFormat(p) : fmt, { quality: 0.95, bg: bgColor }, '-rotated'));
        continue;
      }
      let f = fmt === 'same' ? keepFormat(p) : fmt;
      if (f === 'gif' && p.frames.length < 2) f = 'png';
      // Transparent corners need a format that keeps transparency.
      if (bgMode === 'auto' && mode !== 'crop' && f === 'jpg' && fmt === 'same') f = 'png';
      const fill = bgMode === 'color' || f === 'jpg' ? bgColor : null;
      const frames = await mapFrames(p.frames, (c) => rotateFree(c, a, s.flip, mode, fill));
      out.push(...await savePicture(p, frames, f, { quality: 0.95, bg: bgColor }, '-rotated'));
    }
    return out;
  }, ctx));

  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, stage, info, thumbs),
    h('div', { class: 'panel sidepanel' }, h('h3', {}, 'Rotate'),
      h('div', { class: 'field' }, quick),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Angle'), h('div', { class: 'rotangle' }, slider, num), fine,
        h('div', { class: 'hint' }, 'Drag on the picture to turn it. It snaps to straight angles; hold Shift for 15° steps. Arrow keys turn it by 1°.')),
      corners, bgField, fmtField,
      same ? h('div', { class: 'field' }, h('label', { class: 'check' }, same, `Rotate all ${pics.length} images the same way`)) : null,
      run, err, h('button', { class: 'btn ghost', type: 'button', style: { width: '100%', marginTop: '8px' }, onclick: ctx.restart }, 'Choose other images'))));

  function nudge(d) { set(S().angle + d); }
  function set(a, updateSlider = true, fromSlider = false) {
    each((s) => { s.angle = norm(a); });
    draw(updateSlider, !fromSlider);
  }
  function draw(updateSlider = true, updateNum = true) {
    const s = S(), p = pics[cur], W = p.frames[0].canvas.width, H = p.frames[0].canvas.height;
    const a = s.angle, D = Math.hypot(W, H);
    // The stage is a square as wide as the picture's diagonal, so every angle fits.
    img.style.width = (W / D * 100) + '%';
    img.style.transform = `translate(-50%, -50%) scale(${s.flip.h ? -1 : 1}, ${s.flip.v ? -1 : 1}) rotate(${a}deg)`;
    const quarter = isQuarter(a);
    const o = quarter ? (Math.abs(Math.round(a / 90)) % 2 ? { w: H, h: W } : { w: W, h: H }) : outSize(W, H, a, mode);
    Object.assign(frame.style, { width: (o.w / D * 100) + '%', height: (o.h / D * 100) + '%' });
    frame.classList.toggle('hidden', quarter || mode === 'expand');
    ring.style.transform = `rotate(${a}deg)`;
    badge.textContent = (Math.round(a * 10) / 10) + '°';
    if (updateSlider) slider.value = a;
    if (updateNum) num.value = Math.round(a * 10) / 10;
    corners.classList.toggle('dim', quarter);
    bgField.classList.toggle('hidden', quarter || mode === 'crop');
    colorIn.parentElement.classList.toggle('hidden', bgMode !== 'color');
    info.textContent = `${p.name} · ${W} × ${H} px → ${o.w} × ${o.h} px${s.flip.h ? ' · mirrored' : ''}${s.flip.v ? ' · upside down' : ''}${p.frames.length > 1 ? ` · all ${p.frames.length} frames` : ''}`;
  }

  // Drag anywhere on the stage: the picture follows the pointer around its centre.
  let drag = null;
  const angleAt = (e) => { const r = stage.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    drag = { a0: S().angle, p0: angleAt(e) };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let d = angleAt(e) - drag.p0;
    // Mirroring one way reverses the turning direction on screen.
    if (S().flip.h !== S().flip.v) d = -d;
    let a = drag.a0 + d;
    if (e.shiftKey) a = Math.round(a / 15) * 15;
    else { const q = Math.round(a / 90) * 90; if (Math.abs(a - q) < 2.5) a = q; }
    set(a);
  });
  const end = () => { drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (d) { e.preventDefault(); nudge(d * (e.shiftKey ? 15 : 1)); }
  });
  draw();
}

// ---------------- Crop image ----------------
async function cropTool(el, files, ctx) {
  loading(el, 'Opening the picture…');
  let pics;
  try { pics = []; for (const f of files) pics.push(await readPicture(f)); }
  catch (e) { el.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
  const pic = pics[0], src = pic.frames[0].canvas, W = src.width, H = src.height;
  let r = { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 };
  let aspect = 0;
  const shown = newCanvas(W, H); shown.getContext('2d').drawImage(src, 0, 0);
  shown.className = 'stagecanvas';
  const box = h('div', { class: 'cropbox' }, ...['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((d) => h('span', { class: 'hd ' + d, 'data-h': d })));
  const stage = h('div', { class: 'cropstage' }, shown, box);
  const num = (key, label) => h('label', { class: 'mini' }, label, h('input', { class: 'inp', type: 'number', min: 0, 'data-k': key, oninput: (e) => { r[key] = +e.target.value || 0; fix(key); draw(false); } }));
  const inputs = h('div', { class: 'cropnums' }, num('w', 'Width'), num('h', 'Height'), num('x', 'Left'), num('y', 'Top'));
  const ASPECTS = [['0', 'Free'], ['orig', 'Original'], ['1', '1:1'], ['1.3333', '4:3'], ['1.5', '3:2'], ['1.7778', '16:9'], ['0.8', '4:5'], ['0.5625', '9:16']];
  const seg = h('div', { class: 'seg wrapseg' }, ASPECTS.map(([v, l]) => h('button', { type: 'button', class: v === '0' ? 'on' : '', onclick: (e) => {
    [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    aspect = v === 'orig' ? W / H : +v;
    if (aspect) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; let w = Math.min(r.w, r.h * aspect), hh = w / aspect; if (hh > H) { hh = H; w = hh * aspect; } if (w > W) { w = W; hh = w / aspect; } r = { x: cx - w / 2, y: cy - hh / 2, w, h: hh }; fix(); }
    draw();
  } }, l)));
  const all = pics.length > 1 ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true }), `Crop all ${pics.length} images the same way`) : null;
  const err = h('div', { class: 'error' });
  const btn = sideButton('Crop image', () => runSave(btn, err, async () => {
    const out = [];
    const list = all && all.querySelector('input').checked ? pics : [pic];
    for (const p of list) {
      const c = p.frames[0].canvas, kx = c.width / W, ky = c.height / H;
      const x = Math.round(r.x * kx), y = Math.round(r.y * ky), w = Math.max(1, Math.round(r.w * kx)), hh = Math.max(1, Math.round(r.h * ky));
      if (p.kind === 'svg') { out.push({ name: stem(p.name) + '-cropped.svg', blob: svgBlob(svgCrop(p.svg, x, y, w, hh)) }); continue; }
      const frames = await mapFrames(p.frames, (fc) => cropCanvas(fc, x, y, w, hh));
      out.push(...await savePicture(p, frames, keepFormat(p), { quality: 0.95 }, '-cropped'));
    }
    return out;
  }, ctx));
  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, stage, h('p', { class: 'status' }, `${pic.name} · ${W} × ${H} px${pic.frames.length > 1 ? ` · ${pic.frames.length} frames (all are cropped)` : ''}. Drag the box or its corners; drag outside it to draw a new one.`)),
    h('div', { class: 'panel sidepanel' }, h('h3', {}, 'Crop options'),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Shape'), seg),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Crop area (pixels)'), inputs),
      all ? h('div', { class: 'field' }, all) : null,
      btn, err, h('button', { class: 'btn ghost', type: 'button', style: { width: '100%', marginTop: '8px' }, onclick: ctx.restart }, 'Choose other images'))));

  function fix(changed) {
    r.w = clamp(r.w, 4, W); r.h = clamp(r.h, 4, H);
    if (aspect) { if (changed === 'h') r.w = Math.min(W, r.h * aspect); else r.h = Math.min(H, r.w / aspect); if (r.h >= H) { r.h = H; r.w = H * aspect; } }
    r.x = clamp(r.x, 0, W - r.w); r.y = clamp(r.y, 0, H - r.h);
  }
  function draw(updateInputs = true) {
    const k = 100;
    Object.assign(box.style, { left: r.x / W * k + '%', top: r.y / H * k + '%', width: r.w / W * k + '%', height: r.h / H * k + '%' });
    if (updateInputs) for (const i of inputs.querySelectorAll('input')) i.value = Math.round(r[i.dataset.k]);
  }
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const p = posOn(shown, e, W, H);
    const hd = e.target.dataset?.h;
    if (hd) drag = { mode: hd, p, r0: { ...r } };
    else if (e.target === box) drag = { mode: 'move', p, r0: { ...r } };
    else { drag = { mode: 'se', p, r0: { x: p.x, y: p.y, w: 4, h: 4 } }; r = { ...drag.r0 }; }
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = posOn(shown, e, W, H), dx = p.x - drag.p.x, dy = p.y - drag.p.y, o = drag.r0;
    if (drag.mode === 'move') r = { ...o, x: clamp(o.x + dx, 0, W - o.w), y: clamp(o.y + dy, 0, H - o.h) };
    else {
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (drag.mode.includes('w')) x0 = clamp(o.x + dx, 0, x1 - 4);
      if (drag.mode.includes('e')) x1 = clamp(x1 + dx, x0 + 4, W);
      if (drag.mode.includes('n')) y0 = clamp(o.y + dy, 0, y1 - 4);
      if (drag.mode.includes('s')) y1 = clamp(y1 + dy, y0 + 4, H);
      if (aspect) {
        let w = x1 - x0, hh = y1 - y0;
        if (drag.mode === 'n' || drag.mode === 's') w = hh * aspect; else hh = w / aspect;
        if (drag.mode.includes('n')) y0 = y1 - hh; else y1 = y0 + hh;
        if (drag.mode.includes('w')) x0 = x1 - w; else x1 = x0 + w;
        if (x0 < 0 || y0 < 0 || x1 > W || y1 > H) return;
      }
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    draw();
  });
  const end = () => { drag = null; };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  draw();
}

// ---------------- Photo editor (Design Studio on the photo) ----------------
async function photoEditor(el, files, ctx) {
  loading(el, 'Opening the photo editor…');
  try {
    const pic = await readPicture(files[0]);
    let c = pic.frames[0].canvas;
    const k = Math.min(1, 4000 / Math.max(c.width, c.height));
    const { resizeCanvas, hasAlpha } = await import('../lib/imgio.js');
    if (k < 1) c = resizeCanvas(c, c.width * k, c.height * k);
    const W = c.width, H = c.height, alpha = hasAlpha(c);
    const objs = [
      { type: 'rect', layer: 'Background', isBg: true, locked: true, x: 0, y: 0, w: W, h: H, fill: '#ffffff', stroke: '#ffffff', sw: 0, opacity: alpha ? 0 : 100 },
      { type: 'image', layer: 'Photo', x: 0, y: 0, w: W, h: H, src: c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.95), natW: W, natH: H, jpeg: !alpha, opacity: 100, filters: {} }
    ];
    const { openDesign } = await import('./design.js');
    await openDesign(el, ctx, { W, H, objs, name: stem(pic.name) + '-edited' }, ctx.restart);
    toast('Add text, stickers (Elements → icons), frames and effects (select the photo → filters), then Download.', 6000);
  } catch (e) { console.error(e); el.replaceChildren(h('p', { class: 'error' }, e.message)); }
}

// ---------------- Meme generator ----------------
async function memeTool(el, files, ctx) {
  loading(el, 'Opening the picture…');
  const { loadFont, fontPicker } = await import('../lib/fonts.js');
  let pic;
  try { pic = await readPicture(files[0]); } catch (e) { el.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
  let img = pic.frames[0].canvas;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  if (k < 1) { const { resizeCanvas } = await import('../lib/imgio.js'); img = resizeCanvas(img, img.width * k, img.height * k); }
  const IW = img.width, IH = img.height;
  const st = { caption: false, captionText: 'Write your caption here', font: 'Anton', upper: true };
  const mk = (text, y) => ({ text, x: 0.5, y, size: 0.1, color: '#ffffff', stroke: '#000000', sw: 0.08 });
  const texts = [mk('Top text', 0.03), mk('Bottom text', 0.85)];
  let sel = 0;
  await loadFont('Anton'); await loadFont('Roboto', { bold: true });
  const cv = newCanvas(IW, IH); cv.className = 'stagecanvas';
  const boxes = [];
  let barH = 0;

  function wrap(g, text, maxW) {
    const out = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const w of para.split(/\s+/)) {
        const t = line ? line + ' ' + w : w;
        if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function render(target = cv) {
    const g0 = newCanvas(10, 10).getContext('2d');
    // Caption bar (modern meme style): black text on white above the picture.
    let lines = [], cpx = IW * 0.06;
    if (st.caption) { g0.font = `bold ${cpx}px "Roboto", Arial, sans-serif`; lines = wrap(g0, st.captionText, IW * 0.92); barH = Math.round(lines.length * cpx * 1.25 + cpx * 0.9); } else barH = 0;
    target.width = IW; target.height = IH + barH;
    const g = target.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, IW, barH);
    g.drawImage(img, 0, barH);
    if (st.caption) {
      g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `bold ${cpx}px "Roboto", Arial, sans-serif`;
      lines.forEach((l, i) => g.fillText(l, IW * 0.04, cpx * 0.45 + i * cpx * 1.25));
    }
    boxes.length = 0;
    texts.forEach((t, i) => {
      const px = t.size * IW;
      g.font = `${px}px "${st.font}", Impact, "Arial Black", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round';
      const ls = wrap(g, st.upper ? t.text.toUpperCase() : t.text, IW * 0.94);
      const x = t.x * IW, y0 = barH + t.y * IH;
      ls.forEach((l, j) => {
        const y = y0 + j * px * 1.08;
        if (t.sw > 0) { g.lineWidth = px * t.sw; g.strokeStyle = t.stroke; g.strokeText(l, x, y); }
        g.fillStyle = t.color; g.fillText(l, x, y);
      });
      const w = Math.max(...ls.map((l) => g.measureText(l).width), px);
      boxes[i] = { x0: x - w / 2, x1: x + w / 2, y0, y1: y0 + ls.length * px * 1.08 };
      if (target === cv && i === sel) { g.save(); g.setLineDash([8, 6]); g.lineWidth = Math.max(2, IW / 400); g.strokeStyle = '#2f80ff'; g.strokeRect(boxes[i].x0 - 6, y0 - 6, w + 12, boxes[i].y1 - y0 + 12); g.restore(); }
    });
  }
  const list = h('div', { class: 'memelist' });
  function drawList() {
    list.replaceChildren(...texts.map((t, i) => h('div', { class: 'memerow' + (i === sel ? ' on' : ''), onclick: () => { if (sel !== i) { sel = i; drawList(); render(); } } },
      h('textarea', { rows: 2, oninput: (e) => { t.text = e.target.value; render(); } }, t.text),
      h('div', { class: 'memectl' },
        h('label', { title: 'Text colour' }, h('input', { type: 'color', value: t.color, oninput: (e) => { t.color = e.target.value; render(); } })),
        h('label', { title: 'Outline colour' }, h('input', { type: 'color', value: t.stroke, oninput: (e) => { t.stroke = e.target.value; render(); } })),
        h('input', { type: 'range', min: 3, max: 25, value: Math.round(t.size * 100), title: 'Size', oninput: (e) => { t.size = e.target.value / 100; render(); } }),
        h('input', { type: 'range', min: 0, max: 20, value: Math.round(t.sw * 100), title: 'Outline width', oninput: (e) => { t.sw = e.target.value / 100; render(); } }),
        h('button', { class: 'btn small ghost', type: 'button', title: 'Remove this text', onclick: (e) => { e.stopPropagation(); texts.splice(i, 1); sel = Math.max(0, Math.min(sel, texts.length - 1)); drawList(); render(); } }, '✕')))));
  }
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    const p = posOn(cv, e, cv.width, cv.height);
    const i = boxes.findIndex((b) => b && p.x >= b.x0 - 10 && p.x <= b.x1 + 10 && p.y >= b.y0 - 10 && p.y <= b.y1 + 10);
    if (i < 0) return;
    sel = i; drawList();
    drag = { i, p, x: texts[i].x, y: texts[i].y };
    cv.setPointerCapture(e.pointerId); e.preventDefault(); render();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = posOn(cv, e, cv.width, cv.height), t = texts[drag.i];
    t.x = clamp(drag.x + (p.x - drag.p.x) / IW, 0.05, 0.95); t.y = clamp(drag.y + (p.y - drag.p.y) / IH, -0.05, 0.98);
    render();
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  const fmt = { v: 'jpg' };
  const err = h('div', { class: 'error' });
  const btn = sideButton('Create meme', () => runSave(btn, err, async () => {
    const out = newCanvas(1, 1); render(out);
    return [{ name: stem(pic.name) + '-meme.' + fmt.v, blob: await encode(out, fmt.v, { quality: 0.92 }) }];
  }, ctx));
  const capText = h('textarea', { rows: 2, oninput: (e) => { st.captionText = e.target.value; render(); } }, st.captionText);
  const capRow = h('div', { class: 'field hidden' }, capText);
  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, h('div', { class: 'memestage' }, cv), h('p', { class: 'status' }, 'Drag the texts to move them.')),
    h('div', { class: 'panel sidepanel' }, h('h3', {}, 'Meme text'),
      h('div', { class: 'field' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { st.caption = e.target.checked; capRow.classList.toggle('hidden', !st.caption); render(); } }), 'Caption above the picture (white bar)')),
      capRow,
      list,
      h('button', { class: 'btn small', type: 'button', onclick: () => { texts.push(mk('New text', 0.45)); sel = texts.length - 1; drawList(); render(); } }, '+ Add text'),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Font'), fontPicker(st.font, async (v) => { st.font = v || 'Anton'; await loadFont(st.font); await document.fonts.ready; render(); }, { standard: false })),
      h('div', { class: 'field' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { st.upper = e.target.checked; render(); } }), 'CAPITAL LETTERS')),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Save as'), (() => { const s = h('div', { class: 'seg' }, [['jpg', 'JPG'], ['png', 'PNG']].map(([v, l]) => h('button', { type: 'button', class: v === 'jpg' ? 'on' : '', onclick: (e) => { fmt.v = v; [...s.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, l))); return s; })()),
      btn, err)));
  drawList(); render();
}

// ---------------- Blur face ----------------
let detectorP = null;
function faceDetector() {
  detectorP ||= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm');
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', minDetectionConfidence: 0.55
    });
  })();
  detectorP.catch(() => { detectorP = null; });
  return detectorP;
}

/** Faces as boxes in picture pixels. The detector is made for faces near the camera, so the picture is also searched in tiles to find small faces in group photos. */
export async function findFaces(canvas, onStatus) {
  const det = await faceDetector();
  const W = canvas.width, H = canvas.height, found = [];
  const look = (x, y, w, hh) => {
    const s = Math.min(1, 1024 / Math.max(w, hh));
    const t = newCanvas(w * s, hh * s);
    t.getContext('2d').drawImage(canvas, x, y, w, hh, 0, 0, t.width, t.height);
    for (const d of det.detect(t).detections) {
      const b = d.boundingBox;
      found.push({ x: x + b.originX / s, y: y + b.originY / s, w: b.width / s, h: b.height / s, score: d.categories?.[0]?.score || 0.5 });
    }
  };
  look(0, 0, W, H);
  for (const n of [2, 3, 4]) {
    const ts = Math.max(W, H) / n * 1.35;
    if (ts < 160) break;
    onStatus?.(`Looking for small faces (${n}×${n})…`);
    const sx = Math.max(1, Math.ceil((W - ts) / (ts * 0.7)) + 1), sy = Math.max(1, Math.ceil((H - ts) / (ts * 0.7)) + 1);
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const x = sx === 1 ? 0 : (W - ts) * i / (sx - 1), y = sy === 1 ? 0 : (H - ts) * j / (sy - 1);
      look(Math.max(0, x), Math.max(0, y), Math.min(ts, W), Math.min(ts, H));
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  // Merge the boxes that found the same face.
  found.sort((a, b) => b.score - a.score);
  const keep = [];
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy / Math.min(a.w * a.h, b.w * b.h);
  };
  for (const f of found) if (!keep.some((k) => overlap(k, f) > 0.35)) keep.push(f);
  return keep;
}

function hide(g, src, b, effect, strength) {
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
  const w = Math.min(src.width - x, Math.ceil(b.w)), hh = Math.min(src.height - y, Math.ceil(b.h));
  if (w < 2 || hh < 2) return;
  g.save();
  g.beginPath();
  if (b.shape === 'ellipse') g.ellipse(x + w / 2, y + hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); else g.rect(x, y, w, hh);
  g.clip();
  if (effect === 'solid') { g.fillStyle = '#000'; g.fillRect(x, y, w, hh); }
  else {
    // Blur and pixelate both shrink the area and draw it back; blur smooths it, pixelate keeps hard blocks.
    const cells = effect === 'pixel' ? clamp(Math.round(26 - strength * 2.2), 4, 24) : clamp(Math.round(40 - strength * 3.5), 3, 30);
    const k = cells / Math.max(w, hh);
    const t = newCanvas(w * k, hh * k), tg = t.getContext('2d');
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(src, x, y, w, hh, 0, 0, t.width, t.height);
    g.imageSmoothingEnabled = effect !== 'pixel';
    g.imageSmoothingQuality = 'high';
    if (effect === 'blur' && 'filter' in g) { g.filter = `blur(${Math.max(1, Math.max(w, hh) / cells / 3)}px)`; }
    g.drawImage(t, x, y, w, hh);
    g.filter = 'none';
  }
  g.restore();
}

async function blurTool(el, files, ctx) {
  loading(el, 'Opening the picture…');
  let pic;
  try { pic = await readPicture(files[0]); } catch (e) { el.replaceChildren(h('p', { class: 'error' }, e.message)); return; }
  const src = pic.frames[0].canvas, W = src.width, H = src.height;
  const cv = newCanvas(W, H); cv.className = 'stagecanvas';
  const st = { effect: 'blur', strength: 7, boxes: [], sel: -1 };
  const status = h('p', { class: 'status' }, 'Looking for faces…');
  function paint(target = cv, preview = true) {
    const g = target.getContext('2d');
    g.drawImage(src, 0, 0);
    for (const b of st.boxes) if (b.on) hide(g, src, b, st.effect, st.strength);
    if (!preview) return;
    st.boxes.forEach((b, i) => {
      g.save(); g.lineWidth = Math.max(2, W / 350);
      g.strokeStyle = !b.on ? 'rgba(255,255,255,.9)' : i === st.sel ? '#2f80ff' : '#16c172';
      g.setLineDash(b.on ? [] : [10, 8]);
      g.beginPath();
      if (b.shape === 'ellipse') g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); else g.rect(b.x, b.y, b.w, b.h);
      g.stroke(); g.restore();
    });
  }
  const count = () => { const n = st.boxes.filter((b) => b.on).length; status.textContent = `${n} area${n === 1 ? '' : 's'} will be hidden. Click a box to switch it off or on; drag on the picture to add an area (licence plates, names, screens…).`; };
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    const p = posOn(cv, e, W, H);
    const i = st.boxes.findIndex((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    drag = { p, i, moved: false };
    cv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = posOn(cv, e, W, H);
    if (!drag.moved && Math.hypot(p.x - drag.p.x, p.y - drag.p.y) < 6 * W / cv.getBoundingClientRect().width) return;
    if (!drag.moved) { drag.moved = true; st.boxes.push(drag.box = { x: drag.p.x, y: drag.p.y, w: 1, h: 1, on: true, shape: 'rect' }); st.sel = st.boxes.length - 1; }
    Object.assign(drag.box, { x: Math.min(p.x, drag.p.x), y: Math.min(p.y, drag.p.y), w: Math.abs(p.x - drag.p.x), h: Math.abs(p.y - drag.p.y) });
    paint();
  });
  cv.addEventListener('pointerup', () => {
    if (drag && !drag.moved && drag.i >= 0) { const b = st.boxes[drag.i]; b.on = !b.on; st.sel = drag.i; }
    if (drag?.box && (drag.box.w < 6 || drag.box.h < 6)) st.boxes.pop();
    drag = null; count(); paint();
  });
  const segOf = (opts, key, cls = 'seg') => { const s = h('div', { class: cls }, opts.map(([v, l]) => h('button', { type: 'button', class: st[key] === v ? 'on' : '', onclick: (e) => { st[key] = v; [...s.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paint(); } }, l))); return s; };
  const err = h('div', { class: 'error' });
  const btn = sideButton('Save picture', () => runSave(btn, err, async () => {
    if (!st.boxes.some((b) => b.on)) throw new Error('Nothing is selected to hide. Drag on the picture to mark an area.');
    const out = newCanvas(W, H); paint(out, false);
    const fmt = keepFormat(pic) === 'gif' ? 'png' : keepFormat(pic);
    return savePicture(pic, [{ canvas: out }], fmt, { quality: 0.93 }, '-blurred');
  }, ctx));
  el.replaceChildren(h('div', { class: 'layout' },
    h('div', { class: 'panel' }, h('div', { class: 'memestage' }, cv), status),
    h('div', { class: 'panel sidepanel' }, h('h3', {}, 'Blur options'),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Effect'), segOf([['blur', 'Blur'], ['pixel', 'Pixelate'], ['solid', 'Black box']], 'effect')),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Strength'), h('input', { type: 'range', min: 1, max: 10, value: st.strength, oninput: (e) => { st.strength = +e.target.value; paint(); } })),
      h('div', { class: 'field' }, h('button', { class: 'btn small', type: 'button', onclick: () => { st.boxes.forEach((b) => { b.on = true; }); count(); paint(); } }, 'Select all'), ' ',
        h('button', { class: 'btn small', type: 'button', onclick: () => { st.boxes = st.boxes.filter((b) => b.on); count(); paint(); } }, 'Remove unselected')),
      btn, err)));
  paint();
  try {
    const faces = await findFaces(src, (m) => { status.textContent = m; });
    // A little larger than the detector's box, so hair line and chin are covered.
    st.boxes.push(...faces.map((f) => ({ x: f.x - f.w * 0.12, y: f.y - f.h * 0.28, w: f.w * 1.24, h: f.h * 1.42, on: true, shape: 'ellipse' })));
    if (!faces.length) toast('No faces were found. Drag on the picture to mark what to hide.', 5000);
  } catch (e) { console.error(e); toast('Face finding is not available right now (' + e.message + '). Drag on the picture to mark areas.', 6000); }
  count(); paint();
}

export const tools = {
  'crop-image': { accept: IMG_ACCEPT, multiple: true, label: 'Select images', mount: cropTool },
  'rotate-image': { accept: IMG_ACCEPT, multiple: true, label: 'Select images', mount: rotateTool },
  'photo-editor': { accept: IMG_ACCEPT, multiple: false, label: 'Select a photo', stock: true, mount: photoEditor },
  'meme-generator': { accept: IMG_ACCEPT, multiple: false, label: 'Select a picture for your meme', stock: true, mount: memeTool },
  'blur-face': { accept: IMG_ACCEPT, multiple: false, label: 'Select a photo', mount: blurTool }
};
