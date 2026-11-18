// AI video ad maker: give it your product photos and clips, a few words about the offer and (optionally) ads
// you like as reference. It studies the reference (colours, mood, pace), writes the script with on-device AI,
// picks fonts and colours, builds an editable storyboard with motion, transitions, music and an AI
// voice-over, plays it live and exports an MP4 / WebM video. The video can be opened in FilmCraft (the
// site's video editor) for finishing touches. Everything runs in the browser; nothing is uploaded.
import { h, toast, pickFiles } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { download } from '../lib/core.js';
import { IMG_ACCEPT, readPicture, newCanvas } from '../lib/imgio.js';
import { loadFont, fontStack } from '../lib/fonts.js';
import { FONT_PAIRS, PALETTES, imagePalette, imageMood, rankPairs, textOn, lumOf } from '../lib/pairs.js';

const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.m4v,.mkv';
const FORMATS = [['9:16', 'Reel / Story / Shorts (9:16)', 1080, 1920], ['1:1', 'Square post (1:1)', 1080, 1080], ['4:5', 'Feed portrait (4:5)', 1080, 1350], ['16:9', 'YouTube / landscape (16:9)', 1920, 1080]];
const TONES = [['Exciting', 'Exciting'], ['Friendly', 'Friendly'], ['Professional', 'Professional'], ['Luxury', 'Premium / luxury'], ['Funny', 'Fun'], ['Urgent', 'Urgent sale'], ['Inspiring', 'Inspiring'], ['Minimal', 'Calm / minimal']];
const TONE_TAGS = { Exciting: ['bold', 'fitness', 'modern'], Friendly: ['playful', 'modern', 'food'], Professional: ['corporate', 'modern', 'minimal'], Luxury: ['luxury', 'elegant', 'fashion'], Funny: ['playful', 'kids', 'bold'], Urgent: ['bold'], Inspiring: ['elegant', 'editorial', 'modern'], Minimal: ['minimal', 'modern', 'editorial'] };
const MOTIONS = [['zoom-in', 'Slow zoom in'], ['zoom-out', 'Slow zoom out'], ['pan-left', 'Pan left'], ['pan-right', 'Pan right'], ['still', 'Still']];
const LAYOUTS = [['bottom', 'Text at bottom'], ['center', 'Text in centre'], ['big', 'Big highlighted words'], ['card', 'Text on a card'], ['top', 'Text at top'], ['split', 'Text at side']];
const TRANS = [['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['wipe', 'Wipe'], ['cut', 'Cut']];
const TR = 0.45; // transition length, seconds

const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const uid = () => Math.random().toString(36).slice(2, 9);
const satOf = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };

/** A design palette [bg, text, accent, accent 2, soft] from a picture's main colours. */
function paletteFrom(hexes, dark) {
  if (!hexes || hexes.length < 3) return null;
  const byL = hexes.slice().sort((a, b) => lumOf(a) - lumOf(b));
  const vivid = hexes.slice().sort((a, b) => satOf(b) * (lumOf(b) > 40 ? 1 : 0.3) - satOf(a) * (lumOf(a) > 40 ? 1 : 0.3));
  const bg = dark ? byL[0] : byL[byL.length - 1];
  const accent = satOf(vivid[0]) > 0.3 ? vivid[0] : (dark ? '#f5c542' : '#e4572e');
  return [bg, textOn(bg), accent, vivid[1] || accent, hexes[0]];
}

function videoEl(url) {
  const v = h('video', { src: url, muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
  v.muted = true;
  return v;
}
const once = (el, ev, ms = 4000) => new Promise((res) => { const t = setTimeout(res, ms); el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true }); });
async function seekTo(v, t) { if (Math.abs(v.currentTime - t) < 0.02 && v.readyState >= 2) return; v.currentTime = t; await once(v, 'seeked', 3000); }

/** Frames from a video (canvases), spread through its first `upto` seconds. */
async function videoFrames(url, n = 8, upto = 30) {
  const v = videoEl(url);
  await once(v, 'loadedmetadata', 8000);
  // WebM files recorded in a browser often have no duration until the end has been read.
  if (!isFinite(v.duration)) { v.currentTime = 1e9; await once(v, 'durationchange', 5000); v.currentTime = 0; await once(v, 'seeked', 3000); }
  const d = Math.min(isFinite(v.duration) ? v.duration : 0, upto), out = [];
  for (let i = 0; i < n && d; i++) {
    await seekTo(v, d * (i + 0.5) / n);
    const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
    const c = newCanvas(Math.round(v.videoWidth * k), Math.round(v.videoHeight * k));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c);
  }
  return { frames: out, duration: v.duration, v };
}

/** Average shot length (seconds) of a video, from how often the picture changes completely. */
async function shotLength(v) {
  const d = Math.min(v.duration || 0, 15);
  if (d < 2) return null;
  const c = newCanvas(32, 32), g = c.getContext('2d', { willReadFrequently: true });
  let prev = null, cuts = 0;
  for (let t = 0; t < d; t += 0.25) {
    await seekTo(v, t);
    g.drawImage(v, 0, 0, 32, 32);
    const px = g.getImageData(0, 0, 32, 32).data;
    if (prev) { let s = 0; for (let i = 0; i < px.length; i += 4) s += Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]); if (s / 1024 / 3 > 38) cuts++; }
    prev = px;
  }
  return d / (cuts + 1);
}

async function pairReady(p) {
  const heavy = (p.hw || 700) >= 600;
  await Promise.all([loadFont(p.head, { bold: heavy }), loadFont(p.head), loadFont(p.body), loadFont(p.body, { bold: true })]);
  try { await document.fonts.load(`${heavy ? 700 : 400} 40px "${p.head}"`); await document.fonts.load(`700 20px "${p.body}"`); } catch { /* fallback font */ }
}

