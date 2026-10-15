# SILGAPP Regression Inventory

## Isolated iOS signing preparation — 2026-10-14

- Upload-only workflow reuses the exact verified r2 IPA, without rebuilding or
  changing product code. The owner configured API secrets manually. An immutable
  separate upload tag, first-attempt guard, Apple duplicate-build preflight and
  restricted public receipt artifact protect the transfer. No TestFlight campaign
  or automatic compliance declaration is added; submission is a separate step.

- Source: verified remote ios d52bf1da. Native iOS metadata, build-preparation files
  and guarded iOS logo selection change; Android images and business/dispatch/finance
  implementations stay intact.
- Preserve the existing native plugins, background location/remote notifications,
  callbacks, bundle identity and all operational-zone/commission safeguards below.
- APNs entitlements are development in Debug and production in Release. Existing
  matching Firebase configuration is a Git-ignored resource, not a fabricated key.
- Signed CI fails before signing unless owner-confirmed App Store version/build,
  latest ios source, exact profile/certificate identity and production rights match.
- Local release/profile safety tests, YAML trigger/artifact checks and Bash syntax
  checks pass: 17 Python + 6 workflow + 4 branding tests. Typecheck, lint and local
  web build (native Vite config loader) pass. The authorized first macos-15 run
  passed web/Pods/signing-asset validation, then failed because an app profile was
  also imposed on Pods. Signing overrides now apply only to App Release; retry
  tags preserve the reviewed version/build without moving an existing tag.
  Retry r1 archived/exported successfully. Its IPA uses Xcode 16.4/iOS SDK 18.5,
  below Apple's current SDK 26 minimum. Xcode 26.2 selection and SDK guards correct
  the toolchain; a new immutable-tag attempt is authorized after the SDK defect
  was established. Product code, version/build and signing secrets remain intact.
- The owner-approved logo is used only on native iOS; original Android/web URLs
  and all component logic are preserved. Local iOS 1.0.60/67 follows the owner's
  06:30 UTC screenshot showing the last visible 1.0.59/66. Recheck concurrent
  uploads before submission. Eric reports accepting the Apple Developer agreement
  at 06:37 UTC; this has not been independently rechecked. No publication occurred.
  See docs/ios-signed-build-preparation.md for scope and separate approvals.

## Corrections 18 And 19

Base44 origin/main f481f1ec integrated without replacing Codex changes. Active
on-route proposals exclude their courses from the ordinary waiting modal.
Push and EcoProposal realtime invalidate the query; 15-second polling remains
fallback. SDK data extraction from correction 17 stays in place.

Cancellation recalculates mission membership and remaining steps. Preserve
pickup timestamps, completed steps, prices, commissions and independent history.
Never redispatch a collected Eco parcel: require administrator intervention.
Do not release the driver while another parcel remains active. Mission realtime
invalidates the active mission query to restore CourseActiveCard after reduction
to one active course. A pre-acceptance survivor returns to isolated via the
existing candidate compensation path. Conditional single-mission writes and
retryable detachment are not a multi-entity transaction guarantee.

Protection: 27 incoming simulated assertions (on-route-proposals-regression and
eco-mission-cancellation-regression), plus eco-cancellation-runtime-regression
executing the real recalculation with fault-injected adapters. Live cancellation,
concurrency and FCM still require controlled test data; do not claim them PASS
from source re-reading or mock execution alone.

## Correction 17 - SDK Proposal Responses

Integrated origin/main 9135d80b: unwrap SDK data in useOnRouteProposals and
both accept/refuse handlers in OnRouteProposalCard. Preserve expiry checks,
identity checks and existing query invalidation. No Dispatch V2 changes.
Protection: on-route-proposals-regression.mjs (13 simulated assertions) and
on-route-sdk-source-regression.mjs (source wiring checks). These do not prove
live acceptance, refusal or expiration; controlled pending proposals and an
authenticated eligible test driver are still required for device validation.

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

## Exclusive On-route Priority Safety Gate

- Owner decision for 1.0.128: correction 20 is officially deferred, not a
  blocker for releasing the validated non-exclusive production paths. Preserve
  and report its experimental suite separately (last run 9/20 passed, 11 failed).
  Do not remove or weaken those tests. Release checks must exercise the disabled
  feature, including stale true configuration, read endpoints and cleanup actions.
