import type { InterceptedPayment } from './notificationListener';
import type { LocationTag } from '../types/finance';
import { getCurrentDeviceLocation, isDeviceLocationPermissionGranted, reverseGeocodeCoordinates } from './locationService';

export function canLocatePaymentNow(postedAt: number, now = Date.now()): boolean {
  return Number.isFinite(postedAt) && Math.abs(now - postedAt) <= 120_000;
}

export function isReadableLocation(name?: string): name is string {
  return Boolean(name?.trim()) && name !== 'Location name unavailable'
    && !/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(name || '');
}

export async function resolvePaymentLocation(
  payment: InterceptedPayment,
  enabled: boolean,
  existing?: LocationTag,
): Promise<LocationTag | undefined> {
  const location = payment.location || existing;
  if (location) {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)
      || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
      throw new Error('Invalid captured payment coordinates');
    }
    if (isReadableLocation(location.name)) return { ...location, name: location.name };
    if (!enabled) return { lat: location.lat, lng: location.lng, name: 'Location name unavailable' };
    const name = await reverseGeocodeCoordinates(location.lat, location.lng);
    if (!name) console.warn('Payment coordinates retained; readable location is unavailable and will be retried.');
    return { lat: location.lat, lng: location.lng, name: name || 'Location name unavailable' };
  }
  if (!enabled) return existing;
  if (document.visibilityState !== 'visible' || !canLocatePaymentNow(payment.postedAt)
    || !(await isDeviceLocationPermissionGranted())) return undefined;
  if (!canLocatePaymentNow(payment.postedAt)) return undefined;
  const detected = await getCurrentDeviceLocation();
  if (!canLocatePaymentNow(payment.postedAt) || document.visibilityState !== 'visible') return undefined;
  return detected ? {
    lat: detected.lat, lng: detected.lng,
    name: isReadableLocation(detected.formattedLocation) ? detected.formattedLocation : 'Location name unavailable',
  } : undefined;
}
