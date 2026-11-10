// A compact ICC v2 sRGB display profile (D50-adapted primaries, gamma 2.2 curves), built in code so
// PDF/A files can carry the OutputIntent colour profile the standard requires.

export function srgbProfile() {
  const tags = [];
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const s15 = (v) => u32(Math.round(v * 65536) >>> 0);
  const xyz = (x, y, z) => [...ascii('XYZ '), 0, 0, 0, 0, ...s15(x), ...s15(y), ...s15(z)];
  const curv = (gamma) => [...ascii('curv'), 0, 0, 0, 0, ...u32(1), (Math.round(gamma * 256) >> 8) & 255, Math.round(gamma * 256) & 255];
  const text = (s) => [...ascii('text'), 0, 0, 0, 0, ...ascii(s), 0];
  const desc = (s) => [...ascii('desc'), 0, 0, 0, 0, ...u32(s.length + 1), ...ascii(s), 0, ...u32(0), ...u32(0), 0, 0, 0, ...new Array(67).fill(0)];
  tags.push(['desc', desc('sRGB IEC61966-2.1')]);
  tags.push(['cprt', text('No copyright, use freely')]);
  tags.push(['wtpt', xyz(0.9642, 1.0, 0.8249)]);
  tags.push(['rXYZ', xyz(0.4361, 0.2225, 0.0139)]);
  tags.push(['gXYZ', xyz(0.3851, 0.7169, 0.0971)]);
  tags.push(['bXYZ', xyz(0.1431, 0.0606, 0.7141)]);
  const trc = curv(2.2);
  tags.push(['rTRC', trc], ['gTRC', trc], ['bTRC', trc]);

  // Layout: header (128) + tag count (4) + table (12 per tag) + tag data (4-byte aligned).
  let offset = 128 + 4 + tags.length * 12;
  const table = [], data = [];
  for (const [sig, bytes] of tags) {
    while (offset % 4) { data.push(0); offset++; }
    table.push(...ascii(sig), ...u32(offset), ...u32(bytes.length));
    data.push(...bytes);
    offset += bytes.length;
  }
  const size = offset;
  const now = new Date();
  const header = [
    ...u32(size), 0, 0, 0, 0, 0x02, 0x10, 0, 0, ...ascii('mntr'), ...ascii('RGB '), ...ascii('XYZ '),
    ...[now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].flatMap((v) => [(v >> 8) & 255, v & 255]),
    ...ascii('acsp'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...s15(0.9642), ...s15(1.0), ...s15(0.8249), 0, 0, 0, 0, ...new Array(16).fill(0), ...new Array(28).fill(0)
  ];
  if (header.length !== 128) throw new Error('ICC header size ' + header.length);
  return new Uint8Array([...header, ...u32(tags.length), ...table, ...data]);
}
