import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { AuthModal as AuthComponent } from './AuthModal';
import type { ProfileSettings as ProfileComponent } from './settings/ProfileSettings';

test('identity glass keeps all auth modes and the non-dismissible sign-in gate', () => {
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('./AuthModal.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'import.meta.env': '{}' },
  });
  const module: { exports: Partial<{ AuthModal: typeof AuthComponent }> } = { exports: {} };
  let native = false;
  const require = createRequire(import.meta.url);
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: (name: string) => name === '@capacitor/core' ? {
      ...require(name), Capacitor: { isNativePlatform: () => native },
    } : require(name), console, Date,
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
      assert.doesNotMatch(markup, /Password requirements|Pending: At least 8 characters/);
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
  native = true;
  const recovery = renderToStaticMarkup(<AuthModal initialMode="forgot_password" onClose={() => {}} onSuccess={() => {}} />);
  assert.match(recovery, /Send recovery code/);
  assert.doesNotMatch(recovery, /Send reset link/);
});

test('profile settings expose personal details and sign out without a modal', () => {
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL('./settings/ProfileSettings.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'import.meta.env': '{}' },
  });
  const module: { exports: Partial<{ ProfileSettings: typeof ProfileComponent }> } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url), console,
  });
  const { ProfileSettings } = module.exports;
  assert.ok(ProfileSettings);
  const markup = renderToStaticMarkup(
    <ProfileSettings
      settings={{
        userName: 'Test', userEmail: 'test@example.com', currencySymbol: '$', currencyCode: 'USD',
        passcodeEnabled: false, locationTracking: false, autoExtractSms: false,
        notificationsEnabled: false,
      }}
      authUserEmail="account@example.com"
      onUpdateSettings={() => {}} onSignOut={() => {}}
    />
  );
  assert.match(markup, /id="settings-profile"/);
  assert.match(markup, /Profile settings/);
  assert.match(markup, /<button type="submit" disabled=""[^>]*>[\s\S]*?Save Changes<\/button>/);
  assert.match(markup, /for="profile-display-name"/);
  assert.match(markup, /for="profile-contact-email"/);
  assert.match(markup, /This email identifies your account and cannot be edited/);
  assert.match(markup, /<input id="profile-contact-email"[^>]*readOnly=""[^>]*value="account@example.com"/i);
  assert.doesNotMatch(markup, /value="test@example.com"/);
  assert.doesNotMatch(markup.match(/<input id="profile-display-name"[^>]*>/)?.[0] || '', /readonly|disabled/i);
  assert.doesNotMatch(markup, /role="dialog"|aria-modal|Export Backup|Profile sections/);
  for (const action of ['Upload Photo', 'Save Changes', 'Sign out']) {
    assert.match(markup, new RegExp(action));
  }
});
