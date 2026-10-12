# SILGAPP 1.0.129 / 136 - October 12 consolidated release

## Scope and evidence

The owner's successful physical campaign on 1.0.128 is the baseline, not a
newly executed test on 1.0.129. This intervention did not create, modify or
deliver a production course. It did not alter financial history or global flags.
Private device captures and raw backend evidence remain outside Git.

Source baseline: `bb03683f2090ad23f01c891fde10637dea924711`.
Base44/GitHub main checked: `d1fed9dbe727e78d89eb9f1c1c56a538a8ef3390`.
Work branch: `integrate/origin-main-android-20261010`.
Backup: `backup/pre-release-129-20261012`, with a separately copied and
SHA256-verified snapshot of the pre-existing dirty/untracked files.

## Corrections

| Finding | Change | Executed proof | Physical limit |
|---|---|---|---|
| Eco-only available missions hidden | Check both query states; render Eco cards independently of ordinary courses; realtime invalidation | PASS: actual React component rendered with isolated hooks | A live available Eco-only mission is still needed |
| Intermediate Eco route remains pending | Deploy confirmed-state progress in transition/finalization callers; preserve completed steps; compare-and-update with retries | PASS: real progress function executed against changing isolated records, alternating pickup/delivery, repeated calls and stale states | No new production delivery was generated |
| Invalidated mission retains operational links/totals | Recompute active price/payout; archive cancelled steps as audit-only; detach single continuing course after mission persistence; retry incomplete detachment | PASS: real cancellation function, failed reads/writes, retry, picked/unpicked parcels, all cancelled; 14/14 Base44 cancellation tests | Historical invalidated mission intentionally unchanged |
| GPS absent at confirmed stages | Fresh device fix or recent accurate driver fix; explicit missing/denied reason; never substitute heartbeat time | PASS: valid/absent/stale/inaccurate/denied coordinates and endpoint adapters | New physical pickup/delivery GPS remains untested |
| Eco commission lock missing | Write existing Pass/Happy Hour lock per course during fenced acceptance; read both back before publication; preserve locks on retry | PASS: interrupted acceptance/recovery and existing zero-commission tests | Old commission metadata intentionally not backfilled |
| False empty history | Separate authentication/loading, failure, empty success and loaded results; preserve authenticated identity filters and deduplicate | PASS: history SDK simulation and loading contracts | Device result recorded below |
| Premature success labels | Use factual waiting labels; no cancelled-as-delivered label; parcel and displacement UI changes wait for successful SDK body | PASS: endpoint, source and actual isolated displacement-handler tests | No new displacement created |
| Victory chime | Short Android notification-stream tone, persistent course-id deduplication, silent/vibrate/DND/volume guards | PASS: JS deduplication and native source guards; native build recorded below | Audible playback after a new confirmed delivery not yet validated |
| Admin overflow / VENUS / bells | Wrap Report/Pass/Country headers; embed mobile VENUS in header; single breakpoint instance; body portals; distinguish notifications from admin inbox | Source changes reviewed; device observations below | No broad redesign; all admin subpages not re-audited |

`SuiviCourseFullscreen`, `ChatWindow`, existing Victory words/duration, native GPS,
FCM configuration, prices, financial policy, Public/Enterprise isolation and iOS
configuration were preserved. No Dispatch V2 implementation change. No QR/PIN
restoration. Video remains deferred.

## Backend deployment

Only official app `6a0ec08f3af5e1d1284254c1` was targeted with official CLI
`functions deploy` and explicit names, without `--force` or an entity push.

| Function | Deployment and source reread |
|---|---|
| transitionStatutLivreur | PASS: entry + 12 executable dependencies match staging |
| finaliserLivraisonLivreur | PASS: entry + 12 dependencies match |
| annulerCourseExterne | PASS: entry + 11 dependencies match |
| ecoOptimizationOrchestrator | PASS: entry + 11 dependencies match |
| courseEventOrchestrator | PASS: entry + 19 dependencies match |

Fresh remote exports were compared against the previous local release before
deployment. They lacked several already-tested Codex recovery/progression guards.
No newer remote-only executable change was discarded. The exporter omits a
commented-out `courseCodeMessage` import; AST traversal confirmed it is not a
runtime dependency. No source test was relaxed to accept a mismatch.

