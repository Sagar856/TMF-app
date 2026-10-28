/**
 * Strict numeric parsing for form inputs. Unlike `parseFloat(x) || 0`, these
 * helpers distinguish "blank" from "zero" from "garbage" so callers can show a
 * validation message instead of silently saving 0 or a default.
 */

export interface ParseNumberOptions {
  /** Allow an empty string; returns `null` instead of an error. Default false. */
  allowEmpty?: boolean;
  /** Minimum accepted value (inclusive). */
  min?: number;
  /** Maximum accepted value (inclusive). */
  max?: number;
  /** Require an integer. */
  integer?: boolean;
  /** Human label used in the error message. */
  label?: string;
}

export type ParseNumberResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function parseNumberInput(raw: string | number | null | undefined, options: ParseNumberOptions = {}): ParseNumberResult {
  const { allowEmpty = false, min, max, integer = false, label = 'Value' } = options;
  const text = raw === null || raw === undefined ? '' : String(raw).trim().replace(/,/g, '');

  if (text === '') {
    return allowEmpty ? { ok: true, value: null } : { ok: false, error: `${label} is required.` };
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) {
    return { ok: false, error: `${label} must be a number.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: `${label} must be a number.` };
  if (integer && !Number.isInteger(value)) return { ok: false, error: `${label} must be a whole number.` };
  if (min !== undefined && value < min) return { ok: false, error: `${label} must be at least ${min}.` };
  if (max !== undefined && value > max) return { ok: false, error: `${label} must be at most ${max}.` };
  return { ok: true, value };
}

/** Convenience: parse a required positive amount (> 0). */
export function parsePositiveAmount(raw: string | number | null | undefined, label = 'Amount'): ParseNumberResult {
  const result = parseNumberInput(raw, { label, min: 0 });
  if (!result.ok) return result;
  if ((result.value ?? 0) <= 0) return { ok: false, error: `${label} must be greater than zero.` };
  return result;
}

/** Convenience: optional non-negative number; blank → `null`. */
export function parseOptionalNonNegative(raw: string | number | null | undefined, label = 'Value'): ParseNumberResult {
  return parseNumberInput(raw, { label, min: 0, allowEmpty: true });
}
