// Reads an existing resume (PDF, Word or a photo / scan) and sorts its text into the editor's sections.
// Rules do the work everywhere; when the browser has its own built-in AI (Chrome / Edge) it can tidy
// the result further. Nothing is uploaded.
import { readBytes, openPdfjs, extractPageText } from '../../lib/core.js';
import { normalize, newSection, newEntry, uid, DEFAULT_DESIGN, SECTION_TYPES } from './model.js';

// Heading words → section type.
const HEADINGS = [
  ['summary', /^(professional\s+|career\s+|personal\s+)?(summary|profile|objective|about( me)?|overview|career objective|professional profile)$/],
  ['experience', /^(work\s+|professional\s+|employment\s+|relevant\s+)?(experience|history|employment|work history|career history)$|^experience\b/],
  ['internships', /^internships?( experience)?$/],
  ['education', /^(education|academic(s| background| qualifications?| details)?|qualifications?|educational (background|qualifications?))$/],
  ['projects', /^(academic\s+|personal\s+|key\s+)?projects?$/],
  ['skills', /^((technical|key|core|professional|it|computer|soft)\s+)?(skills|competencies|expertise|strengths|technologies|tools)( & tools| and tools| summary)?$/],
  ['languages', /^languages?( known)?$/],
  ['interests', /^(interests|hobbies|hobbies (and|&) interests|interests (and|&) hobbies|extra[- ]?curricular( activities)?)$/],
  ['certs', /^(certifications?|certificates?|courses|licen[cs]es( (and|&) certifications)?|trainings?|certifications? (and|&) (courses|trainings?))$/],
  ['awards', /^(awards?|honou?rs|achievements?|accomplishments|awards? (and|&) (achievements?|honou?rs))$/],
  ['publications', /^publications?$/],
  ['volunteer', /^(volunteer(ing)?( experience| work)?|community service|social work)$/],
  ['references', /^references?$/],
  ['personal', /^(personal (details|information|profile|data)|personal info)$/],
  ['declaration', /^declaration$/],
  ['contact', /^(contact( me| details| information| info)?|get in touch)$/]
];
const MONTH = '(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)';
const DATE = `(${MONTH}\\.?\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{2,4}|(19|20)\\d{2})`;
// The dash is optional: text read from pictures often loses it ("Mar 2022 Present").
const RANGE = new RegExp(`(${DATE})\\s*(-|–|—|to|till|until|\\s)\\s*(${DATE}|present|current|now|till date|ongoing|today)|\\b(${DATE})\\b`, 'i');
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINK = /((https?:\/\/)?(www\.)?(linkedin\.com|github\.com|behance\.net|dribbble\.com|gitlab\.com|medium\.com|[\w-]+\.(dev|io|me|in|com|net|org|co|site|page|app))\/?[\w\-./?=#%&]*)/i;
const BULLET = /^\s*([-•*▪●◦■□➢➤►▸✓✔–+»«°]|\d+[.)])\s+/; // + » « ° are how pictures' round bullets are often read

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** Undo letter spacing: "S U M M A R Y" → "SUMMARY" (words stay apart where the gap was wider). */
const unspace = (raw) => {
  const segs = String(raw || '').split(/\s{2,}/).map((w) => w.trim()).filter(Boolean).map((w) => (/^(?:\S ){2,}\S$/.test(w) ? w.replace(/ /g, '') : w));
  // Letters that came as separate pieces ("S", "U", "M"…) also make one word.
  const out = [];
  let run = '';
  for (const w of segs) { if ([...w].length === 1 && /\p{L}/u.test(w)) run += w; else { if (run) { out.push(run); run = ''; } out.push(w); } }
  if (run) out.push(run);
  return out.map((w) => (w.length === 1 && out.length > 1 ? w : w)).join(' ');
};
// Headings whose words ran together after removing letter spacing ("PERSONALDETAILS").
const PHRASES = ['professional summary', 'career objective', 'work experience', 'professional experience', 'employment history', 'personal details', 'personal information',
  'technical skills', 'key skills', 'core competencies', 'academic projects', 'personal projects', 'educational qualifications', 'academic qualifications',
  'awards and achievements', 'languages known', 'hobbies and interests', 'extra curricular activities', 'contact details', 'about me'];
const headingOf = (line) => {
  let t = clean(line).replace(/[:|]+$/, '').toLowerCase();
  if (!t || t.length > 42) return null;
  const compact = t.replace(/[^a-z]/g, '');
  const ph = PHRASES.find((p) => p.replace(/[^a-z]/g, '') === compact);
  if (ph) t = ph;
  for (const [type, re] of HEADINGS) if (re.test(t)) return type;
  return null;
};
const headingTitle = (line) => {
  const compact = clean(line).toLowerCase().replace(/[^a-z]/g, '');
  const ph = PHRASES.find((p) => p.replace(/[^a-z]/g, '') === compact);
  return ph ? ph.replace(/(^|\s)\w/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, 'and') : null;
};

// ---------- getting lines out of the file ----------
/** Lines of text in reading order: [{text, size, bold}]. Two-column PDFs are read column by column. */
async function pdfLines(file) {
  const doc = await openPdfjs(await readBytes(file));
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    const { vp, lines } = await extractPageText(doc, i);
    const W = vp.width;
    // Find a clear vertical gap shared by most lines: a sidebar or a second column.
    const bins = new Array(60).fill(0);
    for (const r of lines) for (const it of r.items) {
      const a = Math.floor(it.x / W * 60), b = Math.min(59, Math.floor((it.x + it.w) / W * 60));
      for (let k = Math.max(0, a); k <= b; k++) bins[k]++;
    }
    let split = null, best = 0;
    for (let k = 12; k < 48; k++) {
      if (bins[k] > lines.length * 0.04) continue;
      let run = 1; while (k + run < 48 && bins[k + run] <= lines.length * 0.04) run++;
      if (run > best) { best = run; split = (k + run / 2) / 60 * W; }
    }
    const rows = [];
    const push = (items, y) => {
      if (!items.length) return;
      const text = clean(unspace(items.map((it) => it.str).join('  ')).replace(/\s+([,.;:])/g, '$1'));
      const size = Math.max(...items.map((it) => it.size));
      if (text) rows.push({ text, size, bold: false, y });
    };
    if (split && best >= 2) {
      const rightTexts = lines.map((r) => r.items.filter((it) => it.x + it.w / 2 >= split).map((it) => it.str).join(' ').trim()).filter(Boolean);
      const leftCount = lines.filter((r) => r.items.some((it) => it.x + it.w / 2 < split)).length;
      const datesOnly = rightTexts.filter((t) => RANGE.test(t) && t.replace(RANGE, '').replace(/[\s–—-]/g, '').length < 6).length;
      if (rightTexts.length < 5 || leftCount < 5 || datesOnly > rightTexts.length * 0.4) split = null;
    }
    if (split && best >= 2) {
      const left = [], right = [];
      for (const r of lines) {
        const l = r.items.filter((it) => it.x + it.w / 2 < split), rr = r.items.filter((it) => it.x + it.w / 2 >= split);
        if (l.length) left.push({ items: l, y: r.y });
        if (rr.length) right.push({ items: rr, y: r.y });
      }
      // Read the column that starts with the name (usually the wider one) first.
      for (const part of [left, right]) { for (const r of part) push(r.items, r.y); rows.push({ text: '', size: 0, colBreak: true }); }
    } else for (const r of lines) push(r.items, r.y);
    out.push(...rows);
  }
  // pdf.js does not say which fonts are bold reliably: treat clearly bigger text as headings instead.
  return out;
}

