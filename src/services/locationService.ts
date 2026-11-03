import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Location Service for TMF
 * Handles device geolocation retrieval and human-readable reverse geocoding.
 */

export interface GeolocationResult {
  lat: number;
  lng: number;
  formattedLocation: string;
}

// In-memory cache for recent reverse-geocoded coordinates
const locationCache: { [key: string]: { result: GeolocationResult; timestamp: number } } = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// Tracks if user explicitly denied permission during the current session
let permissionDeniedInSession = false;

export async function isDeviceLocationPermissionGranted(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permissions = await Geolocation.checkPermissions();
      return permissions.location === 'granted' || permissions.coarseLocation === 'granted';
    } catch (error) {
      console.warn('Could not check device location permission:', error);
      return false;
    }
  }
  if (typeof navigator === 'undefined' || !navigator.permissions) return false;
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
  } catch {
    return false;
  }
}

export async function requestDeviceLocationPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) {
    try {
      const current = await Geolocation.checkPermissions();
      if (current.location === 'granted' || current.coarseLocation === 'granted') return true;
      const requested = await Geolocation.requestPermissions();
      const granted = requested.location === 'granted' || requested.coarseLocation === 'granted';
      if (granted) permissionDeniedInSession = false;
      return granted;
    } catch (error) {
      console.warn('Could not request device location permission:', error);
      return false;
    }
  }
  if (!navigator.geolocation) return false;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        permissionDeniedInSession = false;
        resolve(true);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) permissionDeniedInSession = true;
        resolve(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/**
 * Formats reverse geocode details into a concise, user-friendly location string
 * e.g., 'Bandra West, Mumbai', 'Andheri East, Mumbai', 'Pune, Maharashtra'
 */
export function formatConciseLocation(data: {
  suburb?: string;
  neighbourhood?: string;
  road?: string;
  city_district?: string;
  locality?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  principalSubdivision?: string;
  country?: string;
}): string {
  const localPart =
    data.suburb ||
    data.neighbourhood ||
    data.locality ||
    data.city_district ||
    data.road ||
    '';

  const cityPart =
    data.city ||
    data.town ||
    data.village ||
    data.county ||
    '';

  const statePart =
    data.state ||
    data.principalSubdivision ||
    '';

  const clean = (s: string) => s.trim().replace(/^,\s*|\s*,$/g, '');

  if (localPart && cityPart) {
    if (localPart.toLowerCase() !== cityPart.toLowerCase()) {
      return clean(`${localPart}, ${cityPart}`);
    }
    return clean(localPart);
  }

  if (cityPart && statePart) {
    if (cityPart.toLowerCase() !== statePart.toLowerCase()) {
      return clean(`${cityPart}, ${statePart}`);
    }
    return clean(cityPart);
  }

  if (localPart && statePart) {
    return clean(`${localPart}, ${statePart}`);
  }

  return clean(localPart || cityPart || statePart || '');
}

/**
 * Reverse geocodes latitude and longitude to a human-readable address.
 * Tries BigDataCloud client API first, then falls back to OpenStreetMap Nominatim.
 */
export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number
): Promise<string | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = locationCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result.formattedLocation;
  }

  // Attempt 1: BigDataCloud Client Reverse Geocode (free, client-side friendly, CORS-enabled)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const locality = json.locality || json.localityInfo?.administrative?.[3]?.name || json.localityInfo?.administrative?.[2]?.name;
      const city = json.city || json.localityInfo?.administrative?.[1]?.name;
      const state = json.principalSubdivision;

      const formatted = formatConciseLocation({
        locality: locality || '',
        city: city || '',
        principalSubdivision: state || '',
        country: json.countryName || '',
      });

      if (formatted) {
        locationCache[cacheKey] = {
          result: { lat, lng, formattedLocation: formatted },
          timestamp: Date.now(),
        };
        return formatted;
      }
    }
  } catch (err) {
    // Silently proceed to fallback
  }

  // Attempt 2: OpenStreetMap Nominatim Reverse Geocoding
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const addr = json.address || {};
      const formatted = formatConciseLocation({
        suburb: addr.suburb,
        neighbourhood: addr.neighbourhood,
        road: addr.road,
        city_district: addr.city_district || addr.quarter,
        city: addr.city,
        town: addr.town,
        village: addr.village,
        county: addr.county,
        state: addr.state,
      });

      if (formatted) {
        locationCache[cacheKey] = {
          result: { lat, lng, formattedLocation: formatted },
          timestamp: Date.now(),
        };
        return formatted;
      }
    }
  } catch (err) {
    // Network or timeout failure
  }

  return null;
}

/**
 * Retrieves the user's current device position and converts it to a human-readable location.
 * Does NOT throw errors and gracefully returns null on failure or denial.
 */
export async function getCurrentDeviceLocation(): Promise<GeolocationResult | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || (!Capacitor.isNativePlatform() && !navigator.geolocation)) {
    return null;
  }

  if (permissionDeniedInSession) {
    return null;
  }

  try {
    const position = Capacitor.isNativePlatform()
      ? await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 })
      : await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12_000,
            maximumAge: 60_000,
          });
        });
    const { latitude, longitude } = position.coords;
    const formattedLocation = await reverseGeocodeCoordinates(latitude, longitude);
    return formattedLocation ? { lat: latitude, lng: longitude, formattedLocation } : null;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 1) {
      permissionDeniedInSession = true;
    }
    console.warn('Could not detect or resolve the current device location:', error);
    return null;
  }
}
