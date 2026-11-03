export type SettingsGroup = 'profile' | 'account' | 'notifications' | 'appearance' | 'privacy' | 'help' | 'about';
export type CustomisationSection = 'budgets' | 'categories' | 'accounts' | 'rules';

export interface SettingsSearchEntry {
  id: string;
  title: string;
  path: string;
  description: string;
  keywords: string;
  targetId: string;
  group?: SettingsGroup;
  section?: CustomisationSection;
  requiresAuth?: boolean;
  requiresDeleteAccount?: boolean;
  requiresSignOut?: boolean;
  requiresPasscode?: boolean;
}

export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  { id: 'photo', title: 'Profile picture', path: 'Profile settings', description: 'Upload or remove your profile photo.', keywords: 'avatar image upload remove', targetId: 'settings-profile-photo', group: 'profile' },
  { id: 'name', title: 'Display name', path: 'Profile settings', description: 'Edit the name shown across the app.', keywords: 'username nickname rename personal details', targetId: 'profile-display-name', group: 'profile' },
  { id: 'email', title: 'Account email', path: 'Profile settings', description: 'View your read-only sign-in email.', keywords: 'emailid email id identity login address', targetId: 'profile-contact-email', group: 'profile' },
  { id: 'sign-out', title: 'Sign out', path: 'Profile settings', description: 'Review the sign-out action for this device.', keywords: 'logout signout log out logoff session', targetId: 'settings-profile-signout', group: 'profile', requiresAuth: true, requiresSignOut: true },
  { id: 'sync', title: 'Cloud sync', path: 'Account setting', description: 'Check cloud status and the last successful sync.', keywords: 'synchronize synchronise online offline upload devices', targetId: 'settings-cloud-sync', group: 'account' },
  { id: 'plan', title: 'Plan', path: 'Account setting', description: 'Free tracking and premium availability.', keywords: 'premium subscription pricing upgrade', targetId: 'settings-plan', group: 'account' },
  { id: 'backup', title: 'Data & Backup', path: 'Account setting', description: 'Export, restore or manage your saved data.', keywords: 'storage recovery archive', targetId: 'settings-data', group: 'account' },
  { id: 'export', title: 'Export backup', path: 'Account setting > Data & Backup', description: 'Save a JSON copy of your records and preferences.', keywords: 'download json save file records', targetId: 'settings-export', group: 'account' },
  { id: 'restore', title: 'Restore from backup', path: 'Account setting > Data & Backup', description: 'Choose and validate a JSON backup before restoring.', keywords: 'import upload json file recovery recover', targetId: 'settings-restore', group: 'account' },
  { id: 'sample', title: 'Sample demo data', path: 'Account setting > Data & Backup', description: 'Load or remove sample records.', keywords: 'example demonstration test data', targetId: 'sw-sample-data', group: 'account' },
  { id: 'reset', title: 'Reset all data', path: 'Account setting > Data & Backup > Danger zone', description: 'Review the action for wiping financial records.', keywords: 'erase clear wipe remove records factory reset', targetId: 'settings-reset-data', group: 'account' },
  { id: 'delete-account', title: 'Delete account', path: 'Account setting > Data & Backup > Danger zone', description: 'Review permanent account deletion.', keywords: 'remove erase close account identity', targetId: 'settings-delete-account', group: 'account', requiresAuth: true, requiresDeleteAccount: true },
  { id: 'notification-access', title: 'Notification access', path: 'Notifications', description: 'Android permission for bank and UPI payment capture.', keywords: 'permission sms android bank upi listener interceptor', targetId: 'settings-notification-access', group: 'notifications' },
  { id: 'extract', title: 'Auto-extract from notifications', path: 'Notifications', description: 'Detect payment details from bank messages.', keywords: 'sms automatic capture parsing merchant bank upi', targetId: 'sw-auto-extract', group: 'notifications' },
  { id: 'push', title: 'Add transaction push alerts', path: 'Notifications', description: 'Alerts when an unlogged payment is detected.', keywords: 'notification debit credit push permission', targetId: 'sw-push-alerts', group: 'notifications' },
  { id: 'budget-alerts', title: 'Budget threshold alerts', path: 'Notifications', description: 'Alerts at 80% and 100% of a monthly budget.', keywords: 'notification spending limits warning overspending', targetId: 'sw-budget-alerts', group: 'notifications' },
  { id: 'theme', title: 'Theme', path: 'Appearance > Appearance & Display', description: 'Choose light or dark mode.', keywords: 'light dark mode color colour ceramic obsidian', targetId: 'settings-theme', group: 'appearance' },
  { id: 'expand', title: 'Auto-expand dashboard sections on scroll', path: 'Appearance > Appearance & Display', description: 'Automatically open dashboard cards as you scroll.', keywords: 'home cards collapse animation', targetId: 'sw-auto-expand', group: 'appearance' },
  { id: 'currency', title: 'Preferred currency', path: 'Appearance > Currency & Region', description: 'Choose the currency for balances and reports.', keywords: 'money symbol locale region rupee dollar euro pound inr usd eur gbp', targetId: 'settings-region', group: 'appearance' },
  { id: 'password', title: 'Change password', path: 'Privacy & Security', description: 'Confirm your current password and set a new one.', keywords: 'login credential sign in reset password', targetId: 'settings-password', group: 'privacy', requiresAuth: true },
  { id: 'mask', title: 'Mask balances by default', path: 'Privacy & Security', description: 'Hide net worth and totals until revealed.', keywords: 'hide money amounts eye privacy net worth', targetId: 'sw-mask-balances', group: 'privacy' },
  { id: 'location', title: 'Location tagging', path: 'Privacy & Security', description: 'Attach device location to selected transactions.', keywords: 'gps geolocation map permission tracking', targetId: 'sw-location', group: 'privacy' },
  { id: 'passcode', title: 'App passcode protection', path: 'Privacy & Security', description: 'Protect app access with a device-local PIN.', keywords: 'lock pin unlock security code', targetId: 'sw-passcode', group: 'privacy' },
  { id: 'change-pin', title: 'Change PIN', path: 'Privacy & Security > App passcode protection', description: 'Set a different app passcode.', keywords: 'update lock pin code', targetId: 'settings-change-pin', group: 'privacy', requiresPasscode: true },
  { id: 'biometrics', title: 'Unlock with device biometrics', path: 'Privacy & Security', description: 'Fingerprint, face or Windows Hello. Requires app passcode protection.', keywords: 'touch id faceid face id fingerprint authentication', targetId: 'sw-biometric', group: 'privacy' },
  { id: 'auto-lock', title: 'Auto-lock', path: 'Privacy & Security', description: 'Choose when to lock after backgrounding. Requires app passcode protection.', keywords: 'timeout delay timer minutes restart', targetId: 'settings-auto-lock', group: 'privacy' },
  { id: 'confirm-delete', title: 'Skip delete confirmations', path: 'Privacy & Security', description: 'Control confirmation dialogs for transactions, investments and loans.', keywords: 'confirmation dialog records remove lend', targetId: 'settings-delete-confirmations', group: 'privacy' },
  { id: 'privacy', title: 'Privacy policy', path: 'Privacy & Security > Privacy', description: 'Learn how your data is stored and protected.', keywords: 'personal data row level security policy permissions', targetId: 'settings-privacy', group: 'privacy' },
  { id: 'budgets', title: 'Budgets', path: 'Categories & Budgets', description: 'Manage monthly category spending limits.', keywords: 'monthly budget limits spending edit monitor', targetId: 'settings-customisations-heading', section: 'budgets' },
  { id: 'categories', title: 'Categories', path: 'Categories & Budgets', description: 'Edit income, expense and investment categories.', keywords: 'subcategory subcategories tags classification rename', targetId: 'settings-customisations-heading', section: 'categories' },
  { id: 'accounts', title: 'Manage accounts', path: 'Categories & Budgets', description: 'Manage bank, card and wallet accounts.', keywords: 'bank credit card debit wallet upi balances linked', targetId: 'settings-customisations-heading', section: 'accounts' },
  { id: 'brokers', title: 'Manual Broker Portfolios', path: 'Categories & Budgets > Manage accounts', description: 'Track portfolio valuations and estimated returns.', keywords: 'investments stocks holdings broker portfolio valuation', targetId: 'settings-brokers', section: 'accounts' },
  { id: 'rules', title: 'Auto-categorise', path: 'Categories & Budgets', description: 'Manage automatic merchant and keyword rules.', keywords: 'categorize categorise automatic smart rules keyword merchant classification', targetId: 'settings-customisations-heading', section: 'rules' },
  { id: 'help', title: 'Help and Support', path: 'Help and Support', description: 'Payment capture, background alerts and backup guidance.', keywords: 'troubleshooting battery autostart notification permissions problem', targetId: 'settings-help', group: 'help' },
  { id: 'issues', title: 'Report an issue or request a feature', path: 'Help and Support', description: 'Find the GitHub support link.', keywords: 'bug feedback contact github support', targetId: 'settings-report-issue', group: 'help' },
  { id: 'version', title: 'Version', path: 'About', description: 'Check the installed MINARTH version.', keywords: 'build release app minarth mtracker', targetId: 'settings-version', group: 'about' },
  { id: 'android', title: 'Android app', path: 'About', description: 'Find the Android APK download.', keywords: 'install download mobile apk phone', targetId: 'settings-android', group: 'about' },
  { id: 'source', title: 'Open source', path: 'About', description: 'View the project on GitHub.', keywords: 'repository github code project', targetId: 'settings-source', group: 'about' },
];

