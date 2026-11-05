import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyUiPalette, getUiPalette, isUiPalette, UI_PALETTES } from './uiPalette';

test('five color palettes keep the original purple as the backwards-compatible default', () => {
  assert.equal(getUiPalette().id, 'purple');
  assert.equal(getUiPalette().hueShift, 0);
  assert.deepEqual(UI_PALETTES.map(palette => palette.name), [
    'Deep Purple', 'Forest Green', 'Celestial Blue', 'Burgundy', 'Sunset Gold',
  ]);
  assert.equal(new Set(UI_PALETTES.map(palette => palette.hueShift)).size, 5);
  for (const palette of UI_PALETTES) assert.equal(isUiPalette(palette.id), true);
  for (const value of [undefined, null, '', 'invalid', 1, {}]) assert.equal(isUiPalette(value), false);
});

test('palette application replaces the shared hue and updates every scope without changing theme mode', () => {
  const properties = new Map<string, string>();
  const root = {
    dataset: { uiPalette: '' },
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
  };
  for (const palette of UI_PALETTES) {
    applyUiPalette(root, palette.id);
    assert.equal(root.dataset.uiPalette, palette.id);
    assert.equal(properties.get('--ui-hue-shift'), String(palette.hueShift));
    assert.equal(properties.size, 1, 'Palette application must not alter spacing, blur or theme mode');
  }
  applyUiPalette(root);
  assert.equal(properties.get('--ui-hue-shift'), '0');
});

test('glass shades and all Tailwind purple accent levels share the hue control', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  for (const property of ['--glass-accent', '--glass-chart-accent', '--glass-feature-background', '--glass-action-background']) {
    const declarations = [...css.matchAll(new RegExp(`${property}:([^;]+);`, 'g'))];
    assert.ok(declarations.length > 0);
    for (const declaration of declarations) assert.match(declaration[1], /var\(--ui-hue-shift, 0\)/);
  }
  for (const family of ['violet', 'purple', 'indigo']) {
    for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      assert.match(css, new RegExp(`--color-${family}-${shade}: oklch\\([^;]+var\\(--ui-hue-shift, 0\\)`));
    }
  }
  assert.match(css, /--glass-chart-credit: #81cbb6;/, 'Income must retain its status color');
  const filters = [...css.matchAll(/([^{}]+)\{[^{}]*filter:\s*hue-rotate[^{}]*\}/g)];
  assert.equal(filters.length, 1, 'Hue filtering must be limited to approved brand artwork');
  assert.equal(filters[0][1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), '.brand-mark');
});
