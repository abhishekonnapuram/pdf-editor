// Image to layers, step 1: choose which objects become their own layers. Objects are found by the on-device
// "segment anything" AI (automatically, or by clicking on them), and the main subject can be cut out with the
// background-removal AI. Resolves with { objects: [{name, alpha}], withText, fill }.
import { h } from '../lib/ui.js';
import { icon } from '../lib/icons.js';

const COLORS = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#ff9500', '#00c7be', '#ff2d55', '#5856d6', '#a2845e', '#30d158', '#64d2ff', '#bf5af2', '#ffd60a'];

export function pickObjects(el, canvas, { design }) {
  return new Promise((resolve) => {
    const W = canvas.width, H = canvas.height;
    const k = Math.min(1, 1100 / Math.max(W, H));
    const view = h('canvas', { class: 'olview', width: Math.round(W * k), height: Math.round(H * k) });
    const vg = view.getContext('2d');
    const status = h('div', { class: 'olstatus' });
    const list = h('div', { class: 'ollist' });
    const sel = h('div', { class: 'olsel' });
    const objs = [];
    let picker = null, current = null, busy = false, seq = 0;
    const opts = { withText: design, fill: true };

    const say = (text, spin) => status.replaceChildren(...(text ? [spin ? h('span', { class: 'spinner' }) : null, h('span', {}, text)].filter(Boolean) : []));

    // A tinted copy of an object's outline at the view's size, for drawing over the picture.
    function tint(o) {
      const c = document.createElement('canvas');
      c.width = view.width; c.height = view.height;
      const g = c.getContext('2d');
      if (o.choice) {
        const m = o.choice.masks[o.choice.pick], s = document.createElement('canvas');
        s.width = picker.vw; s.height = picker.vh;
        const sg = s.getContext('2d'), id = sg.createImageData(s.width, s.height);
        for (let i = 0; i < m.low.length; i++) id.data[i * 4 + 3] = m.low[i] > 0.5 ? 255 : Math.round(m.low[i] * 255);
        sg.putImageData(id, 0, 0);
        g.imageSmoothingQuality = 'high';
        g.drawImage(s, 0, 0, c.width, c.height);
      } else {
        const s = document.createElement('canvas');
        s.width = W; s.height = H;
        const sg = s.getContext('2d'), id = sg.createImageData(W, H);
        for (let i = 0; i < o.alpha.length; i++) id.data[i * 4 + 3] = o.alpha[i];
        sg.putImageData(id, 0, 0);
        g.drawImage(s, 0, 0, c.width, c.height);
      }
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = o.color;
      g.fillRect(0, 0, c.width, c.height);
      o.tint = c;
      o.hit = g.getImageData(0, 0, c.width, c.height).data;
    }

    function draw() {
      vg.clearRect(0, 0, view.width, view.height);
      vg.drawImage(canvas, 0, 0, view.width, view.height);
      for (const o of objs) {
        vg.globalAlpha = o === current ? 0.62 : 0.38;
        vg.drawImage(o.tint, 0, 0);
      }
      vg.globalAlpha = 1;
      drawList();
    }

    function drawList() {
      list.replaceChildren(...(objs.length ? objs.map((o) => h('div', { class: 'olitem' + (o === current ? ' on' : '') },
        h('button', { type: 'button', class: 'olname', onclick: () => { current = o; draw(); } }, h('span', { class: 'dot', style: { background: o.color } }), o.name),
        h('button', { type: 'button', class: 'olx', title: 'Don’t make this a layer', onclick: () => remove(o) }, '×')))
        : [h('p', { class: 'hint', style: { margin: 0 } }, 'No objects yet. Click anything in the picture to make it its own layer.')]));
      const c = current?.choice;
      sel.replaceChildren(...(c ? [
        h('div', { class: 'hint' }, `Selected: ${current.name}`),
        h('div', { class: 'olsizes' },
          ...['Small part', 'Bigger part', 'Whole object'].map((t, i) => h('button', { type: 'button', class: 'chip' + (c.pick === i ? ' on' : ''), onclick: () => { c.pick = i; current.alpha = null; tint(current); draw(); } }, t)))
      ] : []));
    }

    function remove(o) {
      objs.splice(objs.indexOf(o), 1);
      if (current === o) current = objs[objs.length - 1] || null;
      draw();
    }

    function add(o) {
      o.color = COLORS[seq++ % COLORS.length];
      o.name ||= 'Object ' + (objs.filter((x) => x.choice).length + 1);
      tint(o);
      // Smaller pieces found earlier that are part of this object would be layers twice: drop them.
      const area = (x) => { let n = 0; for (let i = 3; i < x.hit.length; i += 16) if (x.hit[i] > 128) n++; return n; };
      for (const p of [...objs]) {
        let inside = 0;
        for (let i = 3; i < p.hit.length; i += 16) if (p.hit[i] > 128 && o.hit[i] > 128) inside++;
        const a = area(p);
        if (a && inside / a > 0.85 && a < area(o)) objs.splice(objs.indexOf(p), 1);
      }
      objs.push(o);
      current = o;
      draw();
    }

    async function job(text, fn) {
      if (busy) return;
      busy = true; el.classList.add('olbusy');
      say(text, true);
      try { await fn(); say(''); }
      catch (e) { console.error(e); say(/^nothing clear/.test(e.message) ? 'Sorry, ' + e.message : 'Something went wrong: ' + (e.message || e)); }
      finally { busy = false; el.classList.remove('olbusy'); }
    }

    // Picker AI, started at once so the first click is quick.
    let ready = null;
    const getPicker = () => (ready ||= (async () => {
      const { objectPicker } = await import('../lib/objlayers.js');
      picker = await objectPicker(canvas, (s) => say(s[0].toUpperCase() + s.slice(1) + '…', true));
      return picker;
    })());

    view.addEventListener('click', (e) => {
      const r = view.getBoundingClientRect();
      const vx = (e.clientX - r.left) * view.width / r.width, vy = (e.clientY - r.top) * view.height / r.height;
      const at = (Math.round(vy) * view.width + Math.round(vx)) * 4 + 3;
      // Clicking a found object selects it; clicking inside the selected one picks a part of it.
      const hit = [...objs].reverse().find((o) => o.hit[at] > 128);
      if (hit && hit !== current) { current = hit; draw(); return; }
      job('Finding the object…', async () => {
        await getPicker();
        const choice = await picker.at([{ x: vx / k, y: vy / k }]);
        if (!choice) throw new Error('nothing clear was found there. Click right on the object you want.');
        add({ choice });
      });
    });

    const auto = () => job('Finding objects…', async () => {
      await getPicker();
      const found = await picker.auto((s) => say(s[0].toUpperCase() + s.slice(1) + '…', true));
      for (const choice of found) add({ choice });
      current = null; draw();
      if (!found.length) say('No clear objects were found. Click anything in the picture to select it.');
    });

    const subject = () => job('Cutting out the main subject…', async () => {
      const { subjectMask } = await import('../lib/objlayers.js');
      const alpha = await subjectMask(canvas, (s) => say(s[0].toUpperCase() + s.slice(1) + '…', true));
      add({ alpha, name: 'Main subject' });
    });

    const check = (key, label, hint) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts[key], onchange: (e) => { opts[key] = e.target.checked; } }), ' ' + label, hint && h('div', { class: 'hint' }, hint));

    const go = h('button', { class: 'btn primary big', type: 'button', style: { width: '100%' }, onclick: async () => {
      if (busy) return;
      go.disabled = true;
      const out = [];
      for (const o of objs) out.push({ name: o.name, alpha: o.alpha || (o.alpha = picker.full(o.choice)) });
      resolve({ objects: out, ...opts });
    } }, h('span', { html: icon('layers') }), 'Make layers');

    el.replaceChildren(h('div', { class: 'layout' },
      h('div', { class: 'panel' }, h('div', { class: 'olstage' }, view), status,
        h('p', { class: 'hint' }, 'Click any object, person or thing to make it its own layer. Click a coloured object to select it; click it again to pick a part of it.')),
      h('div', { class: 'panel sidepanel' },
        h('h3', { style: { marginTop: 0 } }, 'Choose your layers'),
        h('p', { class: 'hint' }, 'Free AI on your device finds objects and fills in the background behind them. Nothing is uploaded.'),
        h('div', { class: 'olbtns' },
          h('button', { class: 'btn', type: 'button', onclick: auto }, h('span', { html: icon('ai') }), 'Find objects automatically'),
          h('button', { class: 'btn', type: 'button', onclick: subject }, h('span', { html: icon('cutout') }), 'Cut out main subject')),
        h('div', { class: 'olhead' }, 'Object layers'), list, sel,
        h('div', { class: 'olhead' }, 'Also'),
        check('withText', 'Make text editable', 'Reads the words in the picture and turns them into text you can change.'),
        check('fill', 'Fill in behind objects with AI', 'So the background looks complete when you move an object.'),
        go,
        h('p', { class: 'hint' }, design ? 'This looks like a design: shapes, photos and text become layers too.' : 'Photos and illustrations: pick the objects you want to move or change.'))));
    draw();
    if (design) { say('Getting the object finder ready…', true); getPicker().then(() => say('Ready. Click anything to make it a layer.')).catch((e) => say('The object finder could not start: ' + e.message)); }
    else auto();
  });
}
