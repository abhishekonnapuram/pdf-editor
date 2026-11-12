// AI assistant: the visitor types or says what they want ("compress this PDF under 1 MB", "remove the background
// and make it white, then resize to 600 x 600") and it runs the site's own tools on their files, on their device.
// Requests are understood by built-in rules (instant, every browser); when nothing matches and the browser has its
// own on-device language model (Chrome / Edge), that model is asked to pick the tools instead.
import { h, toast, pickFiles, resultView, previewFile } from '../lib/ui.js';
import { icon } from '../lib/icons.js';
import { TOOLS, toolById, loadTool } from './registry.js';
import { VOICE_LANGS, speak, hasLiveSpeech } from '../lib/voice.js';
import { micButton, PASSPORT_SPECS } from './aitools.js';
import { builtinAI } from '../lib/ai.js';
import { loadPdfLib, readBytes, PDFDocument, parseRanges, stem, fmtSize } from '../lib/core.js';
import { readPicture, savePicture, rotateCanvas, keepFormat, mapFrames } from '../lib/imgio.js';

// ---------- what kind of file ----------
const ext = (f) => (f.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
const KIND = {
  pdf: (f) => f.type === 'application/pdf' || ext(f) === 'pdf',
  img: (f) => /^image\//.test(f.type) || ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'svg', 'psd', 'ico'].includes(ext(f)),
  audio: (f) => /^(audio|video)\//.test(f.type) || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm', 'mp4', 'mov', 'mkv', 'm4v', '3gp', 'amr'].includes(ext(f)),
  word: (f) => ext(f) === 'docx', ppt: (f) => ext(f) === 'pptx', sheet: (f) => ['xlsx', 'xls', 'csv', 'ods'].includes(ext(f)), html: (f) => ['html', 'htm'].includes(ext(f))
};
const kindOf = (f) => Object.keys(KIND).find((k) => KIND[k](f)) || 'other';
const kindsOf = (files) => new Set(files.map(kindOf));

// ---------- reading details out of a sentence ----------
const COLORS = {
  'light blue': '#dfe9f5', 'sky blue': '#87ceeb', 'navy': '#1b2a4a', 'light grey': '#e6e6e6', 'light gray': '#e6e6e6', 'off white': '#f2f2f2', 'off-white': '#f2f2f2',
  white: '#ffffff', black: '#000000', red: '#e53935', green: '#43a047', blue: '#1e88e5', yellow: '#fdd835', orange: '#fb8c00', pink: '#ec407a',
  purple: '#8e24aa', grey: '#9e9e9e', gray: '#9e9e9e', brown: '#795548', cream: '#fff8e1', gold: '#d4af37', silver: '#c0c0c0', maroon: '#800000'
};
function colorIn(t) {
  const hex = t.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
  if (hex) return hex[0];
  for (const [n, c] of Object.entries(COLORS)) if (new RegExp(`\\b${n}\\b`, 'i').test(t)) return c;
  return null;
}
const LANGS = { english: 'en', hindi: 'hi', telugu: 'te', tamil: 'ta', kannada: 'kn', malayalam: 'ml', marathi: 'mr', bengali: 'bn', bangla: 'bn', gujarati: 'gu', punjabi: 'pa', urdu: 'ur', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl', russian: 'ru', ukrainian: 'uk', polish: 'pl', czech: 'cs', romanian: 'ro', hungarian: 'hu', swedish: 'sv', danish: 'da', finnish: 'fi', turkish: 'tr', indonesian: 'id', vietnamese: 'vi', arabic: 'ar', chinese: 'zh', mandarin: 'zh', japanese: 'ja', korean: 'ko', thai: 'th' };
const TESS = { en: 'eng', hi: 'hin', te: 'tel', ta: 'tam', kn: 'kan', mr: 'mar', es: 'spa', fr: 'fra', de: 'deu', pt: 'por', ar: 'ara', zh: 'chi_sim' };
const langsIn = (t) => Object.keys(LANGS).filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(t)).map((n) => LANGS[n]);
function sizeIn(t) {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kb|kilobytes?|kbs|mb|megabytes?|mbs|k)\b/i);
  return m ? { n: +m[1], unit: /^m/i.test(m[2]) ? 'mb' : 'kb' } : null;
}
function dimsIn(t) {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(px|pixels?|cm|mm|in|inch(?:es)?)?\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)\s*(px|pixels?|cm|mm|in(?:ch(?:es)?)?)?/i);
  if (m) {
    const u = (m[4] || m[2] || 'px').toLowerCase();
    return { w: +m[1], h: +m[3], unit: u.startsWith('pix') ? 'px' : u.startsWith('inch') ? 'in' : u };
  }
  const w = t.match(/(\d+)\s*(?:px|pixels?)?\s*(?:wide|width)|width\s*(?:of|to|=|:)?\s*(\d+)/i);
  if (w) return { w: +(w[1] || w[2]), h: '', unit: 'px' };
  const hh = t.match(/(\d+)\s*(?:px|pixels?)?\s*(?:tall|high|height)|height\s*(?:of|to|=|:)?\s*(\d+)/i);
  if (hh) return { w: '', h: +(hh[1] || hh[2]), unit: 'px' };
  return null;
}
function pagesIn(t) {
  const m = t.match(/\bpages?\s+((?:(?:\d+|last)\s*(?:-|–|to|through|and|,|&)?\s*)+)/i);
  if (!m) return null;
  return m[1].replace(/\s*(?:to|through|–)\s*/gi, '-').replace(/\s*(?:and|&)\s*/gi, ',').replace(/\s+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '').replace(/,-|-,/g, '-');
}
function quotedIn(t) {
  const m = t.match(/["“”'‘’]([^"“”‘’]{1,80})["“”'‘’]/);
  if (m) return m[1].trim();
  const s = t.match(/\b(?:saying|that says|with (?:the )?text|text)\s+(.{1,60}?)(?:\s+(?:on|at|in|to)\s+(?:the\s+)?(?:top|bottom|middle|centre|center|every|all|each)\b|$)/i);
  return s ? s[1].replace(/^(?:of|as|is)\s+/i, '').trim() : null;
}
function angleIn(t) {
  if (/upside down|180/.test(t)) return 180;
  if (/\b(left|anti-?clockwise|counter-?clockwise|270)\b/.test(t)) return 270;
  return 90;
}
function positionIn(t, def = 'bc') {
  const v = /\btop\b|\bheader\b/.test(t) ? 't' : /\b(middle|centre|center)\b/.test(t) && !/\b(bottom|top)\b/.test(t) ? 'm' : /\bbottom\b|\bfooter\b/.test(t) ? 'b' : def[0];
  const hz = /\bleft\b/.test(t) ? 'l' : /\bright\b/.test(t) ? 'r' : /\b(centre|center|middle)\b/.test(t) ? 'c' : def[1];
  return v + hz;
}
function passwordIn(t) {
  const bad = /^(is|of|as|to|the|a|an|and|it|this|that|file|pdf|password|passcode|pin|without|remove|open)$/i;
  const found = [
    ...t.matchAll(/\b(?:password|passcode|pass|pin)\b\s*(?:is|of|as|to|=|:)?\s*["'“]?([^\s"'”,;]+)["'”]?/gi),
    ...t.matchAll(/\bwith\s+(?:the\s+|a\s+)?(?:pass(?:word|code)\s+)?["'“]?([^\s"'”,;]+)["'”]?/gi),
    ...t.matchAll(/"([^"]+)"/g)
  ].map((m) => m[1]).filter((p) => p && !bad.test(p));
  return found[0] || null;
}

// ---------- understanding a request ----------
// Each rule turns one instruction into a step: { tool, opts, say } (a tool run on the files) or { open } (open a tool page).
const has = (re, t) => re.test(t);
const step = (tool, opts, say) => ({ tool, opts, say });

