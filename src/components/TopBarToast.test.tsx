import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { TopBarToast, ToastMessage } from './TopBarToast';

test('toast expiration survives rerenders with new dismiss callbacks and retains accessible controls', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('./TopBarToast.tsx', import.meta.url), 'utf8');
  const module = { exports: {} as { TopBarToast: typeof TopBarToast } };
  const ref = { current: () => {} };
  let previous: unknown[] = [];
  let cleanup: (() => void) | undefined;
  let timer: (() => void) | undefined;
  let timersStarted = 0;
  runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs' }).code, {
    module, exports: module.exports,
    require: (name: string) => name === 'react' ? { ...React,
      useRef: () => ref,
      useEffect: (effect: () => () => void, deps: unknown[]) => {
        if (deps.some((dep, index) => dep !== previous[index])) {
          cleanup?.();
          previous = deps;
          cleanup = effect();
        }
      },
    } : require(name),
    setTimeout: (work: () => void) => { timer = work; timersStarted++; return 1; },
    clearTimeout: () => { timer = undefined; },
  });
  const toast: ToastMessage = { id: 'one', text: 'Needs review', type: 'warning', action: { label: 'Review in MINA', onClick: () => {} } };
  let first = 0;
  let latest = 0;
  module.exports.TopBarToast({ toast, onDismiss: () => { first++; } });
  const element = module.exports.TopBarToast({ toast: { ...toast }, onDismiss: () => { latest++; } });
  assert.equal(timersStarted, 1);
  timer?.();
  assert.equal(first, 0);
  assert.equal(latest, 1);
  const html = renderToStaticMarkup(element);
  assert.match(html, /Review in MINA/);
  assert.match(html, /aria-label="Dismiss notification"/);
  assert.match(html, /min-h-11 min-w-11/);
  assert.doesNotMatch(html, /lucide-trash/);
});
