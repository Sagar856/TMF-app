// Usage: npm run icons:generate
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'public', 'icons');
const nativeIcons = join(root, 'native', 'notification-intercept-plugin', 'res', 'drawable');
const source = join(icons, 'Designer logo only.png');
const background = '#e9e9fa';
const pngOptions = { compressionLevel: 9 };
const contain = { fit: 'contain', background: '#00000000' };

mkdirSync(nativeIcons, { recursive: true });

const logo = await sharp(source).resize(768, 768, contain).png(pngOptions).toBuffer();
writeFileSync(join(icons, 'minarth.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">MINARTH</title>
  <desc id="desc">The approved logo-only MINARTH rising M on lavender glass.</desc>
  <image width="512" height="512" href="data:image/png;base64,${logo.toString('base64')}"/>
</svg>
`);

for (const size of [192, 512]) {
  await sharp(source).resize(size, size, contain).png(pngOptions).toFile(join(icons, `icon-${size}.png`));
}

// Keep the complete artwork inside the central safe zone of circular/adaptive masks.
const foreground = await sharp(source).resize(336, 336, contain).png().toBuffer();
const padded = () => sharp({
  create: { width: 512, height: 512, channels: 4, background: '#00000000' },
}).composite([{ input: foreground, left: 88, top: 88 }]);
await padded().png(pngOptions).toFile(join(icons, 'icon-adaptive-foreground.png'));
await padded().flatten({ background }).png(pngOptions).toFile(join(icons, 'icon-maskable-512.png'));

// Android themed/status icons need a white alpha silhouette, not the opaque glass tile.
const { data, info } = await sharp(source)
  .extract({ left: 240, top: 320, width: 792, height: 648 })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let offset = 0; offset < data.length; offset += 4) {
  const [r, g, b, a] = data.subarray(offset, offset + 4);
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  data[offset + 3] = b > r && b > g
    ? Math.round(a * Math.max(0, Math.min(1, (saturation - 35) / 20)))
    : 0;
  data[offset] = data[offset + 1] = data[offset + 2] = 255;
}
const symbol = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(288, 220, contain).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } })
  .composite([{ input: symbol, left: 112, top: 146 }])
  .png(pngOptions).toFile(join(nativeIcons, 'ic_minarth_monochrome.png'));
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(96, 96, { fit: 'contain', background: '#00000000' })
  .png(pngOptions).toFile(join(nativeIcons, 'ic_minarth_notification.png'));

writeFileSync(join(nativeIcons, 'ic_minarth_foreground.xml'), `<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/minarth_launcher_foreground" android:gravity="fill" android:filter="true"/>
`);
writeFileSync(join(nativeIcons, 'ic_stat_tmf.xml'), `<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/ic_minarth_notification" android:gravity="fill" android:filter="true"/>
`);
console.log('Generated MINARTH web, maskable, Android adaptive, themed and notification icons from Designer logo only.png');
