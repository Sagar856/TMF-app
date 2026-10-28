export interface PasscodeCredentials {
  passcodeHash: string;
  passcodeSalt: string;
}

/** Current scheme: PBKDF2-HMAC-SHA256. Stored as `pbkdf2$<iterations>$<hex>` so legacy hashes stay recognisable. */
export const PBKDF2_ITERATIONS = 150_000;
const PBKDF2_PREFIX = 'pbkdf2$';
const DERIVED_BITS = 256;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Legacy scheme (single SHA-256 of salt+pin). Kept only to verify and then upgrade existing credentials. */
export async function hashPasscode(pin: string, salt: string): Promise<string> {
  const input = new TextEncoder().encode(salt + pin);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return toHex(digest);
}

export async function derivePasscodeHash(pin: string, salt: string, iterations: number = PBKDF2_ITERATIONS): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    keyMaterial,
    DERIVED_BITS
  );
  return `${PBKDF2_PREFIX}${iterations}$${toHex(bits)}`;
}

export function isLegacyPasscodeHash(hash: string | undefined): boolean {
  return Boolean(hash) && !String(hash).startsWith(PBKDF2_PREFIX);
}

/** Constant-time string comparison so verification timing doesn't leak how many characters matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  let diff = bytesA.length ^ bytesB.length;
  const length = Math.max(bytesA.length, bytesB.length);
  for (let i = 0; i < length; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

export async function createPasscodeCredentials(pin: string): Promise<PasscodeCredentials> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { passcodeSalt: salt, passcodeHash: await derivePasscodeHash(pin, salt) };
}

export async function verifyPasscode(
  pin: string,
  credentials: Partial<PasscodeCredentials>
): Promise<boolean> {
  if (!credentials.passcodeHash || !credentials.passcodeSalt) return false;
  const stored = credentials.passcodeHash;
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const iterations = Number(stored.split('$')[1]);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const candidate = await derivePasscodeHash(pin, credentials.passcodeSalt, iterations);
    return constantTimeEqual(candidate, stored);
  }
  return constantTimeEqual(await hashPasscode(pin, credentials.passcodeSalt), stored);
}

const COMMON_PINS = new Set(['1234', '4321', '0000', '1111', '2580', '0852', '1212', '6969', '1004', '2000', '123456', '654321', '000000', '111111', '121212', '112233', '159753']);

/** Rejects trivially guessable PINs: repeated digits, straight ascending/descending runs and well-known choices. */
export function getWeakPinReason(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'PIN must be 4 to 6 digits.';
  if (COMMON_PINS.has(pin)) return 'That PIN is too common.';
  if (/^(\d)\1+$/.test(pin)) return 'Avoid repeating the same digit.';
  const digits = pin.split('').map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return 'Avoid sequential digits like 2345 or 9876.';
  return null;
}
