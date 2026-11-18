// On-device AI models (Transformers.js). The ONNX runtime's .wasm engine is loaded from the CDN copy of
// exactly the runtime version bundled here: the default location (the Transformers.js package on the CDN)
// can hold a build that doesn't match, and then every model fails to start with a bare number as the error.
let ready = null;
export function transformers() {
  ready ||= import('@huggingface/transformers').then((T) => {
    T.env.allowLocalModels = false;
    const v = T.env.backends.onnx.versions?.web;
    if (v) T.env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${v}/dist/`;
    return T;
  });
  return ready;
}

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * The language model built into the browser (Chrome / Edge Prompt API), free and on-device.
 * 'available' | 'downloadable' | 'downloading' | 'unavailable'.
 */
export async function builtinAIStatus() {
  if (typeof self === 'undefined' || !('LanguageModel' in self)) return 'unavailable';
  try { return await within(self.LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }), 6000); }
  catch { return 'unavailable'; }
}

/** A chat session with the browser's model, or null. Only downloads the model when `allowDownload` is set. */
export async function builtinAI(system, { allowDownload = false, onStatus = () => {} } = {}) {
  const st = await builtinAIStatus();
  if (st === 'unavailable' || (st !== 'available' && !allowDownload)) return null;
  try {
    return await within(self.LanguageModel.create({
      initialPrompts: [{ role: 'system', content: system }],
      expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }],
      monitor(m) { m.addEventListener('downloadprogress', (e) => onStatus(`Downloading the browser's AI model ${Math.round((e.loaded || 0) * 100)}% (once)…`)); }
    }), st === 'available' ? 20000 : 600000);
  } catch { return null; }
}
