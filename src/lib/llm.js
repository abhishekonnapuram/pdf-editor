// Free text AI that runs on the visitor's device: the model built into Chrome / Edge when there is one,
// otherwise a small open model (Qwen2.5 0.5B Instruct, Apache-2.0) downloaded once and run in the browser.
// Nothing is sent to a server.
import { builtinAI, builtinAIStatus } from './ai.js';


/** Which AI will answer: 'builtin' (ready), 'builtin-download', or 'local' (downloads about 0.8 GB once). */
export async function aiKind() {
  const st = await builtinAIStatus();
  if (st === 'available') return 'builtin';
  if (st === 'downloadable' || st === 'downloading') return 'builtin-download';
  return 'local';
}
export const AI_NOTE = {
  builtin: 'Uses the AI built into your browser. Free and private: nothing leaves your device.',
  'builtin-download': 'Uses the AI built into your browser. It downloads once the first time (Chrome / Edge), then works offline.',
  local: 'Runs a small open AI model in your browser. It downloads once (about 500–800 MB), then works offline. Nothing leaves your device.'
};

// The local model runs in a worker (see llm.worker.js); the setup that worked last time is tried first.
const CFG_KEY = 'editsupreme.llm.cfg';
let worker = null, seq = 0;
function localGenerate(messages, { onStatus, onToken, maxTokens, temperature }) {
  worker ||= new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' });
  let hint = null;
  try { hint = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch { /* storage blocked */ }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const on = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.status) onStatus(m.status);
      if (m.cfg) try { localStorage.setItem(CFG_KEY, JSON.stringify(m.cfg)); } catch { /* storage blocked */ }
      if (m.token != null) onToken?.(m.token);
      if (m.done != null) { worker.removeEventListener('message', on); resolve(m.done); }
      if (m.error) { worker.removeEventListener('message', on); reject(new Error(m.error)); }
    };
    worker.addEventListener('message', on);
    worker.postMessage({ id, messages, maxTokens, temperature, hint });
  });
}

/**
 * Writes a reply. opts: { onStatus, onToken (streamed text so far), maxTokens, temperature, schema (JSON schema for
 * the built-in AI) }. Returns the text.
 */
export async function generate(system, prompt, { onStatus = () => {}, onToken, maxTokens = 400, temperature = 0.7, schema } = {}) {
  onStatus('Starting the AI…');
  const session = await builtinAI(system, { allowDownload: true, onStatus });
  if (session) {
    try {
      onStatus('Writing…');
      const opts = schema ? { responseConstraint: schema } : {};
      if (onToken && !schema && session.promptStreaming) {
        let text = '';
        for await (const chunk of session.promptStreaming(prompt, opts)) { text = chunk.startsWith(text) ? chunk : text + chunk; onToken(text); }
        return text.trim();
      }
      return (await session.prompt(prompt, opts)).trim();
    } finally { session.destroy?.(); }
  }
  // The small model sometimes slips in a Chinese word; the tools ask for English, so those are dropped.
  const noCJK = (t) => String(t).replace(/[　-〿㐀-鿿＀-￯]+/g, '');
  const text = await localGenerate([{ role: 'system', content: system }, { role: 'user', content: prompt }], { onStatus, onToken: onToken && ((t) => onToken(noCJK(t))), maxTokens, temperature });
  return noCJK(text).trim();
}

/** Asks for JSON and reads it back (tolerant of code fences and text around it). Returns null when unreadable. */
export async function generateJSON(system, prompt, schema, opts = {}) {
  const text = await generate(system + '\nReply with JSON only, no other text.', prompt, { ...opts, schema, temperature: opts.temperature ?? 0.6 });
  const m = text.replace(/```(?:json)?/gi, '').match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch {
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch { return null; }
  }
}
