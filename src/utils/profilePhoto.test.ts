import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawProfileCrop, validateProfilePhoto } from './profilePhoto';

test('profile crop covers the square and positions the rotated image', () => {
  const translations: number[][] = [];
  const draws: number[][] = [];
  const rotations: number[] = [];
  const context = {
    fillStyle: '', fillRect() {}, save() {}, restore() {},
    translate: (...args: number[]) => translations.push(args),
    rotate: (angle: number) => rotations.push(angle),
    drawImage: (_image: unknown, ...args: number[]) => draws.push(args),
  };
  const canvas = { width: 256, getContext: () => context } as unknown as HTMLCanvasElement;
  const image = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  drawProfileCrop(canvas, image, { zoom: 1, x: 0, y: 50, rotation: 0 });
  assert.deepEqual(translations[0], [256, 128]);
  assert.deepEqual(draws[0], [-256, -128, 512, 256]);
  drawProfileCrop(canvas, image, { zoom: 2, x: 50, y: 100, rotation: 90 });
  assert.deepEqual(translations[1], [128, -256]);
  assert.deepEqual(draws[1], [-512, -256, 1024, 512]);
  assert.equal(rotations[1], Math.PI / 2);
});

test('profile photo validation rejects non-images and oversized files', () => {
  assert.throws(() => validateProfilePhoto({ type: 'text/plain', size: 2 } as File), /image file/);
  assert.throws(() => validateProfilePhoto({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 } as File), /5MB/);
  assert.doesNotThrow(() => validateProfilePhoto({ type: 'image/png', size: 5 * 1024 * 1024 } as File));
});
