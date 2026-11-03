import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import type * as Auth from '../services/supabaseClient';

const bundle = buildSync({
  entryPoints: [fileURLToPath(new URL('../services/supabaseClient.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-test-key', BASE_URL: '/' }) },
}).outputFiles[0].text;

function load(
  auth: Record<string, unknown>,
  rpc: (name: string, args?: Record<string, unknown>) => unknown = async () => ({ data: false, error: null }),
  registrationAuth = auth
) {
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  runInNewContext(bundle, {
    module, exports: module.exports,
    require: (name: string) => name === '@supabase/supabase-js' ? {
      createClient: (_url: string, _key: string, options?: { auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean } }) => {
        if (options) {
          assert.equal(options.auth.persistSession, false);
          assert.equal(options.auth.autoRefreshToken, false);
          assert.equal(options.auth.detectSessionInUrl, false);
        }
        return { auth: options ? registrationAuth : auth, rpc };
      },
    } : require(name),
    window: { location: { origin: 'https://app.test' } }, console, URL, crypto: webcrypto,
  });
  return module.exports as typeof Auth;
}

const user = { id: 'user', email: 'user@example.test', email_confirmed_at: '2026-11-02' };

test('password login rejects an unconfirmed session and clears it', async () => {
  let signedOut = false;
  const api = load({
    signInWithPassword: async () => ({ data: { session: {}, user: { ...user, email_confirmed_at: null } }, error: null }),
    signOut: async () => { signedOut = true; return { error: null }; },
  });
  await assert.rejects(api.signInUser(user.email, 'Strong-password1!'), /Verify your email/);
  assert.equal(signedOut, true);
});

test('signup verifies on an isolated client before password creation or main sign-in', async () => {
  const calls: string[] = [];
  const api = load({
    signInWithPassword: async () => { calls.push('main-sign-in'); return { data: { user, session: {} }, error: null }; },
  }, undefined, {
    signInWithOtp: async () => { calls.push('send'); return { error: null }; },
    verifyOtp: async (request: { email: string; token: string; type: string }) => {
      assert.equal(request.type, 'email');
      assert.equal(request.email, user.email);
      assert.equal(request.token, '123456');
      calls.push('verify');
      return { data: { session: {}, user }, error: null };
    },
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async () => { calls.push('set-password'); return { error: null }; },
  });
  const registration = api.createEmailRegistration();
  await assert.rejects(registration.complete(user.email, 'Strong-password1!', 'User'), /Verify your email/);
  await registration.sendCode(user.email);
  await assert.rejects(registration.verifyCode(user.email, 'bad'), /numeric code/);
  assert.deepEqual(calls, ['send']);
  await registration.verifyCode(user.email, '123456');
  assert.deepEqual(calls, ['send', 'verify']);
  await assert.rejects(registration.complete('different@example.test', 'Strong-password1!', 'User'), /Verify your email/);
  await registration.complete(user.email, 'Strong-password1!', 'User');
  assert.deepEqual(calls, ['send', 'verify', 'set-password', 'main-sign-in']);
  await assert.rejects(registration.verifyCode(user.email, '123456'), /Request a code/);
  registration.reset();
  await assert.rejects(registration.complete(user.email, 'Strong-password1!', 'User'), /Verify your email/);
});

test('existing normalized email is checked before OTP and no code is sent', async () => {
  let sent = false;
  const api = load({
    signInWithOtp: async () => { sent = true; return { error: null }; },
  }, async (name, args) => {
    assert.equal(name, 'registration_email_exists');
    assert.equal(args?.candidate_email, user.email);
    return { data: true, error: null };
  });
  await assert.rejects(api.createEmailRegistration().sendCode(`  ${user.email.toUpperCase()} `), api.EmailAlreadyRegisteredError);
  assert.equal(sent, false);
});

test('new email lookup completes before sending and same-flow resends remain available', async () => {
  const calls: string[] = [];
  let failResend = false;
  const api = load({
    signInWithOtp: async () => {
      calls.push('send');
      return { error: failResend ? new Error('Rate limited') : null };
    },
  }, async () => {
    calls.push('lookup');
    return { data: false, error: null };
  });
  const registration = api.createEmailRegistration();
  await registration.sendCode(user.email);
  failResend = true;
  await assert.rejects(registration.sendCode(user.email), /Rate limited/);
  failResend = false;
  await registration.sendCode(user.email);
  assert.deepEqual(calls, ['lookup', 'send', 'send', 'send']);
  registration.reset();
  await registration.sendCode(user.email);
  assert.deepEqual(calls, ['lookup', 'send', 'send', 'send', 'lookup', 'send']);
});

