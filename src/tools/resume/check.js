// The resume checker: common problems recruiters and applicant tracking systems notice, a score,
// spelling slips, and how well the resume matches a pasted job description. All rules, no AI needed.
import { splitLines, splitTags, sectionHasContent, contactsOf } from './model.js';

const MISSPELT = {
  recieve: 'receive', recieved: 'received', acheive: 'achieve', acheived: 'achieved', managment: 'management', responsibilty: 'responsibility',
  responsibilites: 'responsibilities', experiance: 'experience', sucessful: 'successful', succesful: 'successful', successfull: 'successful',
  comunication: 'communication', communcation: 'communication', enviroment: 'environment', developement: 'development', knowlege: 'knowledge',
  seperate: 'separate', occured: 'occurred', definately: 'definitely', untill: 'until', begining: 'beginning', beleive: 'believe', calender: 'calendar',
  independant: 'independent', liason: 'liaison', maintainance: 'maintenance', maintenence: 'maintenance', oppurtunity: 'opportunity', oportunity: 'opportunity',
  profesional: 'professional', proffesional: 'professional', recomend: 'recommend', relevent: 'relevant', tommorow: 'tomorrow', wich: 'which',
  analysed: null, accomodate: 'accommodate', adress: 'address', buisness: 'business', collegue: 'colleague', commited: 'committed', critisism: 'criticism',
  excellant: 'excellent', existance: 'existence', goverment: 'government', guarentee: 'guarantee', immediatly: 'immediately', langauge: 'language',
  neccessary: 'necessary', necesary: 'necessary', noticable: 'noticeable', persue: 'pursue', posession: 'possession', prefered: 'preferred',
  priviledge: 'privilege', recieving: 'receiving', refered: 'referred', reponsible: 'responsible', resposible: 'responsible', strenght: 'strength',
  succes: 'success', techincal: 'technical', tecnical: 'technical', thier: 'their', truely: 'truly', writting: 'writing', excel: null, javascipt: 'JavaScript',
  pyhton: 'Python', mangement: 'management', analyis: 'analysis', anaylsis: 'analysis', costumer: 'customer', custmer: 'customer', aquire: 'acquire'
};
const WEAK = [[/\bresponsible for\b/i, 'Start with what you did (“Led”, “Built”, “Managed”) instead of “responsible for”.'],
  [/\b(worked on|helped( with)?|assisted( with)?|involved in|duties included|tasked with)\b/i, 'Use a strong action word (“Built”, “Improved”, “Delivered”) instead of “$1”.']];
const STOP = new Set(('a an the and or of to in on for with at by from as is are be been was were will can our your their you we they this that these those it its ' +
  'have has had not but if into over under about across within more most such other than also any all each per via etc using use used able strong ' +
  'experience years year work working role job team teams company candidate candidates required requirements preferred plus including include ' +
  'skills skill knowledge ability good excellent new well must should may who what which when where how responsibilities responsible looking ' +
  'join we\'re you\'ll day days time based environment opportunity related relevant least hiring own run daily ensure drive help make get ' +
  'seeking ideal position apply salary benefits remote hybrid office full-time part-time immediate across like want need needs big').split(' '));

const words = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z+#.\-]*[a-z+#]|[a-z]/g) || []);

/** Every piece of text in the resume with where it came from (for pointing at problems). */
function texts(r) {
  const out = [];
  for (const s of r.sections) {
    if (s.hidden) continue;
    if (s.kind === 'entries') s.items.forEach((e) => { for (const k of ['title', 'subtitle', 'note', 'bullets']) if (e[k]) out.push({ where: `${s.title}: ${e.title || e.subtitle || 'entry'}`, text: e[k], bullets: k === 'bullets', sec: s, entry: e }); });
    else if (s.text) out.push({ where: s.title, text: s.text, bullets: s.kind === 'list', sec: s });
  }
  return out;
}