function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- the tool
function mount(el, ctx) {
  const A = {
    format: '9:16', length: 15, media: [], refs: [], scenes: [], logo: null, music: null, musicVol: 0.6,
    brief: { brand: '', product: '', points: '', offer: '', cta: 'Shop now', site: '', audience: '', tone: 'Exciting' },
    pair: FONT_PAIRS.find((p) => p.id === 'bebas-montserrat'), pal: PALETTES[4].c.slice(), refPal: null, energy: 'medium',
    voice: { on: false, id: 'af_heart', speed: 1.05 }, useAI: true, style: 0, look: null
  };
  const size = () => { const f = FORMATS.find((x) => x[0] === A.format); return [f[2], f[3]]; };

  // ---------- media ----------
  async function addMedia(files, into) {
    for (const f of files) {
      try {
        if (/^video\//.test(f.type) || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name)) {
          const url = URL.createObjectURL(f);
          const { frames, duration, v } = await videoFrames(url, into === A.refs ? 8 : 1);
          if (!frames.length) throw new Error('no frames');
          const item = { id: uid(), kind: 'video', name: f.name, url, dur: duration, w: frames[0].width, h: frames[0].height, thumb: frames[0], frames, file: f };
          if (into === A.refs) item.shot = await shotLength(v).catch(() => null);
          into.push(item);
        } else {
          const c = (await readPicture(f)).frames[0].canvas;
          into.push({ id: uid(), kind: 'image', name: f.name, el: c, w: c.width, h: c.height, thumb: c, frames: [c], file: f, plain: plainBackground(c) });
        }
      } catch (e) { console.warn(e); toast(`Could not read ${f.name}.`); }
    }
  }
  /** Product shots on a plain light background look better whole (fitted) on a colour than cropped. */
  function plainBackground(c) {
    const g = c.getContext('2d', { willReadFrequently: true }), pts = [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]];
    const px = pts.map(([x, y]) => g.getImageData(x, y, 1, 1).data);
    const same = px.every((p) => Math.abs(p[0] - px[0][0]) + Math.abs(p[1] - px[0][1]) + Math.abs(p[2] - px[0][2]) < 24);
    return same ? '#' + [...px[0]].slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('') : null;
  }

  // ---------- understanding the reference ----------
  function studyRefs() {
    const notes = [];
    if (!A.refs.length) return notes;
    const frames = A.refs.flatMap((r) => r.frames);
    const mos = newCanvas(320, 320), mg = mos.getContext('2d'), n = Math.ceil(Math.sqrt(frames.length)), cw = 320 / n;
    frames.forEach((f, i) => mg.drawImage(f, (i % n) * cw, Math.floor(i / n) * cw, cw, cw));
    const mood = imageMood(mos), hexes = imagePalette(mos, 6);
    A.look = { mood, dark: mood.lum < 120 };
    A.refPal = paletteFrom(hexes, mood.lum < 120);
    if (A.refPal) { A.pal = A.refPal.slice(); notes.push('its colours'); }
    const shots = A.refs.map((r) => r.shot).filter(Boolean);
    if (shots.length) {
      const s = shots.reduce((a, b) => a + b, 0) / shots.length;
      A.energy = s < 1.6 ? 'fast' : s < 3.2 ? 'medium' : 'calm'; A.shotLen = s;
      notes.push(`its pace (a new shot about every ${s.toFixed(1)} s)`);
    }
    notes.push(`its mood (${mood.tags.slice(0, 2).join(', ')})`);
    return notes;
  }
  function choosePair() {
    const tags = [...(A.look?.mood.tags || []).slice(0, 2), ...(TONE_TAGS[A.brief.tone] || ['modern'])];
    const ranked = rankPairs([...new Set(tags)]);
    return ranked[A.style % Math.max(1, Math.min(6, ranked.length))] || FONT_PAIRS[0];
  }

  // ---------- writing the script ----------
  function ruleScript(n) {
    const b = A.brief, name = b.product || b.brand || 'our new collection';
    const points = b.points.split(/\n|;|•/).map((s) => s.trim()).filter(Boolean);
    const hooks = { Exciting: `Say hello to ${name}`, Friendly: `Meet ${name}`, Professional: `${name}, made simple`, Luxury: `Introducing ${name}`, Funny: `You need ${name}. Trust us.`, Urgent: b.offer || `Last chance: ${name}`, Inspiring: `Made for more: ${name}`, Minimal: name };
    const scenes = [{ text: hooks[b.tone] || `Meet ${name}`, sub: b.audience ? `Made for ${b.audience}` : (b.brand && b.product ? b.brand : ''), voiceover: (hooks[b.tone] || `Meet ${name}`) + '.' }];
    // Only the visitor's own points: no made-up claims to fill extra scenes.
    const mids = Math.max(1, Math.min(n - 2, points.length));
    for (let i = 0; i < mids; i++) {
      const p = points[i] || (b.brand && b.product ? `${b.product} by ${b.brand}` : name);
      // "Heading: detail" or "Heading – detail" (a hyphen inside a word like sun-ripened is kept).
      const SEP = /\s*:\s+|\s+[–—-]\s+/;
      const [head, ...rest] = p.split(SEP);
      scenes.push({ text: head.length > 34 ? head.split(' ').slice(0, 5).join(' ') : head, sub: rest.join(' – ') || (head.length > 34 ? p : ''), voiceover: p.split(SEP).join(', ').replace(/[.!?]*$/, '') + '.' });
    }
    scenes.push({ text: b.offer || b.cta || 'Order today', sub: [b.cta && b.offer ? b.cta : '', b.site].filter(Boolean).join(' · '), voiceover: [b.offer, b.cta, b.site ? `Visit ${b.site.replace(/^https?:\/\//, '')}` : ''].filter(Boolean).join('. ') + '.', last: true });
    return scenes.slice(0, Math.max(n, 3));
  }
  async function aiScript(n, onStatus) {
    const { generateJSON } = await import('../lib/llm.js');
    const b = A.brief;
    const schema = { type: 'object', properties: { scenes: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, sub: { type: 'string' }, voiceover: { type: 'string' } }, required: ['text', 'sub', 'voiceover'] } } }, required: ['scenes'] };
    const facts = [['Brand', b.brand], ['Product or service', b.product], ['Key points', b.points.replace(/\n/g, '; ')], ['Offer', b.offer], ['Call to action', b.cta], ['Website or handle', b.site], ['Audience', b.audience]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
    const res = await generateJSON('You write short, punchy scripts for social media video ads.',
      `${facts}\nTone: ${b.tone}.\n\nWrite exactly ${n} scenes for a ${A.length}-second ${A.format} video ad. Scene 1 is a hook that stops people scrolling. The middle scenes each show one benefit. The last scene gives the offer and the call to action. For each scene: "text" is the big on-screen text (at most 6 words), "sub" is a smaller line (at most 10 words, may be empty), "voiceover" is one short spoken sentence. Use only the facts given; do not invent prices or claims.\nReturn {"scenes":[{"text":"","sub":"","voiceover":""}]}`,
      schema, { onStatus, maxTokens: 700 });
    const sc = res?.scenes?.filter((s) => s && s.text);
    if (!sc?.length) return null;
    sc[sc.length - 1].last = true;
    return sc.slice(0, n + 1).map((s) => ({ text: String(s.text).slice(0, 60), sub: String(s.sub || '').slice(0, 90), voiceover: String(s.voiceover || '').slice(0, 200), last: s.last }));
  }

  /** Motion, layout, transitions and pictures for every scene. */
  function arrange(script) {
    const n = script.length, total = A.length;
    const look = A.brief.tone === 'Luxury' || A.brief.tone === 'Minimal' ? 'calm' : A.energy;
    const layouts = A.format === '16:9' ? ['split', 'bottom', 'big', 'center', 'card'] : look === 'fast' ? ['big', 'bottom', 'center', 'big', 'card'] : look === 'calm' ? ['bottom', 'card', 'top', 'center'] : ['bottom', 'big', 'card', 'center', 'top'];
    const trans = look === 'fast' ? ['slide', 'zoom', 'wipe', 'cut'] : look === 'calm' ? ['fade'] : ['fade', 'slide', 'zoom', 'wipe'];
    const motions = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
    const weights = script.map((s, i) => (i === 0 ? 0.85 : s.last ? 1.35 : 1));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const vids = new Map();
    return script.map((s, i) => {
      const mi = A.media.length ? (s.last && A.media.length > 2 ? 0 : i % A.media.length) : -1;
      const m = A.media[mi];
      let from = 0;
      if (m?.kind === 'video') { const used = vids.get(m.id) || 0; from = Math.min(Math.max(0, m.dur - 2), used); vids.set(m.id, used + total * weights[i] / wsum); }
      return {
        id: uid(), text: s.text, sub: s.sub || '', vo: s.voiceover || '', last: !!s.last, media: mi, from,
        dur: Math.max(1.5, Math.round(total * weights[i] / wsum * 10) / 10),
        motion: motions[(i + A.style) % motions.length], layout: s.last ? (A.format === '16:9' ? 'center' : 'card') : layouts[(i + A.style) % layouts.length],
        trans: i === 0 ? 'cut' : trans[(i + A.style) % trans.length], fit: m?.plain ? 'contain' : 'cover',
        // Fast ads cut between your photos inside a long scene, while its text stays.
        shot: look === 'fast' && m?.kind === 'image' && A.media.filter((x) => x.kind === 'image').length > 1 ? Math.max(0.9, A.shotLen || 1.2) : 0
      };
    });
  }

  async function create() {
    const b = A.brief;
    if (!b.product && !b.brand && !b.points) return toast('Tell us at least what you are advertising.');
    stopPlay();
    const busy = progress('Studying your reference…');
    try {
      const notes = studyRefs();
      if (!A.refs.length) A.shotLen = 0;
      if (!A.refs.length) A.energy = b.tone === 'Exciting' || b.tone === 'Urgent' || b.tone === 'Funny' ? 'fast' : b.tone === 'Luxury' || b.tone === 'Minimal' ? 'calm' : 'medium';
      const shot = A.energy === 'fast' ? 2.2 : A.energy === 'calm' ? 4 : 3;
      const n = Math.max(3, Math.min(8, Math.round(A.length / shot)));
      A.pair = choosePair();
      if (!A.refPal) {
        // No reference: colours from the product pictures, else a palette that fits the tone.
        const pics = A.media.map((m) => m.thumb).slice(0, 4);
        const fromMedia = pics.length ? paletteFrom(imagePalette(pics[0], 6), true) : null;
        const tonePal = PALETTES.find((p) => p.tags.some((t) => (TONE_TAGS[b.tone] || []).includes(t))) || PALETTES[4];
        A.pal = (fromMedia && satOf(fromMedia[2]) > 0.3 ? fromMedia : tonePal.c).slice();
      }
      let script = null;
      if (A.useAI) {
        try { script = await aiScript(n, busy.set); } catch (e) { console.warn('AI script', e); }
        if (!script) toast('Used the quick script writer (the AI was not available).');
      }
      script ||= ruleScript(n);
      A.scenes = arrange(script);
      if (A.voice.on) await makeVoice(busy.set);
      busy.done();
      draw();
      await pairReady(A.pair);
      seek(0);
      if (notes.length) toast('Copied from your reference: ' + notes.join(', ') + '.', 5000);
    } catch (e) { busy.done(); console.warn(e); toast('Could not make the ad: ' + (e.message || e)); }
  }

  async function makeVoice(onStatus) {
    const { synthesize, RATE } = await import('../lib/tts.js');
    for (let i = 0; i < A.scenes.length; i++) {
      const s = A.scenes[i];
      if (!s.vo.trim()) { s.voSamples = null; continue; }
      if (s.voSamples && s.voText === s.vo + A.voice.id + A.voice.speed) continue;
      onStatus(`Recording the voice-over ${i + 1} of ${A.scenes.length}…`);
      s.voSamples = await synthesize(s.vo, { voice: A.voice.id, speed: A.voice.speed, pause: 0, onStatus: (m) => { if (/Download/.test(m)) onStatus(m); } });
      s.voText = s.vo + A.voice.id + A.voice.speed;
      const need = s.voSamples.length / RATE + 0.6 + (i ? TR * 0.5 : 0);
      if (s.dur < need) s.dur = Math.round(need * 10) / 10;
    }
  }

  // ---------- drawing a frame ----------
  const canvas = h('canvas', { class: 'am-canvas' });
  const g = canvas.getContext('2d');
  const starts = () => { let t = 0; return A.scenes.map((s) => { const st = t; t += s.dur; return st; }); };
  const total = () => A.scenes.reduce((a, s) => a + s.dur, 0);
  const sceneVideo = (s) => {
    const m = A.media[s.media];
    if (m?.kind !== 'video') return null;
    if (!s._v || s._vurl !== m.url) { s._v = videoEl(m.url); s._vurl = m.url; }
    return s._v;
  };

  /** The picture on screen at this moment of the scene (a scene may switch between your photos). */
  function shotAt(s, lt) {
    const m = A.media[s.media];
    if (s.shot && m?.kind === 'image') {
      const imgs = A.media.filter((x) => x.kind === 'image'), k = Math.floor(lt / s.shot);
      if (imgs.length > 1 && k > 0) {
        const m2 = imgs[(imgs.indexOf(m) + k) % imgs.length];
        return { m: m2, p: clamp01((lt - k * s.shot) / s.shot), s: { ...s, fit: m2.plain ? 'contain' : 'cover', motion: MOTIONS[(k + s.media) % 4][0] } };
      }
    }
    return { m, p: clamp01(lt / s.dur), s };
  }
  function drawBg(s0, lt, W, H) {
    const { m, p, s } = shotAt(s0, lt);
    if (!m) {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, A.pal[0]); gr.addColorStop(1, A.pal[4] || A.pal[0]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H); return;
    }
    const src = m.kind === 'video' ? sceneVideo(s) : m.el;
    const sw = m.kind === 'video' ? src.videoWidth || m.w : m.w, sh = m.kind === 'video' ? src.videoHeight || m.h : m.h;
    let k = s.fit === 'contain' ? Math.min(W / sw, H / sh) * 0.86 : Math.max(W / sw, H / sh);
    let sc = 1, dx = 0, dy = 0;
    const e = s.motion === 'still' ? 0 : p;
    if (s.motion === 'zoom-in') sc = 1 + 0.12 * e; else if (s.motion === 'zoom-out') sc = 1.12 - 0.12 * e;
    else if (s.motion === 'pan-left') { sc = 1.14; dx = (0.5 - e) * 0.1 * W; } else if (s.motion === 'pan-right') { sc = 1.14; dx = (e - 0.5) * 0.1 * W; }
    if (s.fit === 'contain') {
      g.fillStyle = m.plain || A.pal[0]; g.fillRect(0, 0, W, H);
      const gr = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      dy = s.layout === 'bottom' || s.layout === 'card' ? -H * 0.12 : s.layout === 'top' ? H * 0.1 : 0;
    }
    const iw = sw * k * sc, ih = sh * k * sc;
    if (src && sw) g.drawImage(src, (W - iw) / 2 + dx, (H - ih) / 2 + dy, iw, ih);
  }

  function drawText(s, lt, W, H) {
    const p = A.pair, base = Math.min(W, H * 0.75);
    const shot = shotAt(s, lt);
    const onPhoto = !!shot.m && shot.s.fit !== 'contain';
    const light = !onPhoto && lumOf(shot.m ? (shot.m.plain || A.pal[0]) : A.pal[0]) > 150;
    const a1 = ease((lt - 0.12) / 0.45), a2 = ease((lt - 0.3) / 0.45), a3 = ease((lt - 0.5) / 0.4);
    // Shade behind the text on photos.
    if (onPhoto && s.layout !== 'card') {
      g.save();
      if (s.layout === 'bottom') { const gr = g.createLinearGradient(0, H * 0.4, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.72)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      else if (s.layout === 'top') { const gr = g.createLinearGradient(0, 0, 0, H * 0.6); gr.addColorStop(0, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      else if (s.layout === 'split') { const gr = g.createLinearGradient(0, 0, W * 0.7, 0); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      else if (s.layout === 'center') { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, 0, W, H); }
      g.restore();
    }
    let ink = onPhoto ? '#ffffff' : light ? (lumOf(A.pal[1]) < 120 ? A.pal[1] : '#111111') : (lumOf(A.pal[1]) > 150 ? A.pal[1] : '#ffffff');
    const maxW = W * (s.layout === 'split' ? 0.5 : s.layout === 'card' ? 0.74 : 0.84);
    const headTxt = p.up ? s.text.toUpperCase() : s.text;
    let hs = base * (s.layout === 'big' ? 0.13 : 0.1) * (p.up ? 1.05 : 1);
    g.font = `${p.hw || 700} ${hs}px ${fontStack(p.head)}`; g.letterSpacing = (p.ls || 0) * hs + 'px';
    let lines = wrapText(g, headTxt, maxW);
    while (lines.length > 3 && hs > base * 0.05) { hs *= 0.88; g.font = `${p.hw || 700} ${hs}px ${fontStack(p.head)}`; g.letterSpacing = (p.ls || 0) * hs + 'px'; lines = wrapText(g, headTxt, maxW); }
    const headFont = g.font, headLs = g.letterSpacing, lh = hs * 1.1;
    const ss = base * 0.042;
    g.font = `400 ${ss}px ${fontStack(p.body)}`; g.letterSpacing = '0px';
    const subLines = s.sub ? wrapText(g, s.sub, maxW * 0.95).slice(0, 3) : [];
    const subFont = g.font, slh = ss * 1.4;
    const cta = s.last && A.brief.cta && !s.text.toLowerCase().includes(A.brief.cta.toLowerCase()) ? A.brief.cta : '';
    const cs = base * 0.045;
    const blockH = lines.length * lh + (subLines.length ? hs * 0.25 + subLines.length * slh : 0) + (cta ? cs * 3.4 : 0);
    const left = s.layout === 'top' || s.layout === 'split';
    const x = left ? W * 0.08 : W / 2;
    let y = s.layout === 'bottom' ? H * 0.9 - blockH : s.layout === 'top' ? H * 0.1 : (H - blockH) / 2;
    if (s.layout === 'bottom' && A.format === '9:16') y -= H * 0.06; // clear of app buttons and captions
    g.textAlign = left ? 'left' : 'center'; g.textBaseline = 'middle';
    // Card behind the text.
    if (s.layout === 'card') {
      g.font = headFont; g.letterSpacing = headLs;
      const wMax = Math.max(...lines.map((l) => g.measureText(l).width), ...(subLines.length ? (g.font = subFont, subLines.map((l) => g.measureText(l).width)) : [0]), cta ? cs * 8 : 0);
      const pad = base * 0.06, cw = wMax + pad * 2, ch = blockH + pad * 2;
      g.save(); g.globalAlpha = a1 * 0.94; g.fillStyle = A.pal[0];
      g.beginPath(); g.roundRect(W / 2 - cw / 2, y - pad, cw, ch, base * 0.03); g.fill(); g.restore();
      ink = textOn(A.pal[0]) === '#ffffff' ? (lumOf(A.pal[1]) > 150 ? A.pal[1] : '#ffffff') : (lumOf(A.pal[1]) < 120 ? A.pal[1] : '#111111');
    }
    // Headline: rises in line by line.
    g.font = headFont; g.letterSpacing = headLs;
    lines.forEach((l, i) => {
      const a = ease((lt - 0.12 - i * 0.08) / 0.45);
      const yy = y + i * lh + lh / 2 + (1 - a) * hs * 0.5;
      g.save(); g.globalAlpha = a;
      if (s.layout === 'big') {
        const w = g.measureText(l).width, padX = hs * 0.18;
        g.fillStyle = A.pal[2]; const bx = left ? x - padX : x - w / 2 - padX;
        g.fillRect(bx, yy - lh / 2 + hs * 0.02, (w + padX * 2) * ease((lt - 0.05 - i * 0.08) / 0.35), lh * 0.98);
        g.fillStyle = textOn(A.pal[2]);
      } else g.fillStyle = ink;
      if (onPhoto && s.layout !== 'big') { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = hs * 0.15; }
      g.fillText(l, x, yy); g.restore();
    });
    y += lines.length * lh;
    if (subLines.length) {
      y += hs * 0.25; g.font = subFont; g.letterSpacing = '0px';
      subLines.forEach((l, i) => { g.save(); g.globalAlpha = a2 * 0.92; g.fillStyle = ink; if (onPhoto) { g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = ss * 0.3; } g.fillText(l, x, y + i * slh + slh / 2 + (1 - a2) * ss); g.restore(); });
      y += subLines.length * slh;
    }
    if (cta) {
      g.font = `700 ${cs}px ${fontStack(p.body)}`; g.letterSpacing = '0px';
      const w = g.measureText(cta).width + cs * 2.4, bh = cs * 2.2, sc = 0.85 + 0.15 * a3;
      const bx = left ? x : x - (w * sc) / 2, by = y + cs * 0.9;
      g.save(); g.globalAlpha = a3; g.fillStyle = A.pal[2];
      g.beginPath(); g.roundRect(bx, by, w * sc, bh * sc, bh * sc / 2); g.fill();
      g.fillStyle = textOn(A.pal[2]); g.textAlign = 'center'; g.fillText(cta, bx + (w * sc) / 2, by + (bh * sc) / 2); g.restore();
    }
    g.letterSpacing = '0px';
  }

  function drawScene(s, lt, W, H) {
    drawBg(s, lt, W, H);
    drawText(s, lt, W, H);
    if (A.logo) {
      const lw = W * 0.16, lh = lw * A.logo.height / A.logo.width;
      g.save(); g.globalAlpha = 0.95; g.drawImage(A.logo, W - lw - W * 0.05, W * 0.05, lw, lh); g.restore();
    }
  }

  function frame(t) {
    const [W, H] = size();
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    g.clearRect(0, 0, W, H);
    if (!A.scenes.length) {
      g.fillStyle = '#1b2033'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#aab3c5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${W * 0.045}px Inter, sans-serif`;
      g.fillText('Your ad appears here', W / 2, H / 2); return;
    }
    const st = starts();
    let i = st.findIndex((s0, k) => t >= s0 && t < s0 + A.scenes[k].dur);
    if (i < 0) i = A.scenes.length - 1;
    const s = A.scenes[i], lt = t - st[i];
    if (i > 0 && s.trans !== 'cut' && lt < TR) {
      const prev = A.scenes[i - 1], a = ease(lt / TR);
      drawScene(prev, prev.dur, W, H);
      g.save();
      if (s.trans === 'fade') g.globalAlpha = a;
      else if (s.trans === 'slide') g.translate((1 - a) * W, 0);
      else if (s.trans === 'zoom') { g.globalAlpha = a; const z = 1.18 - 0.18 * a; g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2); }
      else if (s.trans === 'wipe') { g.beginPath(); g.rect(0, 0, W * a, H); g.clip(); }
      drawScene(s, lt, W, H);
      g.restore();
    } else drawScene(s, lt, W, H);
    return i;
  }

  // ---------- playback ----------
  let playing = null, curT = 0;
  const timeLbl = h('span', { class: 'status am-time' }, '0.0 s');
  const scrub = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0, class: 'am-scrub', oninput: (e) => { stopPlay(); seek(+e.target.value); } });
  const playBtn = h('button', { class: 'btn', type: 'button', onclick: () => (playing ? stopPlay() : play()) }, '▶ Play');
  async function syncVideos(t, live) {
    const st = starts(), jobs = [];
    A.scenes.forEach((s, k) => {
      const v = sceneVideo(s);
      if (!v) return;
      const lt = t - st[k];
      const visible = lt >= 0 && lt < s.dur + (A.scenes[k + 1]?.trans !== 'cut' ? TR : 0);
      const target = Math.min((A.media[s.media].dur || 1) - 0.05, s.from + Math.max(0, Math.min(lt, s.dur)));
      if (!visible) { if (!v.paused) v.pause(); return; }
      if (live && lt <= s.dur) { if (v.paused) { v.currentTime = target; v.play().catch(() => {}); } else if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target; }
      else { if (!v.paused) v.pause(); jobs.push(seekTo(v, target)); }
    });
    await Promise.all(jobs);
  }
  async function seek(t) {
    curT = Math.max(0, Math.min(total(), t));
    await syncVideos(curT, false);
    frame(curT); showTime();
  }
  function showTime() {
    const T = total(); scrub.max = T || 1; scrub.value = curT;
    timeLbl.textContent = `${curT.toFixed(1)} / ${T.toFixed(1)} s`;
  }

  /** Music and voice-over for playing from time t0, into `dest` (speakers or the recorder). */
  async function audioFor(ac, t0, dest) {
    const nodes = [], T = total(), st = starts(), now = ac.currentTime + 0.05;
    const { RATE } = A.scenes.some((s) => s.voSamples) ? await import('../lib/tts.js') : { RATE: 24000 };
    let musicGain = null;
    if (A.music?.buffer) {
      const src = ac.createBufferSource(); src.buffer = A.music.buffer; src.loop = true;
      musicGain = ac.createGain(); src.connect(musicGain).connect(dest);
      const v = A.musicVol, end = now + (T - t0);
      musicGain.gain.setValueAtTime(t0 < 0.5 ? 0 : v, now);
      if (t0 < 0.5) musicGain.gain.linearRampToValueAtTime(v, now + 0.5);
      musicGain.gain.setValueAtTime(v, Math.max(now, end - 1.2)); musicGain.gain.linearRampToValueAtTime(0, end);
      src.start(now, t0 % A.music.buffer.duration); src.stop(end + 0.05); nodes.push(src);
    }
    A.scenes.forEach((s, k) => {
      if (!s.voSamples) return;
      const at = st[k] + (k ? TR * 0.6 : 0.2), len = s.voSamples.length / RATE;
      if (at + len <= t0) return;
      const buf = ac.createBuffer(1, s.voSamples.length, RATE); buf.copyToChannel(s.voSamples, 0);
      const src = ac.createBufferSource(); src.buffer = buf;
      const gn = ac.createGain(); gn.gain.value = 1.1; src.connect(gn).connect(dest);
      const off = Math.max(0, t0 - at), when = now + Math.max(0, at - t0);
      src.start(when, off); nodes.push(src);
      // Music ducks under the voice.
      if (musicGain) { musicGain.gain.setValueAtTime(A.musicVol, when); musicGain.gain.linearRampToValueAtTime(A.musicVol * 0.3, when + 0.15); musicGain.gain.setValueAtTime(A.musicVol * 0.3, when + len - off); musicGain.gain.linearRampToValueAtTime(A.musicVol, when + len - off + 0.3); }
    });
    return nodes;
  }

  async function play({ record = null } = {}) {
    if (!A.scenes.length) return toast('Make the ad first.');
    stopPlay();
    if (curT >= total() - 0.05) curT = 0;
    await pairReady(A.pair);
    const ac = new AudioContext();
    const nodes = await audioFor(ac, curT, record ? record.dest(ac) : ac.destination);
    const t0 = curT, start = performance.now() + 50;
    playing = { ac, nodes, raf: 0 };
    playBtn.textContent = '❚❚ Pause';
    const T = total();
    const tick = () => {
      if (!playing) return;
      if (!canvas.isConnected) { stopPlay(); return; }
      const t = t0 + Math.max(0, performance.now() - start) / 1000;
      if (t >= T) { curT = T; frame(T - 0.001); showTime(); stopPlay(); record?.end(); return; }
      curT = t; syncVideos(t, true); frame(t); showTime();
      record?.progress(t / T);
      playing.raf = requestAnimationFrame(tick);
    };
    await syncVideos(t0, true);
    playing.raf = requestAnimationFrame(tick);
  }
  function stopPlay() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    playing.ac.close().catch(() => {});
    A.scenes.forEach((s) => s._v && !s._v.paused && s._v.pause());
    playing = null; playBtn.textContent = '▶ Play';
  }

  // ---------- export ----------
  function bestType() {
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  }
  async function exportVideo() {
    if (!A.scenes.length) return toast('Make the ad first.');
    if (!window.MediaRecorder || !canvas.captureStream) return toast('This browser cannot record video. Try Chrome, Edge or Firefox on a computer.');
    stopPlay(); curT = 0;
    const type = bestType(), ext = type.includes('mp4') ? 'mp4' : 'webm';
    const busy = progress('Recording your ad… keep this tab open and visible.');
    return new Promise((resolve) => {
      let rec, adest;
      const stream = canvas.captureStream(30);
      const record = {
        dest: (ac) => { adest = ac.createMediaStreamDestination(); adest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); return adest; },
        progress: (p) => busy.set(`Recording your ad… ${Math.round(p * 100)}% (keep this tab open and visible)`),
        end: () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150)
      };
      const chunks = [];
      play({ record }).then(() => {
        rec = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          busy.done();
          const blob = new Blob(chunks, { type: type.split(';')[0] || 'video/webm' });
          const name = `${(A.brief.brand || A.brief.product || 'video-ad').replace(/[^\w-]+/g, '-').toLowerCase()}-${A.format.replace(':', 'x')}.${ext}`;
          A.lastVideo = { blob, name };
          download(blob, name);
          showResult(blob, name);
          resolve(blob);
        };
        rec.start(250);
      });
    });
  }
  const resultBox = h('div', { class: 'am-result' });
  function showResult(blob, name) {
    const url = URL.createObjectURL(blob);
    resultBox.replaceChildren(h('h3', {}, 'Your video'), h('video', { src: url, controls: true, playsInline: true, class: 'am-video' }),
      h('div', { class: 'am-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => download(blob, name) }, h('span', { html: icon('download') }), `Download ${name.split('.').pop().toUpperCase()}`),
        h('button', { class: 'btn', type: 'button', onclick: () => openFilmCraft(blob, name) }, h('span', { html: icon('scan') }), 'Finish in FilmCraft')),
      h('p', { class: 'hint' }, name.endsWith('webm') ? 'This browser records WebM. Instagram and YouTube accept it; to get MP4, open it in FilmCraft and export, or use Chrome / Edge.' : 'MP4 (H.264), ready for Instagram, YouTube, Facebook and WhatsApp.'));
  }

  /** Opens the video (and your clips) in FilmCraft, the site's video editor, through its file bridge. */
  function openFilmCraft(blob, name) {
    const frame = h('iframe', { src: '/filmcraft/index.html?host=parent', title: 'FilmCraft video editor', class: 'am-film', allow: 'fullscreen; clipboard-read; clipboard-write; autoplay' });
    const send = async (n, b) => frame.contentWindow.postMessage({ type: 'filmcraft:open', name: n, bytes: await b.arrayBuffer() }, location.origin);
    const onMsg = async (e) => {
      if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.type === 'filmcraft:ready') {
        await send(name, blob);
        for (const md of A.media.filter((x) => x.file)) await send(md.file.name, md.file);
        if (A.music?.file) await send(A.music.file.name, A.music.file);
      } else if (m.type === 'filmcraft:save' && m.bytes) download(new Blob([m.bytes]), m.name || 'filmcraft-export');
      else if (m.type === 'filmcraft:failed') toast('FilmCraft could not start here: ' + (m.error || 'it needs WebGPU or WebGL2.'));
    };
    window.addEventListener('message', onMsg);
    const bg = h('div', { class: 'modal-bg am-filmbg' }, h('div', { class: 'am-filmbox' },
      h('div', { class: 'am-row' }, h('b', {}, 'FilmCraft'), h('span', { class: 'status' }, 'Your ad, clips and music are in the project bin. Exports and saves download to your device.'),
        h('button', { class: 'btn small', type: 'button', style: { marginLeft: 'auto' }, onclick: () => { window.removeEventListener('message', onMsg); bg.remove(); } }, 'Close')),
      frame));
    document.body.append(bg);
  }

  // ---------- progress ----------
  const statusLine = h('p', { class: 'status am-status' });
  function progress(text) {
    statusLine.textContent = text; createBtn.disabled = true; exportBtn.disabled = true;
    return { set: (t) => { statusLine.textContent = t; }, done: () => { statusLine.textContent = ''; createBtn.disabled = false; exportBtn.disabled = false; } };
  }

  // ---------- form ----------
  const fld = (label, input, hint) => h('label', { class: 'am-field' }, h('span', {}, label), input, hint ? h('small', { class: 'hint' }, hint) : '');
  const bind = (key, ph, rows) => { const e = h(rows ? 'textarea' : 'input', { class: 'inp', placeholder: ph, rows, value: A.brief[key], oninput: (ev) => { A.brief[key] = ev.target.value; } }); return e; };
  const sel = (opts, val, on) => h('select', { class: 'inp', onchange: (e) => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l)));
  const mediaList = h('div', { class: 'am-thumbs' }), refList = h('div', { class: 'am-thumbs' });
  const thumbOf = (m, list, redraw) => {
    const c = newCanvas(120, Math.round(120 * m.h / m.w)); c.getContext('2d').drawImage(m.thumb, 0, 0, c.width, c.height);
    return h('div', { class: 'am-thumb' }, c, m.kind === 'video' ? h('span', { class: 'am-badge' }, `▶ ${Math.round(m.dur)}s`) : '',
      h('button', { type: 'button', class: 'am-x', title: 'Remove', 'aria-label': 'Remove ' + m.name, onclick: () => {
        const k = list.indexOf(m); list.splice(k, 1);
        // Scenes that used it show a colour background; later pictures move up one place.
        if (list === A.media) { A.scenes.forEach((s) => { if (s.media === k) { s.media = -1; s._v = null; } else if (s.media > k) s.media--; }); drawScenes(); seek(curT); }
        redraw();
      } }, '×'));
  };
  const drawMedia = () => { mediaList.replaceChildren(...A.media.map((m) => thumbOf(m, A.media, drawMedia))); };
  const drawRefs = () => { refList.replaceChildren(...A.refs.map((m) => thumbOf(m, A.refs, drawRefs))); };
  const adder = (list, redraw, label) => h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const f = await pickFiles(IMG_ACCEPT + ',' + VIDEO_ACCEPT, true); if (!f.length) return;
    const b = progress('Reading your files…'); await addMedia(f, list); b.done(); redraw();
  } }, h('span', { html: icon('upload') }), label);

  const createBtn = h('button', { class: 'btn primary big', type: 'button', onclick: create }, h('span', { html: icon('ai') }), 'Create my ad');
  const exportBtn = h('button', { class: 'btn primary', type: 'button', onclick: exportVideo }, h('span', { html: icon('download') }), 'Export video');
  const aiNote = h('small', { class: 'hint' });
  import('../lib/llm.js').then(async ({ aiKind, AI_NOTE }) => { const k = await aiKind(); aiNote.textContent = AI_NOTE[k]; if (k === 'local') { A.useAI = false; aiBox.checked = false; } });
  const aiBox = h('input', { type: 'checkbox', checked: A.useAI, onchange: (e) => { A.useAI = e.target.checked; } });

  const form = h('div', { class: 'am-form' },
    h('h3', {}, '1. Your pictures and clips'),
    h('p', { class: 'hint' }, 'Product photos, shop photos or short video clips. They become the scenes of your ad.'),
    adder(A.media, drawMedia, 'Add photos or videos'), mediaList,
    h('h3', {}, '2. Ads you like (optional)'),
    h('p', { class: 'hint' }, 'Add screenshots or videos of ads whose look you want. Their colours, mood and pace are copied into your ad (not their pictures or words).'),
    adder(A.refs, drawRefs, 'Add reference images or videos'), refList,
    h('h3', {}, '3. About the ad'),
    h('div', { class: 'am-grid' }, fld('Brand', bind('brand', 'e.g. Mango Mantra')), fld('Product or service', bind('product', 'e.g. Cold-pressed mango juice'))),
    fld('Key points (one per line)', bind('points', 'No added sugar\nPicked in Ratnagiri\nHome delivery in 2 hours', 4)),
    h('div', { class: 'am-grid' }, fld('Offer', bind('offer', 'e.g. Launch price ₹99')), fld('Call to action', bind('cta', 'e.g. Order now'))),
    h('div', { class: 'am-grid' }, fld('Website or handle', bind('site', 'e.g. @mangomantra')), fld('Audience', bind('audience', 'e.g. busy families'))),
    h('div', { class: 'am-grid' },
      fld('Tone', sel(TONES, A.brief.tone, (v) => { A.brief.tone = v; })),
      fld('Length', sel([[6, '6 seconds'], [10, '10 seconds'], [15, '15 seconds'], [20, '20 seconds'], [30, '30 seconds']], A.length, (v) => { A.length = +v; }))),
    fld('Format', sel(FORMATS.map((f) => [f[0], f[1]]), A.format, (v) => { A.format = v; seek(curT); })),
    h('label', { class: 'check' }, aiBox, ' Write the script with AI'), aiNote,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: A.voice.on, onchange: (e) => { A.voice.on = e.target.checked; drawStyle(); } }), ' Add an AI voice-over (free, on your device; about 90 MB once)'),
    h('div', { class: 'am-row' }, createBtn), statusLine);

  // ---------- style and scenes ----------
  const styleBox = h('div', { class: 'am-style' });
  const scenesBox = h('div', { class: 'am-scenes' });
  function drawStyle() {
    const ranked = rankPairs([...(A.look?.mood.tags || []), ...(TONE_TAGS[A.brief.tone] || [])]);
    const pairs = [...new Set([A.pair, ...ranked, ...FONT_PAIRS])];
    const pals = [...(A.refPal ? [{ name: 'From your reference', c: A.refPal }] : []), ...PALETTES];
    styleBox.replaceChildren(
      h('h3', {}, 'Style'),
      h('div', { class: 'am-grid' },
        fld('Fonts', sel(pairs.map((p) => [p.id, `${p.head} + ${p.body}`]), A.pair.id, async (v) => { A.pair = FONT_PAIRS.find((p) => p.id === v); await pairReady(A.pair); seek(curT); })),
        fld('Music (optional)', h('div', { class: 'am-row' },
          h('button', { class: 'btn small', type: 'button', onclick: async () => {
            const [f] = await pickFiles('audio/*,.mp3,.wav,.m4a,.ogg,.aac', false); if (!f) return;
            try { const ac = new AudioContext(); A.music = { file: f, buffer: await ac.decodeAudioData(await f.arrayBuffer()) }; ac.close(); drawStyle(); toast('Music added.'); } catch { toast('Could not read that audio file.'); }
          } }, h('span', { html: icon('music') }), A.music ? 'Change' : 'Add music'),
          A.music ? h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: A.musicVol, title: 'Music volume', oninput: (e) => { A.musicVol = +e.target.value; } }) : ''))),
      h('div', { class: 'am-pals' }, pals.map((p) => h('button', { type: 'button', class: 'fp-pal' + (A.pal.join() === p.c.join() ? ' on' : ''), title: p.name, 'aria-label': 'Colours ' + p.name, onclick: () => { A.pal = p.c.slice(); drawStyle(); seek(curT); } }, p.c.slice(0, 4).map((x) => h('i', { style: { background: x } }))))),
      h('div', { class: 'am-row' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const [f] = await pickFiles(IMG_ACCEPT, false); if (!f) return;
          A.logo = (await readPicture(f)).frames[0].canvas; drawStyle(); seek(curT);
        } }, A.logo ? 'Change logo' : 'Add logo'),
        A.logo ? h('button', { class: 'btn small', type: 'button', onclick: () => { A.logo = null; drawStyle(); seek(curT); } }, 'Remove logo') : '',
        h('button', { class: 'btn small', type: 'button', onclick: () => { if (!A.scenes.length) return toast('Make the ad first.'); A.style++; A.pair = choosePair(); const keep = A.scenes.map((s) => ({ text: s.text, sub: s.sub, voiceover: s.vo, last: s.last })); const old = A.scenes; A.scenes = arrange(keep).map((s, i) => ({ ...s, dur: old[i]?.dur || s.dur, voSamples: old[i]?.voSamples, voText: old[i]?.voText })); drawStyle(); drawScenes(); pairReady(A.pair).then(() => seek(0)); } }, '🎲 Try another style')));
    if (A.voice.on) import('../lib/tts.js').then(({ VOICES }) => {
      const row = styleBox.querySelector('.am-voice') || styleBox.appendChild(h('div', { class: 'am-row am-voice' }));
      row.replaceChildren(h('span', { class: 'status' }, 'Voice:'), sel(VOICES, A.voice.id, (v) => { A.voice.id = v; }),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!A.scenes.length) return toast('Make the ad first.'); const b = progress('Recording the voice-over…'); try { await makeVoice(b.set); } catch (e) { toast('The voice model could not start: ' + (e.message || e)); } b.done(); drawScenes(); seek(curT); } }, 'Record voice-over again'));
    });
  }
  function drawScenes() {
    scenesBox.replaceChildren(
      h('h3', {}, 'Scenes'),
      ...A.scenes.map((s, i) => {
        const m = A.media[s.media];
        const set = (k, v, re) => { s[k] = v; if (k === 'media') s.fit = A.media[v]?.plain ? 'contain' : 'cover'; if (re) drawScenes(); seek(starts()[i] + Math.min(s.dur - 0.05, 1.2)); };
        return h('div', { class: 'am-scene' },
          h('div', { class: 'am-scene-h' }, h('b', {}, `Scene ${i + 1}`), h('span', { class: 'status' }, m ? m.name : 'Colour background'),
            h('div', { class: 'am-scene-btns' },
              h('button', { type: 'button', class: 'iconbtn', title: 'Show', 'aria-label': 'Show scene', onclick: () => { stopPlay(); seek(starts()[i] + Math.min(s.dur - 0.05, 1.2)); }, html: icon('eye') }),
              i ? h('button', { type: 'button', class: 'iconbtn', title: 'Move up', 'aria-label': 'Move up', onclick: () => { A.scenes.splice(i - 1, 0, A.scenes.splice(i, 1)[0]); drawScenes(); seek(curT); }, html: icon('up') }) : '',
              h('button', { type: 'button', class: 'iconbtn', title: 'Duplicate', 'aria-label': 'Duplicate scene', onclick: () => { A.scenes.splice(i + 1, 0, { ...s, id: uid(), _v: null, last: false }); drawScenes(); seek(curT); }, html: icon('dup') }),
              A.scenes.length > 1 ? h('button', { type: 'button', class: 'iconbtn', title: 'Delete', 'aria-label': 'Delete scene', onclick: () => { A.scenes.splice(i, 1); drawScenes(); seek(Math.min(curT, total())); }, html: icon('trash') }) : '')),
          h('div', { class: 'am-grid' },
            fld('Big text', h('input', { class: 'inp', value: s.text, oninput: (e) => { s.text = e.target.value; seek(curT); } })),
            fld('Small text', h('input', { class: 'inp', value: s.sub, oninput: (e) => { s.sub = e.target.value; seek(curT); } }))),
          A.voice.on ? fld('Voice-over', h('input', { class: 'inp', value: s.vo, oninput: (e) => { s.vo = e.target.value; } }), s.voSamples ? '' : 'Press "Record voice-over again" after changing it.') : '',
          h('div', { class: 'am-grid4' },
            fld('Picture', sel([[-1, 'Colour background'], ...A.media.map((x, k) => [k, x.name])], s.media, (v) => set('media', +v, true))),
            fld('Seconds', h('input', { class: 'inp', type: 'number', min: 1, max: 15, step: 0.1, value: s.dur, onchange: (e) => set('dur', Math.max(1, Math.min(15, +e.target.value || 2))) })),
            fld('Layout', sel(LAYOUTS, s.layout, (v) => set('layout', v))),
            fld('Movement', sel(MOTIONS, s.motion, (v) => set('motion', v))),
            fld('Transition in', sel(TRANS, s.trans, (v) => set('trans', v))),
            m?.kind === 'image' && A.media.filter((x) => x.kind === 'image').length > 1 ? fld('Switch photos every', sel([[0, 'Never'], [0.8, '0.8 s'], [1.2, '1.2 s'], [2, '2 s']], [0, 0.8, 1.2, 2].reduce((a, b) => (Math.abs(b - (s.shot || 0)) < Math.abs(a - (s.shot || 0)) ? b : a)), (v) => set('shot', +v))) : '',
            m?.kind === 'image' ? fld('Picture fit', sel([['cover', 'Fill the frame'], ['contain', 'Whole picture']], s.fit, (v) => set('fit', v))) : m?.kind === 'video' ? fld('Clip starts at (s)', h('input', { class: 'inp', type: 'number', min: 0, max: Math.max(0, m.dur - 0.5), step: 0.1, value: s.from.toFixed(1), onchange: (e) => set('from', Math.max(0, +e.target.value || 0)) })) : ''));
      }),
      A.scenes.length ? h('button', { class: 'btn small', type: 'button', onclick: () => { A.scenes.push({ id: uid(), text: 'New scene', sub: '', vo: '', media: A.media.length ? 0 : -1, from: 0, dur: 2.5, motion: 'zoom-in', layout: 'center', trans: 'fade', fit: 'cover' }); drawScenes(); seek(total() - 1); } }, h('span', { html: icon('plus') }), 'Add scene') : '');
  }
  const draw = () => { drawStyle(); drawScenes(); };

  el.replaceChildren(h('div', { class: 'am' },
    h('div', { class: 'am-left' }, form, styleBox, scenesBox),
    h('div', { class: 'am-right' },
      h('div', { class: 'am-stage' }, canvas,
        h('div', { class: 'am-row am-controls' }, playBtn, scrub, timeLbl),
        h('div', { class: 'am-row' }, exportBtn,
          h('button', { class: 'btn', type: 'button', onclick: async () => { const v = A.lastVideo || (await exportVideo().then(() => A.lastVideo)); if (v) openFilmCraft(v.blob, v.name); } }, h('span', { html: icon('scan') }), 'Finish in FilmCraft')),
        resultBox))));
  drawStyle(); drawScenes(); frame(0); showTime();
}

export const tools = { 'ai-video-ad': { standalone: true, mount: (el, ctx) => mount(el, ctx) } };
