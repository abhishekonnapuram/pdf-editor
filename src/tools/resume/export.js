// Word (.docx) and plain-text copies of the resume. Both are one column in the visitor's section order,
// which is what applicant tracking systems (ATS) read best.
import { splitTags, splitLines, dateRange, contactsOf, sectionHasContent, templateOf } from './model.js';

export async function resumeDocx(r) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ImageRun } = await import('docx');
  const d = r.design, b = r.basics, T = templateOf(d.template);
  const accent = T.plain ? '111111' : (d.accent || '#1f3a5f').replace('#', '');
  const font = d.font || 'Calibri', head = d.headFont || font;
  const sz = (pt) => Math.round(pt * 2 * ((+d.size || 10) / 10));
  const P = (runs, o = {}) => new Paragraph({ children: runs, ...o });
  const R = (text, o = {}) => new TextRun({ text, font, size: sz(10), ...o });
  const kids = [];
  const center = ['center'].includes(T.header);
  const align = center ? AlignmentType.CENTER : AlignmentType.LEFT;
  if (b.photo && d.photo !== 'none' && !T.plain) {
    try {
      const data = Uint8Array.from(atob(b.photo.split(',')[1]), (c) => c.charCodeAt(0));
      kids.push(P([new ImageRun({ data, type: /^data:image\/jpe?g/.test(b.photo) ? 'jpg' : 'png', transformation: { width: 90, height: 90 } })], { alignment: align }));
    } catch { /* skip a broken picture */ }
  }
  kids.push(P([R(b.name || 'Your Name', { bold: true, size: sz(22), font: head })], { alignment: align }));
  if (b.title) kids.push(P([R(b.title, { size: sz(12), color: accent })], { alignment: align }));
  const contacts = contactsOf(b);
  if (contacts.length) kids.push(P([R(contacts.join('   |   '), { size: sz(9), color: '555555' })], { alignment: align, spacing: { after: 120 } }));
  const heading = (t) => kids.push(P([R(t.toUpperCase(), { bold: true, size: sz(11), color: accent, font: head })],
    { spacing: { before: 240, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 2 } } }));
  const lr = (left, right) => kids.push(P([R(left, { bold: true }), ...(right ? [R('\t' + right, { size: sz(9.5), color: '666666' })] : [])],
    { tabStops: [{ type: TabStopType.RIGHT, position: 9600 }], spacing: { before: 100 } }));
  const bullets = (items) => items.forEach((p) => kids.push(P([R(p)], { bullet: { level: 0 } })));
  for (const s of r.sections) {
    if (!sectionHasContent(s)) continue;
    heading(s.title || '');
    if (s.kind === 'text') kids.push(P([R(s.text.trim())]));
    else if (s.kind === 'tags') kids.push(P([R(splitTags(s.text).join('  ·  '))]));
    else if (s.kind === 'list') {
      if (s.type === 'personal') splitLines(s.text).forEach((l) => { const m = l.match(/^([^:]{1,30}):\s*(.*)$/); kids.push(P(m ? [R(m[1] + ': ', { bold: true }), R(m[2])] : [R(l)])); });
      else bullets(splitLines(s.text));
    } else {
      for (const e of s.items.filter((x) => x.title || x.subtitle || x.bullets)) {
        lr(e.title || e.subtitle, dateRange(e));
        const sub = e.title ? [e.subtitle, e.place].filter(Boolean).join(', ') : e.place;
        if (sub) kids.push(P([R(sub, { color: accent })]));
        if (e.link) kids.push(P([R(e.link, { size: sz(9), color: '666666' })]));
        if (e.note) kids.push(P([R(e.note, { size: sz(9.5), color: '666666' })]));
        bullets(splitLines(e.bullets));
      }
    }
  }
  const m = { narrow: 700, normal: 900, wide: 1150 }[d.margin] || 900;
  const page = d.paper === 'letter' ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 };
  const doc = new Document({ creator: 'EditSupreme', title: `${b.name || ''} Resume`,
    sections: [{ properties: { page: { size: page, margin: { top: m, bottom: m, left: m + 100, right: m + 100 } } }, children: kids }] });
  return Packer.toBlob(doc);
}

export function resumeText(r) {
  const b = r.basics, out = [];
  out.push((b.name || 'Your Name').toUpperCase());
  if (b.title) out.push(b.title);
  const c = contactsOf(b);
  if (c.length) out.push(c.join(' | '));
  for (const s of r.sections) {
    if (!sectionHasContent(s)) continue;
    out.push('', (s.title || '').toUpperCase());
    if (s.kind === 'text') out.push(s.text.trim());
    else if (s.kind === 'tags') out.push(splitTags(s.text).join(', '));
    else if (s.kind === 'list') splitLines(s.text).forEach((l) => out.push(s.type === 'personal' ? l : '- ' + l));
    else for (const e of s.items.filter((x) => x.title || x.subtitle || x.bullets)) {
      out.push([e.title, e.subtitle, e.place].filter(Boolean).join(', ') + (dateRange(e) ? ' (' + dateRange(e) + ')' : ''));
      if (e.link) out.push(e.link);
      if (e.note) out.push(e.note);
      splitLines(e.bullets).forEach((l) => out.push('- ' + l));
    }
  }
  return new Blob([out.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
}

export const fileBase = (r) => ((r.basics.name || r.name || 'resume').trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'resume') + '-resume';
