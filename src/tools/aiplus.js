// Free on-device AI tools: AI Writer (ad copy, captions, scripts…), AI Voice-over (text to speech) and
// AI Smart crop (one picture cropped for every social size with the subject kept in frame).
import { h, toast, pickFiles } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { download, zipOutputs, stem, canvasToBlob } from '../lib/core.js';
import { IMG_ACCEPT, readPicture, newCanvas } from '../lib/imgio.js';

const field = (label, input, hint) => h('label', { class: 'ai-field' }, h('span', {}, label), input, hint ? h('small', { class: 'hint' }, hint) : '');
const select = (opts, value, onchange) => h('select', { class: 'inp', onchange: (e) => onchange(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));

// ======================= AI Writer =======================
const TASKS = [
  ['ad', 'Ad copy (headline, text, call to action)', 'Write {n} different ad variations for: {about}. Each has a short attention-grabbing headline (max 8 words), one or two lines of persuasive text and a call to action. Number them.'],
  ['caption', 'Social media caption + hashtags', 'Write {n} social media captions for: {about}. Use a hook in the first line, a few short lines, a call to action and 5 to 8 relevant hashtags. Number them.'],
  ['product', 'Product description', 'Write {n} product descriptions for: {about}. Start with a benefit, then 3 to 5 bullet points of features, then a closing line.'],
  ['script', 'Video ad script (15–30 seconds)', 'Write {n} short video ad scripts for: {about}. Format each as scenes: "Scene 1 (3s): on-screen text | voice-over". Start with a strong hook, show the benefit, end with a call to action.'],
  ['headlines', 'Headlines and slogans', 'Write {n}0 short, catchy headlines or slogans for: {about}. One per line, numbered.'],
  ['youtube', 'YouTube title and description', 'Write {n} YouTube video titles (under 70 characters) and one description with timestamps placeholders and keywords for: {about}.'],
  ['email', 'Email or message', 'Write {n} short emails for: {about}. Include a subject line, a friendly greeting, the message and a sign-off.'],
  ['rewrite', 'Rewrite / improve my text', 'Rewrite this text to be clearer and more engaging, keeping its meaning. Give {n} versions:\n\n{about}'],
  ['shorter', 'Make my text shorter', 'Make this text about half as long, keeping the key points. Give {n} versions:\n\n{about}'],
  ['bio', 'Bio / about us', 'Write {n} short bios (about 60 words) for: {about}.']
];
const TONES = ['Friendly', 'Professional', 'Exciting', 'Luxury', 'Funny', 'Urgent', 'Inspiring', 'Simple and clear'].map((t) => [t, t]);

async function writerMount(el, ctx) {
  const { aiKind, AI_NOTE, generate } = await import('../lib/llm.js');
  const S = { task: 'ad', tone: 'Friendly', n: '3', length: 'short' };
  const about = h('textarea', { class: 'inp', rows: 5, placeholder: 'What is it about? For example: "Cold-pressed mango juice from Ratnagiri, no added sugar, ₹99 launch offer, delivery in Hyderabad".' });
  const audience = h('input', { class: 'inp', placeholder: 'Who is it for? (optional) e.g. college students, new parents, small shops' });
  const out = h('textarea', { class: 'inp ai-out', rows: 14, placeholder: 'Your text appears here.', spellcheck: 'true' });
  const status = h('p', { class: 'status' });
  const note = h('p', { class: 'hint' });
  aiKind().then((k) => { note.textContent = AI_NOTE[k]; });
  let busy = false;
  const run = async () => {
    if (busy) return;
    if (!about.value.trim()) { about.focus(); return toast('Tell the AI what to write about.'); }
    busy = true; go.disabled = true; out.value = '';
    try {
      const t = TASKS.find((x) => x[0] === S.task);
      const prompt = t[2].replace('{n}', S.n).replace('{about}', about.value.trim()) +
        (audience.value.trim() ? `\nAudience: ${audience.value.trim()}.` : '') + `\nTone: ${S.tone}. Length: ${S.length}.`;
      const text = await generate('You are an expert copywriter for small businesses and creators. Write natural, specific, persuasive English. No made-up facts, prices or claims beyond what you are told. Use plain text.',
        prompt, { onStatus: (s) => { status.textContent = s; }, onToken: (s) => { out.value = s; out.scrollTop = out.scrollHeight; }, maxTokens: S.length === 'long' ? 900 : 550, temperature: 0.8 });
      out.value = text; status.textContent = 'Done. Edit anything you like.';
    } catch (e) { console.warn(e); status.textContent = 'The AI could not start on this device. Try Chrome or Edge on a computer.'; }
    finally { busy = false; go.disabled = false; }
  };
  const go = h('button', { class: 'btn primary', type: 'button', onclick: run }, h('span', { html: icon('ai') }), 'Write');
  el.replaceChildren(h('div', { class: 'ai-wrap' },
    h('div', { class: 'ai-panel' },
      field('What to write', select(TASKS.map((t) => [t[0], t[1]]), S.task, (v) => { S.task = v; })),
      field('About', about), field('Audience', audience),
      h('div', { class: 'ai-row' },
        field('Tone', select(TONES, S.tone, (v) => { S.tone = v; })),
        field('Length', select([['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']], S.length, (v) => { S.length = v; })),
        field('Options', select([['1', '1'], ['3', '3'], ['5', '5']], S.n, (v) => { S.n = v; }))),
      h('div', { class: 'ai-row' }, go), status, note),
    h('div', { class: 'ai-panel' }, out,
      h('div', { class: 'ai-row' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(out.value); toast('Copied.'); } catch { toast('Select the text and copy it.'); } } }, h('span', { html: icon('copy') }), 'Copy'),
        h('button', { class: 'btn', type: 'button', onclick: run }, 'Write again'),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (!out.value.trim()) return toast('Write something first.'); sessionStorage.setItem('editsupreme.vo.text', out.value); ctx.openTool ? ctx.openTool('ai-voiceover', []) : (location.hash = '#/tool/ai-voiceover'); } }, h('span', { html: icon('wave') }), 'Turn into voice-over')))));
}

