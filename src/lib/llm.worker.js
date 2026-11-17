// Runs the small open text model (Qwen2.5 0.5B Instruct) off the page's main thread, so the page never
// freezes while it loads or writes. 16-bit builds give garbage on some graphics chips, so only the
// full-precision builds are used, and each setup answers a small test before it is trusted.
import { transformers } from './ai.js';

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
let ready = null; // Promise<{ gen, T, cfg }>

async function load(hint, status) {
  const T = await transformers();
  const adapter = self.navigator?.gpu ? await self.navigator.gpu.requestAdapter().catch(() => null) : null;
  let tries = adapter ? [['webgpu', 'q4'], ['wasm', 'q8']] : [['wasm', 'q8']];
  if (hint && tries.some((t) => t.join() === hint.join())) tries = [hint, ...tries.filter((t) => t.join() !== hint.join())];
  for (const [device, dtype] of tries) {
    try {
      const size = { q4: 790, q8: 510 }[dtype];
      const gen = await T.pipeline('text-generation', MODEL, {
        device, dtype,
        progress_callback: (p) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) status(`Downloading the AI model ${Math.round(p.progress || 0)}% (about ${size} MB, only once)…`); }
      });
      status('Checking the AI model…');
      const out = await gen([{ role: 'system', content: 'You are a helpful assistant. Answer briefly and correctly.' },
        { role: 'user', content: 'A shop sells apples, bananas and grapes. Bananas are yellow and curved; grapes grow in bunches; apples can be red or green. Which fruit is yellow and curved? Answer with one word.' }], { max_new_tokens: 6, do_sample: false });
      if (/banana/i.test(out[0].generated_text.at(-1).content || '')) return { gen, T, cfg: [device, dtype] };
      await gen.dispose?.();
    } catch (e) { console.warn('llm setup failed', device, dtype, e); }
  }
  throw new Error('The AI model could not run on this device.');
}

self.onmessage = async (e) => {
  const { id, messages, maxTokens = 400, temperature = 0.7, hint } = e.data;
  const post = (m) => self.postMessage({ id, ...m });
  try {
    ready ||= load(hint, (s) => post({ status: s }));
    ready.catch(() => { ready = null; });
    const { gen, T, cfg } = await ready;
    post({ status: 'Writing…', cfg });
    let text = '';
    const streamer = new T.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => { text += t; post({ token: text }); } });
    const out = await gen(messages, { max_new_tokens: maxTokens, do_sample: temperature > 0, temperature: Math.max(0.01, temperature), top_p: 0.9, repetition_penalty: 1.1, streamer });
    post({ done: String(out[0].generated_text.at(-1).content || text) });
  } catch (err) { post({ error: String(err?.message || err) }); }
};
