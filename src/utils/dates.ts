/**
 * Date and time utilities for Track Money Flow (TMF).
 * Always operates in user's local timezone rather than UTC to prevent
 * date shifts (e.g. before 05:30 IST / late evening timezones).
 */

/** Formats a Date object to YYYY-MM-DD in local time */
export function toLocalISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns today's date in local time as YYYY-MM-DD */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}

/** Returns the current year and month in local time as YYYY-MM */
export function currentMonthLocal(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Returns the current local time formatted as HH:MM (24-hour) */
export function nowLocalTimeHHMM(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Adds months to an ISO date string (YYYY-MM-DD), clamping day-of-month
 * to target month's maximum days (e.g., 2026-01-31 + 1 month = 2026-02-28).
 * Parses by splitting string to strictly avoid UTC Date parsing shifts.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10); // 1-12
  const targetDay = parseInt(dStr, 10);

  const totalMonths = y * 12 + (m - 1) + months;
  const targetY = Math.floor(totalMonths / 12);
  const targetM = (totalMonths % 12) + 1; // 1-12

  // Day 0 of month M+1 in local time gives the total days in month M
  const maxDays = new Date(targetY, targetM, 0).getDate();
  const clampedDay = Math.min(targetDay, maxDays);

  return `${targetY}-${String(targetM).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Adds days to an ISO date string (YYYY-MM-DD) in local time.
 */
export function addDays(isoDate: string, days: number): string {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10) + days);
  return toLocalISODate(d);
}

/**
 * Constructs a local Date object from YYYY-MM-DD without UTC timezone offset issues.
 */
export function parseLocalDate(isoDate: string): Date {
  const [yStr, mStr, dStr] = isoDate.split('-');
  return new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10) || 1);
}
