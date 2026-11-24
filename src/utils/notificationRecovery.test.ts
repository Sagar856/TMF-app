import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyMerchant } from '../services/notification/CategoryClassifier';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('native payment helpers and bridge methods are declared at class scope', () => {
  for (const file of ['InterceptedPaymentStore.java', 'NotificationInterceptPlugin.java', 'AccountSuggestionStore.java']) {
    const source = read(`native/notification-intercept-plugin/${file}`)
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const line of source.split('\n')) {
      if (/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:synchronized\s+)?[\w<>\[\]]+\s+\w+\s*\(/.test(line)) {
        assert.equal(depth, 1, `${file}: method must be a direct class member: ${line.trim()}`);
      }
      for (const brace of line.match(/[{}]/g) || []) depth += brace === '{' ? 1 : -1;
    }
    assert.equal(depth, 0, `${file}: unbalanced braces`);
  }
});

test('account suggestions remain separate from payment actions and scoped to the current owner', () => {
  const store = read('native/notification-intercept-plugin/AccountSuggestionStore.java');
  const receiver = read('native/notification-intercept-plugin/PaymentActionReceiver.java');
  assert.match(store, /owner\.equals\(record\.optString\("owner"\)\)/);
  assert.match(store, /getString\("owner", ""\)/);
  assert.match(store, /known\.optString\(i\)/);
  assert.match(store, /ignored\.optString\(i\)/);
  assert.match(store, /manager\.notify\("account:" \+ id, 3/);
  assert.doesNotMatch(store, /completeSave|PaymentSaveWorker|resolvePayment/);
  assert.match(receiver, /AccountSuggestionStore\.action\(context, accountId/);
});

test('Android category preview and JS classification share the same ordered rules', () => {
  const rules = JSON.parse(read('native/notification-intercept-plugin/res/raw/payment_category_rules.json'));
  assert.ok(rules.length > 10);
  assert.equal(classifyMerchant('Swiggy', 'INR 500 debited').category, 'Food & Dining');
  assert.equal(classifyMerchant('Groww', 'INR 500 debited').categoryType, 'Investment');
  const store = read('native/notification-intercept-plugin/InterceptedPaymentStore.java');
  assert.match(store, /R\.raw\.payment_category_rules/);
  assert.match(store, /record\.put\("classification", classify/);
  assert.match(store, /summary\.details \+ "\\nDetected  " \+ category/);
  assert.match(store, /setAutoCancel\(false\)/);
  assert.match(store, /boolean ownsRecord = record\.optString\("owner"\)\.equals\(owner\)/);
  assert.match(store, /RemoteInput\.Builder\("tmfCategory"\)/);
  assert.match(store, /RemoteInput\.Builder\("tmfDescription"\)/);
  assert.match(store, /\.addAction\(categoryAction\)[\s\S]*\.addAction\(descriptionAction\)/);
  assert.match(store, /setOnClickPendingIntent\(R\.id\.payment_ignore, ignoreIntent\)/);
  assert.match(store, /record\.put\("categoryOverride", input\.substring/);
  const categoryHandler = store.slice(store.indexOf('void category('), store.indexOf('void description('));
  const descriptionHandler = store.slice(store.indexOf('void description('), store.indexOf('void action('));
  assert.match(categoryHandler, /"saving"\.equals\(record\.optString\("action"\)\) && !record\.has\("saveError"\)/);
  assert.match(descriptionHandler, /"saving"\.equals\(record\.optString\("action"\)\) && !record\.has\("saveError"\)/);
  const receiver = read('native/notification-intercept-plugin/PaymentActionReceiver.java');
  assert.match(receiver, /InterceptedPaymentStore\.category\(context, id, category\.toString\(\)\)/);
  assert.match(receiver, /InterceptedPaymentStore\.description\(context, id, description\.toString\(\)\)/);
  const app = read('src/App.tsx');
  assert.match(app, /payment\.categoryOverride !== undefined \|\| locationTag/);
  assert.match(app, /categoryOverride: payment\.categoryOverride \?\? n\.categoryOverride/);
  const layout = read('native/notification-intercept-plugin/res/layout/payment_notification.xml');
  assert.match(layout, /@\+id\/payment_ignore/);
  assert.match(layout, /android:orientation="horizontal">[\s\S]*?@\+id\/payment_description[\s\S]*?@\+id\/payment_ignore/);
  assert.doesNotMatch(layout, /payment_edit|Edit category \/ transaction in app/);
  assert.match(store, /setTextViewText\(R\.id\.payment_ignore, "Ignore"\)/);
  const patch = read('scripts/patch-android.mjs');
  assert.match(patch, /copyFileSync\(join\(pluginSrcDir, 'res', 'raw', 'payment_category_rules.json'\)/);
});

test('Gmail previews are opt-in and statements are separate from payment capture', () => {
  const listener = read('native/notification-intercept-plugin/TmfNotificationListenerService.java');
  assert.match(listener, /emailNotificationsEnabled\(this\)\) return/);
  assert.match(listener, /TransactionEligibility\.isStatement[\s\S]*showStatementAlert[\s\S]*return;[\s\S]*TransactionEligibility\.accepts/);
  const settings = read('src/components/SettingsView.tsx');
  assert.match(settings, /checked=\{Boolean\(settings\.autoExtractEmailNotifications\)\}/);
});

test('session recovery preserves native queue and notification launch waits for unlock and hydration', () => {
  const app = read('src/App.tsx');
  const prepare = app.slice(app.indexOf('const prepareUserCache'), app.indexOf('// Bootstraps the real auth session'));
  assert.match(prepare, /clearLocalDataOnSignOut\(true\)/);
  const signedOut = app.slice(app.indexOf("if (event === 'SIGNED_OUT')"), app.indexOf('if (passwordRecoveryRef.current) return;'));
  assert.match(signedOut, /clearLocalDataOnSignOut\(true\)/);
  assert.match(app, /authLoading \|\| \(isCloudBackendConfigured\(\) && \(!isAuthenticated \|\| !cloudHydrated\)\)/);
  assert.match(app, /!isUnlocked \|\| isAppLoading \|\| \(cloudReady && !cloudHydrated\)/);
  assert.match(app, /if \(payment.owner && payment.owner !== authUser\?\.id\) return/);
  assert.match(app, /await persistInterceptedLocation\(payment, detectedLocation\)/);
  const editor = read('src/components/EditTransactionModal.tsx');
  assert.match(editor, /!transaction\?\.rawText && !coordinates && !place && locationTracking/);
});
