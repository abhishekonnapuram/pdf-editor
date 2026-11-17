// Natural-sounding voice-overs on the visitor's device with Kokoro (82M, Apache-2.0) through kokoro-js.
// The model (about 90 MB) downloads once; text never leaves the device.
import { transformers } from './ai.js';

export const VOICES = [
  ['af_heart', 'Heart (US, female, warm)'], ['af_bella', 'Bella (US, female, lively)'], ['af_nicole', 'Nicole (US, female, soft)'],
  ['af_sarah', 'Sarah (US, female)'], ['af_sky', 'Sky (US, female, young)'], ['am_michael', 'Michael (US, male)'],
  ['am_adam', 'Adam (US, male, deep)'], ['am_fenrir', 'Fenrir (US, male, strong)'], ['am_puck', 'Puck (US, male, playful)'],
  ['bf_emma', 'Emma (UK, female)'], ['bf_isabella', 'Isabella (UK, female)'], ['bm_george', 'George (UK, male)'], ['bm_lewis', 'Lewis (UK, male)']
];
export const RATE = 24000;

let modelP = null;
async function model(onStatus) {
  modelP ||= (async () => {
    await transformers(); // sets the ONNX runtime location shared with kokoro-js
    const { KokoroTTS } = await import('kokoro-js');
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8', device: 'wasm',
      progress_callback: (p) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) onStatus(`Downloading the voice model ${Math.round(p.progress || 0)}% (about 90 MB, only once)…`); }
    });
  })();
  modelP.catch(() => { modelP = null; });
  return modelP;
}

/** Sentences and short chunks, so long text is spoken piece by piece. */
function chunks(text) {
  const parts = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [];
  const out = [];
  for (let p of parts) {
    p = p.trim();
    while (p.length > 260) { const cut = p.lastIndexOf(',', 240) > 80 ? p.lastIndexOf(',', 240) + 1 : p.lastIndexOf(' ', 240); out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); }
    if (p) out.push(p);
  }
  return out;
}

/** Speaks the text: returns a Float32Array of samples at RATE (24 kHz). */
export async function synthesize(text, { voice = 'af_heart', speed = 1, onStatus = () => {}, pause = 0.18 } = {}) {
  const tts = await model(onStatus);
  const list = chunks(text);
  const pieces = [];
  for (let i = 0; i < list.length; i++) {
    onStatus(`Speaking ${i + 1} of ${list.length}…`);
    const a = await tts.generate(list[i], { voice, speed });
    pieces.push(a.audio, new Float32Array(Math.round(RATE * pause)));
  }
  const n = pieces.reduce((s, p) => s + p.length, 0), all = new Float32Array(n);
  let o = 0; for (const p of pieces) { all.set(p, o); o += p.length; }
  return all;
}

/** 16-bit mono WAV file. */
export function wavBlob(samples, rate = RATE) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}

/** MP3 file (128 kbps mono). */
export async function mp3Blob(samples, rate = RATE) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const enc = new Mp3Encoder(1, rate, 128), pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  const out = [];
  for (let i = 0; i < pcm.length; i += 1152) { const d = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (d.length) out.push(new Uint8Array(d)); }
  const end = enc.flush(); if (end.length) out.push(new Uint8Array(end));
  return new Blob(out, { type: 'audio/mpeg' });
}
