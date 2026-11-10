// Download the official web builds of the open-source Craft apps (PhotoCraft, VectorCraft, LightCraft,
// FilmCraft, EffectCraft, SoundCraft, PdfCraft; MIT / Apache-2.0, by Storyteller) into public/<app>/,
// unmodified, so the site can host them. They are too big for the Git repository, so run this before
// building:  npm run fetch-crafts   (add --force to re-download).
import { rm, cp, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

export const CRAFTS = {
  photocraft: '0.22.0', vectorcraft: '0.23.0', lightcraft: '0.20.0', filmcraft: '0.19.0',
  effectcraft: '0.23.1', soundcraft: '0.19.0', pdfcraft: '0.20.0'
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');

for (const [name, version] of Object.entries(CRAFTS)) {
  const dest = path.join(root, 'public', name);
  const stamp = path.join(dest, '.version');
  if (!force && existsSync(stamp) && (await readFile(stamp, 'utf8')).trim() === version) { console.log(`${name} ${version}: already here`); continue; }
  const url = `https://github.com/storytold/${name}/releases/download/v${version}/${name}-web-${version}.zip`;
  console.log(`${name} ${version}: downloading ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${name}: download failed (${r.status})`);
  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  const tmp = path.join(root, 'public', `.${name}-tmp`);
  await rm(tmp, { recursive: true, force: true });
  zip.extractAllTo(tmp, true);
  // The zip holds one folder, <name>-web-<version>/, with the site inside.
  const [inner] = (await readdir(tmp)).filter((f) => f.startsWith(name));
  await rm(dest, { recursive: true, force: true });
  await cp(path.join(tmp, inner), dest, { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  // PhotoCraft's loader in app/ imports ./snippets/…, which the zip only has at the top level.
  if (existsSync(path.join(dest, 'app')) && existsSync(path.join(dest, 'snippets')) && !existsSync(path.join(dest, 'app', 'snippets'))) {
    await cp(path.join(dest, 'snippets'), path.join(dest, 'app', 'snippets'), { recursive: true });
  }
  await writeFile(stamp, version);
  const size = (await du(dest)) / 1e6;
  console.log(`${name} ${version}: ready (${size.toFixed(0)} MB)`);
}

async function du(dir) {
  let n = 0;
  for (const f of await readdir(dir)) { const p = path.join(dir, f); const s = await stat(p); n += s.isDirectory() ? await du(p) : s.size; }
  return n;
}