- Existing exclusive proposals are not accepted or displayed; experimental
  cleanup performs no backend access. Inspect any legacy reservations read-only
  before a separately authorized repair. Never silently redispatch real courses.

- Correction 20 from origin/main d1fed9db is integrated but NOT release-ready.
- Exclusive priority stays disabled even when a stored enable flag is true until
  a durable 15-second dispatch handoff, recovery outbox and all acceptance-path
  reservation guards are implemented and verified. Never claim updateMany is a
  multi-entity transaction.
- A five-minute workflow plus activity-driven cleanup cannot guarantee release
  after 15 seconds. Marking a proposal expired before a recoverable dispatch
  handoff can strand a course after an interruption.
- Ordinary on-route proposals remain non-blocking; Standard dispatch starts
  before those proposals. No Dispatch V2 implementation changes are authorized.
- Guard: tests/on-route-priority-disabled-regression.mjs executes the real
  reservation function with adapters that throw on any backend access.
- Keep the original priority regression suite: its enabled-feature failures
  must remain visible, not be removed to approve a release.

## Physical Campaign 2026-10-12: Findings For The Next Single Batch

These are observed findings and pending work, not claims of fixes or a new release.
Private account ids, course ids, screenshots and backend evidence stay outside Git.
The owner requested one consolidated correction batch and no rebuild during tests.

- Available courses must not return an empty state before checking available Eco
  missions. `CoursesDisponibles` currently hides grouped missions when its ordinary
  course list is empty. Reproduced on both driver devices; preserve isolated-course
  non-acceptability and the existing mission acceptance path when fixing it.
- One real two-driver Eco acceptance race had a single winner and both courses
  assigned to that winner. The losing driver's rejection was legitimate, not a
  false error. This single run is not a general multi-entity transaction guarantee.
- Eco pickup confirmations advanced the device UI while the stored mission route
  still showed pending steps. Final delivery brought all four steps to completed.
  Protect intermediate backend progress as well as final completion.
- Delivery coordinates were absent on all four delivered TEST records. Eco pickup
  coordinates were also absent, despite available driver positions. Investigate
  persistence without inventing or backfilling locations.
- Normal commission amounts matched individual prices in this campaign, but Eco
  commission lock metadata was absent. Reconcile and protect traceability without
  changing financial rules or rewriting balances.
- Non-exclusive on-route addition succeeded; cancelling the added, uncollected
  parcel preserved the collected original parcel and returned to CourseActiveCard.
  The invalidated mission retained stale total/route metadata. Do not mistake an
  invalidated audit record for an active, acceptable mission.
- Client history initially displayed no courses, then loaded 54 entries including
  the new TEST courses. Distinguish loading, genuine empty results and failures;
  do not claim persistent history loss from the initial empty screen.
- Admin-origin course contact progression exposes Call/WhatsApp but no explicit
  independent contact action in the observed state. Review this gate without
  making unsolicited calls or changing confirmed transition rules.
- Keep misleading client waiting labels, mobile overflow, duplicate admin bells
  and VENUS-covered controls in the consolidated visual correction list. Counter
  differences between pages need scope/pagination checks before being called bugs.
- New owner request: add a short completion chime to the existing Victory overlay,
  once per backend-confirmed parcel delivery (Standard or Eco). Preserve the
  historical growing text, roughly nine-second duration and automatic dismissal.
  Respect device silent/audio settings; do not replay on rerender, reconnect or a
  duplicate confirmation. This is planned, NOT implemented or device-validated.
- Physical Victory was captured for both Standard deliveries and the second Eco
  parcel. The first Eco parcel's animation was not captured and stays unverified.
- Keep correction 20 disabled. Video remains explicitly deferred. Background/
  terminated-app FCM, controlled moving GPS, on-route refusal/expiry and crash
  recovery were not comprehensively validated by this campaign.

## 1.0.125 Dispatch Follow-up

- dispatchExterneAuto must fail closed with dispatch_v2_disabled/503 when V2 is off, never call the retired V1 engine. V2 publication and tenant checks remain unchanged. Targeted deployment re-read matched staging; configuration and workflows were not changed.
- Guard: dispatch-v2-enterprise-reconstruction.mjs scans executable AST imports/calls and executes the real publication branch with isolated adapters for both flag values and Public/Enterprise inputs. It preserves current backend/frontend tenant and suspension guards; it does not prove live acceptance atomicity.