// ---------- everyday language -> plain commands ----------
// Spoken or typed requests are full of filler, ordinals, typos and (in India) Hindi/Hinglish verbs. They are
// rewritten into plain words the rules understand, e.g. "pdf ka size kam karo" -> "pdf size compress",
// "delete the second page" -> "delete the page 2".
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, '1st': 1, '2nd': 2, '3rd': 3 };
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const SAY = [
  [/\b(kam|kum|chhota|chota|chhoti|choti|halka|halki)\s*(karo|kar do|kardo|kar dijiye|karna|kare|kijiye|banao|bana do|karke do)\b/gi, 'compress'],
  [/\b(hatao|hata do|hatado|hata dijiye|nikalo|nikal do|nikaldo|mitao|mita do|delete karo|remove karo|uda do|udao)\b/gi, 'remove'],
  [/\b(jodo|jod do|joddo|milao|mila do|ek saath karo|ek karo|ek file banao|combine karo|merge karo)\b/gi, 'merge'],
  [/\b(ghumao|ghuma do|ghumado|seedha karo|sidha karo)\b/gi, 'rotate'],
  [/\b(bada karo|badi karo|bada kar do|badhao|badha do)\b/gi, 'enlarge'],
  [/\b(saaf karo|saaf kar do|clear karo|achha karo|acchi karo)\b/gi, 'enhance'],
  [/\b(kaato|kaat do|katdo|crop karo)\b/gi, 'crop'],
  [/\b(banao|bana do|banado|bana dijiye|badlo|badal do|badaldo|convert karo)\b/gi, 'convert'],
  [/\b(safed|safaid)\b/gi, 'white'], [/\b(neela|nila)\b/gi, 'blue'], [/\b(laal|lal)\b/gi, 'red'], [/\b(kaala|kala)\b/gi, 'black'], [/\bhara\b/gi, 'green'],
  [/\b(panna|panne|prishth)\b/gi, 'page'], [/\b(tasveer|tasvir|foto)\b/gi, 'photo'],
  [/\b(ka|ki|ke|ko|mein|isko|isse|yeh|ye|wala|wali|zara|thoda|please|pls|plz|kindly)\b/gi, ' '],
  [/\b(can|could|would|will) you\b|\bi (want|need|would like|wanna|have) to\b|\bi (want|need|would like)\b|\bhelp me( to)?\b|\bfor me\b|\bjust\b|\bactually\b|\bbasically\b|\bquickly\b/gi, ' '],
  [/\bpdf'?s\b/gi, 'pdfs'], [/\bp\.?\s?d\.?\s?f\b/gi, 'pdf'], [/\bj\s?peg\b|\bjay peg\b/gi, 'jpeg'], [/\bpng\b|\bp\.n\.g\b/gi, 'png'],
  [/\bkilo ?bytes?\b|\bkbs\b/gi, 'kb'], [/\bmega ?bytes?\b|\bmbs\b/gi, 'mb'], [/\bback ground\b|\bbackgroud\b|\bbakground\b/gi, 'background']
];
// Words the rules look for: close misspellings are corrected to these.
const VOCAB = ['compress', 'background', 'remove', 'merge', 'combine', 'convert', 'passport', 'watermark', 'rotate', 'resize', 'translate', 'summarize', 'summarise', 'protect', 'password', 'unlock', 'transcribe', 'upscale', 'numbers', 'extract', 'delete', 'signature', 'picture', 'pictures', 'photo', 'photos', 'image', 'images', 'document', 'smaller', 'transparent', 'subtitles', 'searchable', 'enhance', 'enlarge', 'separate', 'reduce', 'quality', 'powerpoint', 'excel', 'word', 'pages', 'split'];
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function normalize(text) {
  let t = ' ' + text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"') + ' ';
  // Keep quoted text (watermark words, passwords) exactly as typed.
  const quotes = [];
  t = t.replace(/"[^"]*"/g, (m) => { quotes.push(m); return ` __q${quotes.length - 1}__ `; });
  for (const [re, w] of SAY) t = t.replace(re, ` ${w} `);
  t = t.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|\d+(?:st|nd|rd|th))\s+(and\s+(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+)?pages?\b/gi, (m, a, b) => {
    const n = (w) => ORD[w.toLowerCase()] || parseInt(w, 10);
    const second = b ? b.replace(/^and\s+(the\s+)?/i, '').trim() : null;
    return `page ${n(a)}${second ? ' and ' + n(second) : ''}`;
  });
  t = t.replace(/\blast\s+pages?\b/gi, 'page last').replace(/\bpages?\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m, w) => 'page ' + NUMW[w.toLowerCase()]);
  t = t.replace(/\b(one|two|three|four|five|ten|twenty|thirty|forty|fifty|hundred)\s*(kb|mb)\b/gi, (m, w, u) => NUMW[w.toLowerCase()] + ' ' + u);
  t = t.replace(/[A-Za-z]{5,}/g, (w) => {
    const lw = w.toLowerCase();
    if (VOCAB.includes(lw)) return w;
    let best = null, bd = 9;
    for (const v of VOCAB) { if (Math.abs(v.length - lw.length) > 2) continue; const d = lev(lw, v); if (d < bd) { bd = d; best = v; } }
    return best && bd <= (lw.length >= 8 ? 2 : 1) ? best : w;
  });
  t = t.replace(/__q(\d+)__/g, (m, i) => quotes[+i]);
  return t.replace(/\s+/g, ' ').trim();
}