async function docxLines(file) {
  const mammoth = (await import('mammoth/mammoth.browser.min.js')).default;
  const html = (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value;
  const box = document.createElement('div');
  box.innerHTML = html;
  const out = [];
  for (const el of box.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td')) {
    if (el.tagName === 'TD' && el.querySelector('p')) continue;
    const text = clean(el.textContent);
    if (!text) continue;
    const head = /^H\d/.test(el.tagName);
    const strong = el.querySelector('strong, b') && clean(el.querySelector('strong, b').textContent) === text;
    out.push({ text: el.tagName === 'LI' ? '• ' + text : text, size: head ? 14 - +el.tagName[1] + 6 : 10, bold: head || !!strong });
  }
  return out;
}

async function imageLines(file, onStatus) {
  const { findText } = await import('../../lib/imagetext.js');
  const { readPicture } = await import('../../lib/imgio.js');
  const c = (await readPicture(file)).frames[0].canvas;
  const lines = await findText(c, 'eng', onStatus);
  // Sidebars: read the left part, then the right, when a clear gap splits the lines.
  const W = c.width;
  const xs = lines.map((l) => l.bbox.x0 / W);
  const right = xs.filter((x) => x > 0.33).length, left = xs.filter((x) => x < 0.3).length;
  let split = null;
  if (right > 4 && left > 4 && lines.every((l) => !(l.bbox.x0 < W * 0.28 && l.bbox.x1 > W * 0.42) || l.size > 22)) split = W * 0.31;
  const conv = (l) => ({ text: clean(l.text), size: l.size || 10, bold: !!l.bold, y: l.bbox.y0 });
  if (split) return [...lines.filter((l) => l.bbox.x0 < split).map(conv), { text: '', size: 0, colBreak: true }, ...lines.filter((l) => l.bbox.x0 >= split).map(conv)];
  return lines.map(conv);
}

export async function resumeLines(file, onStatus = () => {}) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') { onStatus('Reading the PDF…'); return { lines: await pdfLines(file), from: 'pdf' }; }
  if (n.endsWith('.docx')) { onStatus('Reading the Word file…'); return { lines: await docxLines(file), from: 'docx' }; }
  if (n.endsWith('.txt')) return { lines: (await file.text()).split(/\r?\n/).map((t) => ({ text: clean(t), size: 10 })), from: 'txt' };
  onStatus('Reading the text in the picture…');
  return { lines: await imageLines(file, onStatus), from: 'image' };
}