test('lookup failure, missing migration and invalid responses never send an OTP', async () => {
  for (const result of [
    { data: null, error: { code: 'PGRST202', message: 'Not found' } },
    { data: null, error: { message: 'Database unavailable' } },
    { data: null, error: null },
  ]) {
    let sent = false;
    const api = load({
      signInWithOtp: async () => { sent = true; return { error: null }; },
    }, async () => result);
    await assert.rejects(api.createEmailRegistration().sendCode(user.email), /migration|Could not check/);
    assert.equal(sent, false);
  }
});

test('changing email during lookup prevents a stale OTP request', async () => {
  let finish: (value: unknown) => void = () => {};
  let sent = false;
  const api = load({
    signInWithOtp: async () => { sent = true; return { error: null }; },
  }, () => new Promise(resolve => { finish = resolve; }));
  const registration = api.createEmailRegistration();
  const pending = registration.sendCode(user.email);
  registration.reset();
  finish({ data: false, error: null });
  await assert.rejects(pending, /Email changed/);
  assert.equal(sent, false);
});

test('invalid email never queries the backend or sends a code', async () => {
  const api = load({
    signInWithOtp: async () => { assert.fail('Unexpected OTP'); },
  }, async () => { assert.fail('Unexpected lookup'); });
  const registration = api.createEmailRegistration();
  await assert.rejects(registration.sendCode('not an email'), /valid email/);
  await assert.rejects(registration.sendCode(`${'x'.repeat(250)}@test.example`), /valid email/);
});

test('expired OTP and resend rate limits surface errors; no local bypass', async () => {
  const api = load({
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ data: {}, error: new Error('Token expired') }),
  });
  const registration = api.createEmailRegistration();
  await registration.sendCode(user.email);
  await assert.rejects(registration.verifyCode(user.email, '123456'), /Token expired/);
  const limited = load({ signInWithOtp: async () => ({ error: new Error('Rate limited') }) }).createEmailRegistration();
  await assert.rejects(limited.sendCode(user.email), /Rate limited/);
});

test('changing email while OTP verification is in flight invalidates the response', async () => {
  let finish: (value: unknown) => void = () => {};
  const api = load({
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: () => new Promise(resolve => { finish = resolve; }),
  });
  const registration = api.createEmailRegistration();
  await registration.sendCode(user.email);
  const pending = registration.verifyCode(user.email, '123456');
  registration.reset();
  finish({ data: { session: {}, user }, error: null });
  await assert.rejects(pending, /Email changed/);
  await assert.rejects(registration.complete(user.email, 'Strong-password1!', 'User'), /Verify your email/);
});

test('cached unconfirmed users are never admitted', async () => {
  const api = load({ getSession: async () => ({ data: { session: { user: { ...user, email_confirmed_at: null } } } }) });
  assert.equal(await api.getCurrentUserSession(), null);
});

test('password reset validates strength and signs out after updating', async () => {
  const calls: string[] = [];
  const api = load({
    updateUser: async () => { calls.push('update'); return { error: null }; },
    signOut: async () => { calls.push('sign-out'); return { error: null }; },
  });
  await assert.rejects(api.updatePassword('weak'), /requirements/);
  assert.deepEqual(calls, []);
  await api.updatePassword('Strong-password1!');
  assert.deepEqual(calls, ['update', 'sign-out']);
});

test('account deletion calls only the self-service RPC and surfaces failures', async () => {
  let signedOut = false;
  const api = load({
    signOut: async () => { signedOut = true; return { error: null }; },
  }, async name => {
    assert.equal(name, 'delete_own_account');
    return { error: { message: 'Migration required' } };
  });
  await assert.rejects(api.deleteUserAccount(), /Migration required/);
  assert.equal(signedOut, false);
});

test('successful deletion clears the local auth session', async () => {
  let scope: string | undefined;
  const api = load({
    signOut: async (options: { scope: string }) => { scope = options.scope; return { error: null }; },
  }, async () => ({ error: null }));
  await api.deleteUserAccount();
  assert.equal(scope, 'local');
});
