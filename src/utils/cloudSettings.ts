import { UserSettings } from '../types/finance';

const STRING_KEYS = ['userName', 'userEmail', 'userPhoto', 'currencySymbol', 'currencyCode', 'locale'] as const;
const BOOLEAN_KEYS = [
  'budgetAlertsEnabled', 'defaultNetWorthMasked', 'autoCollapseExpandOnScroll',
  'skipDeleteConfirmation', 'skipInvestmentDeleteConfirmation', 'skipLoanDeleteConfirmation',
] as const;

export interface CloudSettings {
  settings: Partial<UserSettings>;
  smartRules: { id: string; keyword: string; category: string; subcategory: string }[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Explicit allowlist keeps credentials, device permissions and lock settings local.
export function portableSettings(value: unknown): Partial<UserSettings> {
  if (!isRecord(value)) throw new TypeError('Invalid cloud settings.');
  const result: Partial<UserSettings> = {};
  for (const key of STRING_KEYS) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string') throw new TypeError(`Invalid setting: ${key}`);
      Object.assign(result, { [key]: value[key] });
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw new TypeError(`Invalid setting: ${key}`);
      Object.assign(result, { [key]: value[key] });
    }
  }
  if (value.theme !== undefined) {
    if (value.theme !== 'light' && value.theme !== 'dark') throw new TypeError('Invalid theme.');
    result.theme = value.theme;
  }
  return result;
}

export function parseCloudSettings(value: unknown): CloudSettings {
  if (!isRecord(value)) throw new TypeError('Invalid cloud settings payload.');
  const settings = portableSettings(value.settings);
  if (value.smartRules === null) return { settings, smartRules: null };
  if (!Array.isArray(value.smartRules)) throw new TypeError('Invalid category rules.');
  const smartRules = value.smartRules.map((rule: unknown) => {
    if (!isRecord(rule) || typeof rule.id !== 'string' || typeof rule.keyword !== 'string'
      || typeof rule.category !== 'string' || typeof rule.subcategory !== 'string') {
      throw new TypeError('Invalid category rule.');
    }
    return { id: rule.id, keyword: rule.keyword, category: rule.category, subcategory: rule.subcategory };
  });
  return { settings, smartRules };
}