function understandOne(raw, files) {
  const t = ' ' + raw.toLowerCase().replace(/[’‘]/g, "'") + ' ';
  const K = kindsOf(files);
  const pdf = K.has('pdf'), img = K.has('img'), audio = K.has('audio');
  const size = sizeIn(t), dims = dimsIn(t), pages = pagesIn(t), color = colorIn(t);

  if (has(/^\s*(help|hi|hello|hey|what can you do|commands|how does (this|it) work|what do you do)\b/, t)) return { help: true };

  // Passport / ID photos
  if (has(/passport|visa photo|\bid photo|pan card|\boci\b|photo for (my )?(visa|passport|id)/, t)) {
    const C = [['in-visa', /\b(india|indian)\b.*\b(visa|oci)\b|\b(visa|oci)\b.*\b(india|indian)\b|\boci\b/], ['pan', /\bpan\b/], ['in', /\b(india|indian)\b/], ['us', /\b(us|usa|u\.s\.|america|american|united states)\b/], ['uk', /\b(uk|britain|british|england|united kingdom)\b/],
      ['eu', /\b(schengen|europe|european|eu|germany|france|italy|spain|netherlands)\b/], ['ca', /\bcanada|canadian\b/], ['au', /\baustralia/], ['cn', /\bchina|chinese\b/], ['jp', /\bjapan/], ['ae', /\b(uae|dubai|emirates)\b/], ['sg', /\bsingapore/]];
    const spec = (C.find(([, re]) => re.test(t)) || ['in'])[0];
    const sheet = has(/\b(sheet|print|copies|4 ?x ?6|a4)\b/, t) ? (has(/\ba4\b/, t) ? 'a4' : '4x6') : 'none';
    return step('passport-photo', { spec, bg: color || '#ffffff', sheet, maxKB: size ? (size.unit === 'mb' ? size.n * 1024 : size.n) : 0 },
      `Making a passport photo: ${PASSPORT_SPECS.find((s) => s[0] === spec)[1]}${sheet !== 'none' ? ' with a print sheet' : ''}`);
  }

  // Speech to text
  if (audio || has(/transcri|speech to text|audio to text|video to text|subtitle|caption|\bsrt\b|what (is|was) said/, t)) {
    if (audio || has(/transcri|speech to text|audio to text|video to text|subtitle|caption|\bsrt\b/, t)) {
      const L = langsIn(t);
      const translate = has(/translat|in english|to english/, t) && !has(/^\s*transcribe .*\benglish\b\s*$/, t);
      return step('audio-to-text', { lang: translate ? (L.find((l) => l !== 'en') || '') : (L[0] || ''), task: translate ? 'translate' : 'transcribe', out: has(/\bvtt\b/, t) ? 'vtt' : has(/subtitle|caption|\bsrt\b/, t) ? 'srt' : 'txt', size: has(/accura|better|best|precise/, t) ? 'base' : 'tiny' },
        translate ? 'Turning the speech into English text' : 'Turning the speech into text');
    }
  }

  // Questions about a PDF
  if (pdf && has(/\b(ask|chat|question|talk to|what does (it|this) say|find (out|where)|search (in|inside))\b/, t)) return { open: 'chat-pdf', say: 'Opening Chat with PDF so you can ask questions about it' };

  // Background
  if (has(/\b(remove|delete|erase|cut ?out|get rid of|clear|change|replace|transparent|blur|swap|no)\b[^.]*\b(background|backdrop|bg)\b|\bbackground\b[^.]*\b(remov|transparent|white|blur|change|replace)|\bcut ?out\b|\bcutout\b|\bwithout (the |a |any )?(background|bg)\b|\b(background|bg) ?(less|free)\b|\bremove bg\b/, t)) {
    const bg = has(/\bblur/, t) ? 'blur' : color ? 'color' : 'transparent';
    return step('remove-background', { model: has(/\b(person|people|portrait|selfie|face|me|man|woman|boy|girl|myself)\b/, t) ? 'people' : has(/\blogo|plain|solid|flat\b/, t) ? 'simple' : 'best', bg, color: color || '#ffffff', trim: has(/\btrim|crop\b/, t), format: has(/\bjpe?g\b/, t) ? 'jpg' : has(/\bwebp\b/, t) ? 'webp' : 'png' },
      bg === 'blur' ? 'Blurring the background' : bg === 'color' ? 'Replacing the background with a new colour' : 'Removing the background');
  }

  // Remove / delete pages (PDF)
  if (pdf && pages && has(/\b(remove|delete|drop|get rid of|without)\b/, t)) return step('@drop-pages', { pages }, pages === 'last' ? 'Removing the last page' : `Removing page${/[,-]/.test(pages) ? 's' : ''} ${pages.replace(/last/g, 'the last')}`);

  if (pdf && has(/\b(remove|delete|drop|get rid of)\b[^.]*\bpages?\b/, t)) return { ask: 'Which pages should I remove? For example "remove pages 2 and 5" or "delete the last page".' };

  // Black and white
  if (img && has(/black (and|&|n) white|\bb ?& ?w\b|gr[ae]y ?scale|monochrome|remove (the |all )?colou?rs?|colou?rless|\bgr[ae]y\b/, t)) return step('@grayscale', {}, 'Making it black and white');

  // Resize (pictures)
  if (img && (dims || has(/\bresize|\b\d+\s*(%|percent)\b|scale (it |them )?(to|by|down)|dimension/, t)) && !has(/upscale|enhance/, t)) {
    const pc = t.match(/(\d+)\s*(%|percent)/);
    const o = pc && !dims ? { mode: 'percent', pct: +pc[1] } : { mode: 'pixels', w: dims?.w ?? '', h: dims?.h ?? '', unit: dims?.unit || 'px',
      fit: has(/\bstretch/, t) ? 'stretch' : has(/\b(pad|bars|fit inside|letterbox|without cropping|don'?t crop)\b/, t) ? 'pad' : dims?.w && dims?.h ? 'fill' : 'fit' };
    if (size) Object.assign(o, { limit: true, target: size.n, unitKB: size.unit });
    if (has(/\bjpe?g\b/, t)) o.format = 'jpg'; else if (has(/\bpng\b/, t)) o.format = 'png'; else if (has(/\bwebp\b/, t)) o.format = 'webp';
    const what = o.mode === 'percent' ? `${o.pct}%` : [o.w, o.h].filter(Boolean).join(' × ') + ' ' + o.unit;
    return step('resize-image', o, `Resizing to ${what}${o.fit === 'fill' ? ' (cropped to fill exactly)' : o.fit === 'pad' ? ' (padded, nothing cropped)' : ''}${size ? `, under ${size.n} ${size.unit.toUpperCase()}` : ''}`);
  }

  // Upscale
  if (img && !has(/compress|reduce|smaller|shrink|too (big|large|heavy)|\bkb\b|\bmb\b/, t) && has(/upscale|enlarge|enhance|sharpen|super ?res|increase (the )?(resolution|quality)|improve|\bhd\b|\bclear(er)?\b|unblur|blurry|blurred|(better|good|high) quality|sharp(er)?|crisp|pixelated|bigger|larger|\b[24] ?x\b|(2|4|two|four) times/, t))
    return step('upscale-image', { scale: has(/\b4 ?x\b|four|4 times/, t) ? '4' : '2' }, `Enlarging ${has(/\b4 ?x\b|four|4 times/, t) ? '4×' : '2×'} with AI`);

  // Compress
  if (has(/compress|reduce|smaller|shrink|optimi[sz]e|lighter|decrease|less (file )?size|too (big|large|heavy)|\bsmall\b[^.]*\b(size|file)\b|\b(size|file)\b[^.]*\bsmall\b|\bfor (email|e-?mail|whatsapp|upload|uploading|exam|form|website|gmail|sending)\b|\blow(er)? (the )?size|under\s+\d|below\s+\d|less than\s+\d|max(imum)?\s+\d|within\s+\d|\bupto\s+\d|up to\s+\d/, t) || (size && !has(/convert|merge/, t))) {
    if (pdf && !img) {
      const o = size ? { level: 'target', target: size.n, unitKB: size.unit } : { level: has(/\b(max|strong|extreme|as small as|smallest|a lot)\b/, t) ? 'extreme' : has(/\b(light|little|slight|best quality)\b/, t) ? 'low' : 'recommended' };
      return step('compress', o, size ? `Compressing to under ${size.n} ${size.unit.toUpperCase()}` : 'Compressing the PDF');
    }
    if (img) {
      const o = size ? { level: 'target', target: size.n, unitKB: size.unit } : { level: has(/\b(max|strong|extreme|smallest|a lot)\b/, t) ? 'extreme' : has(/\b(light|little|slight)\b/, t) ? 'low' : 'recommended' };
      if (size && has(/\bjpe?g\b/, t)) o.tfmt = 'jpg';
      return step('compress-image', o, size ? `Compressing to under ${size.n} ${size.unit.toUpperCase()}` : 'Compressing the pictures');
    }
    return step(size ? 'compress' : 'compress', size ? { level: 'target', target: size.n, unitKB: size.unit } : {}, 'Compressing');
  }

  // Rotate
  if (has(/\b(rotate|flip|mirror|upside down|sideways|straighten)\b|\bturn\b[^.]*\b(left|right|around|clockwise|anti-?clockwise|counter-?clockwise|upside|sideways|\d+\s*(°|deg))/, t)) {
    const free = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:°|deg|degrees?)/);
    if (img && (has(/straighten/, t) || (free && +free[1] % 90))) return { open: 'rotate-image', say: 'Opening Rotate image so you can turn it to any angle' };
    if (pdf) return step('rotate', { angle: String(angleIn(t)), ...(pages ? { apply: 'range', range: pages } : {}) }, `Rotating ${pages ? 'pages ' + pages : 'the pages'} ${angleIn(t)}°`);
    const flip = has(/\b(mirror|flip)\b[^.]*\b(vertical|upside)|vertically/, t) ? 'v' : has(/\b(mirror|flip)\b/, t) ? 'h' : 'none';
    return step('@rotate-img', { angle: has(/\b(rotate|turn|upside|sideways)\b/, t) ? angleIn(t) : 0, flip }, flip !== 'none' && !has(/\brotate|turn\b/, t) ? 'Flipping the picture' : `Rotating ${angleIn(t)}°`);
  }

  // Page numbers
  if (has(/page numbers?|number (the |all |every |each )?pages|numbers? (on|to) (the |all |every |each )?pages?|page no\.?s?\b|paginat|add numbers/, t)) {
    const st = t.match(/start(?:ing)?\s*(?:at|from|with)\s*(\d+)/);
    return step('page-numbers', { position: positionIn(t), format: has(/of\s*(the\s*)?(total|\d+|n|y)|page \d+ of/, t) ? 'Page {n} of {total}' : has(/saying page|["'“]page|\bword page\b|\bpage 1\b/, t) ? 'Page {n}' : '{n}', ...(st ? { start: +st[1] } : {}), skipFirst: has(/skip (the )?first|not on (the )?first|except (the )?first|cover/, t) }, 'Adding page numbers');
  }

  // Watermark
  if (has(/watermark|\bstamp\b/, t)) {
    const text = quotedIn(raw);
    if (pdf) return step('watermark', { kind: 'text', text: text || 'CONFIDENTIAL', ...(color ? { color } : {}), rotation: has(/straight|horizontal|no angle|flat/, t) ? '0' : '45', mosaic: has(/\b(tile|tiled|mosaic|all over|repeat)\b/, t), position: has(/\bcorner|bottom|top\b/, t) ? positionIn(t, 'br') : 'mc' }, `Adding the watermark "${text || 'CONFIDENTIAL'}"`);
    return step('watermark-image', { kind: 'text', text: text || '© ' + new Date().getFullYear(), ...(color ? { color } : {}), mosaic: has(/\b(tile|tiled|mosaic|all over|repeat)\b/, t), position: positionIn(t, 'br') }, `Adding the watermark "${text || '©'}"`);
  }

  // Password
  if (has(/\b(unlock|remove (the )?password|decrypt|take off (the )?password|without (a |the |any )?password|open without)\b/, t)) {
    const pw = passwordIn(raw.replace(/remove (the )?password/i, ''));
    return step('unlock', { pw: pw || '' }, 'Removing the password', !pw && 'unlock');
  }
  if (has(/\b(protect|encrypt|lock|secure)\b|(add|set|put)( a)? password|password[- ]protect/, t)) {
    const pw = passwordIn(raw);
    if (!pw) return { ask: 'What password should I use? Say for example: "protect with password Sun@2024".' };
    return step('protect', { pw, pw2: pw }, 'Adding a password');
  }

  // Translate PDF
  if (has(/translat/, t) && pdf) {
    const L = langsIn(t);
    const to = t.match(/\b(?:to|into|in)\s+([a-z]+)/g)?.map((s) => LANGS[s.split(/\s+/).pop()]).filter(Boolean).pop() || L[L.length - 1];
    if (!to) return { ask: 'Which language should I translate it into? For example "translate to Hindi".' };
    return step('translate', { to, from: L.length > 1 ? L.find((l) => l !== to) : 'auto' }, `Translating into ${Object.keys(LANGS).find((k) => LANGS[k] === to)}`);
  }

  // Summary
  if (has(/summar|key points|tl;?dr|\bgist\b|overview|main points/, t) && pdf) return step('summarize', { len: has(/short|brief|quick/, t) ? 'short' : has(/long|detail/, t) ? 'long' : 'medium' }, 'Summarising the PDF');

  // Repair
  if (pdf && has(/\b(repair|fix|corrupt|broken|damaged|won'?t open|doesn'?t open|recover)\b/, t)) return step('repair', {}, 'Repairing the PDF');

  // OCR / text
  if (has(/\bocr\b|searchable|recogni[sz]e|scanned|read (the )?text|extract (the )?text|copy (the )?text|get (the )?text|text (out )?(from|of)|to text|\btxt\b/, t)) {
    const L = langsIn(t).map((l) => TESS[l]).filter(Boolean);
    if (pdf && has(/searchable|\bocr\b|scanned|selectable/, t)) return step('ocr', { lang: L[0] || 'eng', ...(L[1] ? { lang2: L[1] } : {}) }, 'Making the PDF searchable (OCR)');
    if (pdf) return step('pdf-to-text', {}, 'Taking the text out of the PDF');
    if (img) return step('ocr', { lang: L[0] || 'eng', ...(L[1] ? { lang2: L[1] } : {}) }, 'Reading the text in the picture (OCR)');
  }

  // Split / extract
  if (pdf && has(/\b(split|separate|extract|take out|pull out|break)\b|\bonly (the )?pages?\b|\bkeep (only )?pages?\b|\bget pages?\b|\bpages? [\dlast,\- and]+ only\b/, t)) {
    const every = t.match(/every\s+(\d+)\s+pages?/);
    if (every) return step('split', { mode: 'fixed', n: +every[1] }, `Splitting every ${every[1]} pages`);
    if (pages && has(/\b(extract|take|pull|only|keep|get)\b/, t)) return step('split', { mode: 'extract', pages }, `Taking out page${/[,-]/.test(pages) ? 's' : ''} ${pages}`);
    if (pages) return step('split', { mode: 'ranges', ranges: pages }, `Splitting into ${pages}`);
    return step('split', { mode: 'every' }, 'Splitting every page into its own PDF');
  }

  // Merge / combine
  if (has(/\b(merge|combine|join|put together|stitch|attach|append)\b|\binto (one|a single)\b|\bone (pdf|file|document)\b|\bsingle (pdf|file|document)\b|\btogether\b/, t)) {
    if (img && !pdf) return step('jpg-to-pdf', { merge: true }, 'Putting the pictures into one PDF');
    if (pdf && K.size === 1) return step('merge', {}, 'Merging the PDFs');
    return step('@merge-any', {}, 'Turning everything into PDF and merging it into one');
  }

  // Conversions
  const target = t.match(/\b(?:to|into|as|convert(?:ed)?\s+(?:it\s+)?(?:to)?)\s+(?:an?\s+|the\s+)?(jpe?g|png|webp|gif|animated gif|animation|image|images|picture|pictures|photo|photos|pdf\/?a|pdfa|pdf|word|docx?|excel|xlsx|spreadsheet|csv|power ?point|pptx?|slides|markdown|md|text|txt|editable)\b/)?.[1]
    || t.match(/\b(jpe?g|png|webp|gif|pdf|word|docx|excel|powerpoint|pptx|markdown)\b(?!.*\b(jpe?g|png|webp|gif|pdf|word|docx|excel|powerpoint|pptx|markdown)\b)/)?.[1];
  if (target && has(/\b(convert|change|turn|make|save|export|transform|to|into|as)\b/, t)) {
    const g = target.replace(/\s+/g, '');
    if (/^(pdf\/?a|pdfa)$/.test(g)) return step('pdf-to-pdfa', {}, 'Converting to PDF/A for archiving');
    if (g === 'pdf') {
      if (K.size === 1 && img) return step('jpg-to-pdf', { merge: !has(/\b(each|separate|individual)\b/, t) }, 'Turning the pictures into a PDF');
      if (K.size === 1 && K.has('word')) return step('word-to-pdf', {}, 'Converting Word to PDF');
      if (K.size === 1 && K.has('ppt')) return step('ppt-to-pdf', {}, 'Converting PowerPoint to PDF');
      if (K.size === 1 && K.has('sheet')) return step('excel-to-pdf', {}, 'Converting the spreadsheet to PDF');
      if (K.size === 1 && K.has('html')) return step('html-to-pdf', {}, 'Converting the web page to PDF');
      if (pdf && K.size === 1) return { reply: 'These are PDFs already. Tell me what to do with them, for example "compress" or "merge".' };
      return step('@to-pdf', {}, 'Converting each file to PDF');
    }
    const imgFmt = /^jpe?g$/.test(g) ? 'jpg' : ['png', 'webp', 'gif'].includes(g) ? g : /animat/.test(g) ? 'anim' : /^(image|images|picture|pictures|photo|photos)$/.test(g) ? 'jpg' : null;
    if (imgFmt) {
      if (pdf) return step('pdf-to-jpg', { mode: has(/\b(images|pictures|photos) (in|inside|from)\b|embedded/, t) ? 'images' : 'pages', format: imgFmt === 'anim' || imgFmt === 'gif' ? 'png' : imgFmt, dpi: has(/high|print|300/, t) ? '300' : '150' }, `Saving every page as ${imgFmt.toUpperCase()}`);
      if (img) {
        if (imgFmt === 'jpg') return step('convert-to-jpg', {}, 'Converting to JPG');
        return step('convert-from-jpg', { to: imgFmt === 'anim' || (imgFmt === 'gif' && files.length > 1 && has(/anim|together|one gif|slideshow/, t)) ? 'anim' : imgFmt }, imgFmt === 'anim' ? 'Making an animated GIF' : `Converting to ${imgFmt.toUpperCase()}`);
      }
    }
    if (/^(word|docx?|editable)$/.test(g)) return img ? step('image-to-editable', { out: g === 'editable' ? 'both' : 'docx' }, 'Turning the picture into an editable Word file') : step('pdf-to-word', { layout: has(/exact|same (layout|look)/, t) ? 'exact' : 'flow' }, 'Converting to Word');
    if (/^(excel|xlsx|spreadsheet|csv)$/.test(g)) return step('pdf-to-excel', { format: g === 'csv' ? 'csv' : 'xlsx' }, `Converting to ${g === 'csv' ? 'CSV' : 'Excel'}`);
    if (/^(powerpoint|pptx?|slides)$/.test(g)) return step('pdf-to-ppt', { mode: has(/editable/, t) ? 'editable' : 'image' }, 'Converting to PowerPoint');
    if (/^(markdown|md)$/.test(g)) return step('pdf-to-md', {}, 'Converting to Markdown');
    if (/^(text|txt)$/.test(g)) return pdf ? step('pdf-to-text', {}, 'Taking the text out of the PDF') : step('ocr', {}, 'Reading the text in the picture (OCR)');
  }

  // Tools that need you on screen
  const OPEN = [
    [/\bblur (the |their |all |my )?faces?|hide (the )?faces?|anonymi/, 'blur-face', 'Blur face'],
    [/\bmeme\b/, 'meme-generator', 'Meme generator'],
    [/\b(redact|black ?out|hide (the )?(text|info|details|numbers?))\b/, 'redact', 'Redact PDF'],
    [/\bsign(ature)?\b/, 'sign', 'Sign PDF'],
    [/\b(fill|form)\b/, 'forms', 'PDF Forms'],
    [/\b(compare|difference|diff)\b/, 'compare', 'Compare PDF'],
    [/\b(organi[sz]e|reorder|rearrange|re-?order|move (the )?pages?|sort (the )?pages?)\b/, 'organize', 'Organize PDF'],
    [/\bcrop\b/, img ? 'crop-image' : 'crop', img ? 'Crop image' : 'Crop PDF'],
    [/\b(design|poster|thumbnail|banner|instagram|flyer|invitation|business card|youtube)\b/, 'design-studio', 'Design Studio'],
    [/\bfont\b/, 'font-finder', 'Font Finder'],
    [/\blogo\b/, img ? 'watermark-image' : 'watermark', 'Watermark (add your logo there)'],
    [/\bscan\b/, 'scan', 'Scan to PDF'],
    [/\b(edit|change|fix|correct) (the )?(text|words|spelling|typo)|\bedit\b/, img ? 'photo-editor' : 'edit', img ? 'Photo editor' : 'Edit PDF'],
    [/\b(text|caption|sticker|frame|filter|font size|bigger text)\b/, img ? 'photo-editor' : 'edit', img ? 'Photo editor' : 'Edit PDF']
  ];
  for (const [re, id, name] of OPEN) if (id && re.test(t)) return { open: id, say: `Opening ${name}` };
  return null;
}

/** Split "do this, then that" into instructions. "and" splits only when both halves are instructions. */
function understand(text, files) {
  text = normalize(text);
  const parts = text.split(/\s*(?:,?\s*\b(?:and then|then|after that|afterwards|next|finally)\b\s*|;\s*|\.\s+(?=[a-z]))/i).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let cur = files;
  for (const p of parts) {
    const halves = p.split(/\s+\band\b\s+|,\s+(?=[a-z])/i);
    let done = false;
    if (halves.length > 1) {
      const res = halves.map((x) => understandOne(x, cur));
      if (res.every((r) => r && (r.tool || r.open)) && new Set(res.map((r) => r.tool || r.open)).size === res.length) {
        out.push(...res); done = true;
      }
    }
    if (!done) out.push(understandOne(p, cur) || { miss: p });
    const last = out[out.length - 1];
    if (last?.tool) cur = guessOutputs(last.tool, cur);
  }
  return out;
}
/** What files a step will hand on, so later steps in one request are understood for the right kind of file. */
function guessOutputs(tool, files) {
  const as = (name) => [new File([], name)];
  if (['jpg-to-pdf', 'word-to-pdf', 'ppt-to-pdf', 'excel-to-pdf', 'html-to-pdf', '@merge-any', '@to-pdf', 'merge', 'translate'].includes(tool)) return as('x.pdf');
  if (['pdf-to-jpg', 'passport-photo', 'remove-background', 'upscale-image', 'resize-image', 'convert-to-jpg', 'convert-from-jpg'].includes(tool)) return as('x.jpg');
  if (['pdf-to-word', 'image-to-editable'].includes(tool)) return as('x.docx');
  if (['pdf-to-text', 'audio-to-text', 'summarize', 'pdf-to-md'].includes(tool)) return as('x.txt');
  return files;
}

// ---------- the browser's own AI as a fallback ----------
const LM_TOOLS = ['compress', 'compress-image', 'resize-image', 'remove-background', 'upscale-image', 'convert-to-jpg', 'convert-from-jpg', 'jpg-to-pdf', 'merge', 'split', 'rotate', 'pdf-to-jpg', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-ppt', 'pdf-to-text', 'page-numbers', 'watermark', 'watermark-image', 'protect', 'unlock', 'ocr', 'translate', 'summarize', 'repair', 'passport-photo', 'audio-to-text'];
async function askBrowserAI(text, files) {
  const lm = await builtinAI('You turn a request about files into a JSON list of tool steps for a file-editing website. Reply with JSON only.');
  if (!lm) return null;
  const list = LM_TOOLS.map((id) => `${id}: ${toolById(id).desc}`).join('\n');
  const schema = { type: 'array', items: { type: 'object', properties: { tool: { type: 'string', enum: LM_TOOLS } }, required: ['tool'] } };
  try {
    const r = await lm.prompt(`Tools:\n${list}\n\nFiles: ${files.map((f) => f.name).join(', ') || 'none'}\nRequest: "${text}"\n\nAnswer with a JSON array of steps in order, like [{"tool":"compress"}]. Use [] if no tool fits.`, { responseConstraint: schema });
    const steps = JSON.parse(r.match(/\[[\s\S]*\]/)?.[0] || '[]').filter((s) => LM_TOOLS.includes(s.tool));
    return steps.map((s) => step(s.tool, {}, toolById(s.tool).name));
  } catch { return null; } finally { lm.destroy?.(); }
}

// ---------- running steps ----------
const asFiles = (outputs) => outputs.map((o) => o instanceof File ? o : new File([o.blob], o.name, { type: o.blob.type || 'application/octet-stream' }));
const acceptsFile = (accept, f) => {
  if (!accept) return true;
  return accept.split(',').map((s) => s.trim().toLowerCase()).some((a) => a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? (f.type || '').startsWith(a.slice(0, -1)) : f.type === a);
};

const INTERNAL = {
  async '@grayscale'(files, o, ctx) {
    const outputs = [];
    for (const f of files.filter(KIND.img)) {
      ctx.progress(0.3, 'Removing colour from ' + f.name);
      const pic = await readPicture(f);
      const frames = await mapFrames(pic.frames, (c) => {
        const g = c.getContext('2d', { willReadFrequently: true });
        const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
        out.getContext('2d').putImageData(id, 0, 0);
        return out;
      });
      outputs.push(...await savePicture(pic, frames, keepFormat(pic), { quality: 0.95 }, '-bw'));
    }
    return outputs;
  },
  async '@drop-pages'(files, o, ctx) {
    const outputs = [];
    for (const f of files.filter(KIND.pdf)) {
      const src = await loadPdfLib(await readBytes(f));
      const n = src.getPageCount();
      const drop = new Set(parseRanges(o.pages, n).flat());
      const keep = [...Array(n).keys()].filter((i) => !drop.has(i));
      if (!keep.length) throw new Error('That would remove every page.');
      const out = await PDFDocument.create();
      (await out.copyPages(src, keep)).forEach((p) => out.addPage(p));
      outputs.push({ name: stem(f.name) + '-edited.pdf', blob: new Blob([await out.save()], { type: 'application/pdf' }) });
      ctx.progress(1, `Removed ${drop.size} page${drop.size > 1 ? 's' : ''}`);
    }
    return { outputs, note: `Removed page${o.pages.match(/[,-]/) ? 's' : ''} ${o.pages}.` };
  },
  async '@rotate-img'(files, o, ctx) {
    const outputs = [];
    for (const f of files.filter(KIND.img)) {
      ctx.progress(0.3, 'Turning ' + f.name);
      const pic = await readPicture(f);
      const frames = await mapFrames(pic.frames, (c) => rotateCanvas(c, o.angle, o.flip));
      outputs.push(...await savePicture(pic, frames, keepFormat(pic), { quality: 0.95 }, o.flip !== 'none' && !o.angle ? '-flipped' : '-rotated'));
    }
    return outputs;
  },
  async '@to-pdf'(files, o, ctx) {
    const outputs = [];
    const groups = [['jpg-to-pdf', KIND.img, { merge: false }], ['word-to-pdf', KIND.word], ['ppt-to-pdf', KIND.ppt], ['excel-to-pdf', KIND.sheet], ['html-to-pdf', KIND.html]];
    for (const f of files.filter(KIND.pdf)) outputs.push({ name: f.name, blob: f });
    for (const [tool, test, extra] of groups) {
      const fs = files.filter(test);
      for (const f of tool === 'html-to-pdf' ? fs.map((x) => [x]) : fs.length ? [fs] : []) {
        const r = await runTool(tool, f, extra || {}, ctx);
        outputs.push(...r.outputs);
      }
    }
    if (!outputs.length) throw new Error('None of these files can be turned into a PDF.');
    return outputs;
  },
  async '@merge-any'(files, o, ctx) {
    const pdfs = await INTERNAL['@to-pdf'](files, o, ctx);
    if (pdfs.length < 2) return pdfs;
    return (await runTool('merge', asFiles(pdfs), {}, ctx)).outputs;
  }
};

async function runTool(id, files, opts, ctx) {
  // "the last page": the page count is only known once the PDF is open.
  if (Object.values(opts).some((v) => typeof v === 'string' && /last/.test(v))) {
    const f = files.find(KIND.pdf);
    if (f) {
      const n = (await loadPdfLib(await readBytes(f))).getPageCount();
      opts = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/last/g, String(n)) : v]));
    }
  }
  if (INTERNAL[id]) {
    const r = await INTERNAL[id](files, opts, ctx);
    return Array.isArray(r) ? { outputs: r } : r;
  }
  const meta = toolById(id);
  const impl = await loadTool(meta);
  const use = files.filter((f) => acceptsFile(impl.accept, f));
  if (!use.length) throw new Error(`${meta.name} needs ${describeAccept(impl.accept)}, and none of the files are.`);
  if (impl.quick) return impl.quick(use, opts, ctx);
  if (!impl.process) throw new Error(`${meta.name} needs you on screen.`);
  const schema = typeof impl.options === 'function' ? impl.options(use) : impl.options || [];
  const vals = {};
  for (const o of schema) if ('default' in o) vals[o.key] = o.default;
  Object.assign(vals, opts);
  const list = impl.multiple ? use : use.slice(0, 1);
  const outputs = [];
  let note = '';
  // Tools that take one file at a time get each file in turn.
  for (const group of impl.multiple ? [list] : use.map((f) => [f])) {
    const r = await impl.process(group, vals, { meta, toast, progress: ctx.progress });
    outputs.push(...(Array.isArray(r) ? r : r.outputs));
    if (!Array.isArray(r) && r.note) note += (note ? '\n' : '') + r.note;
  }
  return { outputs, note };
}
const describeAccept = (a = '') => /pdf/.test(a) && !/image/.test(a) ? 'PDF files' : /image/.test(a) && !/pdf/.test(a) ? 'pictures' : /audio/.test(a) ? 'audio or video files' : /docx/.test(a) ? 'Word files' : /pptx/.test(a) ? 'PowerPoint files' : /xlsx/.test(a) ? 'spreadsheets' : 'a different kind of file';

// ---------- the screen ----------
// ---------- understanding by meaning (on-device) ----------
// When no rule matches, the request is compared by meaning with example phrasings using a small sentence model
// (all-MiniLM-L6-v2, 23 MB, downloaded once). The best match's command is combined with the original words so
// details like sizes, colours and page numbers are still picked up.
const MEANINGS = [
  ['compress', 'Compress (make the file smaller)', ['make the file smaller', 'reduce the file size', 'the file is too big', 'it is too large to send by email', 'shrink it', 'lower the size', 'make it lighter to upload', 'it is too heavy for whatsapp', 'the size should be less']],
  ['remove the background', 'Remove the background', ['remove the background', 'picture without a background', 'make the background transparent', 'cut out the person', 'erase what is behind me', 'only keep the person', 'delete the backdrop']],
  ['remove background white', 'Make the background white', ['make the background white', 'put a white background', 'change the background colour', 'replace the background with blue']],
  ['merge', 'Merge into one PDF', ['combine these files', 'join the documents', 'put them all together', 'make one file out of these', 'attach these pdfs to each other', 'add this pdf to the other one']],
  ['convert to pdf', 'Convert to PDF', ['make a pdf', 'change it to pdf', 'save as pdf', 'turn the photos into a pdf document', 'i need it as a pdf']],
  ['convert to jpg', 'Convert to JPG pictures', ['convert to image', 'save the pages as pictures', 'turn the pdf into photos', 'i need it as an image', 'make it a jpeg']],
  ['convert to png', 'Convert to PNG', ['convert to png', 'save it as png', 'i need a png file']],
  ['convert to word', 'Convert to Word', ['make it editable in word', 'convert to a word file', 'open it in microsoft word', 'i want to edit it in docs']],
  ['convert to excel', 'Convert to Excel', ['get the table into a spreadsheet', 'convert to excel', 'i need the data in sheets']],
  ['upscale', 'Make it sharper (AI upscale)', ['make the photo clearer', 'improve the picture quality', 'it looks blurry', 'make it sharper', 'increase the resolution', 'the photo is pixelated', 'make it high definition']],
  ['resize', 'Resize the picture', ['change the image size in pixels', 'change the dimensions', 'make the photo width smaller', 'resize the photo', 'change height and width']],
  ['rotate', 'Rotate', ['turn the page around', 'it is sideways', 'fix the orientation', 'the page is upside down', 'rotate it']],
  ['add page numbers', 'Add page numbers', ['number the pages', 'put page numbers', 'add page count at the bottom']],
  ['watermark', 'Add a watermark', ['stamp my name on it', 'write confidential across the pages', 'add text over the photo', 'mark it as draft']],
  ['protect', 'Add a password', ['lock the file', 'secure the pdf', 'add a password', 'nobody should open it without a password']],
  ['unlock', 'Remove the password', ['remove the password', 'open the locked pdf', 'the pdf asks for a password', 'take the lock off']],
  ['translate', 'Translate the PDF', ['change the language', 'translate the document', 'i cannot read this language']],
  ['summarize', 'Summarise the PDF', ['give me a summary', 'what is this document about', 'main points', 'short version of this', 'tell me the gist']],
  ['make searchable ocr', 'Make it searchable (OCR)', ['make the scan searchable', 'read the text from the image', 'copy text from the scanned document', 'the text cannot be selected']],
  ['split', 'Split the PDF', ['separate the pages', 'split into files', 'break the pdf apart', 'each page as its own file']],
  ['delete pages', 'Remove pages', ['delete a page', 'remove some pages', 'take out a page', 'i do not need some pages']],
  ['passport photo', 'Make a passport photo', ['passport size photo', 'photo for visa application', 'id card photo', 'photo for my application form', 'small photo with white background for documents']],
  ['transcribe', 'Turn speech into text', ['convert speech to text', 'write down what is said', 'make subtitles', 'type out the audio', 'what does the recording say']],
  ['black and white', 'Make it black and white', ['make it grayscale', 'remove the colours', 'monochrome', 'old photo look']],
  ['edit', 'Edit the text', ['change the text', 'edit the document', 'fix a spelling mistake', 'change a word in the pdf', 'make the text bigger']],
  ['sign', 'Sign it', ['add my signature', 'sign the document', 'put my sign']],
  ['crop', 'Crop', ['cut the edges', 'trim the borders', 'crop it', 'cut out a part of the photo']],
  ['blur faces', 'Blur faces', ['hide the faces', 'blur people', 'make faces unrecognisable']],
  ['ask question', 'Ask a question about the PDF', ['ask a question about the pdf', 'find information in the document', 'what is the deadline in this document']]
];
const ONLY_IMG = new Set(['remove the background', 'remove background white', 'upscale', 'resize', 'black and white', 'passport photo', 'blur faces']);
const ONLY_PDF = new Set(['add page numbers', 'protect', 'unlock', 'translate', 'summarize', 'split', 'delete pages', 'sign', 'ask question', 'convert to word', 'convert to excel', 'make searchable ocr', 'convert to jpg']);
const fits = (canon, K) => !K.size || (ONLY_IMG.has(canon) ? K.has('img') : ONLY_PDF.has(canon) ? K.has('pdf') : canon === 'transcribe' ? K.has('audio') : true);
let meaningIndex = null;
async function meaningGuess(text, onStatus = () => {}) {
  const { embedder } = await import('./aitools.js');
  const ex = await embedder(onStatus);
  meaningIndex ||= (async () => {
    const rows = MEANINGS.flatMap(([canon, label, ph]) => ph.map((p) => ({ canon, label, p })));
    const vecs = (await ex(rows.map((r) => r.p), { pooling: 'mean', normalize: true })).tolist();
    return rows.map((r, i) => ({ ...r, v: vecs[i] }));
  })();
  const idx = await meaningIndex;
  const q = (await ex([text], { pooling: 'mean', normalize: true })).tolist()[0];
  const best = new Map();
  for (const r of idx) { let s = 0; for (let i = 0; i < q.length; i++) s += q[i] * r.v[i]; if (!best.has(r.canon) || best.get(r.canon).score < s) best.set(r.canon, { canon: r.canon, label: r.label, score: s }); }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

const EXAMPLES = [
  ['pdf', 'Compress this PDF under 1 MB'],
  ['pdf', 'Merge these PDFs and add page numbers'],
  ['pdf', 'Delete the last page'],
  ['pdf', 'Convert to Word'],
  ['img', 'Remove the background and make it white'],
  ['img', 'Make a passport photo for India with a print sheet'],
  ['img', 'Resize to 600 x 600 under 50 KB'],
  ['img', 'Turn these pictures into one PDF'],
  ['audio', 'Transcribe this and make subtitles'],
  ['pdf', 'Translate this PDF to Hindi']
];
const QUICK = { pdf: ['Compress', 'Merge', 'Convert to Word', 'Add page numbers', 'Delete pages', 'Summarise'], img: ['Remove the background', 'Compress', 'Make it sharper', 'Convert to PDF', 'Passport photo', 'Black and white'], audio: ['Transcribe', 'Make subtitles'], other: ['Convert to PDF'] };
const HELP = 'Add your files with the + button (or drop them here), then type or say what you want in your own words. I can compress, resize, convert, merge, split, rotate, remove pages, add page numbers, watermarks or passwords, remove backgrounds, make pictures sharper or black and white, make passport photos, read text (OCR), translate, summarise and transcribe audio. Join steps with "then", e.g. "remove the background then resize to 1080 x 1080". Hinglish works too, e.g. "pdf ka size kam karo".';

// ---------- file cards with a small preview ----------
const metaCache = new WeakMap();
async function fileMeta(f) {
  if (metaCache.has(f)) return metaCache.get(f);
  const p = (async () => {
    const k = kindOf(f), ex = (ext(f) || k).toUpperCase();
    try {
      if (k === 'img' && /^image\/(jpeg|png|webp|gif|bmp|avif|svg)/.test(f.type || 'image/' + ext(f))) {
        const url = URL.createObjectURL(f);
        const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        return { thumb: url, info: `${ex} · ${im.naturalWidth} × ${im.naturalHeight} px` };
      }
      if (k === 'pdf') {
        const { pdfThumb } = await import('../lib/core.js');
        const { canvas, pages } = await pdfThumb(await readBytes(f), 96);
        return { thumb: canvas.toDataURL('image/jpeg', 0.7), info: `PDF · ${pages} page${pages > 1 ? 's' : ''}` };
      }
      if (k === 'audio') {
        const url = URL.createObjectURL(f);
        const d = await new Promise((res) => { const a = document.createElement(/^video/.test(f.type) ? 'video' : 'audio'); a.preload = 'metadata'; a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); a.src = url; });
        URL.revokeObjectURL(url);
        return { icon: 'wave', info: `${ex}${d && isFinite(d) ? ` · ${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : ''}` };
      }
    } catch { /* fall through to a plain card */ }
    return { icon: k === 'img' ? 'image' : k === 'word' ? 'word' : k === 'ppt' ? 'ppt' : k === 'sheet' ? 'excel' : 'page', info: ex };
  })();
  metaCache.set(f, p);
  return p;
}

function mount(body, ctx) {
  let files = [...(ctx.files || [])];
  let pending = null, busy = false, lastWasVoice = false;
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('editsupreme.assistant') || '{}'); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem('editsupreme.assistant', JSON.stringify(prefs)); } catch { /* private mode */ } };
  prefs.lang ||= 'en'; prefs.speak ??= true; prefs.autoSend ??= true;

  const log = h('div', { class: 'chatlog big' });
  const tray = h('div', { class: 'filetray' });
  const status = h('div', { class: 'status voicestatus' });
  const input = h('textarea', { class: 'inp chatinp', rows: 1, placeholder: 'Type or say it in your own words, e.g. "this file is too big to email"', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; } });
  const mic = micButton((t) => { input.value = t; }, (t) => { if (t) { input.value = t; lastWasVoice = true; if (prefs.autoSend) submit(); } else input.focus(); },
    (m) => { status.textContent = m; }, { lang: () => prefs.lang, priv: () => !!prefs.priv });
  const add = h('button', { class: 'btn addbtn', type: 'button', title: 'Add files', html: icon('plus'), onclick: async () => { const f = await pickFiles('', true); if (f.length) addFiles(f); } });
  const send = h('button', { class: 'btn primary', type: 'button', title: 'Send', html: icon('send'), onclick: () => submit() });
  const langSel = h('select', { class: 'inp mini', title: 'Language you speak in', onchange: () => { prefs.lang = langSel.value; save(); } }, VOICE_LANGS.map(([c, n]) => h('option', { value: c, selected: c === prefs.lang }, n)));
  const toggle = (key, label, title) => h('label', { class: 'check mini', title }, h('input', { type: 'checkbox', checked: !!prefs[key], onchange: (e) => { prefs[key] = e.target.checked; save(); } }), ' ' + label);
  const chips = h('div', { class: 'examples' });

  const panel = h('div', { class: 'panel chatpanel assistant' + (ctx.docked ? ' docked' : '') },
    ctx.docked ? null : h('div', { class: 'chathead' }, h('div', { class: 'aibadge', html: icon('ai') }), h('div', {}, h('strong', {}, 'EditSupreme Assistant'), h('div', { class: 'hint' }, 'Runs the site\'s tools on your files, on your device. Nothing is uploaded.'))),
    log, tray, chips,
    h('div', { class: 'chatbar' }, add, mic.el, input, send), status,
    h('details', { class: 'voiceopts' }, h('summary', {}, 'Voice settings'),
      h('div', { class: 'voicerow' }, h('span', { class: 'hint' }, 'I speak:'), langSel,
        toggle('speak', 'Read replies aloud', 'Speak short replies back'),
        toggle('autoSend', 'Send when I stop talking', 'Run the request as soon as you finish speaking'),
        toggle('priv', 'Private voice', hasLiveSpeech ? 'Your browser\'s live voice typing may send audio to its maker (e.g. Google). Private voice turns speech into text on this device instead (40 MB model, downloaded once).' : 'Speech is turned into text on this device (40 MB model, downloaded once).')),
      h('p', { class: 'hint' }, 'Requests work best in English or Hinglish. Voice typing works in the languages listed; in Chrome and Edge it uses the browser\'s speech service unless "Private voice" is on.')));
  body.replaceChildren(panel);

  // Drop or paste files anywhere on the assistant.
  panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag'); });
  panel.addEventListener('dragleave', (e) => { if (e.target === panel) panel.classList.remove('drag'); });
  panel.addEventListener('drop', (e) => { e.preventDefault(); panel.classList.remove('drag'); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  input.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addFiles(f); } });

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const say = (who, ...kids) => { const b = h('div', { class: 'bubble ' + who }, ...kids); log.append(b); scroll(); return b; };
  const reply = (text, ...more) => { const b = say('bot', h('div', {}, text), ...more); if (prefs.speak && lastWasVoice) speak(text, 'en'); return b; };
  const choices = (list) => h('div', { class: 'examples' }, list.map(([label, cmd]) => h('button', { class: 'chip', type: 'button', onclick: () => { say('me', label); run(cmd); } }, label)));

  function card(f, i, removable = true) {
    const thumb = h('button', { class: 'fthumb', type: 'button', title: 'Preview ' + f.name, onclick: () => previewFile(f, f.name) });
    const info = h('span', { class: 'fi' }, fmtSize(f.size));
    fileMeta(f).then((m) => {
      if (m.thumb) thumb.append(h('img', { src: m.thumb, alt: '' })); else thumb.innerHTML = icon(m.icon);
      info.textContent = `${m.info} · ${fmtSize(f.size)}`;
    });
    return h('div', { class: 'filecard' }, thumb, h('div', { class: 'fmeta' }, h('span', { class: 'n', title: f.name }, f.name), info),
      removable && h('button', { class: 'fx', type: 'button', title: 'Remove ' + f.name, 'aria-label': 'Remove ' + f.name, onclick: () => { files.splice(i, 1); drawTray(); } }, '×'));
  }
  function drawTray() {
    tray.replaceChildren(...files.map((f, i) => card(f, i)));
    if (files.length > 1) tray.append(h('button', { class: 'btn ghost small', type: 'button', onclick: () => { files = []; drawTray(); } }, 'Clear all'));
    const K = kindsOf(files);
    const ex = EXAMPLES.filter(([k]) => !files.length ? true : K.has(k)).slice(0, files.length ? 4 : 6);
    chips.replaceChildren(...ex.map(([, t]) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = t; lastWasVoice = false; submit(); } }, t)));
  }
  function addFiles(f) {
    files.push(...f);
    drawTray();
    say('me files', h('div', { class: 'msgfiles' }, f.map((x) => card(x, -1, false))));
    if (pending) { const p = pending; pending = null; run(p); }
    else reply(`Got ${f.length === 1 ? 'it' : 'them'}. What should I do? Say it in your own words.`);
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ''; input.style.height = 'auto';
    say('me', text);
    await run(text);
    lastWasVoice = false;
  }

  async function run(text) {
    let plan = understand(text, files);
    if (plan.some((p) => p.help)) { reply(HELP); return; }
    const ask = plan.find((p) => p.ask);
    if (ask) { reply(ask.ask); return; }
    const reply1 = plan.find((p) => p.reply);
    if (reply1) { reply(reply1.reply); return; }
    if (plan.some((p) => p.miss)) {
      if (!files.length) {
        pending = text;
        reply('Add your file first (tap + or drop it here), then I\'ll work out what to do with it.');
        return;
      }
      const thinking = say('bot', h('span', { class: 'spinner' }), ' Working out what you mean…');
      let unsure = null;
      try {
        for (const m of plan.filter((p) => p.miss)) {
          const K = kindsOf(files);
          const g = (await meaningGuess(m.miss, (s) => { thinking.lastChild.textContent = ' ' + s; })).filter((x) => fits(x.canon, K));
          const top = g[0];
          const r = top && top.score >= 0.5 ? understandOne(normalize(top.canon + ' ' + m.miss), files) : null;
          if (r && !r.miss && (r.tool || r.open || r.ask)) { Object.keys(m).forEach((k) => delete m[k]); Object.assign(m, r); if (r.say) m.say = r.say; continue; }
          unsure = { text: m.miss, guesses: g.filter((x) => x.score >= 0.3).slice(0, 3) };
          break;
        }
      } catch (e) { console.warn('meaning model unavailable', e); unsure = { text, guesses: [] }; }
      if (unsure) {
        const lm = await askBrowserAI(text, files);
        if (lm?.length) { plan = lm; unsure = null; }
      }
      thinking.remove();
      if (unsure) {
        const K = [...kindsOf(files)];
        const opts = unsure.guesses.length ? unsure.guesses.map((g) => [g.label, g.canon + ' ' + unsure.text])
          : (QUICK[K[0]] || QUICK.other).map((q) => [q, q]);
        reply(unsure.guesses.length ? `I'm not completely sure what you mean by "${unsure.text}". Did you mean:` : `Sorry, I didn't get "${unsure.text}". What would you like to do?`, choices(opts));
        return;
      }
      const askNow = plan.find((p) => p.ask);
      if (askNow) { reply(askNow.ask); return; }
    }
    if (!files.length) {
      pending = text;
      reply('Add the file' + (plan.length > 1 || /these|them|files|pdfs|pictures|images|photos/i.test(text) ? 's' : '') + ' first: tap + or drop them here. I\'ll start as soon as they\'re in.');
      return;
    }
    const opens = plan.filter((p) => p.open);
    if (opens.length) {
      const o = opens[0];
      reply(o.say + '…', h('div', { class: 'examples' }, h('button', { class: 'chip on', type: 'button', onclick: () => ctx.openTool(o.open, files) }, 'Open it with my files')));
      return;
    }
    busy = true; send.disabled = true;
    const b = say('bot', h('div', { class: 'steps' }, plan.map((p, i) => h('div', { class: 'stepline', 'data-i': i }, h('span', { class: 'dot' }), p.say))));
    const prog = h('div', { class: 'progress' }, h('div'));
    const msg = h('div', { class: 'status' });
    b.append(prog, msg);
    const lines = [...b.querySelectorAll('.stepline')];
    let cur = files, notes = [];
    try {
      for (let i = 0; i < plan.length; i++) {
        lines[i].classList.add('now');
        const p = plan[i];
        const r = await runTool(p.tool, cur, p.opts || {}, { progress: (f, m) => { prog.firstChild.style.width = Math.round(((i + Math.min(1, f || 0)) / plan.length) * 100) + '%'; if (m) msg.textContent = m; }, toast });
        if (!r.outputs?.length) throw new Error('That step made no files.');
        if (r.note) notes.push(r.note);
        cur = asFiles(r.outputs);
        lines[i].classList.replace('now', 'ok');
      }
      prog.remove(); msg.remove();
      const outs = cur.map((f) => ({ name: f.name, blob: f }));
      files = cur; drawTray();
      const view = resultView(outs, { title: 'Done', note: notes.join('\n'), onRestart: () => { files = []; drawTray(); reply('Cleared. Add new files whenever you\'re ready.'); }, tools: null, imgTools: null });
      b.append(view);
      reply(`Done. ${outs.length === 1 ? 'Your file is' : outs.length + ' files are'} ready to download. You can keep going, e.g. "now compress it".`);
    } catch (e) {
      console.error(e);
      const at = lines.findIndex((l) => l.classList.contains('now'));
      if (at >= 0) lines[at].classList.replace('now', 'bad');
      prog.remove(); msg.remove();
      const m = e.message || String(e);
      reply('That did not work: ' + m + (/password/i.test(m) ? ' Tell me the password, e.g. "unlock with password 1234".' : ''));
    } finally { busy = false; send.disabled = false; scroll(); }
  }

  drawTray();
  say('bot', h('div', {}, files.length ? `I have ${files.length === 1 ? files[0].name : files.length + ' files'}. What should I do?` : 'Hi! Add a file with + (or drop it here), then tell me in your own words what you need. Tap the mic to speak.'));
  if (!ctx.docked) input.focus();
  return { focus: () => input.focus(), addFiles };
}

export const tools = {
  assistant: { standalone: true, mount }
};
export { understand as _understand };
