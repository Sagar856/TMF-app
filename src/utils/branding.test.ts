import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

async function decodePng(path: string) {
  const buffer = readFileSync(new URL(`../../${path}`, import.meta.url));
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixel = (x: number, y: number) => [...data.subarray((y * width + x) * 4, (y * width + x + 1) * 4)];
  return { width, height, pixel, data };
}

test('MINARTH identity is consistent without changing installed app identity', async () => {
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
    const { width, height, pixel, data } = await decodePng(`public/${icon.src}`);
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(width, size);
    assert.equal(height, size);
    assert.equal(pixel(0, 0)[3], icon.purpose === 'maskable' ? 255 : 0);
    assert.ok(pixel(Math.round(size * 0.4), Math.round(size * 0.5))[3] > 240);
    if (icon.purpose === 'any') {
      const expected = await sharp(readFileSync(new URL('../../public/icons/Designer logo only.png', import.meta.url)))
        .resize(size, size, { fit: 'contain', background: '#00000000' }).ensureAlpha().raw().toBuffer();
      assert.ok(data.equals(expected), 'Installed icons must use the supplied artwork, not the previous M');
    }
    if (icon.purpose === 'maskable') {
      for (let angle = 0; angle < 360; angle += 10) {
        const x = Math.round(size * (0.5 + 0.39 * Math.cos(angle * Math.PI / 180)));
        const y = Math.round(size * (0.5 + 0.39 * Math.sin(angle * Math.PI / 180)));
        assert.equal(pixel(x, y)[3], 255);
      }
    }
  }
});

test('shared app and loading logo embeds the approved image without external SVG references', async () => {
  const svg = read('public/icons/minarth.svg');
  const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/);
  assert.ok(embedded, 'Favicon and shared BrandMark must be self-contained');
  const actual = await sharp(Buffer.from(embedded[1], 'base64')).ensureAlpha().raw().toBuffer();
  const expected = await sharp(readFileSync(new URL('../../public/icons/Designer logo only.png', import.meta.url)))
    .resize(768, 768, { fit: 'contain', background: '#00000000' }).ensureAlpha().raw().toBuffer();
  assert.ok(actual.equals(expected), 'App logo must preserve the logo-only design without stretching or cropping');
});

test('adaptive and themed icons have transparent padding and a mask-safe symbol', async () => {
  const foreground = await decodePng('public/icons/icon-adaptive-foreground.png');
  assert.equal(foreground.width, 512);
  assert.equal(foreground.height, 512);
  assert.equal(foreground.pixel(0, 0)[3], 0);
  assert.ok(foreground.pixel(256, 256)[3] > 240);
  const artwork = await sharp(readFileSync(new URL('../../public/icons/Designer logo only.png', import.meta.url)))
    .resize(336, 336, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  const expected = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } })
    .composite([{ input: artwork, left: 88, top: 88 }])
    .raw().toBuffer();
  assert.ok(foreground.data.equals(expected), 'Adaptive icon must include the complete padded artwork');
  for (let y = 0; y < foreground.height; y++) {
    for (let x = 0; x < foreground.width; x++) {
      if (foreground.pixel(x, y)[3] <= 16) continue;
      assert.ok(Math.hypot(x - 256, y - 256) < 512 * 0.4, 'Complete logo must fit circular launcher masks');
    }
  }

  const monochrome = await decodePng('native/notification-intercept-plugin/res/drawable/ic_minarth_monochrome.png');
  let visiblePixels = 0;
  for (let y = 0; y < monochrome.height; y++) {
    for (let x = 0; x < monochrome.width; x++) {
      const [r, g, b, a] = monochrome.pixel(x, y);
      if (a === 0) continue;
      visiblePixels++;
      assert.equal(r, g);
      assert.equal(g, b);
      assert.ok(r >= 254, 'Themed icon must be a white silhouette');
      assert.ok(Math.hypot(x - 256, y - 256) < 512 * 0.4, 'Themed M must fit the Android safe zone');
    }
  }
  assert.ok(visiblePixels > 20000, 'Themed icon must contain a visible M, not an empty image');
  assert.ok(visiblePixels < 512 * 512 * 0.25, 'Themed icon must exclude the opaque background tile');
  const notification = await decodePng('native/notification-intercept-plugin/res/drawable/ic_minarth_notification.png');
  assert.equal(notification.width, 96);
  assert.equal(notification.height, 96);
  assert.equal(notification.pixel(0, 0)[3], 0);
});

test('notification card uses a transparent purple M, not the glass tile', async () => {
  const icon = await decodePng('native/notification-intercept-plugin/res/drawable/ic_minarth_purple.png');
  assert.equal(icon.width, 192);
  assert.equal(icon.height, 192);
  assert.equal(icon.pixel(0, 0)[3], 0);
  let visible = 0;
  for (let offset = 0; offset < icon.data.length; offset += 4) {
    const [r, g, b, a] = icon.data.subarray(offset, offset + 4);
    if (a < 128) continue;
    visible++;
    assert.ok(b > r && r > g, 'Visible M pixels must be purple');
  }
  assert.ok(visible > 3000 && visible < 192 * 192 * 0.6, 'Icon must contain the isolated M-growth mark');
});
