import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function playReleaseErrors(env, privacy, deletion) {
  const errors = [];
  const backendUrl = env.VITE_SUPABASE_URL?.trim();
  try {
    const url = new URL(backendUrl);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
  } catch {
    errors.push('VITE_SUPABASE_URL must be a production HTTPS backend URL.');
  }
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!key || /YOUR_|undefined|null/i.test(key)) {
    errors.push('VITE_SUPABASE_ANON_KEY must be configured for the release.');
  } else if (key.startsWith('sb_secret_')) {
    errors.push('Use a public Supabase anon/publishable key, never a secret key.');
  } else if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') errors.push('The Supabase JWT key must have the anon role, never service_role.');
    } catch {
      errors.push('The Supabase JWT key has an invalid payload.');
    }
  } else if (!key.startsWith('sb_publishable_')) {
    errors.push('The Supabase key must be an anon JWT or sb_publishable_ key.');
  }
  if (!/^[1-9]\d*$/.test(env.ANDROID_VERSION_CODE || '') ||
      Number(env.ANDROID_VERSION_CODE) > 2100000000) {
    errors.push('ANDROID_VERSION_CODE must be an explicit integer from 1 to 2100000000, higher than prior Play uploads.');
  }
  try {
    const url = new URL(env.VITE_PUBLIC_APP_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
  } catch {
    errors.push('VITE_PUBLIC_APP_URL must be the public HTTPS app root URL (no query or fragment).');
  }
  if (/\[[^\]]+\]|complete before publication|complete with your actual configuration|not a completed legal policy/i.test(privacy)) {
    errors.push('Finish the privacy policy retention/request fields and remove its draft notices before release.');
  }
  if (!/mailto:[^"\s]+@[^"\s]+/.test(privacy)) errors.push('The privacy policy needs a monitored email contact link.');
  if (!privacy.includes('BigDataCloud') || !privacy.includes('Nominatim')) {
    errors.push('The privacy policy must disclose both reverse-geocoding providers.');
  }
  if (!deletion.includes('?delete-account=1') || !deletion.includes('Danger zone')) {
    errors.push('The public account-deletion page must link to the app and describe its current Danger zone path.');
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
  const deletion = readFileSync(new URL('../public/delete-account.html', import.meta.url), 'utf8');
  const errors = playReleaseErrors(process.env, privacy, deletion);
  if (errors.length) {
    console.error('Play release blocked:\n' + errors.map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Play repository prerequisites passed. Validate live Auth/RLS, hosted policy URLs, signing and device behavior separately.');
  }
}
