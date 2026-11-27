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
  questions merely mentioning reports do not generate one. First-use consent
  gates chat, including local storage of messages, generated reports and commentary.
  `assistantChatHistory.ts` stores one owner-scoped IndexedDB archive atomically:
  five newest chats by creation, last-open selection and report snapshots with
  original currency. Creating a sixth deletes the oldest, not the least recently
  viewed. Stale same-chat writes fail instead of replacing another window's reply.
  Chats survive sign-out outside financial caches/sync/backups; App gates access
  by signed-in owner and unlock, keys the modal by owner, and closes it on sign-out.
  Never pass that storage owner to the model. Clear chats withdraws consent;
  auth-account deletion attempts local cleanup after cloud deletion without
  blocking deletion on a storage failure. Other devices need local cleanup.
  Model removal does not delete chats. Local storage is not a separate encrypted
  vault; keep this limitation visible. Report exports are user-triggered CSV/PDF.
  PDF pages are rendered images and are not text-selectable. Report exports
  reuse the same deterministic report rows.
  The palette-aware chat shell has a fixed-height scrollable conversation,
  labelled message bubbles, draft-only starter questions and an auto-growing
  composer (Enter sends, Shift+Enter inserts a newline; IME Enter is ignored).
  An on-demand left navigation contains new/previous chats, individual deletion
  through each chat's floating three-dot menu, and clear-all confirmation. Individual deletion removes the
  selected chat and reports atomically without withdrawing consent; deleting
  the active chat selects the newest remaining chat or leaves an empty session.
  The navigation also contains expandable monthly report controls; Escape and
  Android Back close chat options, then navigation, before closing MINA.
  Privacy/capability disclosures remain in a footer details
  control. Preserve the consent gate, chat navigation and report/category actions.
  Validate shell changes with `AssistantExperience.test.tsx` and browser checks
  at mobile/desktop sizes in both themes.
- `src/hooks/useAssistantCategorization.ts` runs inference only while the app is
  unlocked and the assistant is enabled with an installed model; durable saved
  notification reviews remain manually actionable without the model. It processes eligible
  notification, imported and rule-origin transactions, while unknown-origin
  existing records require explicit selection. `assistantCategory.ts` validates
  proposals against current transaction state, type-valid categories and
  rules; uncertain/rule-conflicting suggestions require review. User-edited
  categories and transaction fields, including transfer destination and
  location, are protected from changes during inference. Approved changes use revision-checked sync and
  preserve other transaction fields. Processing is invalidated on owner/lock
  changes, and metadata sync checks the captured owner; cloud conflicts must be reloaded or kept
  locally rather than retried as stale writes. The review UI is the Pending review
  section in `NotificationPromptModal.tsx`, beside History; unsaved captured
  payments remain separate.
  Clear titles first use `matchNotificationCategoryText` without inference.
  Invalid output and inference failures produce manual-only reviews with
  View transaction/Keep current, not Apply; do not retry these failures on
  every rerender. The alert opens Pending review. Notification-bell pending payments
  are a separate queue. Toast expiration depends on toast identity/duration,
  not a changing onDismiss callback, and warning icons must not imply deletion.
  Category confirmations use `notificationCategoryFeedback.ts` for amount and
  category; the hook emits them after the React transaction state commits.
- `useAssistantModel` owns the device-local enable preference and the assistant
  download/disable/remove lifecycle. MINA is the user-facing name, including in
  Settings search and the chat dialog. Settings exposes it under its own
  MINA AI Assistance entry. `AssistantSettingsSection` explains the
  storage impact and continuing Supabase financial-record sync; the circular
  MINA shortcut is shown only while AI is enabled and installed. MINA and the
  add FAB share `useFabScroll` for their scroll fade behavior.
- `ProfilePhotoEditor` previews a local square crop with zoom, position and
  rotation before applying a 256px thumbnail to the unsaved profile form.
  `CustomisationsView` portals the category editor to the viewport as a
  responsive sheet; retain its existing category and budget operations.
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
  Those still require target-device end-to-end testing. Inference prompts and report
  findings are passed only to the local worker; never log or upload them. Only
  consented chat messages/report snapshots are retained in the chat archive.
- Categorization prompts use temporary category aliases rather than stored
  IDs; sanitized subcategory labels must map unambiguously to current choices.
  Prompts include transaction titles and available categories,
  not merchant/person or note fields. `assistantPrivacy.ts` filters all runtime
  prompts before the worker and rejects some unsafe responses. It blocks some
  labelled secrets and masks emails and long digit sequences, but cannot detect
  all private text; the UI warns users not to enter it. The model has no
  database tools; report inference receives derived findings, not raw records.
  Never log or upload prompts, chat or report content. Persist only consented
  messages/report snapshots through `assistantChatHistory.ts`. Ordinary
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
  and general budget-usage formula questions use verified bundled answers
  without model inference; personalized or multi-part questions do not.
  Category and report prompts continue
  to use their existing string protocol.
  `assistantCategoryActions.ts` parses bounded category/subcategory/budget
  requests without executing model output. The chat asks for missing fields,
  previews a single change and requires confirmation; proposals are transient
  and reset on chat changes. App validates current categories, owner/unlock,
  connectivity and storage before updating state and using ordinary category sync.
  `assistantCategoryOverview.ts` answers current category/budget list requests
  directly from device records and `computeBudgetUsage`. Labels are filtered;
  derived amounts remain exact. Mark these responses `localData` in local chat
  storage and exclude them from subsequent model prompts. No model database
  tools or owner identity are needed. Runtime generation has a 60-second
  queue-inclusive deadline; terminate stalled workers and reject pending calls,
  without interrupting install cleanup.
  Main Settings navigation resets nested activity keys and clears subpage
  requests/search through `SettingsView.resetToMenuRequest`.
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
   `InterceptedPaymentStore.action` scans the full pending queue and returns
   false after the loop for an empty queue or unknown ID; keep that return
   outside the loop so every Java path returns and later payments remain actionable.
