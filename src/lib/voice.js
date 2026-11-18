// Voice input and on-device speech-to-text.
// Live voice: browsers with built-in speech recognition (Chrome, Edge, Safari) turn speech into text while you talk.
// Private voice / other browsers: a short recording is turned into text by the Whisper model running on this device.
import { transformers } from './ai.js';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const hasLiveSpeech = !!SR;
export const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

// [code, name, Whisper language, speech-recognition locale]
export const VOICE_LANGS = [
  ['en', 'English', 'english', 'en-IN'], ['hi', 'Hindi', 'hindi', 'hi-IN'], ['te', 'Telugu', 'telugu', 'te-IN'],
  ['ta', 'Tamil', 'tamil', 'ta-IN'], ['kn', 'Kannada', 'kannada', 'kn-IN'], ['ml', 'Malayalam', 'malayalam', 'ml-IN'],
  ['mr', 'Marathi', 'marathi', 'mr-IN'], ['bn', 'Bengali', 'bengali', 'bn-IN'], ['gu', 'Gujarati', 'gujarati', 'gu-IN'],
  ['pa', 'Punjabi', 'punjabi', 'pa-IN'], ['ur', 'Urdu', 'urdu', 'ur-IN'], ['es', 'Spanish', 'spanish', 'es-ES'],
  ['fr', 'French', 'french', 'fr-FR'], ['de', 'German', 'german', 'de-DE'], ['it', 'Italian', 'italian', 'it-IT'],
  ['pt', 'Portuguese', 'portuguese', 'pt-BR'], ['ru', 'Russian', 'russian', 'ru-RU'], ['ar', 'Arabic', 'arabic', 'ar-SA'],
  ['tr', 'Turkish', 'turkish', 'tr-TR'], ['id', 'Indonesian', 'indonesian', 'id-ID'], ['zh', 'Chinese', 'chinese', 'zh-CN'],
  ['ja', 'Japanese', 'japanese', 'ja-JP'], ['ko', 'Korean', 'korean', 'ko-KR']
];
const langInfo = (code) => VOICE_LANGS.find((l) => l[0] === code);

// ---------- Whisper (on-device) ----------
export const WHISPER = { tiny: 'Xenova/whisper-tiny', base: 'Xenova/whisper-base' }; // MIT; about 40 MB and 75 MB
const asrs = new Map();
export function whisper(size = 'tiny', onStatus = () => {}) {
  if (!asrs.has(size)) {
    const p = (async () => {
      const { pipeline } = await transformers();
      return pipeline('automatic-speech-recognition', WHISPER[size], {
        progress_callback: (pr) => { if (pr.status === 'progress' && pr.file?.endsWith('.onnx')) onStatus(`Downloading the speech AI model ${Math.round(pr.progress || 0)}% (only the first time)`); }
      });
    })();
    p.catch(() => asrs.delete(size));
    asrs.set(size, p);
  }
  return asrs.get(size);
}

/** Any audio or video file -> 16 kHz mono samples, as Whisper expects. */
export async function decodeAudio(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  let audio;
  try { audio = await ac.decodeAudioData(buf); }
  catch { throw new Error(`Could not read the sound in ${blob.name || 'this file'}. Try MP3, WAV, M4A, OGG, WEBM or MP4.`); }
  finally { ac.close?.(); }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { samples: out.getChannelData(0), duration: audio.duration };
}

/** Speech in a file -> { text, chunks: [{ text, timestamp: [from, to] }] }. */
export async function transcribe(blob, { size = 'tiny', language = '', task = 'transcribe', timestamps = false, onStatus = () => {} } = {}) {
  const asr = await whisper(size, onStatus);
  onStatus('Reading the sound…');
  const { samples, duration } = await decodeAudio(blob);
  if (duration < 0.3) return { text: '', chunks: [] };
  onStatus(`Listening to ${Math.round(duration)} s of speech…`);
  const opts = { chunk_length_s: 30, stride_length_s: 5, task };
  if (timestamps) opts.return_timestamps = true;
  const w = langInfo(language)?.[2];
  if (w) opts.language = w;
  const r = await asr(samples, opts);
  return { text: (r.text || '').trim(), chunks: r.chunks || [] };
}

/**
 * Start listening. Calls onText(text) with the words so far, then onEnd(finalText) once.
 * Returns { stop() }. `priv` forces the on-device recorder even where live recognition exists.
 */
export function listen({ lang = 'en', priv = false, onText = () => {}, onEnd = () => {}, onError = () => {}, onStatus = () => {} } = {}) {
  let ended = false;
  const end = (t) => { if (!ended) { ended = true; onEnd((t || '').trim()); } };
  if (SR && !priv) {
    const r = new SR();
    r.lang = langInfo(lang)?.[3] || navigator.language || 'en-US';
    // Keep listening through short pauses; stop after ~1.6 s of quiet once something was said (or 10 s of nothing).
    r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    let finalText = '', lastText = '', quiet = null;
    const stopSoon = (ms) => { clearTimeout(quiet); quiet = setTimeout(() => { try { r.stop(); } catch { /* stopped */ } }, ms); };
    stopSoon(10000);
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText && !/\s$/.test(finalText) ? ' ' : '') + t.trim(); else interim += t;
      }
      lastText = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
      onText(lastText);
      stopSoon(1600);
    };
    r.onerror = (e) => onError(
      e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow the microphone for this site (the icon in the address bar) and try again.'
        : e.error === 'no-speech' ? "I didn't hear anything. Tap the mic and speak again."
          : e.error === 'network' ? 'Live voice needs an internet connection in this browser. Turn on "Private voice" to use the on-device model instead.'
            : e.error === 'aborted' ? '' : 'Voice input stopped (' + e.error + ').');
    r.onend = () => { clearTimeout(quiet); end(finalText || lastText); };
    try { r.start(); onStatus('Listening… speak now.'); } catch (e) { onError('Could not start the microphone: ' + e.message); end(''); }
    return { stop: () => { try { r.stop(); } catch { /* already stopped */ } } };
  }
  if (!canRecord) { onError('This browser cannot use the microphone. Type your request instead.'); end(''); return { stop() {} }; }
  let rec = null, stream = null, stopped = false;
  (async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { onError('Microphone access is blocked. Allow the microphone for this site and try again.'); end(''); return; }
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        onStatus('Turning your voice into text on this device…');
        const { text } = await transcribe(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), { language: lang, onStatus });
        onText(text); end(text);
      } catch (e) { onError('Could not understand the recording: ' + (e.message || e)); end(''); }
    };
    rec.start();
    onStatus('Recording… tap the mic again when you have finished.');
    if (stopped) rec.stop();
    setTimeout(() => rec.state === 'recording' && rec.stop(), 30000);
  })();
  return { stop: () => { stopped = true; if (rec?.state === 'recording') rec.stop(); } };
}

/** Read a reply aloud with the voices built into the device. */
export function speak(text, lang = 'en') {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, '').slice(0, 400));
  u.lang = langInfo(lang)?.[3] || 'en-IN';
  speechSynthesis.speak(u);
}
