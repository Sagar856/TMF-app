import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { resolveTheme, type ThemePreference } from '../utils/theme';

test('system theme responds to device changes, resumes, and cleans up listeners', () => {
  const source = readFileSync(new URL('../hooks/useResolvedTheme.ts', import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  let systemDark = false;
  let initialized = false;
  let cleanup: (() => void) | undefined;
  const mediaListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  };
  const module: { exports: { useResolvedTheme?: (preference: ThemePreference) => 'dark' | 'light' } } = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    window: { matchMedia: () => media },
    document: {
      visibilityState: 'visible',
      addEventListener: (_: string, listener: () => void) => visibilityListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => visibilityListeners.delete(listener),
    },
    require: (name: string) => name === 'react' ? {
      useState: (initialize: () => boolean) => {
        if (!initialized) systemDark = initialize();
        return [systemDark, (value: boolean) => { systemDark = value; }];
      },
      useEffect: (run: () => (() => void)) => {
        if (!initialized) { cleanup = run(); initialized = true; }
      },
    } : { resolveTheme },
  });
  const render = module.exports.useResolvedTheme!;
  assert.equal(render('system'), 'light');
  media.matches = true;
  mediaListeners.forEach(listener => listener());
  assert.equal(render('system'), 'dark');
  assert.equal(render('light'), 'light');
  media.matches = false;
  visibilityListeners.forEach(listener => listener());
  assert.equal(render('system'), 'light');
  assert.equal(render('dark'), 'dark');
  cleanup!();
  assert.equal(mediaListeners.size, 0);
  assert.equal(visibilityListeners.size, 0);
});