## 1.0.129 Consolidated October 12 Corrections

- Available-feed rendering waits for both ordinary courses and Eco missions.
  An Eco-only result renders its mission cards; read failures never become an
  empty success. Mission realtime events invalidate the existing scoped query.
- Pickup/delivery progress is derived from confirmed course states. Deploy the
  shared progress implementation with the transition/finalization callers;
  source-only fixes do not establish remote behavior. Completed steps never regress.
- Partial cancellation keeps cancelled steps as audit-only records, recomputes
  active totals, and detaches the individually continuing parcel only after the
  mission update. Recovery retries incomplete detachment. Never rewrite test history.
- Eco acceptance writes the existing Pass/Happy Hour commission lock with each
  course claim, reads both locks back before publishing acceptance, and preserves
  locks during retries. This is not a multi-entity database transaction.
- Stage GPS accepts a real fix at most 120 seconds old, with accuracy at most
  100 metres. Heartbeat timestamps are not location timestamps. Permission denial
  prevents cache fallback. Missing GPS is logged and does not block delivery.
- History separates session/loading, request failure, loaded and truly empty
  states. Existing authenticated identity filters and deduplication remain active.
- Victory uses the existing overlay and Android notification-stream chime.
  Persistent per-course deduplication, silent/vibrate/DND and volume checks happen
  natively. No web/iOS sound is claimed; no sound failure may block the overlay.
- Admin mobile VENUS is embedded in the header, with one mounted instance per
  breakpoint and body portals for panels. Preserve both notification destinations
  while using distinct bell/inbox symbols. Report/Pass/Country headers wrap.
- Tests: october12-regression (actual rendered feed and isolated production
  functions), eco-acceptance-recovery, eco-cancellation-runtime,
  final-corrections-regression and client-history-email-regression.
- Deployment targets: transitionStatutLivreur, finaliserLivraisonLivreur,
  annulerCourseExterne, ecoOptimizationOrchestrator, courseEventOrchestrator.
  Source exports matched all executable dependencies after targeted deployment.
- Strict Deno graph check: 87 diagnostics at the previous release and 87 now;
  zero introduced diagnostic signatures. Keep this failure visible, not suppressed.
- Correction 20 remains disabled, including stale true configuration; its original
  experimental suite remains separate and failing. No financial history repair,
  production configuration change or video work belongs to this release.
- Device installation, visible screens and new delivery/sound/GPS execution must
  be reported separately; neither simulation nor signed build proves a physical pass.

## City Dispatch Integration (October 12)

The operational-zone policy below supersedes country-flag activation and the
unknown-origin broadcast fallback described in this historical section.

- Base44 source: origin/main 740fd296; previous validated Android baseline:
  11889120 (1.0.129/136). Preserve the Eco-only feed and both loading/error states
  while resolving the incoming hook/engine merge conflicts.
- CITY_DISPATCH_ENABLED is independent for BF/CI/SN/TG/BJ/ML/GN. Production read
  found no stored activation keys, hence all OFF. No country was activated.
- Known city matching is exact, normalized and regex-escaped, with accent-aware
  query patterns shared by frontend/backend. Base44's unknown-city fallback remains;
  do not claim hard city isolation for records without an operational city.
- Standard notification/acceptance/rescue paths use the country feature flag.
  Busy-driver detection remains tenant-wide, including interurban courses.
- Eco acceptance checks all parcels before any claim; on-route creation and
  acceptance check the driver's city. A temporarily hidden proposal is not expired
  merely because a city filter hides it. Read failures are not successful empty data.
- Automatic city changes require a fresh timestamped fix, accuracy <=100m,
  valid coordinates, known Quartier.ville, and a driver outside a mission.
  Existing geographic hysteresis remains; no paid mapping API is added.
- Admin reuses DispatchMap, remounts on country/city change, shows read failures,
  and labels bounded counter populations. Its configuration setter checks Super
  Admin identity, expected value and persisted result. No activation in device tests.
