// Build step: a real page for every tool (editsupreme.com/merge-pdf/ …) so search engines can find and rank
// each one, plus sitemap.xml and robots.txt. Each page is the app itself (it opens straight on that tool) with
// its own title, description, structured data and a readable section about the tool. See src/seo/.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { SLUGS } from '../src/seo/slugs.js';
import { CONTENT, EXTRA, COMMON_Q } from '../src/seo/content.js';
import { INFO_PAGES } from '../src/seo/pages.js';

const SITE = 'https://editsupreme.com';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function setHead(html, { title, desc, url }) {
  const rep = (re, val) => { if (!re.test(html)) throw new Error('seo-pages: not found in index.html: ' + re); html = html.replace(re, val); };
  rep(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  rep(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`);
  rep(/(<link rel="canonical" href=")[^"]*/, `$1${url}`);
  rep(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  rep(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`);
  rep(/(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  return html;
}

export function seoPages() {
  return {
    name: 'editsupreme-seo-pages',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_, bundle) {
      // The tool list, loaded as it is (its tool code is only imported when a tool opens, so nothing else loads).
      const regPath = resolve('src/tools/registry.js');
      const { TOOLS, CATEGORIES } = await import(pathToFileURL(regPath).href);
      const catName = Object.fromEntries(CATEGORIES);
      const missing = TOOLS.filter((t) => !SLUGS[t.id] || !CONTENT[t.id]).map((t) => t.id);
      if (missing.length) this.warn('No search page text for: ' + missing.join(', '));

      const index = bundle['index.html'];
      const base = String(index.source);
      const today = new Date().toISOString().slice(0, 10);
      const pages = []; // [slug, tool]

      const link = (t) => `<a href="/${SLUGS[t.id]}/">${esc(t.name)}</a>`;
      const directory = () => {
        const cats = CATEGORIES.filter(([id]) => id !== 'all');
        return `<div class="seodir">${cats.map(([cid, cname]) => {
          const ts = TOOLS.filter((t) => t.cat === cid && SLUGS[t.id]);
          return ts.length ? `<div><h4>${esc(cname)}</h4>${ts.map(link).join('')}</div>` : '';
        }).join('')}</div>`;
      };
      const faqHtml = (qs) => qs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
      const faqLd = (qs) => ({ '@type': 'FAQPage', mainEntity: qs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
      const org = { '@type': 'Organization', name: 'EditSupreme', url: SITE + '/', logo: SITE + '/logo.png' };

      function toolPage(t, c, slug, extra) {
        const url = `${SITE}/${slug}/`;
        const qs = [...c.q, ...COMMON_Q];
        const app = t.cat === 'photo' || t.id === 'design-studio' || t.id === 'assistant';
        const steps = c.s || (app
          ? [`Open ${t.name} on this page. It runs in your browser, with nothing to install.`, 'Start something new or open your own file.', 'Save or download your work when you are done.']
          : ['Choose your file, or drop it on the page. It opens in your browser and is never uploaded.', 'Pick the settings you want.', `Press the button and download the result.`]);
        const related = [
          ...EXTRA.filter((e) => e.tool === t.id && e.slug !== slug).map((e) => `<a href="/${e.slug}/">${esc(e.h)}</a>`),
          ...(extra ? [link(t)] : []),
          ...TOOLS.filter((o) => o.cat === t.cat && o.id !== t.id && SLUGS[o.id]).slice(0, 8).map(link)
        ];
        const section = `
<section id="seo" class="seo" data-tool="${t.id}">
  <div class="wrap">
    <nav class="seocrumb" aria-label="Breadcrumb"><a href="/">EditSupreme</a> › <span>${esc(catName[t.cat] || 'Tools')}</span> › <span>${esc(extra ? extra.h : t.name)}</span></nav>
    <h2>${esc(extra ? extra.h : `${t.name}: free, online and private`)}</h2>
    <p class="seolead">${esc(c.i)}</p>
    <div class="seocols">
      <div><h3>How to use it</h3><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div><h3>Why EditSupreme</h3><ul>
        <li><b>Private:</b> your files are processed on your device, never uploaded.</li>
        <li><b>Free:</b> no sign-up, no watermarks, no daily limits.</li>
        <li><b>Works anywhere:</b> phone, tablet or computer, and even offline once installed.</li>
      </ul></div>
    </div>
    <h3>Questions</h3>
    <div class="seofaq">${faqHtml(qs)}</div>
    ${related.length ? `<h3>Related tools</h3><div class="seorel">${related.join('')}</div>` : ''}
    <h3>All free tools</h3>
    ${directory()}
  </div>
</section>`;
        let html = setHead(base, { title: c.t, desc: c.d, url });
        html = html.replace('</head>', ld({ '@context': 'https://schema.org', '@graph': [
          { '@type': 'WebApplication', name: extra ? extra.h : t.name, url, description: c.d, applicationCategory: t.cat === 'photo' || t.cat === 'design' || t.cat === 'image' ? 'MultimediaApplication' : 'BusinessApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires a modern web browser', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: org },
          faqLd(qs),
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'EditSupreme', item: SITE + '/' },
            { '@type': 'ListItem', position: 2, name: extra ? extra.h : t.name, item: url }] }
        ] }) + '\n</head>');
        html = html.replace('<div id="app"></div>', '<div id="app"></div>' + section);
        this.emitFile({ type: 'asset', fileName: `${slug}/index.html`, source: html });
        pages.push(slug);
      }

      for (const t of TOOLS) if (SLUGS[t.id] && CONTENT[t.id]) toolPage.call(this, t, CONTENT[t.id], SLUGS[t.id]);
      for (const e of EXTRA) {
        const t = TOOLS.find((x) => x.id === e.tool);
        if (t) toolPage.call(this, t, e, e.slug, e);
      }

      // About, Contact, Privacy and Terms.
      for (const p of INFO_PAGES) {
        const url = `${SITE}/${p.slug}/`;
        let html = setHead(base, { title: p.t, desc: p.d, url });
        html = html.replace('<div id="app"></div>', `<div id="app"></div>
<section id="seo" class="seo infopage" data-tool="page:${p.slug}">
  <div class="wrap">
    <nav class="seocrumb" aria-label="Breadcrumb"><a href="/">EditSupreme</a> › <span>${esc(p.h)}</span></nav>
    <h1>${esc(p.h)}</h1>
${p.html}
  </div>
</section>`);
        this.emitFile({ type: 'asset', fileName: `${p.slug}/index.html`, source: html });
        pages.push(p.slug);
      }

      // The home page: structured data about the site, and a list of every tool's page.
      const homeQ = [
        ['What is EditSupreme?', 'A free set of PDF, image, design and AI tools that run in your web browser. Edit, convert, compress, merge, sign and protect PDFs, edit photos, remove backgrounds and make passport photos, without uploading your files.'],
        ...COMMON_Q,
        ['Can I install it as an app?', 'Yes. Use “Install” in your browser to add EditSupreme to your phone or computer; it then works offline too.']
      ];
      let home = base.replace('</head>', ld({ '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', name: 'EditSupreme', url: SITE + '/' },
        org,
        { '@type': 'WebApplication', name: 'EditSupreme', url: SITE + '/', description: 'Free PDF, image, design and AI tools that run privately in your browser.', applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
        faqLd(homeQ)
      ] }) + '\n</head>');
      home = home.replace('<div id="app"></div>', `<div id="app"></div>
<section id="seo" class="seo" data-tool="home">
  <div class="wrap">
    <h2>Free online PDF, image and AI tools</h2>
    <p class="seolead">EditSupreme puts ${TOOLS.length} free tools in one place: edit, merge, split, compress and convert PDFs; resize, compress and convert images; remove backgrounds, make passport photos and design social posts. Everything runs in your browser, so your files stay private.</p>
    <h3>All free tools</h3>
    ${directory()}
    <h3>Questions</h3>
    <div class="seofaq">${faqHtml(homeQ)}</div>
  </div>
</section>`);
      index.source = home;

      const urls = ['', ...pages.map((s) => s + '/')];
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}/${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
` });
    }
  };
}