Production read-only health: HTTP 200, success true. No pending exclusive
reservation was found. The BF exclusive-priority AppConfig query returned no row;
the production code also forces this experimental feature off even with stale
true configuration. No configuration write was performed.

Rollback: pre-deployment function archives are retained privately. Restore only
the affected function and its reviewed executable import graph through a named
CLI deployment, then reread. Do not redeploy an entire export archive blindly.
No entity schema or RLS was changed in this release; a new full remote schema
export was not available through the installed CLI's entity commands.

## Automated validation

- PASS: `npm run typecheck`, `npm run lint`, production Web build using the official
  application id, Capacitor Android sync.
- PASS: 38 of 39 historical/test scripts. This includes Dispatch V2/Enterprise,
  Standard, Eco, grouping recovery, cancellation, acceptance recovery, financial
  locks, messaging, badges, tracking and Victory lifecycle checks.
- PASS: Base44 on-route suite 13/13; cancellation suite 14/14.
- FAIL (deferred, not weakened): enabled exclusive-priority experimental suite,
  9/20 cases successful and 11 failed with production priority forced OFF.
  The disabled-path security suite passes and correction 20 remains OFF.
- FAIL (pre-existing): isolated strict Deno check of the transition dependency
  graph, 87 diagnostics before and 87 after; zero newly introduced diagnostic
  signatures. Runtime/syntax checks and deployment compilation succeeded.
- These automated results are not live driver races, physical GPS movement,
  push reception or new financial-write validation.

## Production accounting preservation

Read-only reconciliation of the five campaign records confirms four delivered,
one cancelled and total commissions of 950 FCFA (250 + 200 + 250 + 250).
Record update timestamps remain those from the earlier campaign. The two old
Eco records still have missing lock metadata, deliberately left untouched.
No balance adjustment, payment, deletion or retrospective repair was performed.

## Android and Google Play

PASS: one native `assembleRelease bundleRelease` completed (454 tasks,
58 executed, 396 up-to-date). APK/AAB version is 1.0.129 / 136.
The existing app id `com.base6a0ec08f3af5e1d1284254c1.app`,
signing key, FCM, App Links, min SDK 24 and target/compile SDK 36 are retained.
The short chime uses the existing native plugin and no new dependency/permission.

| Artifact | Repository-relative location | Bytes | SHA256 |
|---|---|---:|---|
| Signed APK | `android/app/build/outputs/apk/release/app-release.apk` | 8870308 | `afeb4b78abcae0a6da38712bf67b898807e31df807128adbb767a459e5ba2f95` |
| Signed AAB | `android/app/build/outputs/bundle/release/app-release.aab` | 8421392 | `de54dd9ff8436d93880e84ed7822456fd76abb55d54b755ab4b001e0fd981bf1` |

Certificate SHA256 for both, matching the previous release:
`9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699`.
PASS: APK signature v2, AAB JAR signature, bundletool validation and manifest,
APK 16-KB zip alignment, no development server URL or enabled WebView debugging.
Existing Gradle deprecation/flatDir warnings remain; no new SDK/signing settings.

## Physical validation on 1.0.129

All four authorized devices received `adb install -r`, without uninstalling or
clearing data. Each reports versionName 1.0.129 and versionCode 136. Installed
APK hashes recorded by the installation procedure match the validated artifact.
Sessions remained usable. Private screenshots are outside Git in
`C:/Users/HP/.codex/tmp/silgapp-136-device-evidence/`.

