import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function decodePng(path: string) {
  const buffer = readFileSync(new URL(`../../${path}`, import.meta.url));
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      compressed.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  assert.equal(raw.length, (width * 4 + 1) * height);
  const pixel = (x: number, y: number) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 5 + x * 4)];
  return { width, height, pixel };
}

test('MINARTH identity is consistent without changing installed app identity', () => {
  const html = read('index.html');
  assert.match(html, /<title>MINARTH<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="MINARTH"/);
  assert.match(html, /icons\/minarth.svg/);
  assert.equal(JSON.parse(read('metadata.json')).name, 'MINARTH');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'MINARTH');
  assert.equal(manifest.short_name, 'MINARTH');
  assert.equal(manifest.id, './');
  assert.equal(manifest.shortcuts.length, 2);
  assert.match(read('public/sw.js'), /\}-minarth`/);
  const config = read('capacitor.config.ts');
  assert.match(config, /appName: 'MINARTH'/);
  assert.match(config, /appId: 'com.trackmoneyflow.app'/);
  assert.match(read('public/icons/minarth.svg'), /<title id="title">MINARTH<\/title>/);
  for (const icon of manifest.icons) {
    const { width, height, pixel } = decodePng(`public/${icon.src}`);
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(width, size);
    assert.equal(height, size);
    assert.equal(pixel(0, 0)[3], icon.purpose === 'maskable' ? 255 : 0);
    const [r, g, b, a] = pixel(Math.round(size * 0.3), Math.round(size * 0.5));
    assert.equal(a, 255);
    assert.ok(b > r && r > g, 'M stroke must retain its violet color');
    if (icon.purpose === 'maskable') {
      for (let angle = 0; angle < 360; angle += 10) {
        const x = Math.round(size * (0.5 + 0.39 * Math.cos(angle * Math.PI / 180)));
        const y = Math.round(size * (0.5 + 0.39 * Math.sin(angle * Math.PI / 180)));
        assert.equal(pixel(x, y)[3], 255);
      }
    }
  }
});
