import { Capacitor, registerPlugin } from '@capacitor/core';

export const APK_UPDATE_URL = 'https://sagar856.github.io/TMF-app/downloads/update.json';
export const APK_DOWNLOAD_URL = 'https://sagar856.github.io/TMF-app/downloads/TMF-app.apk';
export const CHECK_APP_UPDATE_EVENT = 'minarth-check-app-update';

export interface InstalledApp {
  appId: string;
  versionName: string;
  versionCode: number;
  supported: boolean;
}

export interface ApkUpdate {
  schemaVersion: 1;
  appId: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  sha256: string;
  size: number;
  publishedAt: string;
}

interface AppUpdatePlugin {
  getInfo(): Promise<InstalledApp>;
  downloadAndInstall(update: ApkUpdate): Promise<{ status: 'installer-opened' | 'permission-required' }>;
}

const nativeUpdater = registerPlugin<AppUpdatePlugin>('AppUpdate');
export const canCheckApkUpdates = () => Capacitor.getPlatform() === 'android';

export function parseApkUpdate(value: unknown): ApkUpdate {
  if (!value || typeof value !== 'object') throw new Error('The update server returned invalid metadata.');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || data.appId !== 'com.trackmoneyflow.app'
    || typeof data.versionName !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(data.versionName)
    || typeof data.versionCode !== 'number' || !Number.isSafeInteger(data.versionCode) || data.versionCode < 1 || data.versionCode > 2100000000
    || data.apkUrl !== APK_DOWNLOAD_URL
    || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)
    || typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > 150 * 1024 * 1024
    || typeof data.publishedAt !== 'string' || !Number.isFinite(Date.parse(data.publishedAt))) {
    throw new Error('The update server returned invalid or untrusted metadata.');
  }
  return {
    schemaVersion: 1, appId: data.appId, versionName: data.versionName,
    versionCode: data.versionCode, apkUrl: data.apkUrl, sha256: data.sha256,
    size: data.size, publishedAt: data.publishedAt,
  };
}

export async function checkForApkUpdate(): Promise<{ installed: InstalledApp; update: ApkUpdate | null }> {
  const installed = await nativeUpdater.getInfo();
  if (!installed.supported) return { installed, update: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${APK_UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Could not check for updates (HTTP ${response.status}). Please try again.`);
    const update = parseApkUpdate(await response.json());
    if (installed.appId !== update.appId) throw new Error('This update belongs to a different app.');
    return { installed, update: update.versionCode > installed.versionCode ? update : null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadAndInstallApk(update: ApkUpdate) {
  return nativeUpdater.downloadAndInstall(parseApkUpdate(update));
}

export function requestAppUpdateCheck() {
  window.dispatchEvent(new Event(CHECK_APP_UPDATE_EVENT));
}