- Tests: original city-dispatch-regression (30), eco-city-dispatch-regression (24),
  additional city-integration-safety-regression (real functions/hooks with isolated
  adapters). Historical grouping test resolves its new real import by module URL;
  its assertions and fault scenarios are unchanged.
- Physical city switching, ON dispatch/FCM, permission/RLS adversarial integration
  and whole-city population counts require separate evidence. Local test success
  alone does not validate these scenarios.

## Operational Zones (October 14)

- Sources: Base44 origin/main a4c8f6fd, operational prefix eafef669; stable Codex
  baseline 11889120. Preserve commission locks, acceptance recovery, route progress,
  partial cancellation, Eco-only availability, tracking, chat and Victory.
- OperationalCity.actif alone controls per-city filtering. All seven real cities
  were read OFF. Legacy country flags and exclusive-priority flags cannot activate
  this policy. Correction 20 remains deferred and disabled.
- Explicit communes and Quartier.ville_operationnelle resolve Saaba to Ouagadougou.
  Real BF audit: 235 quartiers, 223 Ouaga, 10 Bobo, two Saaba explicitly attached.
  Other 233 use their existing ville; do not claim they all have explicit mappings.
- Active origin zones restrict visibility, notifications and acceptance. Inactive
  origin zones retain historical driver eligibility, but grouping cannot import a
  parcel from another protected zone. Unknown origins fail closed when a zone is
  active. With every zone OFF, no additional geographic filter is applied.
- Country/Enterprise checks stay independent. Manual assignment enforces admin,
  tenant, country and active-zone scope. Busy-driver detection is never city-limited.
- Only fresh accurate GPS changes a city; heartbeat is not GPS. Preserve active
  missions and geographic hysteresis. No paid map lookup or fabricated movement.
- Admin city configuration uses authenticated global Super Admin backend writes,
  expected-state fencing, confirmation, read-back and audit. Direct entity writes
  are denied. Creation uses inactive records and duplicate checks, not an unproven
  multi-entity transaction or database uniqueness guarantee.
- Reuse DispatchMap; bound map/statistical counts are labeled. Country selection
  remains reachable before opening a dialog. Client/driver presentation unchanged.
- Preserve completed route steps when a new optimizer is integrated; do not remove
  a picked parcel's remaining delivery or overwrite concurrent progress.
- Tests: city-dispatch (30), eco-city (24), operational-zones (32), city-integration,
  operational-zones-safety, city-manual-assignment and historical suites. The
  former unknown-origin broadcast assertion is strengthened to deny broadcast ON;
  OFF equivalence is separately retained. Grouping fault assertions are unchanged.
- Deployment schema incident: the API omitted User from App.entities and reported
  its deletion during schema sync. Its saved custom schema was restored exactly;
  merged schema equivalence was verified ignoring required-field order. Preserve
  User explicitly in future complete snapshots. Do not describe the incident as
  harmless without checking authentication and schema restoration.
- Physical screens, real GPS movement, FCM, adversarial RLS and production ON
  behavior require separate evidence. All-OFF read-back and mocks are not such proof.
- Release 1.0.131/138 was signed with the existing upload certificate and installed
  without data clearing on Fold4, A06 and Moto g35. Client history/tracking/map,
  chat entry, driver feed/profile/dashboard and history were physically opened.
  This is not a new-delivery, FCM, moving-GPS or activated-zone validation.
- Fold7 carries a Play-signed installation and refuses the locally upload-key-signed
  APK. Preserve its data; use a matching Play-signed update, never a new keystore or
  an unauthorized uninstall. New Admin city/map physical validation remains pending.
- Existing client/driver VENUS overlaps and the compact A06 reliability tile remain
  visible residual UI findings; those components were not redesigned in this merge.


## Current GPS eligibility and integrated native candidate (October 14)

Detailed policy, compatibility, costs and validation are recorded in
`gps-city-social-auth-preparation-2026-10-14.md`.

- Isolated branch codex/release-gps-social-20261014 combines iOS preparation
  2986923a with GPS changes based on integrated d52bf1da, including main a4c8f6fd.
  Existing email login and all three iOS AuthGate branding selections remain.
- Active-origin new work requires a genuine GPS acquisition <=120 seconds,
  known accuracy <=100 m, valid country-scoped coordinates and a known quartier
  <=30 km. Profile city and ordinary heartbeats are not GPS acquisition proof.
  Saaba resolves canonically to Ouagadougou; future fixes are rejected.