4. The notification's Category and Description RemoteInput values are stored
   natively and mapped to the final transaction's `category` and `title`.
   `notificationCategorization.ts` is shared by foreground and background Add.
   Category text takes priority over entered Description. Fast matching in
   `paymentTransaction.ts` uses close category/subcategory names and shared
   `CategoryClassifier.ts` merchant/topic rules. Meals and food merchants map
   only to available categories; conflicting matches never pick the first rule.
   Complete current category/subcategory names can match within longer phrases;
   conflicting destinations and multiple matching subcategories stay ambiguous.
   Negated text does not produce keyword or phrase matches unless it exactly
   names an available category or subcategory.
   Notification Add uses immediate shared rules regardless of MINA's state.
   Unmatched Category/Description saves promptly with parser categorisation.
   `notificationCategoryJobs.ts` stores owner-scoped, per-transaction local jobs
   before foreground persistence; background receipts retain the text until
   durable import before acknowledgement. No job text is synced. The hook
   processes jobs with Web Locks only after unlock and cloud hydration/revision
   availability; disabled MINA exposes a manual category/subcategory Save form.
   Explicit Category takes priority over Description. Model output must use
   available categories, and ambiguous local evidence forces review.
   Review snapshots and completion markers survive restart; revision checks,
   owner/lock invalidation and original-field checks reject stale edits.
   Job lookup is batched per pass; deleted synced transactions complete their
   jobs without recreating records. Review actions show progress and errors.
   Android keeps a separate durable category-review notification whose Save
   Activity intent opens Pending review after unlock, never the Add receiver.
   Missing permission leaves in-app review; model inference waits while closed
   or locked. Completion cancels the follow-up. Sign-out/reset clears jobs.
   Foreground Add guards duplicate requests and concurrent changes, using
   the latest paired snapshot even when another Add finishes before a rerender.
   `NotificationPromptModal` shows a saving spinner and disables conflicting
   payment actions/pagination while its Add request is pending.
   Background Add requests a native amount/category toast only after cloud save
   and receipt persistence; receipt retries omit it. Android controls visibility.
   `applyNotificationCategoryOverride` remains the synchronous matching path for Edit.
   Android provides at most three system action buttons: Add, Category and
   Description. Ignore is a custom button beside the description in
   `native/notification-intercept-plugin/res/layout/payment_notification.xml`,
   styled by
   `native/notification-intercept-plugin/res/drawable/payment_ignore_button.xml`
   and copied to generated Android by `scripts/patch-android.mjs`. When changing
   this layout, update the corresponding native source, patch script, tests and
   README guidance together.
   The error area supports four lines; the existing patch script copies this
   layout unchanged. Recheck that equality when changing its presentation.
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
For notification reply semantics, MINA/fallback privacy, ambiguity and feedback,
also run `node --import tsx --test src/utils/notificationCategorization.test.ts src/utils/notificationCategoryJobs.test.ts src/components/AppNotificationFeedback.test.tsx`.
For assistant behavior and categorization review, also run
`node --import tsx --test src/utils/assistantReport.test.ts src/utils/assistantCategory.test.ts src/utils/assistantModel.test.ts src/components/AssistantReportView.test.tsx src/components/AssistantExperience.test.tsx src/components/SettingsView.regression.test.tsx`.
For MINA's chat message construction, run `node --import tsx --test src/utils/assistantChat.test.ts`.
For confirmed category actions, also run `node --import tsx --test src/utils/assistantCategoryActions.test.ts src/components/AssistantExperience.test.tsx`.
For instant listings, failed category review, toast expiry and Settings reset,
run `node --import tsx --test src/utils/assistantCategoryOverview.test.ts src/utils/assistantCategorization.test.ts src/components/TopBarToast.test.tsx src/components/SettingsView.regression.test.tsx`.
For settings navigation, category editor and profile crop, run
`node --import tsx --test src/utils/profilePhoto.test.ts src/utils/settingsSearch.test.ts src/components/SettingsView.regression.test.tsx src/components/CustomisationsView.regression.test.tsx src/components/IdentityGlass.regression.test.tsx`;
validate photo editing and the category sheet in an isolated browser at mobile
and desktop sizes without changing real profile or financial data.
For consent, five-chat pruning, report snapshots and isolation guards, also run
`node --import tsx --test src/utils/assistantChatHistory.test.ts src/components/AssistantExperience.test.tsx`;
validate IndexedDB, navigation, storage failures and reload in an isolated
browser harness using synthetic owners/data, never the shared user's records.
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