// ======================= AI Voice-over =======================
async function voiceMount(el) {
  const { VOICES, synthesize, wavBlob, mp3Blob, RATE } = await import('../lib/tts.js');
  const S = { voice: 'af_heart', speed: 1 };
  const text = h('textarea', { class: 'inp', rows: 9, placeholder: 'Type or paste the words to speak. Short sentences sound best.' });
  try { const t = sessionStorage.getItem('editsupreme.vo.text'); if (t) { text.value = t; sessionStorage.removeItem('editsupreme.vo.text'); } } catch { /* blocked */ }
  const status = h('p', { class: 'status' });
  const player = h('div', { class: 'ai-player' });
  let last = null;
  const go = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!text.value.trim()) return toast('Type something to speak.');
    go.disabled = true; player.replaceChildren();
    try {
      const t0 = performance.now();
      last = await synthesize(text.value, { voice: S.voice, speed: S.speed, onStatus: (s) => { status.textContent = s; } });
      const url = URL.createObjectURL(wavBlob(last));
      player.replaceChildren(h('audio', { controls: true, src: url, autoplay: true }),
        h('div', { class: 'ai-row' },
          h('button', { class: 'btn', type: 'button', onclick: async () => download(await mp3Blob(last), 'voice-over.mp3') }, h('span', { html: icon('download') }), 'Download MP3'),
          h('button', { class: 'btn', type: 'button', onclick: () => download(wavBlob(last), 'voice-over.wav') }, 'Download WAV')));
      status.textContent = `Ready: ${(last.length / RATE).toFixed(1)} seconds of speech, made in ${((performance.now() - t0) / 1000).toFixed(0)} s.`;
    } catch (e) { console.warn(e); status.textContent = 'The voice model could not start on this device. Try a current Chrome, Edge or Firefox on a computer.'; }
    finally { go.disabled = false; }
  } }, h('span', { html: icon('wave') }), 'Make voice-over');
  el.replaceChildren(h('div', { class: 'ai-wrap one' }, h('div', { class: 'ai-panel' },
    field('Text', text),
    h('div', { class: 'ai-row' },
      field('Voice', select(VOICES, S.voice, (v) => { S.voice = v; })),
      field('Speed', h('input', { type: 'range', min: 0.7, max: 1.4, step: 0.05, value: 1, oninput: (e) => { S.speed = +e.target.value; } }))),
    h('div', { class: 'ai-row' }, go), status, player,
    h('p', { class: 'hint' }, 'English voices (US and UK). The voice model (Kokoro, open source) downloads once, about 90 MB, then runs on your device: your text is not uploaded. Free for commercial use.'))));
}

// ======================= AI Smart crop =======================
const CROPS = [
  ['ig-post', 'Instagram post', 1080, 1080], ['ig-portrait', 'Instagram portrait', 1080, 1350], ['story', 'Story / Reel / Shorts', 1080, 1920],
  ['yt-thumb', 'YouTube thumbnail', 1280, 720], ['fb-post', 'Facebook post', 1200, 630], ['fb-cover', 'Facebook cover', 1640, 624],
  ['li-banner', 'LinkedIn banner', 1584, 396], ['x-post', 'X (Twitter) post', 1600, 900], ['pin', 'Pinterest pin', 1000, 1500],
  ['wa-dp', 'Profile picture', 800, 800], ['web-hero', 'Website hero', 1920, 1080]
];