- OperationalCity.actif is the sole activation source. All OFF and inactive
  origins preserve historical geographic eligibility. Bobo ON / Ouaga OFF is
  covered explicitly; country and Enterprise isolation remain independent.
- Heartbeat stores separate acquisition date/validity/index fields. Android Java
  sends Location.getTime(); native JS preserves timestamp/time and missing accuracy.
  Invalid new fixes revoke proof; an ordinary heartbeat does not renew it.
- Feed, badge and new-offer popup share eligibility, ignoring obsolete async results.
  Unified/batch notifications reread candidates in one batch. Direct new-course
  push checks scope/GPS. Standard and new Eco claims reread current GPS.
- Accepted work, existing manual assignment and partial Eco acceptance recovery
  keep their existing behavior. Busy-driver checks remain unfiltered. Pricing,
  commissions, idempotency, course CAS, route steps and tracking are preserved.
- Affected source: currentGpsCity, cityResolution/cityDispatchFilter, heartbeat,
  Livreur schema, notification paths, dispatchV2/Eco, nativeAndroid,
  SilgappLocationService, useCoursesDisponibles and LivreurExterneApp.
- Three optional Livreur fields are prepared, not deployed. Schema application
  must be targeted/additive, preserve User and all other definitions, and read back.
  Older mobile clients lacking acquisition timestamps fail closed for active origins;
  updated clients must precede city activation. No city was activated here.
- Social preparation delegates browser routing to the installed SDK. Native
  provider readiness remains disabled until the complete session flow is verified.
- Integrated checks: 27 regression suites PASS, lint/typecheck PASS, web build PASS.
  Historical finance/recovery/route/Victory and iOS branding/release-tool suites remain.
  Typecheck has checkJs false and does not cover all backend JavaScript/Deno/Java.
- Deno strict comparison: transition 80/80 and changed entry graphs 140/140 existing
  diagnostics, zero added/removed signatures. All exit 1, not PASS. Correction 20
  stays deferred. This is local TypeScript verification, not production integration.
- Android debug compilation PASS, 224 tasks in 7m4s, official package 1.0.132/139.
  Existing tools/dependencies/debug key used; no device install, release APK/AAB
  or store publication. Capacitor temporary foreign paths were restored.
- iOS candidate is 1.0.61/68 with confirmation false. Unsigned simulator workflow
  is diagnostic only. Final source pin, store numbers, signing/upload configuration
  and readiness must be reviewed before a future release. Previous 1.0.60/67 stays.
- Physical GPS/zone switching, FCM, hostile RLS, native OAuth return/persistence
  and production schema readback remain outstanding. GPS is client-reported;
  GPS reread plus course CAS is not a multi-entity transaction. Both wrappers
  embed dist without server.url; mobile feed changes require new releases.

## Native iPhone push registration preparation (October 14)

- Capacitor 5 emits an APNs token on iOS, while the existing backend sends through
  FCM. AppDelegate now maps APNs into Firebase Messaging, retrieves the FCM string
  and forwards refreshes through the existing Capacitor registration event. No
  Firebase dependency, APNs entitlement, signing material or credential is changed.
- iOS support and permission helpers use the common native plugin. Android-only
  intent/channel/token APIs stay Android-only. iOS foreground presentation keeps
  the existing native alert/sound/badge configuration without a duplicate local alert.
  livreurUrgentAlert also gates its native start/stop bridge on Android, preserving
  its Android arguments and shared JavaScript cleanup.
- Client registration passes clientProfil.id through useClientNotifications.
  The server and direct fallback retain an existing client_id when an update omits
  it, only for the same normalized email. A token moving accounts cannot inherit
  the previous account's client_id. Other devices and all four roles are preserved.
- Native persistence is serialized in one JavaScript runtime and checks the active
  authenticated email. Delayed old contexts and logged-out profiles cannot write
  or fall back. New login writes follow an already in-flight request. This is not a
  distributed cancellation or transaction guarantee for old app versions/requests.
- Token prefixes are removed from the modified registration diagnostics. No
  PushTelemetry, production sends, live customer records or new grants are used.
