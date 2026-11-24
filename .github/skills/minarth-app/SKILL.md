---
name: minarth-app
description: Use when implementing, debugging, testing or reviewing MINARTH web, Android, notification, finance-data, Supabase or release behavior.
---

# MINARTH app development

Use this guide for changes to the MINARTH personal-finance application. Read
`AGENTS.md` for repository-wide rules and consult the relevant `README.md`
section before changing setup, database, Android, deployment or release
behavior.

## Stack and source map

- **Web app:** React 19, TypeScript, Vite and Tailwind. `src/main.tsx` starts
  the app; `src/App.tsx` owns major app state, navigation and cross-feature
  orchestration.
- **UI:** `src/components/` contains views and modals; `src/hooks/` contains
  reusable React behavior. Keep feature UI in its existing component rather
  than growing `App.tsx` unnecessarily.
- **Domain:** `src/types/finance.ts` defines core financial entities.
  `src/utils/` contains reusable domain logic and its colocated Node tests.
- **Services:** `src/services/supabaseClient.ts` is the main Supabase access and
  row-mapping layer. Other services own notification interception/sync,
  background payment saving, app updates, market data and device integrations.
- **Database:** `supabase_schema.sql` defines the base schema and RLS.
  Feature SQL files such as `supabase_background_payments.sql` and
  `supabase_pending_notifications.sql` add RPCs/migrations that must be
  applied to the live Supabase project separately.
- **Android:** `native/` is the hand-maintained plugin source. Capacitor
  generates the ignored `android/` project; `scripts/patch-android.mjs` copies
  native sources/resources into it. Update source under `native/`, not generated
  files.
- **Automation:** `.github/workflows/` owns Android builds, Pages deployment,
  Supabase function deployment and scheduled market-data work. `README.md`
  documents operator setup and release requirements.

## Important data and behavior contracts

- Financial records are account-owner scoped in Supabase. Preserve verified
  user checks, RLS policies and schema-fallback behavior.
- A `Transaction` uses `title` for the displayed transaction description;
  `note` is separate. Its `category` and `subcategory` must be valid for the
  transaction type. Follow the existing mapping in `supabaseClient.ts` and
  `src/utils/paymentTransaction.ts`.
- Local persistence should use the existing safe-storage helpers in
  `src/utils/storage.ts`. Do not silently report a cloud operation as saved
  when it failed.
- Transaction/account balance changes must remain idempotent and consistent.
  Reuse stable IDs and existing reconciliation/locking logic instead of
  applying a balance change again on retries.

## Android notification payment flow

1. `TmfNotificationListenerService` filters posted notifications using the
   native eligibility rules, then `InterceptedPaymentStore` durably records
   captures before notifying JavaScript.
2. `src/services/notificationListener.ts` bridges captures to `src/App.tsx`;
   TypeScript parser/eligibility logic lives under
   `src/services/notification/`.
3. Background **Add** is handled by `PaymentActionReceiver` and
   `PaymentSaveWorker`, which loads `payment-background.html` and
   `src/services/backgroundPayment.ts` in an application-context WebView.
   The signed-in owner is checked before calling the
   `add_notification_payment` RPC. Keep failures retryable and receipts
   idempotent.
4. The notification's Category and Description RemoteInput values are stored
   natively and mapped to the final transaction's `category` and `title`.
   `applyNotificationCategoryOverride` in `src/utils/paymentTransaction.ts`
   resolves category input against fetched categories for the payment
   direction, including close category-name and subcategory matches. Ambiguous
   or distant values remain retryable; this uses deterministic local text
   matching, not an AI model.
   Android provides at most three system action buttons: Add, Category and
   Description. Ignore is a custom button beside the description in
   `native/notification-intercept-plugin/res/layout/payment_notification.xml`,
   styled by
   `native/notification-intercept-plugin/res/drawable/payment_ignore_button.xml`
   and copied to generated Android by `scripts/patch-android.mjs`. When changing
   this layout, update the corresponding native source, patch script, tests and
   README guidance together.
5. Notification history is rendered by `NotificationHistoryList` in
   `src/components/NotificationPromptModal.tsx`. Added entries must not offer a
   duplicate-add/edit action; they navigate to their saved transaction through
   `src/App.tsx` and `src/components/TransactionsView.tsx`.

The full native design, permissions, migration requirements and device
limitations are documented in
`native/notification-intercept-plugin/README.md` and the UPI/SMS section of
`README.md`.

## Commands and validation

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Use focused tests first when possible. Relevant tests include
`src/utils/backgroundPayment.test.ts`,
`src/utils/notificationRecovery.test.ts`,
`src/utils/androidPatch.test.ts`,
`src/components/NotificationPromptModal.test.tsx` and
`src/components/TransactionsView.regression.test.tsx`.

For Android, `npm run cap:sync` builds the web assets and syncs Capacitor;
`npm run android:patch` applies the hand-maintained plugin sources to a
generated project. `npm run android:build` is the local debug build. CI
workflows perform signed release builds and their additional checks. A passing
TypeScript or static patch test is not proof of a successful Gradle build or
physical-device behavior.

The visible app version comes from `package.json` and the lockfile. Use the
repository's documented release process and keep both version fields aligned;
Android sideload `versionCode` is assigned by the release workflow. Never
commit signing material.

## Keep this skill up to date

Update this file in the same change as every feature or bug fix: replace
obsolete flow descriptions, update changed file paths/contracts, and add the
new focused validation path. Keep the guide concise and current instead of
appending a dated change log.