| Device | Actually opened / observed | Result | Evidence filename |
|---|---|---|---|
| Fold4 Client | Home, history with 54 records, historical delivered-course Codex map and driver card | PASS | `client-history.png`, `client-history-detail.png` |
| Fold4 Client | Tracking close returns to home, without cancellation UI | PASS (navigation) | `client-tracking-close.png` |
| A06 Driver 1 | Available screen, then two delivered historical courses and 500 F commission | PASS (read-only) | `R83Y7023SSM-home.png`, `R83Y7023SSM-step1.png` |
| Moto g35 Driver 2 | Available screen, dashboard and two delivered historical courses with 450 F commission | PASS (read-only) | `ZE223GT5WJ-home.png`, `driver2-history.png` |
| Fold7 Admin | Dashboard, menu country selector, embedded VENUS and distinct bell/inbox icons | PASS (targeted layout) | `RFGL41AZ2NT-step1.png`, `admin-menu.png` |
| Fold7 Admin | Report header/date/country fit; loaded counts show 5 courses, 4 delivered, 1 cancelled, 4750 F and 950 F commission | PASS | `admin-report-loaded.png` |
| Fold7 Admin | Pass tabs wrap and remain visible; Country header and add control fit | PASS (layout only; no setting modified) | `admin-pass-loaded.png`, `admin-country-loaded.png` |
| All | New Eco-only mission, new route-stage updates, GPS coordinates, commission locks and audible Victory | NON TESTE physically in this release | Isolated runtime tests only |

The empty available feed currently has no live eligible mission to demonstrate
the Eco-only case physically. No fictitious delivery or retrospective mutation
was used to manufacture this result. The Report initially shows zero metrics
while fetching, then the correct values; this separate remaining loading-state
limitation is not represented as a financial discrepancy.

Google's current target-API requirement is API 36 for new mobile app updates:
https://support.google.com/googleplay/android-developer/answer/11926878?hl=en

Local signing, bundle validation and manifest checks do not establish Play
Console acceptance. The latest published versionCode, Play App Signing/upload
certificate registration, background-location disclosures and Console warnings
require the owner's Console verification. Nothing was uploaded or published.

## Residual validation

- A new controlled Eco acceptance/pickup/delivery is needed to validate the new
  remote progression, stage GPS, locks and audible Victory together on devices.
- No multi-entity database transaction guarantee is claimed. Fenced claims,
  readback, idempotent retries and compensation are the implemented protections.
- Background/terminated-app FCM, moving GPS and crash recovery were not re-run.
- Admin counter differences must use equivalent populations, country filters,
  periods and pagination. Course views read at most 200 records; CRM and driver
  metrics use different entities/filters. No counter was arbitrarily rewritten.
- The reported cut creation button was not reproduced on the inspected current
  external-courses screen (which has no creation button); do not claim a fix for
  an unidentified control. The creation menu route remains available.
- A complete scan of every admin subpage is not claimed.
- On the unchanged client home, the floating VENUS can still cover part of the
  support copy while scrolling; the corrected Admin header no longer floats over
  page controls. This release does not claim to solve all possible overlays.
- Report metric placeholders still briefly show zero during loading. The loaded
  counts were verified against the same day/country campaign data.

## Changed files

- Android: `android/app/build.gradle`,
  `android/app/src/main/java/com/silgapp2/app/SilgappNativePlugin.java`.
- Backend: `base44/functions/transitionStatutLivreur/entry.ts`,
  `base44/functions/finaliserLivraisonLivreur/entry.ts`,
  `base44/shared/deliveryGps.ts`, `base44/shared/ecoOptimizationEngine.ts`.
  Other deployed callers contain these changed shared dependencies.
- Driver: `src/hooks/useCoursesDisponibles.js`,
  `src/components/livreur/CoursesDisponibles.jsx`, `CourseActiveCard.jsx`,
  `LivreurVictoryOverlay.jsx`, `src/pages/LivreurExterneApp.jsx`.
- Client/GPS: `src/pages/ClientSuiviCourse.jsx`,
  `src/components/client/SuiviBarreFlottante.jsx`,
  `src/lib/clientCourseHistory.js`, `deliveryGps.js`,
  `deliveryConfirmation.js`, `victorySound.js`.
- Layout/Admin: `src/components/client/VenusFloatingButton.jsx`,
  `src/components/layout/AppLayout.jsx`, `MobileNav.jsx`,
  `src/pages/GestionPays.jsx`, `PassZeroCommissionAdmin.jsx`,
  `RapportJourExterne.jsx`.
- Tests: `tests/october12-regression.mjs`,
  `client-history-email-regression.mjs`, `eco-acceptance-recovery-regression.mjs`,
  `eco-cancellation-runtime-regression.mjs`, `final-corrections-regression.mjs`.
- Reference: this report and `docs/silgapp-regression-inventory.md`.
  Existing `AGENTS.md` rules remain in force unchanged.
