# SILGAPP Regression Inventory

This file is the local reference used before Base44 -> Codex integrations and
before Android/iOS delivery builds.

## Evidence And Change Control

Last local reference verified on 2026-10-11:
`c9c53244850585df0dd5c08c556e7fd982e848c5`.
Code presence, a successful merge and a successful build are not proof of
runtime correctness. Record PASS only for an executed check, with its scope;
record PARTIAL or NOT TESTED for remaining backend/device evidence.

For each correction record its cause, affected files, actual change, executed
tests, result and Android checks still required. Distinguish pre-existing fixes
from changes made in the current mission. Remote Base44 fixes must be compared
with the local source before declaring synchronization complete.

## Physical Test Issues Reported On 2026-10-10 And 2026-10-11

These are reported issues to verify, not confirmed local fixes:

| Area | Required invariant | Evidence still needed |
| --- | --- | --- |
| Available feed | Standard, isolated Eco and grouped missions remain visible in the correct country/network; isolated Eco is not acceptable | Feed and backend tests, then Android |
| Status transitions | No unjustified search-to-new transition or resulting disappearance | Identify writer and test transition |
| Eco acceptance | Atomic acceptance; correctly interpret backend success and real errors | Lock/concurrency and response tests |
| Delivery Victory | Existing LivreurVictoryOverlay after every confirmed Standard/Eco delivery; whole words, progressive growth, about 9 seconds | Per-delivery trigger and device tests |
| Client confirmation | Parcel selection, freely proposed price, summary, explicit confirmation, backend creation, existing tracking by real ID | Form and navigation tests |
| Admin country selector | One flag, white background, black text and visible arrow | Web and Android visual checks |
| Eco route progress | All four steps advance; each course closes independently; mission completes only when appropriate | Verify updateEcoMissionRouteProgress in each finalization path |
| Cleanup/incidents | No automatic reassignment after pickup; preserve other deliveries and driver traceability | Verify cleanupStuckEcoMissions and incident tests |
| Conversion | Configured deadline; unchanged price/commission; client informed; no silent or premature conversion | Workflow execution and idempotence evidence |
| Configuration/FCM | Existing country-scoped settings have real effect; eligible Eco push once, correct target | Settings and isolated notification tests |

No new Eco minimum may be imposed: preserve the client's freely entered price.
Do not restore an earlier hardcoded Eco minimum from historical files.
Production course `6aca5ae10f3133623bcae0f5` must not be modified for tests.

## October Integration Checks

See `docs/silgapp-audit-2026-10-11.md` for findings, evidence and unresolved
backend risks. Preserve these additional tests:

- `tests/october-delivery-regression.mjs`: delivery readback and route progress.
- `tests/eco-october-policy-regression.mjs`: no silent Eco downgrade; free price.
- `tests/eco-route-order-regression.mjs`: six precedence-safe geographic orders.
- `tests/eco-dispatch-entry-regression.mjs`: isolated Eco returns before V2;
  dispatch retries never invoke an unknown grouping action or start a second
  grouping writer. Remote guard deployed and pulled back on 2026-10-11.

These local tests do not prove backend transactions or Android behavior.

## Critical Functional Areas

### Physical Eco/Victory follow-up, 2026-10-11

Evidence and pending correction batch:
`docs/silgapp-eco-victory-physical-2026-10-11.md`.
Real TEST mission B/C completed after concurrent taps by two authenticated
drivers (one winner). Both deliveries and independent commissions were read
back from Base44. This single success does not clear the partial-grouping
fault-injection regression, which still FAILS.

Preserve the local client-contact guard correction: admin-only contact phases
must not block Standard client parcels. Preserve the local Victory timer fix:
parent refreshes must not cancel its 9-second close timer. Both remain outside
the installed APK; do not label their physical revalidation PASS.

New user requirement queued only: unify client tracking and messaging using the
historical Codex interfaces. Finish the ongoing real tests before integrating
this change. Keep the real course ID, explicit creation confirmation, existing
GPS/status updates and authorized conversation participants. Do not invent a
replacement tracking screen or lose the prior messaging experience.

Other confirmed observations to protect with future tests: no false delivered
overlay after cancellation; clear cancellation confirmation; Eco draft mode
persists; Add another delivery resets the successful form; no duplicate
cancellation notification; intermediate Eco route progress tracks actual pickup;
per-course GPS evidence; no financial write compensation without authorization.
No APK/AAB or push authorized for this batch.

### Physical profile observation, 2026-10-11

