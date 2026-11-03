import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppLaunchLoader } from './AppLaunchLoader';

test('startup retains the branded loader without a second account-loading screen', () => {
  for (const reduceMotion of [false, true]) {
    const markup = renderToStaticMarkup(<AppLaunchLoader reduceMotion={reduceMotion} />);
    assert.match(markup, /identity-glass app-launch/);
    assert.match(markup, /MINARTH/);
    assert.match(markup, /src="\.\/icons\/minarth.svg"/);
    assert.match(markup, /w-36 h-36 sm:w-40 sm:h-40/);
    assert.match(markup, /role="status"[^>]*>Preparing your private workspace/);
    assert.doesNotMatch(markup, /Loading your private account|Checking your sign-in|Retry|Sign out|role="alert"/);
  }
});

test('startup failures keep the loader and expose error recovery instead of hiding failures', () => {
  const markup = renderToStaticMarkup(
    <AppLaunchLoader reduceMotion error="Could not load cloud data." onRetry={() => {}} onSignOut={() => {}} />
  );
  assert.match(markup, /identity-glass app-launch/);
  assert.match(markup, /role="alert"[^>]*>Could not load cloud data\./);
  assert.match(markup, />Retry<\/button>/);
  assert.match(markup, />Sign out<\/button>/);
});