/** The part of the picture that matters: faces (with head and shoulders) or the main subject. */
async function subjectBox(canvas, onStatus) {
  const W = canvas.width, H = canvas.height;
  try {
    onStatus('Looking for faces…');
    const { findFaces } = await import('./imagestudio.js');
    const faces = (await findFaces(canvas)).filter((f) => f.score > 0.5);
    if (faces.length) {
      const x0 = Math.min(...faces.map((f) => f.x - f.w * 0.6)), x1 = Math.max(...faces.map((f) => f.x + f.w * 1.6));
      const y0 = Math.min(...faces.map((f) => f.y - f.h * 0.5)), y1 = Math.max(...faces.map((f) => f.y + f.h * 2.2));
      return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W, x1), y1: Math.min(H, y1), faces: true };
    }
  } catch { /* face finder unavailable */ }
  onStatus('Finding the main subject with AI…');
  const { cutoutMask } = await import('./images.js');
  const small = newCanvas(Math.round(W * Math.min(1, 640 / W)), Math.round(H * Math.min(1, 640 / W)));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  const mask = await cutoutMask(small, 'best', onStatus);
  const d = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height).data;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (d[(y * mask.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = W / small.width;
  if (x1 < 0) return { x0: 0, y0: 0, x1: W, y1: H };
  return { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k };
}

/** The biggest crop of this shape that keeps the subject in frame (faces sit a little above the middle). */
function cropFor(W, H, box, ratio) {
  let cw = W, ch = W / ratio;
  if (ch > H) { ch = H; cw = H * ratio; }
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  // Zoom in a little when the subject is small, so it fills more of the frame.
  const zoom = Math.max(1, Math.min(1.6, Math.min(cw / (bw * 1.25), ch / (bh * 1.25))));
  cw /= zoom; ch /= zoom;
  const cx = (box.x0 + box.x1) / 2, cy = box.faces ? box.y0 + bh * 0.45 : (box.y0 + box.y1) / 2;
  const x = Math.max(0, Math.min(W - cw, cx - cw / 2)), y = Math.max(0, Math.min(H - ch, cy - ch * (box.faces ? 0.42 : 0.5)));
  return { x, y, w: cw, h: ch };
}

function cropMount(el) {
  const S = { picked: new Set(['ig-post', 'ig-portrait', 'story', 'yt-thumb']), files: [], results: [] };
  const status = h('p', { class: 'status' });
  const grid = h('div', { class: 'ai-crops' });
  const checks = h('div', { class: 'ai-checks' }, CROPS.map(([id, name, w, hh]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.picked.has(id), onchange: (e) => { e.target.checked ? S.picked.add(id) : S.picked.delete(id); } }), ` ${name} `, h('small', { class: 'hint' }, `${w}×${hh}`))));
  const run = async () => {
    if (!S.files.length) return toast('Add a picture first.');
    if (!S.picked.size) return toast('Tick at least one size.');
    go.disabled = true; grid.replaceChildren(); S.results = [];
    try {
      for (const f of S.files) {
        status.textContent = `Reading ${f.name}…`;
        const canvas = (await readPicture(f)).frames[0].canvas;
        const box = await subjectBox(canvas, (s) => { status.textContent = s; });
        for (const [id, name, w, hh] of CROPS.filter((c) => S.picked.has(c[0]))) {
          const r = cropFor(canvas.width, canvas.height, box, w / hh);
          const out = newCanvas(w, hh), g = out.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, w, hh);
          const blob = await canvasToBlob(out, 'image/jpeg', 0.92);
          const fname = `${stem(f.name)}-${id}-${w}x${hh}.jpg`;
          S.results.push({ blob, name: fname });
          const url = URL.createObjectURL(blob);
          grid.append(h('figure', { class: 'ai-crop' }, h('img', { src: url, alt: name, style: { aspectRatio: `${w}/${hh}` } }),
            h('figcaption', {}, h('span', {}, name, h('small', { class: 'hint' }, ` ${w}×${hh}${r.w < w * 0.9 ? ' · enlarged' : ''}`)),
              h('button', { class: 'iconbtn', type: 'button', title: 'Download', 'aria-label': 'Download ' + name, onclick: () => download(blob, fname), html: icon('download') }))));
        }
      }
      status.textContent = `${S.results.length} pictures ready.`;
    } catch (e) { console.warn(e); status.textContent = 'Something went wrong: ' + (e.message || e); }
    finally { go.disabled = false; }
  };
  const go = h('button', { class: 'btn primary', type: 'button', onclick: run }, h('span', { html: icon('crop') }), 'Crop for all sizes');
  const fileNote = h('span', { class: 'status' }, 'No picture yet.');
  el.replaceChildren(h('div', { class: 'ai-wrap one' }, h('div', { class: 'ai-panel' },
    h('div', { class: 'ai-row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { const f = await pickFiles(IMG_ACCEPT, true); if (f.length) { S.files = f; fileNote.textContent = f.length === 1 ? f[0].name : `${f.length} pictures`; } } }, h('span', { html: icon('upload') }), 'Add pictures'), fileNote),
    h('h3', {}, 'Sizes'), checks,
    h('div', { class: 'ai-row' }, go,
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (!S.results.length) return toast('Crop first.'); const z = await zipOutputs(S.results, 'smart-crops.zip'); download(z.blob, z.name); } }, h('span', { html: icon('download') }), 'Download all (ZIP)')),
    status, grid,
    h('p', { class: 'hint' }, 'Faces are found with Google MediaPipe; other subjects with an open background-removal model (44 MB, downloads once). Everything runs on your device.'))));
}

export const tools = {
  'ai-writer': { standalone: true, mount: (el, ctx) => writerMount(el, ctx) },
  'ai-voiceover': { standalone: true, mount: (el) => voiceMount(el) },
  'smart-crop': { standalone: true, mount: (el) => cropMount(el) }
};
