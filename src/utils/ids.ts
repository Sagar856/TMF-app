/**
 * ID generator utility for entities across TMF.
 * Produces collision-resistant unique IDs using crypto.randomUUID() with prefix,
 * falling back to timestamp + random entropy if randomUUID is unavailable.
 */
export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
