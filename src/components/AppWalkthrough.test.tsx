import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppWalkthrough, WALKTHROUGH_STEPS } from './AppWalkthrough';

test('first sign-in presents an accessible walkthrough with Next and Skip', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  try {
    const markup = renderToStaticMarkup(<AppWalkthrough userId="new-user" onNavigate={() => {}} />);
    assert.match(markup, /role="dialog"/);
    assert.match(markup, /Welcome to MINARTH/);
    assert.match(markup, />Skip<\/button>/);
    assert.match(markup, /Next/);
    assert.match(markup, /Step 1 of 6/);
    assert.deepEqual(WALKTHROUGH_STEPS.map(step => step.tab), ['dashboard', 'accounts', 'transactions', 'investments', 'loans', 'settings']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('completion is remembered independently for each signed-in account', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => key === 'tmf_walkthrough_v1_existing-user' ? 'complete' : null,
  } });
  try {
    assert.equal(renderToStaticMarkup(<AppWalkthrough userId="existing-user" onNavigate={() => {}} />), '');
    assert.match(renderToStaticMarkup(<AppWalkthrough userId="different-user" onNavigate={() => {}} />), /Welcome to MINARTH/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
