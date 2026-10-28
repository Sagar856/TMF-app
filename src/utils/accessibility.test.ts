import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('global styles expose keyboard focus and respect reduced motion', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(mainSource, /MotionConfig reducedMotion="user"/);
});

test('app provides a skip link and uses the dynamic mobile viewport height', () => {
  assert.match(appSource, /href="#main-content">Skip to main content/);
  assert.match(appSource, /id="main-content"[^>]*tabIndex=\{-1\}/);
  assert.match(css, /\.app-viewport\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
});
