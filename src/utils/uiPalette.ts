export const UI_PALETTES = [
  { id: 'purple', name: 'Deep Purple', description: 'Premium & modern', hueShift: 0 },
  { id: 'green', name: 'Forest Green', description: 'Fresh & growth focused', hueShift: -125 },
  { id: 'blue', name: 'Celestial Blue', description: 'Calm & professional', hueShift: -50 },
  { id: 'burgundy', name: 'Burgundy', description: 'Rich & elegant', hueShift: 65 },
  { id: 'gold', name: 'Sunset Gold', description: 'Warm & energetic', hueShift: 140 },
] as const;

export type UiPalette = typeof UI_PALETTES[number]['id'];

export function isUiPalette(value: unknown): value is UiPalette {
  return UI_PALETTES.some(palette => palette.id === value);
}

export function getUiPalette(id: UiPalette = 'purple') {
  const palette = UI_PALETTES.find(palette => palette.id === id);
  if (!palette) throw new TypeError('Invalid UI color palette.');
  return palette;
}

export function applyUiPalette(
  root: { dataset: DOMStringMap; style: Pick<CSSStyleDeclaration, 'setProperty'> },
  id?: UiPalette,
): void {
  const palette = getUiPalette(id);
  root.dataset.uiPalette = palette.id;
  root.style.setProperty('--ui-hue-shift', String(palette.hueShift));
}
