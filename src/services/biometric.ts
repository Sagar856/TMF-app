/**
 * Device biometric unlock via the WebAuthn platform authenticator
 * (Windows Hello, Touch ID, Android biometrics). No server is involved: we
 * register a discoverable credential once and later ask the authenticator to
 * sign a random challenge — a successful `get()` with user verification is
 * the unlock signal. The credential id is device-specific and never synced.
 */

const CREDENTIAL_KEY = 'tmf_biometric_credential_id';

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (!('PublicKeyCredential' in window) || !navigator.credentials) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricEnrolled(): boolean {
  try {
    return Boolean(localStorage.getItem(CREDENTIAL_KEY));
  } catch {
    return false;
  }
}

export function clearBiometricEnrollment(): void {
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
  } catch {
    /* ignore */
  }
}

/** Registers a platform credential bound to this device. Resolves false if the user cancels or it is unsupported. */
export async function enrollBiometric(userLabel: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'MTracker', id: window.location.hostname },
        user: { id: userId, name: userLabel || 'mtracker-user', displayName: userLabel || 'MTracker user' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!credential) return false;
    localStorage.setItem(CREDENTIAL_KEY, toBase64Url(credential.rawId));
    return true;
  } catch (error) {
    console.warn('Biometric enrollment failed:', error);
    return false;
  }
}

/** Prompts the device authenticator; resolves true only on a verified assertion for the enrolled credential. */
export async function verifyBiometric(): Promise<boolean> {
  const stored = (() => {
    try {
      return localStorage.getItem(CREDENTIAL_KEY);
    } catch {
      return null;
    }
  })();
  if (!stored || !(await isBiometricAvailable())) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(stored), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) return false;
    const response = assertion.response as AuthenticatorAssertionResponse;
    // Bit 2 (0x04) of authenticatorData flags = User Verified.
    const flags = new Uint8Array(response.authenticatorData)[32] ?? 0;
    return toBase64Url(assertion.rawId) === stored && (flags & 0x04) !== 0;
  } catch (error) {
    console.warn('Biometric verification failed:', error);
    return false;
  }
}
