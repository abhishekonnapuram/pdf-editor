// The resume as data: sections the visitor can add, hide, rename and reorder; several saved resumes
// in this browser; undo / redo; and the original EditSupreme templates (their look is drawn in render.js).
import { store } from '../../lib/docpdf.js';

export const uid = () => Math.random().toString(36).slice(2, 10);

// Entry fields, in the order the form shows them.
export const ENTRY_FIELDS = ['title', 'subtitle', 'place', 'from', 'to', 'link', 'note', 'bullets'];
const ENTRY_LABELS = { title: 'Title', subtitle: 'Organisation', place: 'City', from: 'From', to: 'To', link: 'Link', note: 'Note', bullets: 'Details (one point per line)' };

/** kind: text (a paragraph), entries (jobs, degrees…), tags (comma separated), list (one item per line). */
export const SECTION_TYPES = {
  summary: { kind: 'text', title: 'Summary', ph: 'Two to four lines: what you do, your strengths and what you are looking for.' },
  experience: { kind: 'entries', title: 'Experience', f: { title: 'Job title', subtitle: 'Company', place: 'City', bullets: 'What you did (one point per line)' } },
  internships: { kind: 'entries', title: 'Internships', f: { title: 'Role', subtitle: 'Company', place: 'City', bullets: 'What you did (one point per line)' } },
  education: { kind: 'entries', title: 'Education', f: { title: 'Degree / class', subtitle: 'College / school', place: 'City', note: 'Marks / CGPA', bullets: 'Highlights (optional)' } },
  projects: { kind: 'entries', title: 'Projects', f: { title: 'Project name', subtitle: 'Your role or the tools used', link: 'Link', bullets: 'About it (one point per line)' } },
  volunteer: { kind: 'entries', title: 'Volunteering', f: { title: 'Role', subtitle: 'Organisation', place: 'City', bullets: 'What you did' } },
  skills: { kind: 'tags', title: 'Skills', ph: 'Excel, Python, Communication, Tally, Team leadership' },
  languages: { kind: 'tags', title: 'Languages', ph: 'English, Hindi, Telugu' },
  interests: { kind: 'tags', title: 'Interests', ph: 'Chess, Photography, Running' },
  certs: { kind: 'list', title: 'Certifications', ph: 'Google Data Analytics Certificate, 2024\nAWS Cloud Practitioner, 2023' },
  awards: { kind: 'list', title: 'Awards & achievements', ph: 'Best Employee of the Quarter, Q2 2024\nRank 12 in state Olympiad' },
  publications: { kind: 'list', title: 'Publications', ph: 'Title, journal or website, year' },
  references: { kind: 'list', title: 'References', ph: 'Name, role, company, phone or email\n(or: Available on request)' },
  personal: { kind: 'list', title: 'Personal details', ph: 'Date of birth: 12 March 2001\nNationality: Indian\nMarital status: Single' },
  declaration: { kind: 'text', title: 'Declaration', ph: 'I hereby declare that the above information is true to the best of my knowledge.' },
  custom: { kind: 'list', title: 'Custom section' }
};
export const KIND_NAMES = { text: 'Paragraph', entries: 'Entries (like jobs)', tags: 'Tags (like skills)', list: 'List (one per line)' };

export function fieldsOf(sec) {
  const f = SECTION_TYPES[sec.type]?.f;
  // Custom entry sections show every field with generic names.
  return ENTRY_FIELDS.filter((k) => !f || k in f || k === 'from' || k === 'to').map((k) => [k, f?.[k] || ENTRY_LABELS[k]]);
}

export const newEntry = (o = {}) => ({ id: uid(), title: '', subtitle: '', place: '', from: '', to: '', link: '', note: '', bullets: '', ...o });
export function newSection(type, o = {}) {
  const t = SECTION_TYPES[type] || SECTION_TYPES.custom;
  const kind = o.kind || t.kind;
  return { id: uid(), type, kind, title: t.title, hidden: false, column: 'auto', text: '', items: kind === 'entries' ? [newEntry()] : [], ...o };
}

/**
 * Original EditSupreme designs. layout: single | side-left | side-right | twocol; side: solid | tint | none;
 * header: center | left | split | band | block | side | main-name; heading: rule | caps | smallcaps | lines | box | bar | short | plain;
 * dates: right | gutter | timeline | below; tags: chips | inline | bullets.
 */