- Tests: ios-push-registration-regression executes the actual JS and server handler
  with synthetic adapters and checks the Swift source contract. Twenty-three cases
  cover iOS/Android, roles, permissions, rotation, account changes, delayed writes,
  sequential idempotence and absent/null/empty client ids. This is not native runtime,
  production RLS, concurrent database upsert or physical push reception evidence.
- Historical 27-suite regressions, project lint and project TypeScript pass. Full
  project typecheck has checkJs false and lint excludes several backend/lib paths;
  the targeted adapters execute those changed paths. The changed registration
  handler passes isolated strict Deno checking (baseline one diagnostic, patched
  zero); earlier GPS graphs retain their separately documented baseline errors.
  Web build succeeds with the public SILGAPP app id and native Vite config loader;
  final validation logs record the result for this diff.
- Native iOS compilation and controlled device validation must cover these
  changes. Firebase/APNs configuration and real receipt remain separate checks;
  source contracts and synthetic tests do not prove delivery.


## Local availability projection and native auth preparation (October 14, after 70cd22ff)

- AvailableCourseOffers reconciles records by real course/mission id and version.
  A valid public Eco mission replaces its constituent individual cards once; true
  independent Standard ids remain independent. A mission member must be Eco,
  grouped, linked to that mission, unassigned, nonterminal and dispatch en_attente.
  Fresh conversions and assignments supersede stale cache entries. The UI does
  not convert modes, prices, commissions, route steps or server claims.
- Feed, activity metric and dashboard badge share this projection. Mission members
  are reread even with all cities OFF, without adding geographic filtering OFF.
  Course and EcoMission events invalidate both scoped queries. Every standalone
  Eco card stays labeled Eco and cannot enter the solo Standard acceptance path.
  Affected files: availableCourseOffers, useCoursesDisponibles, CoursesDisponibles,
  EcoMissionCard, ActiviteTempsReel and LivreurExterneApp.
- Tests: available-course-offers-regression 25/25 PASS, including actual hook query
  and subscription adapters. Historical hook harnesses inject the real selector;
  their country, tenant, city ON/OFF and GPS assertions are retained. Photos alone
  do not prove the displayed cards share database ids; production membership and
  physical refreshed screens remain unverified.
- Native OAuth client preparation adds nativeSocialAuth/nativeSocialAuthRuntime,
  the optional SocialLoginButtons bridge and cancellation on email/login logout.
  AuthGate rereads its existing session/routing after a verified bridge event.
  iOS declares the silgapp URL scheme; Android receiver remains unchanged.
- All native readiness flags remain false and runtime configuration remains null.
  No server handoff, protected native pending store or endpoint is configured.
  PKCE/state, strict return URLs, one attempt redemption, isolated same-app user
  verification and cancellation are executed with synthetic adapters only.
  Native-social-auth-regression 26/26 PASS does not establish cloud atomicity,
  browser binding, secure cold storage, provider consent or real device login.
  Existing email routes and iOS branding source equality remain protected.
- Final current-source checks: 27/27 historical suites, 25 Eco, 26 native-auth and
  23 push cases PASS. Full lint, project TypeScript and web build PASS. TypeScript
  still has checkJs false; these are not native/device/backend integration proofs.

## Dispatch delay investigation and truthful Admin status (October 14)

- Production latency requires correlated creation, publication, receipt and
  rendering evidence. Source checks alone do not establish a production cause.
- The local V2 publisher writes disponible_push before awaiting the T0 notification
  batch for all priorities. Standard en_attente is excluded from the driver feed;
  it must not be exposed merely to bypass a missing publication. Eco isolated and
  pending client decisions retain their dedicated guards.
- ProposedLivreursListV2 previously displayed En diffusion unconditionally and
  treated en_attente as active diffusion. Its presentation now distinguishes
  waiting publication, Eco grouping, client decision, published, assigned and
  terminal states. A recent driver count is no longer labeled proof of GPS
  eligibility or notification receipt. No dispatch engine or assignment changes.
- Dispatch-publication-visibility-regression 12/12 PASS executes the actual Admin
  component and publisher with synthetic adapters. It proves source ordering and
  presentation only. The sender-error case leaves a locally published record in
  disponible_push; this is not proof of production history or later rewrites.
