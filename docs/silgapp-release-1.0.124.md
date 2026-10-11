# SILGAPP 1.0.124 / 131

## Scope

Preserves the validated 1.0.123 baseline, official package, signing certificate,
FCM/App Links, tracking and shared messaging. No financial rules, QR/PIN flows,
Dispatch V2 implementation or iOS native configuration were changed.

## Corrections

- Native Android system-bar/cutout insets, zeroed before forwarding to WebView;
  IME resize events remain available. Scoped chat visual viewport sizing and a
  full-height driver messages surface replace the compact panel.
- Shared ChatWindow retains text/media drafts after uncertain sends, reuses
  upload URLs and idempotency keys, and preserves reading position during refresh.
- Unread indicators use account- and course/conversation-scoped local watermarks
  and bounded, RLS-protected message reads. Cross-device read synchronization is
  not implemented; badges are not a server-side read receipt.
- Eco acceptance uses a durable owner in `accepting`, conditional single-course
  claims, revalidation of both owners, and only then publishes `accepted`.
  Retries resume the same owner. The existing delayed workflow also retries old
  interrupted acceptances. Pre-pickup cancellation compensation is fenced and
  resumable. Missing records, foreign ownership or already collected parcels
  remain quarantined for administrative repair, never automatically reassigned.
- Pickup and finalization refuse incomplete mission attribution. Per-course
  prices, commissions, completed stages and accounting remain independent.
- Message notifications persist the supported `message_client` enum while the
  FCM deep-link type remains `nouveau_message`. Video previews are explicit.

## Backend Delivery

Fresh official CLI pull compared the deployed entry points with the validated
baseline before deployment. Ten targeted functions were deployed and re-read;
entry and embedded engine SHA256 values match the prepared packages:

`ecoOptimizationOrchestrator`, `transitionStatutLivreur`,
`finaliserLivraisonLivreur`, `annulerCourseExterne`, `creerCourseAdmin`,
`creerCourseClient`, `courseEventOrchestrator`, `deciderApresAnnulationLivreur`,
`envoyerMessage`, `envoiNotificationPush`.

The six unchanged entry points were repackaged only to include the corrected
shared engine. No global deploy, schema push, workflow creation or configuration
switch changes were performed. The pre-deployment official snapshot is retained
privately for rollback. Initial packaging failures changed no functions; entry
and import paths were then corrected only in the temporary deployment package.

The accidental extra app was inspected with the official functions list command:
it currently has no deployed functions. This is not an exhaustive historical
activity audit. It was not deleted or used for this release.

## Validation Boundaries

Historical suites and targeted isolated adapters cover grouping compensation,
acceptance recovery, cancellation fencing, GPS transition behavior, message
permissions, idempotence and financial non-regression. Desktop React/browser
tests cover chat history/retries, audio retry/viewport focus and Victory timers.
None of these establish a real Base44 multi-entity transaction guarantee.

Additional strict Deno checking of the deployed transition dependency graph
reports 87 diagnostics versus 90 in the previous snapshot, with no new diagnostic
messages. Strict Deno is still FAIL; the remaining pre-existing diagnostics are
not suppressed. Standard Web typecheck/lint/build are separate checks.

No new fictitious course was dispatched: the eligibility read found 14 non-test
drivers in addition to the two designated drivers. Existing TEST deliveries were
read only; their completed states and independent commissions were preserved.
No payments, balance adjustments or changes to other customers' courses occurred.

## Release Evidence

The final chain passed 14 historical suites and nine targeted suites (final
corrections, chat scope, Eco acceptance recovery, unread state, notification type,
driver viewport, chat UI, audio/viewport UI and Victory React lifecycle).
Typecheck, lint and Web build passed. These include isolated adapters and desktop
browser execution, not new physical deliveries or real concurrent backend writes.

Three authorized ADB devices were detected. Secure screen locks prevent some
physical scenarios until the owner unlocks those devices. No lock was bypassed.
Physical delivery, FCM/GPS and real acceptance concurrency must not be inferred
from build success. Historical TEST commissions of 200 F and 250 F remain intact;
no balance regularization was performed.

## Artifacts And Installation

- Version: 1.0.124 / 131; official applicationId unchanged.
- APK: `android/app/build/outputs/apk/release/app-release.apk`, 8,868,596 bytes.
  SHA256: `1063549d613348f193f96f9c0f302e0766962ea4707b2d8a0d78437e6c215c1c`.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`, 8,419,654 bytes.
  SHA256: `d879346ed32e05d4142ed79b8ccc87c1f424ae4f1ef63719cfb1d98693bb17c7`.
- APK apksigner verification and AAB jarsigner verification passed. Both match
  official certificate SHA256
  `9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699`.
- The APK metadata and parsed AAB protobuf manifest independently confirm the
  applicationId, versionName and versionCode. No runtime server URL is bundled.
- ADB `install -r` succeeded on Fold4, A06 and Moto g35. Package reads on each
  confirm 131 / 1.0.124, minSdk 24 and targetSdk 36. No uninstall/data clear.

## Physical Checks And Remaining Work

The A06 opened Disponibles, Messages, the designated TEST driver profile and a
Test-to-Testing course chat. Screenshots show the full-height chat, separate
system bars and a visible composer above the keyboard. An unsent local draft was
entered and removed; keyboard closure restored the viewport. No AndroidRuntime
error was returned by the sampled log reads. Evidence remains private locally.

PARTIAL: the existing VENUS floating avatar partly covers the send control when
the keyboard is closed. The control is unobstructed with the keyboard open. This
remaining visual issue is not represented as a fully passing UI audit.

Fold4 and Moto secure locks prevented inspection of their client/driver screens.
Actual two-way media, FCM states, GPS movement, new Standard/Eco deliveries,
Victory after a new physical delivery and backend concurrency remain NON TESTE.
Unlock devices and establish a verified test-only dispatch scope before those
scenarios; do not globally disable real drivers or alter real balances.
