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