- Validate production behavior separately. Do not replay automations or create
  real deliveries or notifications solely to collect evidence without authorization.


## Eco delivery and promo invariants
- After all latest promo edits, current-source validation passes: 96/96 targeted
  cases, 27/27 historical suites, lint, TypeScript and web build. Eco now has 25
  cases including actual feed render. This covers the mixed working tree, not a
  separately built Eco native package. Device and production-data proof is pending.
- Capacitor configs embed dist, with no server.url. Android/iOS embedded indexes
  differ from the latest dist. Web publication alone cannot update installed apps.
  No backend deployment is needed for Eco. Preserve the final grouped release scope;
  no partial native build, installation, schema/city write or publication occurred.
- Separately retained promo edits add both store links to three share buttons and
  one dynamic formatter; copy still writes the code only. Ten synthetic cases pass.
  The existing fixed referral amount is extracted unchanged to promoBenefits.js
  and reused by validerPrimePromo; its other source is exactly identical to 70cd22ff.
  This backend extraction is outside the Eco-only patch and is not deployed. No
  per-code reduction setting is invented: the current CodePromo schema has none.
- Public store listings do not verify App Store Connect build availability or
  deployment of a local candidate. Native social sign-in remains disabled.


## Dashboard refresh performance (October 14, local grouped release)

- Client counter no longer recreates its 5s initial timer on each GPS object.
  It keeps the existing 120s cadence, reads the latest GPS, and starts after a
  late first GPS. The 8s course poll also reads current profile/GPS callbacks.
- Overlapping client status loads share one active read and one latest trailing
  refresh. Identity/email/country/tenant scope changes invalidate old work without
  waiting for its HTTP response; unmount discards queued work and old results.
  Requests already sent are not aborted. Existing query and tenant filters remain.
- Removed only the driver page's obsolete duplicate feed subscription. The shared
  useCoursesDisponibles hook retains CourseExterne/EcoMission realtime invalidation,
  GPS/zone gates, Eco projection and the existing 10s polling fallback.
- Dashboard-performance-regression executes extracted actual effects/status code
  with synthetic timers/entities: 10/10 PASS. GPS every 15s over 130s causes 2
  counter reads instead of 9. One slow load plus 20 triggers causes 8 entity reads
  instead of 84, retaining the final refresh. This is request-count simulation,
  not measured device latency, real backend load or production confirmation.

## Local completion checkpoint (October 14, investigation resumed)

- Native OAuth preparation adds nativeSocialAuthTransport.js, the disabled-by-
  default server contract nativeOAuthHandoff.js, and nativeAuthSecureStore.js with
  iOS Keychain and Android Keystore source implementations. MainActivity and the
  Xcode project now register the secure-store source. Runtime configuration remains
  null and every readiness flag false. No live endpoint, provider credential,
  production adapter, private key access, native build or installation was used.
- The transport requires an explicitly verified same-app HTTPS endpoint, strict
  primitive request/response fields, no cookies/redirects and bounded responses.
  Server adapters must prove private storage, uniqueness and atomic CAS, trusted
  browser identity/CSRF binding and authenticated vault context binding. Synthetic
  CAS concurrency is not proof of Base44 atomicity. An uncertain consume receipt
  returns no session and is not internally retried; replay behavior depends on
  whether the underlying consume actually committed. No distributed tombstone is
  claimed. No deployed provider exchange is configured.
- The secure pending record contains only the short-lived PKCE transaction fields,
  never a session token. The JS store fails closed when Capacitor payload logging
  is enabled; no logging setting was changed. iOS uses app-scoped, nonsynchronizing
  WhenUnlockedThisDeviceOnly Keychain storage. Android requires API 28+, an unlocked
  device and an unlocked-device-required AES-GCM key, with ciphertext in no-backup
  storage. Android 12-14 availability limitations remain documented in its source.
  Physical lock/unlock, cold-start and native compiler validation remain pending.
- CREATE in courseEventOrchestrator no longer waits for the redundant outer V2
  config read: both old branches called the same dispatch function and payload.
  The engine's own V2 guard, Eco hold, invocation order and error isolation remain.
  UPDATE is unchanged. CREATE called[] omits its informational dispatchV2 marker;
  function/error entries remain. No local consumer was found; external consumers
  are unverified. Watchdog timing, eligibility, prices and finance are unchanged.
