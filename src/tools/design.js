// Design Studio: a design editor for social posts, ads, thumbnails, posters and cards.
import { PDFDocument } from '@cantoo/pdf-lib';
import { h, pickFiles, toast } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { SIZES, sizeById, TEMPLATES, ensureFonts, loadDraft } from '../lib/design.js';

// Open the editor on a W×H canvas (1 PDF point per pixel, so downloads come out at the design size).
export async function openDesign(el, ctx, { W, H, objs, name = 'design', sizeId, groups = {} }, restart) {
  const { mountEditor } = await import('./editor.js');
  const d = await PDFDocument.create();
  d.addPage([W, H]);
  const file = new File([await d.save()], name + '.pdf', { type: 'application/pdf' });
  for (const o of objs) if (o.isBg && (o.w <= 1 || o.h <= 1)) { o.w = W; o.h = H; }
  // Templates name their groups as paths ("Details/Date"); turn those into nested groups.
  groups = JSON.parse(JSON.stringify(groups));
  for (const o of objs) {
    if (!o.grp) continue;
    let parent = null;
    for (const part of o.grp.split('/')) {
      const id = 't_' + (parent ? parent + '_' : '') + part.replace(/W+/g, '');
      groups[id] ||= { id, name: part, parent };
      parent = id;
    }
    o.gid = parent;
    delete o.grp;
  }
  el.replaceChildren();
  window.scrollTo({ top: 0 });
  await mountEditor(el, file, { ...ctx, restart: restart || (() => studioHome(el, ctx)) }, 'design', { initial: [objs], groups, name, sizeId });
}

const blank = (W, H) => [{ type: 'rect', layer: 'Background', isBg: true, locked: true, x: 0, y: 0, w: W, h: H, fill: '#ffffff', stroke: '#ffffff', sw: 0, opacity: 100 }];

async function studioHome(el, ctx) {
  ensureFonts();
  const draft = await loadDraft();
  const card = (ic, title, text, onclick) => h('button', { type: 'button', class: 'startcard', onclick }, h('div', { class: 'ticon', style: { '--tc': 'var(--accent)' }, html: icon(ic) }), h('div', {}, h('b', {}, title), h('span', {}, text)));
  const fromPicture = async (enhance = 'auto') => {
    const [f] = await pickFiles('image/*,.pdf,application/pdf', false);
    if (!f) return;
    const msg = h('div', { class: 'status' }, 'Starting…');
    el.replaceChildren(h('div', { class: 'card', style: { padding: '28px', textAlign: 'center' } }, h('h3', { style: { margin: '0 0 8px' } }, 'Turning your picture into editable layers…'), msg));
    try {
      const { pictureToDesign } = await import('./smart.js');
      const d = await pictureToDesign(f, (m) => { msg.textContent = m[0].toUpperCase() + m.slice(1) + '…'; }, { enhance });
      await openDesign(el, ctx, { ...d, name: f.name.replace(/\.[^.]+$/, '') });
    } catch (e) { console.error(e); toast('Could not read that picture: ' + e.message, 5000); studioHome(el, ctx); }
  };
  const openProject = async () => {
    const [f] = await pickFiles('.json,application/json', false);
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'EditSupreme' || d.kind !== 'design' || !Array.isArray(d.objs)) throw new Error('This is not an EditSupreme design file.');
      await openDesign(el, ctx, d);
    } catch (e) { toast(e.message, 5000); }
  };
  const sizeCard = ([id, name, w, hh]) => {
    const k = 64 / Math.max(w, hh);
    return h('button', { type: 'button', class: 'sizecard', onclick: () => openDesign(el, ctx, { W: w, H: hh, objs: blank(w, hh), name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sizeId: id }) },
      h('div', { class: 'shape', style: { width: w * k + 'px', height: hh * k + 'px' } }), h('b', {}, name), h('span', {}, `${w} × ${hh} px`));
  };
  const tplGrid = h('div', { class: 'tplgrid' });
  const custom = { w: h('input', { class: 'inp', type: 'number', min: 50, max: 8000, value: 1080, style: { width: '110px' } }), h: h('input', { class: 'inp', type: 'number', min: 50, max: 8000, value: 1080, style: { width: '110px' } }) };
  el.replaceChildren(h('div', { class: 'studio' },
    h('p', { class: 'status', style: { marginTop: 0 } }, 'Make social posts, ads, thumbnails, banners, posters and cards. Everything stays on your device.'),
    h('div', { class: 'startrow' },
      draft ? card('edit', 'Continue your last design', `${Math.round(draft.W)} × ${Math.round(draft.H)} px, saved ${new Date(draft.savedAt).toLocaleString()}`, () => openDesign(el, ctx, draft)) : null,
      card('organize', 'Start from a picture', 'Upload any design; it is split into editable layers (text, photos, shapes, graphics) with matching Google fonts.', () => fromPicture('auto')),
      card('scan', 'Recreate a screenshot as a template', 'Low-resolution screenshot or snapshot of a design? It is rebuilt sharp in high resolution, as editable layers.', () => fromPicture('always')),
      card('upload', 'Open a project file', 'Continue a design you saved as an .editsupreme.json file.', openProject)),
    h('h2', {}, 'Start from a template'), tplGrid,
    ...SIZES.map(([group, list]) => h('div', {}, h('h2', {}, group), h('div', { class: 'sizegrid' }, ...list.map(sizeCard)))),
    h('h2', {}, 'Custom size'),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, custom.w, '×', custom.h, 'px',
      h('button', { class: 'btn primary', type: 'button', onclick: () => { const w = Math.max(50, Math.min(8000, +custom.w.value || 1080)), hh = Math.max(50, Math.min(8000, +custom.h.value || 1080)); openDesign(el, ctx, { W: w, H: hh, objs: blank(w, hh), name: 'custom-design' }); } }, 'Create design'))));
  // Template previews are drawn on the device once the fonts have loaded.
  const { renderDesign } = await import('./editor.js');
  for (const t of TEMPLATES) {
    const [, name, W, H] = sizeById(t.size);
    const thumb = h('div', { class: 'thumb' }, h('span', { class: 'status' }, 'Loading…'));
    tplGrid.append(h('button', { type: 'button', class: 'tplcard', onclick: () => openDesign(el, ctx, { W, H, objs: t.build(W, H), name: t.id, sizeId: t.size }) }, thumb, h('b', {}, t.name), h('span', { class: 'status' }, name)));
    try {
      const objs = t.build(W, H);
      for (const o of objs) if (o.isBg) { o.w = W; o.h = H; }
      const c = await renderDesign(objs, W, H, 380 / Math.max(W, H));
      thumb.replaceChildren(h('img', { src: c.toDataURL('image/jpeg', 0.85), alt: t.name }));
    } catch (e) { console.warn('template preview failed', e); thumb.replaceChildren(h('span', { class: 'status' }, t.name)); }
  }
}

export const tools = {
  'design-studio': { standalone: true, mount: (el, ctx) => studioHome(el, ctx) }
};