export const TEMPLATES = [
  { id: 'classic', name: 'Classic', layout: 'single', header: 'center', heading: 'rule', dates: 'right', tags: 'inline', accent: '#1f3a5f', font: 'Lato' },
  { id: 'modern', name: 'Modern', layout: 'side-left', side: 'solid', header: 'main-name', heading: 'rule', dates: 'right', tags: 'bullets', accent: '#24427a', font: 'Inter' },
  { id: 'executive', name: 'Executive', layout: 'single', header: 'band', heading: 'caps', dates: 'right', tags: 'inline', accent: '#173d3a', font: 'Montserrat' },
  { id: 'twocol', name: 'Two column', layout: 'twocol', side: 'none', header: 'left', heading: 'short', dates: 'below', tags: 'chips', accent: '#c2410c', font: 'DM Sans' },
  { id: 'timeline', name: 'Timeline', layout: 'single', header: 'left', heading: 'bar', dates: 'timeline', tags: 'chips', accent: '#0e7490', font: 'Poppins' },
  { id: 'creative', name: 'Creative', layout: 'side-left', side: 'tint', header: 'side', heading: 'plain', dates: 'right', tags: 'chips', accent: '#7c3aed', font: 'Nunito' },
  { id: 'minimal', name: 'Minimal', layout: 'single', header: 'left', heading: 'smallcaps', dates: 'right', tags: 'inline', accent: '#3f3f46', font: 'Work Sans' },
  { id: 'elegant', name: 'Elegant', layout: 'single', header: 'center', heading: 'lines', dates: 'right', tags: 'inline', accent: '#7a4b2a', font: 'Lora' },
  { id: 'bold', name: 'Bold', layout: 'single', header: 'block', heading: 'box', dates: 'right', tags: 'chips', accent: '#b91c1c', font: 'Raleway' },
  { id: 'sidebar-right', name: 'Sidebar right', layout: 'side-right', side: 'tint', header: 'left', heading: 'rule', dates: 'right', tags: 'chips', accent: '#15803d', font: 'Open Sans' },
  { id: 'compact', name: 'Compact', layout: 'single', header: 'split', heading: 'rule', dates: 'right', tags: 'inline', accent: '#1d4ed8', font: 'Roboto', size: 9.2, spacing: 0.85 },
  { id: 'ats', name: 'ATS plain', layout: 'single', header: 'left', heading: 'caps', dates: 'right', tags: 'inline', accent: '#111111', font: 'Arimo', photo: 'none', plain: true }
];
export const templateOf = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
// Sections that go in the narrow column of sidebar and two-column designs (unless moved by the visitor).
export const SIDE_TYPES = new Set(['skills', 'languages', 'interests', 'certs', 'awards', 'personal', 'references']);
export const RFONTS = ['Inter', 'Roboto', 'Lato', 'Open Sans', 'Poppins', 'Montserrat', 'Raleway', 'Nunito', 'Work Sans', 'DM Sans', 'PT Sans', 'Arimo',
  'Merriweather', 'Lora', 'PT Serif', 'Libre Baskerville', 'EB Garamond', 'Playfair Display', 'Roboto Slab', 'Bitter', 'Oswald'];
export const ACCENTS = ['#1f3a5f', '#24427a', '#1d4ed8', '#0e7490', '#173d3a', '#15803d', '#7c3aed', '#be185d', '#b91c1c', '#c2410c', '#7a4b2a', '#3f3f46', '#111111'];

export const DEFAULT_DESIGN = { template: 'classic', accent: '#1f3a5f', font: 'Lato', headFont: '', size: 10, spacing: 1, margin: 'normal', paper: 'a4', photo: 'circle', fit: false,
  fill: '', ink: '', scheme: '', pair: '' }; // fill: sidebar / header colour, ink: text colour ('' = automatic)

/** Switching template takes its colour, font and sizes, but keeps a colour scheme or font pair the visitor picked. */
export function applyTemplate(design, id) {
  const t = templateOf(id);
  const out = { ...design, template: t.id, accent: t.accent, fill: '', ink: '', scheme: '', font: t.font, headFont: '', pair: '', size: t.size || 10, spacing: t.spacing || 1, photo: t.photo || (design.photo === 'none' ? 'circle' : design.photo) };
  if (design.scheme) Object.assign(out, { accent: design.accent, fill: design.fill, ink: design.ink, scheme: design.scheme });
  if (design.pair) Object.assign(out, { font: design.font, headFont: design.headFont, pair: design.pair });
  return out;
}

export function blankResume(name = 'My resume') {
  return normalize({ id: uid(), name, basics: {}, sections: ['summary', 'experience', 'education', 'skills', 'languages', 'certs'].map((t) => newSection(t)), design: { ...DEFAULT_DESIGN } });
}

/** Fill in anything missing (old saves, imports). */
export function normalize(r) {
  r.id ||= uid();
  r.name ||= 'My resume';
  r.basics = { name: '', title: '', email: '', phone: '', location: '', links: '', photo: null, ...(r.basics || {}) };
  r.design = { ...DEFAULT_DESIGN, ...(r.design || {}) };
  r.sections = (r.sections || []).map((s) => {
    const n = { ...newSection(s.type || 'custom', { kind: s.kind }), ...s };
    if (n.kind === 'entries') n.items = (n.items || []).map((e) => newEntry(e));
    return n;
  });
  return r;
}

// ---------- text helpers ----------
export const splitTags = (t) => String(t || '').split(/[,\n•|;]/).map((s) => s.trim()).filter(Boolean);
export const splitLines = (t) => String(t || '').split('\n').map((s) => s.replace(/^\s*[-•*▪●◦–]\s*/, '').trim()).filter(Boolean);
export const dateRange = (e) => [e.from, e.to].map((s) => (s || '').trim()).filter(Boolean).join(' – ');
export const contactsOf = (b) => [b.email, b.phone, b.location, ...String(b.links || '').split('\n')].map((s) => (s || '').trim()).filter(Boolean);
export function sectionHasContent(s) {
  if (s.hidden) return false;
  if (s.kind === 'entries') return s.items.some((e) => e.title || e.subtitle || e.bullets);
  return !!String(s.text || '').trim();
}

