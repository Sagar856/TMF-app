import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { AuthModal as AuthComponent } from './AuthModal';
import type { UserProfileModal as ProfileComponent } from './UserProfileModal';

test('identity glass keeps all auth modes and the non-dismissible sign-in gate', () => {
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('./AuthModal.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'import.meta.env': '{}' },
  });
  const module: { exports: Partial<{ AuthModal: typeof AuthComponent }> } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console, Date,
  });
  const { AuthModal } = module.exports;
  assert.ok(AuthModal);
  for (const initialMode of ['login', 'register', 'verify_email', 'forgot_password', 'set_new_password'] as const) {
    const markup = renderToStaticMarkup(
      <AuthModal initialMode={initialMode} canClose={false} onClose={() => {}} onSuccess={() => {}} />
    );
    assert.match(markup, /identity-glass identity-login/);
    assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="auth-heading"/);
    assert.match(markup, /type="submit"/);
    assert.match(markup, /src="\.\/icons\/minarth.svg"/);
    assert.doesNotMatch(markup, /aria-label="Close sign-in"/);
    if (initialMode === 'login') {
      assert.match(markup, /Sign In To MINARTH/);
      assert.match(markup, /Forgot Password\?/);
      assert.match(markup, /Register Now/);
      assert.match(markup, /type="email"/);
      assert.match(markup, /type="password"/);
    }
    if (initialMode === 'register' || initialMode === 'verify_email') {
      assert.match(markup, />Verify<\/button>/);
      assert.match(markup, /disabled=""[^>]*>Create account<\/button>/);
      assert.match(markup, /autoComplete="new-password"/i);
      assert.match(markup, /aria-label="Show password"/);
      assert.match(markup, /Pending: At least 8 characters/);
    }
    if (initialMode === 'set_new_password') {
      assert.match(markup, /Confirm password/);
      assert.match(markup, /Password requirements/);
      assert.match(markup, /aria-label="Show new password"/);
      assert.doesNotMatch(markup, /value="[^"]+"/);
    }
  }
  assert.match(renderToStaticMarkup(<AuthModal onClose={() => {}} onSuccess={() => {}} />),
    /aria-label="Close sign-in"/);
});

test('profile glass retains profile actions and all four navigation tabs', () => {
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('./UserProfileModal.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'import.meta.env': '{}' },
  });
  const module: { exports: Partial<{ UserProfileModal: typeof ProfileComponent }> } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console,
  });
  const { UserProfileModal } = module.exports;
  assert.ok(UserProfileModal);
  const markup = renderToStaticMarkup(
    <UserProfileModal
      settings={{
        userName: 'Test', userEmail: 'test@example.com', currencySymbol: '$', currencyCode: 'USD',
        passcodeEnabled: false, locationTracking: false, autoExtractSms: false,
        notificationsEnabled: false,
      }}
      accounts={[]} onClose={() => {}} onUpdateSettings={() => {}}
      onExportData={() => {}} onSignOut={() => {}}
    />
  );
  assert.match(markup, /identity-glass-panel/);
  assert.match(markup, /aria-labelledby="profile-heading"/);
  for (const tab of ['Profile', 'Security', 'Accounts', 'Preferences']) {
    assert.match(markup, new RegExp(`aria-label="${tab}" aria-pressed="${tab === 'Profile'}"`));
  }
  for (const action of ['Upload Photo', 'Save Changes', 'Export Backup', 'Sign Out']) {
    assert.match(markup, new RegExp(action));
  }
});