// ---------- sorting text into sections ----------
export function parseLines(lines) {
  lines = lines.filter((l) => l.text != null);
  const sizes = lines.filter((l) => l.text).map((l) => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  const basics = { name: '', title: '', email: '', phone: '', location: '', links: '', photo: null };
  const links = [];

  // Contact details can be anywhere (often in a sidebar); take them out first.
  const rest = [];
  const URLISH = /^(https?:\/\/)?(www\.)?[a-z0-9][\w-]*(\.[a-z][\w-]*)+(\/\S*)?$/i;
  const PLACE = /^(?:address\s*[:-]?\s*)?([A-Z][A-Za-z .-]+,\s*[A-Z][A-Za-z .-]+(?:,\s*[A-Z][A-Za-z .-]+)?)(\s*[-–]?\s*\d{6})?$/;
  let inSec = null; // the section this line is in (links inside jobs and projects stay there)
  for (const l of lines) {
    let t = l.text;
    if (!t) { rest.push(l); continue; }
    const hd = t.length < 42 && headingOf(t);
    if (hd) inSec = hd;
    const profileLink = !inSec || ['contact', 'personal', 'summary'].includes(inSec);
    // A line of contact details: "email | phone | City, Country | link"
    const parts = t.split(/\s*[|•·]\s*|\s{3,}/).map(clean).filter(Boolean);
    if (parts.length >= 2 && parts.some((p) => EMAIL.test(p) || (PHONE.test(p) && p.replace(/\D/g, '').length >= 8 && !RANGE.test(p)))) {
      const left = [];
      for (const p0 of parts) {
        const p = p0.replace(/^(e-?mail|phone|mobile|mob|tel|linkedin|github|portfolio|website|address)\s*[:.]?\s*/i, '');
        if (EMAIL.test(p) && !basics.email) basics.email = p.match(EMAIL)[0];
        else if (PHONE.test(p) && p.replace(/\D/g, '').length >= 8 && !RANGE.test(p) && !basics.phone) basics.phone = clean(p.match(PHONE)[1]);
        else if (URLISH.test(p) && !/^\d/.test(p)) links.push(p.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        else if (PLACE.test(p) && !basics.location) basics.location = clean(p.replace(/^address\s*[:-]?\s*/i, ''));
        else left.push(p0);
      }
      if (!left.length) continue;
      t = left.join(' | ');
    }
    // One detail per line, as in a "Contact" box.
    if (inSec === 'contact' || inSec === 'personal') {
      const p = t.replace(/^(website|portfolio|address|location|city)\s*[:.]?\s*/i, '');
      if (inSec === 'contact' && URLISH.test(p) && !/^\d/.test(p) && !EMAIL.test(p)) { links.push(p.replace(/^https?:\/\//, '').replace(/\/$/, '')); continue; }
      if (PLACE.test(p) && !basics.location && p.length < 50) { basics.location = clean(p); continue; }
    }
    const e = t.match(EMAIL); if (e && !basics.email) { basics.email = e[0]; t = t.replace(e[0], ' '); }
    const lk = t.match(LINK); if (lk && !EMAIL.test(lk[0]) && /\/|linkedin|github|behance|dribbble|portfolio|www\./i.test(lk[0]) && (profileLink || /linkedin\.com\/in\//i.test(lk[0]))) { links.push(lk[0].replace(/^https?:\/\//, '').replace(/\/$/, '')); t = t.replace(lk[0], ' '); }
    const ph = t.match(PHONE); if (ph && !basics.phone && ph[1].replace(/\D/g, '').length >= 8 && !RANGE.test(ph[1])) { basics.phone = clean(ph[1]); t = t.replace(ph[1], ' '); }
    t = clean(t.replace(/\b(e-?mail|phone|mobile|mob|tel|linkedin|github|portfolio)\s*:\s*/gi, ' ').replace(/^[|,•·\s-]+|[|,•·\s-]+$/g, '').replace(/\s*[|•·]\s*[|•·]\s*/g, ' | '));
    if (t !== l.text && !t.replace(/[|,•·\s-]/g, '')) continue;
    rest.push({ ...l, text: t, stripped: t !== l.text });
  }
  basics.links = links.filter((v, i, a) => a.indexOf(v) === i).join('\n');

  // Name: the biggest text near the top that is not a heading.
  const top = rest.filter((l) => l.text).slice(0, 25);
  const cand = top.filter((l) => !headingOf(l.text) && !/^(contact|resume|curriculum|cv|bio|page)/i.test(l.text) && /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l.text) && l.text.split(' ').length <= 5);
  const nameLine = cand.sort((a, b) => b.size - a.size)[0];
  if (nameLine) {
    basics.name = nameLine.text.split(' ').map((w) => (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
    nameLine.used = true;
    const i = rest.indexOf(nameLine), next = rest.slice(i + 1).find((l) => l.text);
    if (next && !headingOf(next.text) && next.text.length < 60 && !RANGE.test(next.text) && !/[.]$/.test(next.text) && next.text.split(' ').length <= 8 && !/,\s*\w+\s*,/.test(next.text)) { basics.title = next.text; next.used = true; }
  }
  // City: a short "Place, Region" line in the header.
  const firstHead = rest.findIndex((l) => l.text && headingOf(l.text));
  for (const l of rest.slice(0, firstHead < 0 ? 8 : Math.min(firstHead, 14))) {
    if (l.used || !l.text || headingOf(l.text)) continue;
    const m = l.text.match(/^(?:address\s*[:-]?\s*)?([A-Z][A-Za-z .-]+,\s*[A-Z][A-Za-z .-]+(?:,\s*[A-Z][A-Za-z .-]+)?)(\s*[-–]?\s*\d{6})?$/);
    if (m && m[1].length < 50 && (l.stripped || m[1].split(',').length >= 2) && !basics.location) { basics.location = clean(m[1] + (m[2] || '')); l.used = true; }
  }

  // Split into sections by headings.
  const sections = [];
  let cur = { type: 'summary', title: '', lines: [], implicit: true };
  const isHeadingLike = (l) => {
    const t = l.text;
    if (!t || t.length > 40 || /[.,;]$/.test(t) || /\d/.test(t) || /:\s*\S/.test(t) || BULLET.test(t)) return false;
    const known = headingOf(t);
    if (known) return known;
    // An unknown heading: short, and larger, or bold capitals, or capitals a little larger than the text.
    const caps = t === t.toUpperCase() && /[A-Z]{3}/.test(t);
    if ((l.size > body * 1.15 || (caps && (l.bold || l.size > body * 1.04))) && t.split(' ').length <= 4 && !RANGE.test(t)) return 'custom';
    return false;
  };
  for (const l of rest) {
    if (l.used) continue;
    if (!l.text) continue;
    const ht = isHeadingLike(l);
    if (ht) { if (cur.lines.length || !cur.implicit) sections.push(cur); cur = { type: ht, title: clean(l.text.replace(/[:|]+$/, '')), lines: [] }; continue; }
    cur.lines.push(l);
  }
  if (cur.lines.length) sections.push(cur);

  // Merge sections of the same known type (e.g. "Skills" in a sidebar and "Technical skills").
  const merged = [];
  for (const s of sections) {
    const same = s.type !== 'custom' && merged.find((m) => m.type === s.type && !['custom'].includes(m.type));
    if (same) same.lines.push(...s.lines); else merged.push(s);
  }

  const out = [];
  for (const s of merged) {
    if (!s.lines.length || s.type === 'contact') continue;
    const def = SECTION_TYPES[s.type] || SECTION_TYPES.custom;
    const title = s.implicit ? 'Summary' : headingTitle(s.title) || titleCase(s.title) || def.title;
    if (s.type === 'custom') {
      const kind = s.lines.some((l) => RANGE.test(l.text)) ? 'entries' : s.lines.every((l) => l.text.length < 40) && s.lines.length > 2 ? 'list' : 'list';
      out.push(kind === 'entries' ? newSection('custom', { kind, title, items: entries(s.lines, body) }) : newSection('custom', { kind, title, text: s.lines.map((l) => l.text.replace(BULLET, '')).join('\n') }));
    } else if (def.kind === 'entries') out.push(newSection(s.type, { title, items: entries(s.lines, body, s.type) }));
    else if (def.kind === 'tags') out.push(newSection(s.type, { title, text: tagsFrom(s.lines) }));
    else if (def.kind === 'text') out.push(newSection(s.type, { title, text: s.lines.map((l) => l.text.replace(BULLET, '')).join(' ').replace(/\s+/g, ' ').trim() }));
    else out.push(newSection(s.type, { title, text: listFrom(s.lines) }));
  }
  // Short sidebars sometimes leave a few loose words in the summary.
  const sum = out.find((s) => s.type === 'summary');
  if (sum && sum.text.length < 25) out.splice(out.indexOf(sum), 1);
  // Two-column pages were read column by column: put the main sections first, in the usual order.
  if (lines.some((l) => l.colBreak)) {
    const RANK = { summary: 0, experience: 1, internships: 2, projects: 3, education: 4, volunteer: 5 };
    const rank = (s) => RANK[s.type] ?? 10;
    out.sort((a, b) => rank(a) - rank(b));
  }
  return normalize({ id: uid(), name: (basics.name || 'Imported') + ' – imported', basics, sections: out, design: { ...DEFAULT_DESIGN } });
}

const titleCase = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()).replace(/\b(And|Of|In|&)\b/g, (m) => m.toLowerCase()) : t);
function tagsFrom(lines) {
  const parts = [];
  for (const l of lines) {
    const t = l.text.replace(BULLET, '').replace(/^[^:]{2,30}:\s*/, (m) => (lines.length > 1 ? '' : m));
    parts.push(...t.split(/\s*[,|•·;]\s*|\s{3,}/).map(clean).filter((x) => x && x.length < 60));
  }
  return [...new Set(parts)].join(', ');
}
function listFrom(lines) {
  const out = [];
  const YEAR = /\b(19|20)\d{2}\b/;
  const withYears = lines.filter((l) => YEAR.test(l.text)).length;
  for (const l of lines) {
    const b = BULLET.test(l.text), x = l.text.replace(BULLET, '');
    const prev = out[out.length - 1];
    // A wrapped line: starts in lower case, follows a line ending in "," or "&", or finishes an item that ends
    // with a year when the other items do ("Google UX Design" + "Certificate, 2021").
    const wrapped = prev != null && !b && (/^[a-z(&]/.test(x) || /[,&-]$/.test(prev) ||
      (withYears >= 2 && !YEAR.test(prev) && YEAR.test(x) && prev.length < 32 && x.length < 32));
    if (wrapped) out[out.length - 1] = prev + ' ' + x; else out.push(x);
  }
  return out.join('\n');
}

/** Jobs, degrees and projects: a new entry starts at a line with dates or a bold/short title line after points. */
function entries(lines, body, type) {
  const items = [];
  let e = null, lastWasBullet = false;
  const start = () => { e = { head: [], bullets: [], dates: '' }; items.push(e); lastWasBullet = false; };
  // Most entries have dates: then a new entry starts at a line with dates (or a short title line just above one).
  const dated = lines.some((l) => RANGE.test(l.text) && !BULLET.test(l.text));
  lines.forEach((l, i) => {
    const t = l.text;
    const isBullet = BULLET.test(t);
    const m = t.match(RANGE);
    // Titles are short and mostly capitalised ("Senior Product Designer"); points are sentences.
    const big = t.split(/\s+/).filter((w) => w.length > 3);
    const titleCased = !big.length || big.filter((w) => /^[A-Z0-9]/.test(w)).length / big.length >= 0.6;
    const shortTitle = !isBullet && t.length < 45 && !/[.]$/.test(t) && !/^[a-z]/.test(t) && titleCased;
    const nextDated = lines[i + 1] && !BULLET.test(lines[i + 1].text) && RANGE.test(lines[i + 1].text) && lines[i + 1].text.length < 70;
    const busy = e && (e.dates || e.bullets.length);
    if (!e) start();
    else if (!isBullet && busy && (dated ? (m || (shortTitle && nextDated && !RANGE.test(t))) : (shortTitle && (l.bold || lastWasBullet)))) start();
    if (isBullet) { e.bullets.push(t.replace(BULLET, '')); lastWasBullet = true; return; }
    if (m && !e.dates) {
      e.dates = m[0];
      const restTxt = clean(t.replace(m[0], '').replace(/[|,(\s-–]+$|^[|,)\s-–]+/g, '').replace(/\(\s*\)/, ''));
      if (restTxt) e.head.push(restTxt);
      lastWasBullet = false;
      return;
    }
    // Text after points without a bullet sign: a wrapped point, or another point.
    if (e.bullets.length && (lastWasBullet || t.length > 60)) {
      if (/^[a-z(]/.test(t) || !/[.]$/.test(e.bullets[e.bullets.length - 1]) && t.length < 50 && /^[a-z]/.test(t)) e.bullets[e.bullets.length - 1] += ' ' + t;
      else e.bullets.push(t);
      return;
    }
    // Points drawn with a shape (not a • character) look like plain lines: long lines after the title are points.
    if (e.head.length >= 3 || t.length > 70 || (e.head.length >= 2 && t.length > 40)) { e.bullets.push(t); lastWasBullet = true; } else e.head.push(t);
  });
  return items.filter((x) => x.head.length || x.bullets.length).map((x) => {
    const [from, to] = splitRange(x.dates);
    const head = x.head.flatMap((h) => h.split(/\s+[|]\s+|\s+[–—]\s+|\s+-\s+|\s*@\s*|,\s+(?=[A-Z][a-z]+\s*$)/).map(clean)).filter(Boolean);
    let [title = '', subtitle = '', ...more] = head;
    // Education usually starts with the degree; jobs sometimes start with the company.
    let place = '', note = '';
    const extra = [];
    for (const m of more) {
      if (!x.link && /^(https?:\/\/)?(www\.)?[a-z0-9][\w-]*(\.[a-z][\w-]*)+(\/\S*)?$/i.test(m)) x.link = m;
      else if (m.length < 40 && /(cgpa|gpa|%|percentage|marks|grade|score)/i.test(m)) note = m; else if (!place && m.length < 30) place = m; else extra.push(m);
    }
    x.bullets.unshift(...extra);
    if (type === 'education') { const sc = [title, subtitle].find((v) => /(cgpa|gpa|%|percentage)/i.test(v)); if (sc) { note = sc; if (subtitle === sc) subtitle = ''; } }
    return newEntry({ title, subtitle, place, note, from, to, link: x.link || '', bullets: x.bullets.join('\n') });
  });
}
function splitRange(r) {
  if (!r) return ['', ''];
  const p = r.split(/\s*(?:-|–|—|\bto\b|\btill\b|\buntil\b)\s*/i).map(clean).filter(Boolean);
  if (p.length === 1) return ['', p[0]];
  const cap = (s) => s.replace(/^(present|current|now|till date|ongoing|today)$/i, 'Present').replace(/^\w/, (c) => c.toUpperCase());
  return [cap(p[0]), cap(p[1])];
}

// ---------- optional tidy-up with the browser's built-in AI ----------
const AI_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }, title: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, location: { type: 'string' },
    links: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
    experience: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, company: { type: 'string' }, place: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } } },
    education: { type: 'array', items: { type: 'object', properties: { degree: { type: 'string' }, school: { type: 'string' }, place: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, score: { type: 'string' } } } },
    projects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, tools: { type: 'string' }, link: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } } } },
    skills: { type: 'array', items: { type: 'string' } }, languages: { type: 'array', items: { type: 'string' } },
    certifications: { type: 'array', items: { type: 'string' } }, awards: { type: 'array', items: { type: 'string' } }
  }
};