Physical client form: advancing Recipient opened confirmation before editing
parcel/price on APK 1.0.122. CourseStepForm navigation now cancels the native
click default before advancing and uses distinct next/submit button keys.
`tests/client-step-click-regression.mjs` verifies handler cancellation order;
corrected WebView behavior still requires a new authorized device build/test.

Samsung RFCT80QCFXT / APK 1.0.122: client profile phone input exceeded the
modal's right edge. Local ProfilModal fix adds shrinkable input sizing and a
viewport-bounded scrollable modal. Preserve phone validation and persistence.
`tests/profile-mobile-layout-regression.mjs` protects source constraints only;
the corrected layout still needs rendering and device validation. No deployment
or Android rebuild performed for this fix.

- Client: account access, draft-only course creation, explicit confirmation,
  Standard/Eco selection, proposed client price, immediate follow/search screen,
  GPS tracking, cancellation decisions, history, messaging.
- Driver: availability, available feed, blocked-admin visibility with backend
  acceptance refusal, Standard acceptance, Eco mission acceptance, on-route
  proposals, pickup/delivery buttons, GPS heartbeat, FCM, messaging, Victory
  overlay, accounting.
- Dispatch: V2 publication, atomic acceptance, redispatch, watchdog, blocked
  client-decision guard, public/Enterprise isolation, country isolation.
- SILGAPP Eco: feature flags, grouping, isolated-course hold, grouped mission
  acceptance, on-route/destination-chain proposals, conversion to Standard,
  admin mission follow-up, client-visible statuses.
- Finance: client price preservation, commission locks, Pass Zero, Happy Hour,
  encours, payments, Enterprise ledger separation.
- Mobile: Android package/signing, iOS configuration, App Links, FCM, no
  unintended `server.url`.

## Explicitly Protected Decisions

### Local corrections batch, 2026-10-11 (not deployed)

- Official tracking: `SuiviCourseFullscreen`; authenticated ClientSuiviCourse,
  ClientExterneApp and token-authorized PublicSuiviCourse reuse it. History
  navigation remains distinct from opening a selected course. Explicit ids
  must never silently select another course. Close and cancel are separate.
- Shared messaging: ChatWindow renders course and general conversations;
  CourseChatPanel and MessagesPage reuse it. State is keyed by scope and sender.
  Eco keeps individual course conversations. Video support and failed audio/text
  retention are included locally; real multimedia/FCM validation remains open.
- Message idempotency lookup follows participant authorization and is scoped
  by course/conversation and sender. No claim of database uniqueness is made.
- Eco grouping publishes only after both claims are verified. Failed partial
  writes are compensated after fencing publication by invalidation. Pending
  compensation keeps locked_at and is retried by the existing convert_due
  workflow. Accepted missions and assigned/picked-up courses are never released.
- Pickup/delivery coordinates are validated, never fabricated. Route progress
  preserves completed steps and uses conditional single-row updates.
- Victory closes after nine seconds even under React StrictMode and repeated
  parent renders. Android verification of this local patch is outstanding.
- Tests: final-corrections-regression.mjs, chat-scope-regression.mjs,
  eco-partial-grouping-reproduction.mjs, victory-react-lifecycle.cjs,
  chat-ui-regression.cjs (205-message pagination and scope/retry behavior), plus
  the historical tests. See silgapp-unification-local-2026-10-11.md for limits.

- New Standard public courses keep the client/admin explicit price; ORS may
  calculate distance/ETA but does not replace the price.
- New Standard, Eco, and Enterprise button flows do not require QR/PIN. Legacy
  QR/PIN data may remain compatible where code still supports it.
- Isolated Eco courses may be visible as waiting for grouping, but are not
  directly acceptable and are not dispatched as Standard before conversion.
- Eco V1 is public-only unless a later validated decision changes that.
- Public Pass/Happy Hour 0% does not apply to Enterprise commissions.

## Regression Tests To Keep

- `tests/victory-overlay-regression.mjs`
- `tests/pass-zero-commission-lock.mjs`
- `tests/eco-dispatch-guards-regression.mjs`
- Existing active tests in `tests/`.

Historical tests removed during prior syncs should be restored selectively only
when their assertions still match current product decisions.

## Integration Procedure

1. `git fetch origin --prune`.
2. Confirm current branch, `origin/main`, `origin/ios`, and a backup branch.
3. Compare incoming changes before merging.
4. Merge conservatively; resolve conflicts by preserving newer Base44 fixes and
   validated Codex behavior.
