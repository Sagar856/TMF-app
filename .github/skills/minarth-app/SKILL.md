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
- Transaction sync uses `sync_revision` and the RPCs in
  `supabase_transaction_sync.sql`; direct legacy writes are rejected after the
  migration. Preserve RLS and owner checks, handle stale-write conflicts
  visibly, and keep `add_notification_payment` compatible via the updated
  `supabase_background_payments.sql`. The guard permits auth-account cascades;
  the authorized admin data wipe requires the updated `supabase_admin.sql`.
  Live cloud rows with pending local deletion IDs are restored for review
  rather   than deleted with a newly fetched revision; cloud tombstones remain protected.
  `supabase_financial_sync.sql` adds account revisions, an owner-scoped reset
  epoch, an atomic account/transaction/deletion RPC and hash-only retry receipts.
  `App.tsx` uploads accounts and transactions together, never as independent
  snapshots. Deletion batches include retained pending transactions and reverse
  balances in the same commit; only a confirmed batch changes the local deletion.
  The transaction-only RPC permits balance-neutral metadata changes for MINA.
  Background Add uses the same owner advisory lock and bumps account revisions.
  Legacy direct account writes are rejected. Reset removes both ledger sides
  atomically and advances the epoch, preventing old unsynced creates from returning.
  Capture a batch's owner and epoch with its snapshot, not when a delayed upload executes.
  Keep the loaded epoch in React state: another tab changing storage must not
  relabel old in-memory records with a post-reset epoch. Paired persistence rejects
  a different active cache owner or generation.
  Reset/restore invalidate old callbacks before replacing local state. Financial
  account deletion checks the account revision and epoch; pending live account
  deletions are restored for review, not retried with fresh revisions.
  `financialState.ts` stores an authoritative paired device snapshot; pending
  snapshots are recovered before cloud hydration. Conflicts preserve the local
  snapshot and offer backup export and explicit discard/reload after unlocking.
  Financial snapshot reads use one RPC, not separate account/transaction reads.
  Offline edits/deletes remain blocked; online status does not prove reachability.
  Keep deployment gated on hosted Supabase and multi-device validation of the
  complete coordinated migration set; local PGlite checks are not that validation.
- `src/utils/assistantReport.ts` prepares deterministic monthly report data;
  operating cashflow and budget usage reuse existing helpers. Accounts,
  investments, loans and goals are current snapshots, not month-end history.
  `assistantReportExplanation.ts` allows the model to select only preverified
  findings, rejecting invented or malformed output. `AssistantChatModal`
  triggers reports only on explicit report requests or the report button;
  questions merely mentioning reports do not generate one. It holds chat/report data in
  component memory, and presents the report with user-triggered CSV/PDF export.
  PDF pages are rendered images and are not text-selectable. Report exports
  reuse the same deterministic report rows.
- `src/hooks/useAssistantCategorization.ts` runs only while the app is unlocked
  and the assistant is enabled with an installed model. It processes eligible
  notification, imported and rule-origin transactions, while unknown-origin
  existing records require explicit selection. `assistantCategory.ts` validates
  proposals against current transaction state, type-valid categories and
  rules; uncertain/rule-conflicting suggestions require review. User-edited
  categories and transaction fields, including transfer destination and
  location, are protected from changes during inference. Approved changes use revision-checked sync and
  preserve other transaction fields; cloud conflicts must be reloaded or kept
  locally rather than retried as stale writes. The review UI is in
  `AssistantChatModal.tsx`.
- `useAssistantModel` owns the device-local enable preference and the assistant
  download/disable/remove lifecycle. MINA is the user-facing name, including in
  Settings search and the chat dialog. `AssistantSettingsSection` explains the
  storage impact and continuing Supabase financial-record sync; the circular
  MINA shortcut is shown only while AI is enabled and installed. MINA and the
  add FAB share `useFabScroll` for their scroll fade behavior.
- Self-service account deletion requires connectivity and invokes the
  `delete_own_account` RPC. Once the server confirms deletion, a local sign-out
  failure is reported as a cleanup warning, not a failed cloud deletion.
