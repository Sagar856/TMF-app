export interface PasscodeCredentials {
  passcodeHash: string;
  passcodeSalt: string;
}

export async function hashPasscode(pin: string, salt: string): Promise<string> {
  const input = new TextEncoder().encode(salt + pin);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPasscodeCredentials(pin: string): Promise<PasscodeCredentials> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  return { passcodeSalt: salt, passcodeHash: await hashPasscode(pin, salt) };
}

export async function verifyPasscode(
  pin: string,
  credentials: Partial<PasscodeCredentials>
): Promise<boolean> {
  if (!credentials.passcodeHash || !credentials.passcodeSalt) return false;
  return await hashPasscode(pin, credentials.passcodeSalt) === credentials.passcodeHash;
}