/** Asks the browser's own model to sort the text. Returns a resume or null (no model, or an odd answer). */
export async function parseWithAI(lines, onStatus = () => {}) {
  const { builtinAI } = await import('../../lib/ai.js');
  const s = await builtinAI('You turn resume text into JSON. Copy the person\'s words exactly; do not invent anything. Use empty strings for missing values.', { allowDownload: true, onStatus });
  if (!s) return null;
  try {
    onStatus('The browser\'s AI is sorting your resume…');
    const text = lines.map((l) => l.text).filter(Boolean).join('\n').slice(0, 9000);
    const ans = await s.prompt('Resume text:\n' + text, { responseConstraint: AI_SCHEMA });
    const j = JSON.parse(ans);
    const S = [];
    if (j.summary) S.push(newSection('summary', { text: j.summary }));
    if (j.experience?.length) S.push(newSection('experience', { items: j.experience.map((x) => newEntry({ title: x.title, subtitle: x.company, place: x.place, from: x.from, to: x.to, bullets: (x.points || []).join('\n') })) }));
    if (j.projects?.length) S.push(newSection('projects', { items: j.projects.map((x) => newEntry({ title: x.name, subtitle: x.tools, link: x.link, bullets: (x.points || []).join('\n') })) }));
    if (j.education?.length) S.push(newSection('education', { items: j.education.map((x) => newEntry({ title: x.degree, subtitle: x.school, place: x.place, from: x.from, to: x.to, note: x.score })) }));
    if (j.skills?.length) S.push(newSection('skills', { text: j.skills.join(', ') }));
    if (j.languages?.length) S.push(newSection('languages', { text: j.languages.join(', ') }));
    if (j.certifications?.length) S.push(newSection('certs', { text: j.certifications.join('\n') }));
    if (j.awards?.length) S.push(newSection('awards', { text: j.awards.join('\n') }));
    if (!S.length) return null;
    return normalize({ id: uid(), name: (j.name || 'Imported') + ' – imported', basics: { name: j.name, title: j.title, email: j.email, phone: j.phone, location: j.location, links: (j.links || []).join('\n') }, sections: S, design: { ...DEFAULT_DESIGN } });
  } catch (e) { console.warn('AI import failed', e); return null; } finally { s.destroy?.(); }
}

/** A photo inside a PDF resume (the first picture that looks like a portrait), as a data URL. */
export async function pdfPhoto(file) {
  try {
    const { renderPage } = await import('../../lib/core.js');
    const doc = await openPdfjs(await readBytes(file));
    const page = await doc.getPage(1);
    const canvas = await renderPage(page, 2);
    const { findFaces } = await import('../imagestudio.js');
    const faces = await findFaces(canvas);
    const f = faces.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!f || f.w < canvas.width * 0.05) return null;
    return cropFace(canvas, f);
  } catch { return null; }
}
export function cropFace(canvas, f) {
  const side = Math.min(f.w * 2.1, canvas.width, canvas.height);
  const cx = f.x + f.w / 2, cy = f.y + f.h * 0.55;
  const x = Math.max(0, Math.min(canvas.width - side, cx - side / 2)), y = Math.max(0, Math.min(canvas.height - side, cy - side / 2));
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(400, Math.round(side));
  c.getContext('2d').drawImage(canvas, x, y, side, side, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
