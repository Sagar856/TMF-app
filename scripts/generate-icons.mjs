// Single artwork source for SVG, antialiased PNGs and Android vector icons.
// Usage: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'public', 'icons');
const nativeIcons = join(root, 'native', 'notification-intercept-plugin', 'res', 'drawable');
const artwork = [
  { points: [[128, 360], [128, 152], [174, 152], [256, 248], [338, 152], [384, 152], [384, 360], [330, 360], [330, 240], [256, 326], [182, 240], [182, 360]], colors: ['#e1d6ff', '#8250dc'] },
  { points: [[256, 248], [338, 152], [384, 152], [384, 360], [330, 360], [330, 240], [256, 326]], colors: ['#c5acff', '#6e40c9'] },
  { points: [[128, 152], [174, 152], [256, 248], [256, 258], [170, 160], [136, 160], [136, 360], [128, 360]], colors: ['#f3edff', '#b69aee'] },
];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const gradient = (colors, t) => mix(rgb(colors[0]), rgb(colors[1]), t);
function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function rounded(x, y, inset = 0) {
  const radius = 112 - inset;
  const dx = Math.max(112 - x, 0, x - 400);
  const dy = Math.max(112 - y, 0, y - 400);
  return x >= inset && y >= inset && x <= 512 - inset && y <= 512 - inset
    && dx * dx + dy * dy <= radius * radius;
}
function sample(x, y, maskable) {
  if (!maskable && !rounded(x, y)) return [0, 0, 0, 0];
  const t = (x + y) / 1024;
  let color = gradient(['#343044', '#10121e'], t);
  if (!maskable && !rounded(x, y, 2)) color = gradient(['#a69ab8', '#393747'], t);
  if (y < 160 - x * 0.18) color = mix(color, [197, 177, 235], 0.045);
  if (x > 405 && y > 320 + (512 - x) * 0.6) color = mix(color, [174, 139, 250], 0.08);
  for (const shape of artwork) {
    if (contains(shape.points, x, y)) color = gradient(shape.colors, (y - 152) / 208);
  }
  return [...color, 255];
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const sum = [0, 0, 0, 0];
      for (const sy of [0.25, 0.75]) for (const sx of [0.25, 0.75]) {
        const pixel = sample((x + sx) * 512 / size, (y + sy) * 512 / size, maskable);
        for (let c = 0; c < 3; c++) sum[c] += pixel[c] * pixel[3] / 255;
        sum[3] += pixel[3];
      }
      for (let c = 0; c < 3; c++) raw[i + c] = sum[3] ? Math.round(sum[c] * 255 / sum[3]) : 0;
      raw[i + 3] = Math.round(sum[3] / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(icons, { recursive: true });
mkdirSync(nativeIcons, { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">MINARTH</title>
  <desc id="desc">A faceted violet M with an ascending right stroke on charcoal glass.</desc>
  <defs>
    <linearGradient id="tile" x2="1" y2="1"><stop stop-color="#343044"/><stop offset="1" stop-color="#10121e"/></linearGradient>
    <linearGradient id="edge" x2="1" y2="1"><stop stop-color="#a69ab8"/><stop offset="1" stop-color="#393747"/></linearGradient>
    ${artwork.map((shape, i) => `<linearGradient id="m${i}" x2="0" y2="1"><stop stop-color="${shape.colors[0]}"/><stop offset="1" stop-color="${shape.colors[1]}"/></linearGradient>`).join('\n    ')}
    <clipPath id="tileClip"><rect width="512" height="512" rx="112"/></clipPath>
  </defs>
  <g clip-path="url(#tileClip)">
    <rect width="512" height="512" fill="url(#tile)"/>
    <path d="M0 0H512V68L0 160Z" fill="#c5b1eb" opacity=".045"/>
    <path d="M405 384L512 320V512H405Z" fill="#ae8bfa" opacity=".08"/>
    ${artwork.map((shape, i) => `<polygon points="${shape.points.map(p => p.join(',')).join(' ')}" fill="url(#m${i})"/>`).join('\n    ')}
    <rect x="1" y="1" width="510" height="510" rx="111" fill="none" stroke="url(#edge)" stroke-width="2"/>
  </g>
</svg>
`;
writeFileSync(join(icons, 'minarth.svg'), svg);
for (const size of [192, 512]) {
  writeFileSync(join(icons, `icon-${size}.png`), png(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}
writeFileSync(join(icons, 'icon-maskable-512.png'), png(512, true));
const pathData = points => `M${points.map(p => p.join(',')).join(' L')} Z`;
writeFileSync(join(nativeIcons, 'ic_minarth_foreground.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512">
${artwork.map(shape => `  <path android:pathData="${pathData(shape.points)}">
    <aapt:attr name="android:fillColor">
      <gradient android:startX="0" android:startY="152" android:endX="0" android:endY="360" android:type="linear" android:startColor="${shape.colors[0]}" android:endColor="${shape.colors[1]}"/>
    </aapt:attr>
  </path>`).join('\n')}
</vector>
`);
writeFileSync(join(nativeIcons, 'ic_stat_tmf.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="320" android:viewportHeight="320">
  <group android:translateX="-96" android:translateY="-96">
    <path android:fillColor="#FFFFFF" android:pathData="${pathData(artwork[0].points)}"/>
  </group>
</vector>
`);
console.log('wrote MINARTH SVG, maskable icon and Android vectors');