// ---------- saved resumes (this browser only) ----------
export const listResumes = () => store.get('resumes', []);
export const loadResume = (id) => { const r = store.get('resume:' + id, null); return r ? normalize(r) : null; };
export function saveResume(r) {
  r.updated = Date.now();
  const ok = store.set('resume:' + r.id, r);
  const idx = listResumes().filter((x) => x.id !== r.id);
  idx.unshift({ id: r.id, name: r.name, updated: r.updated });
  store.set('resumes', idx);
  store.set('resume.current', r.id);
  return ok;
}
export function deleteResume(id) {
  store.del('resume:' + id);
  store.set('resumes', listResumes().filter((x) => x.id !== id));
}
export const currentId = () => store.get('resume.current', null);

/** The resume to open: the last one used, an older single-resume save (moved over), or a new one. */
export function openLast() {
  const id = currentId();
  const r = id && loadResume(id);
  if (r) return r;
  const first = listResumes()[0];
  if (first) { const f = loadResume(first.id); if (f) return f; }
  const old = store.get('resume', null);
  if (old && (old.name || old.jobs)) {
    const m = fromV1(old);
    saveResume(m);
    return m;
  }
  return null;
}

// The first resume builder saved one flat object.
function fromV1(o) {
  const r = blankResume(o.name ? o.name + ' – resume' : 'My resume');
  r.basics = { name: o.name || '', title: o.title || '', email: o.email || '', phone: o.phone || '', location: o.location || '', links: o.links || '', photo: o.photo || null };
  const by = (t) => r.sections.find((s) => s.type === t);
  by('summary').text = o.summary || '';
  by('experience').items = (o.jobs || []).map((j) => newEntry({ title: j.role, subtitle: j.company, place: j.place, from: j.from, to: j.to, bullets: j.points }));
  by('education').items = (o.edu || []).map((e) => newEntry({ title: e.degree, subtitle: e.school, to: e.year, note: e.score }));
  by('skills').text = o.skills || '';
  by('languages').text = o.languages || '';
  by('certs').text = o.certs || '';
  if ((o.projects || []).length) r.sections.splice(3, 0, newSection('projects', { items: o.projects.map((p) => newEntry({ title: p.name, link: p.link, bullets: p.desc })) }));
  const t = { classic: 'classic', modern: 'modern', compact: 'compact' }[o.template] || 'classic';
  r.design = { ...applyTemplate(r.design, t), accent: o.accent || templateOf(t).accent, font: o.font || templateOf(t).font };
  return normalize(r);
}

/** Undo / redo over JSON snapshots. */
export function history(limit = 80) {
  let past = [], future = [], last = null;
  return {
    reset(snap) { past = []; future = []; last = snap; },
    push(snap) { if (snap === last) return; if (last != null) past.push(last); if (past.length > limit) past.shift(); future = []; last = snap; },
    undo() { if (!past.length) return null; future.push(last); last = past.pop(); return last; },
    redo() { if (!future.length) return null; past.push(last); last = future.pop(); return last; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; }
  };
}

/** Example content for the template pictures and for trying a design. */
export function sampleResume() {
  const S = (type, o) => newSection(type, o);
  return normalize({
    id: 'sample', name: 'Sample',
    basics: { name: 'Ananya Rao', title: 'Product Designer', email: 'ananya.rao@example.com', phone: '+91 98765 43210', location: 'Bengaluru, India', links: 'linkedin.com/in/ananyarao' },
    sections: [
      S('summary', { text: 'Product designer with 5 years of experience turning research into simple, accessible apps used by millions. Comfortable leading design from first sketch to launch.' }),
      S('experience', { items: [
        newEntry({ title: 'Senior Product Designer', subtitle: 'Brightpath Technologies', place: 'Bengaluru', from: 'Mar 2022', to: 'Present', bullets: 'Led the redesign of the payments app, raising completed payments by 18%\nBuilt a design system of 120 components used by 6 teams\nMentored three junior designers' }),
        newEntry({ title: 'Product Designer', subtitle: 'Nimbus Labs', place: 'Hyderabad', from: 'Jul 2019', to: 'Feb 2022', bullets: 'Designed onboarding that cut sign-up time in half\nRan weekly usability tests with customers' })] }),
      S('education', { items: [newEntry({ title: 'B.Des, Interaction Design', subtitle: 'National Institute of Design', from: '2015', to: '2019', note: 'CGPA 8.6' })] }),
      S('skills', { text: 'Figma, User research, Prototyping, Design systems, Accessibility, HTML & CSS' }),
      S('languages', { text: 'English, Hindi, Kannada' }),
      S('certs', { text: 'Google UX Design Certificate, 2021' })
    ],
    design: { ...DEFAULT_DESIGN }
  });
}