- Dispatch-start-latency-regression executes the real source with synthetic
  adapters. With an artificial configuration delay, it verifies one fewer read.
  This is not a measurement or proof of resolved production latency.
- Additional passing suites: native-social-transport 7 cases, native-auth-secure-
  store 18, native-oauth-server-contract 32, and native-oauth-handoff-integration 13.
  The integration runs the actual JS coordinator/transport/service/store together
  through in-process HTTP responses, with mocked native bridge, vault, browser and
  CAS storage. It does not validate real Google/Apple consent or native execution.
- Source, adapter and synthetic integration checks have distinct scopes. Native
  iOS compilation, physical receipt, production data isolation and a complete
  provider journey require their own evidence.

## Local continuation checkpoint — 2026-10-15 (not deployed)

- Authentication: email/social mutual exclusion, bounded cancellable account verification, generation fences and ordered Preferences removal prevent stale session restoration. Every logout entry awaits the shared persistence helper. Browser callback diagnostics omit bearer values and native URL forwarding of bearer queries is removed. Historical bearer storage remains localStorage/cookie/Preferences; this is not a secure session migration. Native Google/Apple readiness stays disabled and runtime configuration absent until a supported server exchange and ordinary-user access isolation are verified.
- Push: native action/registration listeners install before the direct Android FCM-token return; iOS early notification openings queue only in memory for the matching account dashboard, consume once, and clear on account switch. Native compiler and real notification receipt remain unverified.
- Available offers: grouped Eco missions deduplicate their two constituent courses; activity counters use the same offer projection. Country/tenant/current-GPS rules and accepted missions remain protected. QueryClient-scoped refcounted subscriptions replace duplicate listeners, with cleanup on partial setup failure.
- Admin: pending publication, published feed, expired acceptance and physical notification receipt are distinct. Dispatch CREATE removes a redundant configuration read; incident cause and real creation/publication/display/sound timing remain unproven.
- Promo share preserves code, benefit and both store URLs. Actual device share sheet not yet checked.
- Synthetic storage exercises do not establish global uniqueness, distributed
  atomicity, provider login or ordinary-user access isolation. Operational reports
  and device evidence are maintained separately from this public inventory.
- Final auth failure handling: logout caller wait bounded to 15 seconds with generic AUTH_LOGOUT_UNCONFIRMED; native Preferences queue remains fenced until actual completion. Persistence suite 9 cases covers rejection/hang/late removal. SDK remains authenticated if durable removal fails. Auth bootstrap privacy 7 cases additionally guard raw SDK error/stack logging in AuthGate and base44Client; not a general application logging audit.
## SILGAPP OFFICIEL continuation, 2026-10-15

- Preserved prepared account/session generation guards, ordered durable logout,
  auth concurrency, disabled provider UI, promo links, and truthful Admin states.
- Realtime feed bursts now share one queued refresh per scope, never cancel a
  running read, retain a trailing refresh, and stop after the last observer leaves.
  Country-mismatched full events are ignored; sparse/delete events still refresh.
- Push receipt and foreground return invalidate both available Standard and Eco
  queries; proposals refresh without waiting for a tap or the fallback poll.
- Explicit logout clears pending notification navigation, listeners' account
  consumers and dedupe state. Push diagnostics discard arbitrary payloads, SDK
  errors, tokens and headers. These are local adapter-tested guarantees only.
- Restored 139's visibility of coherent missions with three or more members. The
  pending handoff had introduced an exact-two presentation filter. Initial server
  acceptance still requires exactly two; that conflict remains documented rather
  than changing the financial/claim contract. On-route additions are untouched.
- 45 source/adapter suites pass (42 handoff suites plus V2/Enterprise, disabled
  exclusive-priority and on-route-modal guards). No production data was changed.
- Validation: 45 source/adapter suites, project lint, TypeScript and web build
  pass for the validated application source. Android release compilation also
  succeeds. These checks do not establish native iOS execution, live push receipt
  or production dispatch latency. Project checkJs remains false.
- Existing dependency versions are retained. Apple numbering, signing and upload
  require a current App Store Connect check and reviewed release configuration.
  Backend deployment and city activation remain separate operations.