export function checkResume(r, pages = 1) {
  const b = r.basics, items = [];
  const add = (level, text, where) => items.push({ level, text, where });
  const by = (type) => r.sections.find((s) => s.type === type && sectionHasContent(s));
  let score = 100;
  const lose = (n) => { score -= n; };

  if (!b.name) { add('bad', 'Add your name.'); lose(15); }
  if (!b.email) { add('bad', 'Add an email address.'); lose(10); }
  else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.email.trim())) { add('bad', 'The email address looks wrong.'); lose(8); }
  else if (/(cute|sexy|baby|angel|king|queen|rockstar|420|69)/i.test(b.email)) { add('warn', 'Use a simple, professional email address (your name is best).'); lose(4); }
  if (!b.phone) { add('warn', 'Add a phone number.'); lose(6); }
  else if ((b.phone.replace(/\D/g, '')).length < 8) { add('warn', 'The phone number looks too short.'); lose(4); }
  if (!b.title) { add('warn', 'Add a headline under your name, such as the job you want.'); lose(3); }
  if (!b.location) { add('tip', 'Adding your city helps recruiters searching by location.'); lose(1); }

  const sum = by('summary');
  if (!sum) { add('warn', 'Add a short summary at the top (2–4 lines).'); lose(6); }
  else {
    const n = words(sum.text).length;
    if (n < 15) { add('warn', 'Your summary is very short. Say what you do, your strengths and what you want next.', sum.title); lose(3); }
    if (n > 90) { add('warn', `Your summary has ${n} words. Keep it under about 80.`, sum.title); lose(3); }
  }
  const exp = by('experience') || by('internships');
  const proj = by('projects');
  if (!exp && !proj) { add('bad', 'Add your work experience (or internships or projects if you are a fresher).'); lose(12); }
  if (!by('education')) { add('warn', 'Add your education.'); lose(6); }
  const sk = by('skills');
  if (!sk) { add('warn', 'Add a skills section; recruiters and ATS search for skills.'); lose(6); }
  else if (splitTags(sk.text).length < 5) { add('tip', 'List at least 5–6 skills.', sk.title); lose(2); }
  else if (splitTags(sk.text).length > 25) { add('tip', 'You have a very long skills list. Keep the 15–20 most relevant.', sk.title); lose(1); }

  // Entries: dates, bullets, numbers, wording.
  let bulletCount = 0, withNumbers = 0, pronouns = 0;
  for (const s of r.sections) {
    if (s.hidden || s.kind !== 'entries') continue;
    for (const e of s.items) {
      if (!(e.title || e.subtitle)) continue;
      const where = `${s.title}: ${e.title || e.subtitle}`;
      if (['experience', 'internships', 'education', 'volunteer'].includes(s.type) && !e.from && !e.to) { add('warn', 'Add dates.', where); lose(2); }
      const bl = splitLines(e.bullets);
      if (['experience', 'internships'].includes(s.type) && !bl.length) { add('warn', 'Add 2–5 points about what you did and achieved.', where); lose(3); }
      if (bl.length > 7) { add('tip', `${bl.length} points is a lot; keep the 4–6 strongest.`, where); lose(1); }
      for (const p of bl) {
        bulletCount++;
        if (/\d/.test(p)) withNumbers++;
        const n = words(p).length;
        if (n > 32) { add('tip', `A point has ${n} words. Shorter points (under ~25 words) are easier to read.`, where); lose(1); }
        if (/^(i|my|me)\b/i.test(p) || /\b(I|my)\b/.test(p)) pronouns++;
      }
    }
  }
  if (bulletCount >= 4 && withNumbers / bulletCount < 0.25) { add('warn', 'Few of your points have numbers. Results like “cut costs by 20%” or “served 300 customers a day” stand out.'); lose(5); }
  if (pronouns) { add('tip', 'Leave out “I” and “my” in your points; start with the action instead.'); lose(2); }

  for (const t of texts(r)) {
    for (const [re, msg] of WEAK) { const m = t.text.match(re); if (m) { add('tip', msg.replace('$1', m[1] || m[0]), t.where); lose(1); } }
    const rep = t.text.match(/\b(\w+)\s+\1\b/i);
    if (rep && !/^\d+$/.test(rep[1])) { add('warn', `“${rep[1]} ${rep[1]}” is written twice.`, t.where); lose(1); }
  }
  for (const m of spelling(r)) { add('warn', `Spelling: “${m.word}” → “${m.fix}”.`, m.where); lose(2); }

  if (pages > 2) { add('warn', `Your resume is ${pages} pages. Most recruiters prefer one page, or two for long careers.`); lose(5); }
  else if (pages === 2 && !(exp && exp.items.length > 3)) { add('tip', 'Try “Fit to one page” in Design if this resume can fit on one page.'); lose(1); }
  const contacts = contactsOf(b).join(' ');
  if (!/linkedin\.com/i.test(contacts)) add('tip', 'Adding your LinkedIn link is common and helps recruiters.');
  if (!items.some((i) => i.level !== 'tip')) add('good', 'No problems found. Nice work!');
  return { score: Math.max(0, Math.min(100, Math.round(score))), items };
}

export function spelling(r) {
  const out = [], seen = new Set();
  const all = [{ where: 'Your details', text: [r.basics.title].join(' ') }, ...texts(r)];
  for (const t of all) for (const w of words(t.text)) {
    const fix = MISSPELT[w];
    if (fix && !seen.has(w)) { seen.add(w); out.push({ word: w, fix, where: t.where }); }
  }
  return out;
}

/** Keywords from a job description and whether the resume uses them. */
export function jobMatch(r, jd) {
  const resumeText = [r.basics.title, ...texts(r).map((t) => t.text)].join(' ').toLowerCase();
  const counts = new Map();
  const jw = words(jd).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w));
  for (const w of jw) counts.set(w, (counts.get(w) || 0) + 1);
  // Two-word phrases that appear more than once ("project management", "machine learning").
  for (let i = 0; i < jw.length - 1; i++) { const p = jw[i] + ' ' + jw[i + 1]; if (String(jd).toLowerCase().includes(p)) counts.set(p, (counts.get(p) || 0) + 0.6); }
  const keys = [...counts].filter(([k, n]) => n >= (k.includes(' ') ? 1.2 : 1)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k]) => k);
  const has = (k) => new RegExp('(^|[^a-z])' + k.replace(/[.+#]/g, '\\$&') + '([^a-z]|$)').test(resumeText);
  const found = keys.filter(has), missing = keys.filter((k) => !has(k));
  return { score: keys.length ? Math.round(found.length / keys.length * 100) : 0, found, missing };
}