const words = (value: string): string[] =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

function isMinorTypo(query: string, word: string): boolean {
  if (query.length < 4 || word.length < 4 || Math.abs(query.length - word.length) > 1) return false;
  if (query.length === word.length) {
    const differences = [...query].reduce<number[]>((indices, letter, index) => {
      if (letter !== word[index]) indices.push(index);
      return indices;
    }, []);
    if (differences.length <= 1) return true;
    const [first, second] = differences;
    return differences.length === 2 && second === first + 1 && query[first] === word[second] && query[second] === word[first];
  }
  const shorter = query.length < word.length ? query : word;
  const longer = query.length < word.length ? word : query;
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  return shorter.slice(index) === longer.slice(index + 1);
}

export interface SettingsSearchOptions {
  isAuthenticated?: boolean;
  canDeleteAccount?: boolean;
  canSignOut?: boolean;
  passcodeEnabled?: boolean;
}

export function searchSettings(query: string, options: SettingsSearchOptions = {}): SettingsSearchEntry[] {
  const ignored = new Set(['how', 'to', 'my', 'the', 'a', 'an', 'in', 'on', 'and', 'is', 'setting', 'settings']);
  const tokens = [...new Set(words(query).filter(token => !ignored.has(token)))];
  if (!tokens.length) return [];
  return SETTINGS_SEARCH_ENTRIES
    .filter(entry => (!entry.requiresAuth || options.isAuthenticated)
      && (!entry.requiresDeleteAccount || options.canDeleteAccount)
      && (!entry.requiresSignOut || options.canSignOut)
      && (!entry.requiresPasscode || options.passcodeEnabled))
    .map(entry => {
      const fields = [words(entry.title), words(entry.keywords), words(entry.path), words(entry.description)];
      const scores = tokens.map(token => {
        let best = Infinity;
        fields.forEach((field, fieldIndex) => field.forEach(word => {
          const cost = token === word ? 0 : word.startsWith(token) ? 2 : isMinorTypo(token, word) ? 8 : Infinity;
          best = Math.min(best, cost + fieldIndex * 2);
        }));
        return best;
      });
      const title = words(entry.title).join(' ');
      const phrase = tokens.join(' ');
      return { entry, score: scores.reduce((sum, score) => sum + score, 0) - (title === phrase ? 20 : title.includes(phrase) ? 10 : 0) };
    })
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title))
    .map(result => result.entry);
}