5. Run typecheck, lint, active tests, and restored regression tests.
6. Do not build Android or push `origin/ios` until explicitly authorized.
## 1.0.124 Corrections And Validation Boundaries

- Driver Messages must own a bounded dynamic viewport, independent of the dashboard's content height. Preserve the shared MessagesPage/ChatWindow and its back action. Guard: `tests/driver-chat-viewport-regression.mjs` (source contract only; Android rendering still required).
- Eco route-progress recursion has an explicit result type; this addresses the newly introduced recursive return-inference diagnostic, not all existing Deno diagnostics.
- Android handles system bars/cutouts natively, forwards zeroed handled insets and keeps IME notifications. Chat uses visual viewport height without clearing focus. Never add a second fixed bottom margin.
- Unread watermarks are account- and course/conversation-scoped, monotonic and persisted on the device. This does not provide cross-device read-receipt synchronization. Latest-message badge queries are bounded to authorized threads and RLS, with no service-role frontend reads.
- Failed text, photo/video and audio retries preserve their idempotency key. Media retries must not upload again after a successful upload with an uncertain send result. Preserve older-message scroll position during refresh.
- Eco acceptance keeps a durable `accepting` owner through partial failures, confirms both single-row claims before publishing `accepted`, and retries from the existing conversion workflow. Pre-pickup cancellation compensation is fenced and resumable; collected parcels and foreign owners require administrative repair, never automatic reassignment. This is a recovery protocol, not a proven Base44 multi-entity transaction.
- Pickup/finalization must reject missions whose acceptance is not complete. Preserve independent per-course finance and completed steps.
- Notification storage maps `nouveau_message` to the supported `message_client` enum, while FCM retains the original deep-link type.
- New guards: `eco-acceptance-recovery-regression`, `chat-read-state-regression`, `message-notification-type-regression`, and the expanded chat/transition adapter tests. Simulation PASS does not establish Android or production concurrency PASS.
- An expanded ChatWindow marks its active surface and hides only the floating VENUS launcher. Preserve the launcher outside chat; a child z-index cannot escape a lower parent stacking context. Guard: `tests/chat-ui-regression.cjs`. This local correction has not been rebuilt into Android.
- Physical 1.0.124 resumption verified two-way text and driver-to-client audio on an existing authorized TEST course, plus tracking-to-chat navigation. Audio playback UI was observed; acoustic quality, photo/video transfer, background FCM, new deliveries and concurrency remain unverified. Never infer those results from browser simulations.
- Follow-up physical test verified client-to-driver photo rendering and an Android message notification while the driver app was backgrounded. Video sending produced a persisted `message_type=video` record without `video_url` and a blank bubble; video delivery is FAIL until runtime persistence is repaired and retested. Exported schema/source presence is not evidence of runtime persistence. `ChatBubble` now displays an explicit unavailable-video state; guard: `tests/chat-media-render-regression.cjs` (actual isolated component render).
- The live driver thread list did not show an unread badge after a new test message while that thread was closed. Keep this open as a physical failure; do not infer badge correctness from local watermark unit tests.

## 1.0.125 Messaging Recovery

- Video uploads require an HTTPS media URL. envoyerMessage preserves the URL in both video_url and existing content when no caption is supplied, because runtime records were observed omitting video_url despite exported schemas. ChatBubble resolves this video-only fallback, never executes arbitrary content, and displays a clear unavailable state for older broken records. Existing broken records are not rewritten.
- MessagesPage listens to the existing scoped chat_refetch notification event, reads only the authorized matching thread, refreshes on focus/return from chat, and merges by timestamp to avoid stale responses replacing newer badges. Account changes reset its cache. No new polling or service-role frontend queries.
- Guards: chat-scope-regression (runtime schema omission simulation, access and retry idempotency), chat-media-render-regression (actual render), message-badge-ui-regression (actual component, mocked API), chat-ui-regression (pagination/retries/VENUS).
- Source comparison and targeted re-read are mandatory for backend deployments. This release changes only envoyerMessage; finance, Dispatch V2 and configuration remain unchanged.

## 1.0.125 Dispatch Follow-up

- dispatchExterneAuto must fail closed with dispatch_v2_disabled/503 when V2 is off, never call the retired V1 engine. V2 publication and tenant checks remain unchanged. Targeted deployment re-read matched staging; configuration and workflows were not changed.
- Guard: dispatch-v2-enterprise-reconstruction.mjs scans executable AST imports/calls and executes the real publication branch with isolated adapters for both flag values and Public/Enterprise inputs. It preserves current backend/frontend tenant and suspension guards; it does not prove live acceptance atomicity.
