// PDF to PDF/A-2b on the device. Every page is rendered at archive quality (so every font, colour and
// effect is preserved exactly and nothing depends on fonts that might be missing), optionally with an
// invisible OCR text layer so the archive stays searchable. The file then gets what PDF/A requires:
// an sRGB OutputIntent, XMP metadata that matches the document info, a file ID, and no transparency,
// encryption, JavaScript or external content.
import { PDFDocument, PDFName, PDFHexString, PDFString } from '@cantoo/pdf-lib';
import { readBytes, pdfBlob, stem, openPdfjs, renderPage, canvasToBlob, blobToBytes } from '../lib/core.js';
import { srgbProfile } from '../lib/icc.js';

const PDF = '.pdf,application/pdf';
const LANGS = [['eng', 'English'], ['hin', 'Hindi'], ['tel', 'Telugu'], ['tam', 'Tamil'], ['kan', 'Kannada'], ['mar', 'Marathi'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['por', 'Portuguese'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)']];
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

async function toPdfA(bytes, name, o, progress) {
  const view = await openPdfjs(bytes);
  const out = await PDFDocument.create();
  const n = view.numPages;
  const dpi = +o.dpi;
  let worker = null;
  if (o.ocr) {
    progress(0.02, 'Loading text recognition…');
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(o.lang, 1);
  }
  try {
    for (let i = 1; i <= n; i++) {
      progress(0.05 + ((i - 1) / n) * 0.85, `Page ${i} of ${n}…`);
      const page = await view.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await renderPage(page, dpi / 72);
      // Flatten onto white: PDF/A-2b allows transparency, but a plain opaque image is the safest archive.
      const flat = document.createElement('canvas');
      flat.width = canvas.width; flat.height = canvas.height;
      const g = flat.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, flat.width, flat.height); g.drawImage(canvas, 0, 0);
      const jpg = await out.embedJpg(await blobToBytes(await canvasToBlob(flat, 'image/jpeg', +o.quality)));
      const p = out.addPage([vp.width, vp.height]);
      p.drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
      if (worker) {
        const { data } = await worker.recognize(flat, { pdfTitle: name, pdfTextOnly: true }, { pdf: true });
        if (data.pdf) {
          const layer = await PDFDocument.load(new Uint8Array(data.pdf));
          const [emb] = await out.embedPdf(layer, [0]);
          p.drawPage(emb, { x: 0, y: 0, width: vp.width, height: vp.height });
        }
      }
      page.cleanup();
    }
  } finally {
    if (worker) await worker.terminate();
    view.destroy();
  }

  progress(0.93, 'Adding PDF/A information…');
  const ctx = out.context;
  const title = o.title || stem(name);
  const now = new Date();
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  out.setTitle(title, { showInWindowTitleBar: true });
  if (o.author) out.setAuthor(o.author);
  out.setCreator('EditSupreme');
  out.setProducer('EditSupreme (pdf-lib)');
  out.setCreationDate(now);
  out.setModificationDate(now);
  out.setLanguage(o.docLang || 'en');

  // Colour: every image is DeviceRGB, so the file declares sRGB as its output intent.
  const icc = ctx.register(ctx.flateStream(srgbProfile(), { N: 3 }));
  const intent = ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'), RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: icc });
  out.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]));

  // XMP metadata, kept uncompressed and in step with the document information dictionary.
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
   ${o.author ? `<dc:creator><rdf:Seq><rdf:li>${esc(o.author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
   <xmp:CreateDate>${iso}</xmp:CreateDate>
   <xmp:ModifyDate>${iso}</xmp:ModifyDate>
   <xmp:MetadataDate>${iso}</xmp:MetadataDate>
   <xmp:CreatorTool>EditSupreme</xmp:CreatorTool>
   <pdf:Producer>EditSupreme (pdf-lib)</pdf:Producer>
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const meta = ctx.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  out.catalog.set(PDFName.of('Metadata'), ctx.register(meta));
  out.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: false }));

  // A file identifier (two equal halves for a new file).
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  return out.save({ useObjectStreams: false });
}

export const tools = {
  'pdf-to-pdfa': {
    accept: PDF, multiple: true, label: 'Select PDF files', runLabel: 'Convert to PDF/A',
    notice: 'Creates PDF/A-2b archive files on your device. Pages are kept exactly as they look (fonts, colours and images can never go missing later). Tick "searchable" to keep the text findable and copyable.',
    options: [
      { key: 'ocr', label: 'Keep the text searchable (adds an invisible text layer, slower)', type: 'checkbox', default: true },
      { key: 'lang', label: 'Document language (for the text layer)', type: 'select', default: 'eng', options: LANGS, showIf: (v) => v.ocr },
      { key: 'dpi', label: 'Quality', type: 'seg', default: '200', options: [['150', 'Smaller file (150 dpi)'], ['200', 'Standard (200 dpi)'], ['300', 'High (300 dpi)']] },
      { key: 'quality', label: 'Image quality', type: 'seg', default: '0.85', options: [['0.75', 'Compact'], ['0.85', 'Balanced'], ['0.95', 'Best']] },
      { key: 'title', label: 'Title (optional)', placeholder: 'Uses the file name if empty', default: '' },
      { key: 'author', label: 'Author (optional)', default: '' }
    ],
    async process(files, o, ctx) {
      const outputs = [];
      for (const [k, f] of files.entries()) {
        const bytes = await readBytes(f);
        const pdf = await toPdfA(bytes, f.name, o, (p, m) => ctx.progress((k + p) / files.length, `${f.name}: ${m}`));
        outputs.push({ name: `${stem(f.name)}-pdfa.pdf`, blob: pdfBlob(pdf) });
      }
      return { outputs, note: 'Saved as PDF/A-2b (archive format): sRGB colour profile, XMP metadata and embedded fonts only. To double-check against the standard, you can open it in a PDF/A validator such as veraPDF.' };
    }
  }
};