- The assistant worker downloads pinned, verified files into Cache
  Storage; weights are split into bounded entries and reassembled as a stream
  for inference. Pipeline preflight reads the pinned revision through a
  read-only cache adapter; generation uses the model's chat template.
  Web Locks serialize installs/removal against inference across tabs, and
  unsupported lock implementations fail explicitly. The worker prioritizes interactive chat/report requests over queued
  categorization without interrupting an active inference or passing an install.
  `AssistantRuntime.cancelInstall()` and `stop()` wait for
  partial download cleanup; removal stops the worker before deleting the model.
  Browser harnesses verified download, warm-worker offline inference, model
  removal and cross-tab locks. A fresh production worker also generated a
  synthetic finance answer with fetch disabled (zero fetch attempts); this does
  not verify an offline app/browser restart or Android compatibility.
  Those still require target-device end-to-end testing. Chat prompts and report
  findings are passed only to the local worker; never log or persist them.
- Categorization prompts use temporary category aliases rather than stored
  IDs; sanitized subcategory labels must map unambiguously to current choices.
  Prompts include transaction titles and available categories,
  not merchant/person or note fields. `assistantPrivacy.ts` filters all runtime
  prompts before the worker and rejects some unsafe responses. It blocks some
  labelled secrets and masks emails and long digit sequences, but cannot detect
  all private text; the UI warns users not to enter it. The model has no
  database tools; report inference receives derived findings, not raw records.
  Never log, persist or upload prompts, chat or report content. Ordinary
  financial records and applied category changes continue to sync to Supabase.
- General chat uses `assistantChat.ts` for bundled MINARTH navigation and
  calculation guidance and passes
  separate system/user/assistant messages through the model's chat template.
  Questions mentioning credentials receive a deterministic refusal before
  report creation or inference and are omitted from later model history; this
  is not a complete free-text privacy filter.
  Questions about report snapshot periods use verified current-snapshot
  guidance instead of a generated claim.
  Simple navigation questions about budgets, categories and auto-categorisation
  receive deterministic settings paths. Exact basic finance-definition questions
  use bundled answers without model inference; personalized questions do not.
  Category and report prompts continue
  to use their existing string protocol.
- `createSampleData` in `src/data/initialData.ts` gives each explicit demo load
  fresh IDs and remaps account links so old tombstones cannot resurrect. Demo
  loading preserves custom data/categories; remove an existing demo set before
  loading another. `isSampleRecordId` recognizes legacy and generated demo IDs.
  Cloud hydration retains every live financial row, including demo rows, and
  derives the local demo-loaded indicator from those records.
- `assistantMarketResponse.ts` handles changing-price questions without model
  generation: gold/silver amounts come only from the cached `MarketSnapshot`
  and show the IBJA source/date; other live-data requests are declined. Never
  let free-form model output invent a current quote or claim internet access.

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
   idempotent. The native notification shows a saving state; Ignore confirms
   only after its native action is persisted. In-app Add and Ignore confirm
   local completion without claiming that cloud sync succeeded.
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
`src/components/AppNotificationFeedback.test.tsx`,
`src/components/AccountsView.regression.test.tsx`, and
`src/components/TransactionsView.regression.test.tsx`.
For assistant behavior and categorization review, also run
`node --import tsx --test src/utils/assistantReport.test.ts src/utils/assistantCategory.test.ts src/utils/assistantModel.test.ts src/components/AssistantReportView.test.tsx src/components/AssistantExperience.test.tsx src/components/SettingsView.regression.test.tsx`.
For MINA's chat message construction, run `node --import tsx --test src/utils/assistantChat.test.ts`.
For worker scheduling, run `node --import tsx --test src/utils/assistantQueue.test.ts src/utils/assistantModel.test.ts`.
For revision protocol checks, run
`node --import tsx --test src/utils/transactionSync.test.ts src/utils/transactionCascade.test.ts src/utils/backgroundPayment.test.ts src/utils/authFlow.test.ts src/components/AppTransactionOffline.test.tsx`.
For atomic batches and recovery, also run
`node --import tsx --test src/utils/financialSync.test.ts src/utils/financialState.test.ts src/components/AppLaunchLoader.test.tsx`.
Demo generation and account links are covered by
`node --import tsx --test src/utils/initialData.test.ts`.
The PGlite regression includes background-payment retries, account ownership,
card and cash balances, and rollback on failure; it is not a hosted Supabase
or multi-device concurrency test.

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
