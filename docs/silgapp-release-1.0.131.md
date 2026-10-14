# SILGAPP 1.0.131 / 138 - operational zones

Date: 2026-10-14. Official app: `6a0ec08f3af5e1d1284254c1`.

## Sources and preservation

- Stable delivered baseline: `118891202c4b9802f7187303705deb8b0d502600` (1.0.129/136).
- Base44 source: `a4c8f6fd5b582af43d30e79a786fcf9f6b97d280`; operational-zone prefix `eafef669`.
- Integration branch: `integrate/origin-main-android-20261010`.
- Integration commits: `8f83a911`, `e85cf9a9`, `3a3313e7`.
- Backup: `backup/pre-city-dispatch-20261014034320068`; 42 dirty/untracked files copied and hash-verified outside Git. Older backups retained.
- Build 1.0.130/137 already existed, so this delivery uses 1.0.131/138. The 137 artifacts were archived before replacing build outputs.
- Native iOS files, Android native code/manifest and Capacitor configuration are unchanged from the stable baseline. No keystore was created.
- Private reports, fixtures, screenshots, credentials and signing files remain outside the pushed change set.

## Integrated changes

- One activation source: `OperationalCity.actif`. Legacy country flags cannot activate zones. Exclusive on-route priority remains disabled.
- Explicit commune mapping Saaba -> Ouagadougou; canonical complete-name matching, accent-aware escaped query patterns, no guessed attachments.
- OFF preserves historical geographic eligibility. Active zones filter Standard, Eco and on-route paths. Unknown origins do not broadcast across protected zones.
- Inactive-zone grouping cannot pull a parcel from another protected active zone. Every Eco parcel is checked before claiming a mission.
- GPS city updates require a fresh accurate fix, retain hysteresis and do not switch an occupied driver's city. Heartbeat is not a GPS timestamp.
- Manual assignment checks admin, country, Enterprise perimeter and operational zone. Busy-driver detection remains tenant-wide.
- Existing durable Eco claims, compensation, commission locks and completed route steps retained while integrating the newer Base44 route optimizer. Started routes are not rebuilt by dropping picked parcels.
- Eco-only availability retains independent loading/error states and realtime invalidation. Malformed zone aliases become a query error rather than a render crash.
- Admin country selection remains reachable; individual toggles require confirmation, expected-state fencing and persisted read-back. Backend failure is never displayed as success.
- Admin reuses DispatchMap; map/statistics use matching aliases and explicitly bounded populations. No client/driver visual redesign.

## Real production reads

| Country | Operational city | State |
|---|---|---|
| BF | Ouagadougou, including Saaba | OFF |
| BF | Bobo-Dioulasso | OFF |
| CI | Abidjan | OFF |
| BJ | Cotonou | OFF |
| GH | Accra | OFF |
| GH | Kumasi | OFF |
| TG | Lome | OFF |

PASS: seven records, no duplicate country/canonical-name pair, no activation performed.

`manageOperationalCity` / `audit_quartiers` was executed in production, read-only:
235 BF quartiers, 223 Ouagadougou, 10 Bobo-Dioulasso, two Saaba. Both Saaba records
explicitly contain `ville_operationnelle=ouagadougou`. The other 233 retain their
existing `ville` fallback; they are not all explicitly linked. All 235 have GPS.

## Backend delivery

The following 15 functions were selectively deployed and read back. Every executable
source/dependency hash matches the validated staging archive. Remote entry paths
are prefixed by Base44, which was accounted for without ignoring content differences.

`manageOperationalCity`, `heartbeatAuto`, `annulerCourseExterne`,
`assignerLivreurAdmin`, `courseEventOrchestrator`, `creerCourseAdmin`,
`creerCourseClient`, `deciderApresAnnulationLivreur`, `dispatchExterneAuto`,
`ecoOptimizationOrchestrator`, `finaliserLivraisonLivreur`,
`getOnRouteProposalsForLivreur`, `recupererCoursesBloquees`,
`terminerCourseAdmin`, `transitionStatutLivreur`.

PASS: automation definitions/states preserved; all untargeted function sources and
automations unchanged. No workflow activation or global dispatch setting change.
The obsolete country setter was not deployed. Remote source backups and deployment
IDs are in the private `silgapp-zones-functions-before.json` and deployment manifest.

### Schema incident and recovery

`OperationalCity` now denies direct create/update/delete and keeps a backend audit
history hidden from ordinary entity reads. A full remote schema snapshot was used
to preserve other definitions because the available sync API deletes omitted schemas.

The first API response unexpectedly reported `User` deleted: Base44's `App.entities`
does not include its separate custom User definition. The saved custom schema was
immediately restored exactly. The merged User schema is equivalent, with only the
order of required fields differing. All 136 unrelated entity definitions remained
identical. The four authorized accounts were then read successfully, with their
business roles present; authenticated admin calls also succeeded. No user records,
courses or financial records were intentionally edited. This incident must not be
omitted from the release record. Future snapshots must explicitly preserve User.

## Tests and comparison

| Check | Result | Evidence scope |
|---|---|---|
| City 30 + Eco/city 24 + operational zones 32 | PASS, 86/86 | Local helpers, adapters and source contracts, not production deliveries |
| Historical production suites | PASS after targeted reruns | Initial audio timeout passed on rerun; grouping adapter updated for OperationalCity without removing fault assertions |
| Additional zone/manual-assignment/UI response guards | PASS | Actual functions/handlers with isolated adapters |
| Typecheck, lint, Web build, Capacitor sync | PASS | Local execution |
| Deno: heartbeatAuto / manageOperationalCity | PASS | Strict isolated graph checks |
| Deno: Eco orchestrator / dispatchExterneAuto | FAIL | 82 / 213 historical diagnostics remain; no increase versus prior city graph after fixes |
| Exclusive priority experimental suite | FAIL, DEFERRED | Kept intact; production-disabled guard PASS |
| Operational city records / BF audit | PASS | Actual official production API, read-only |
| Production ON dispatch, cross-city FCM and adversarial RLS | NON TESTE | No city activated and no production test course created |
| Actual moving GPS, new deliveries and Victory | NON TESTE | Not inferred from simulations or installation |

The former city test expecting unrestricted broadcast for an unknown origin while
a zone is ON was strengthened to deny that broadcast. OFF equivalence remains
separately tested. No regression assertion was removed merely to obtain a pass.

| Feature | Previous evidence | New delivery evidence |
|---|---|---|
| Dispatch V2, Standard, Eco, on-route | Historical physical campaign and tests | Local regression suites PASS; no new live delivery claimed |
| Victory, tracking, chat | Historical physical campaign; video deferred | Historical suites PASS; no video work |
| Finance, Pass, Happy Hour | Independent course amounts previously verified | Financial/idempotence adapters PASS; no production accounting changes |
| Available feed | Historical Eco-only correction | Rendered Eco-only/loading/error regression PASS |
| GPS | Existing native tracking | Freshness/city guards tested in isolation; native configuration preserved |
| Super Admin | Existing dashboard | Operational-city manager and existing map integration added |

## Completed build and physical evidence

One Gradle build produced both release artifacts: SUCCESS, 454 tasks, 23m 6s.
Typecheck, lint, Web build and Capacitor sync passed before it. APK signature,
AAB signature, bundletool validation, package/version checks and APK 16KB zip
alignment passed. No development server URL or WebView debugging is embedded.
The AAB contains no bundled native `.so` library. Existing native settings and
permissions remain unchanged.

- Package: `com.base6a0ec08f3af5e1d1284254c1.app`.
- Version: `1.0.131`, versionCode `138`, minimum API 24, target API 36.
- APK: `android/app/build/outputs/apk/release/app-release.apk`, 8,880,307 bytes.
- APK SHA256: `ba2553c3c786eeb04ff3a8364ef750b5352fd83c92c3c7d8ca7d7b4ac3c253dd`.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`, 8,431,730 bytes.
- AAB SHA256: `64b8c43a9b0e2173066c37f6e4d668e1034c82963144927e5102e5db64a2a9db`.
- Official existing upload certificate SHA256:
  `9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699`.

Artifact paths are relative to the existing SILGAPP repository. Absolute paths,
metadata and verification results are recorded privately in
`C:/Users/HP/.codex/tmp/silgapp-release-138-result.json`.

Four Android 16 devices were authorized. Installation used `adb install -r`,
without uninstalling or clearing data.

| Device | Installation | Actual screens inspected |
|---|---|---|
| Samsung Fold4 | PASS, 1.0.131/138 | Client home, profile, history with 54 records, historical delivered-course Codex tracking/map, Discuter -> ChatWindow |
| Samsung A06 | PASS, 1.0.131/138 | Available feed, driver profile, driver dashboard, Messages list with 30 conversations |
| Moto g35 | PASS, 1.0.131/138 | Available feed, driver profile, history period change and six monthly deliveries with existing commission labels |
| Samsung Fold7 | FAIL, safe update refused | Remains 1.0.129/136 from Google Play; new Admin city/map screen NON TESTE |

On Fold7, Android returned `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. The installed
package's installer is `com.android.vending`; its actual certificate SHA256 is
`c503c57c088b8ea9aada032ef7477bad5494dceb0dacc3d01793f08a229c872e`.
This is the Google Play app-signing certificate, not the existing upload key used
by local releases. Do not erase its data or replace its key. A non-destructive
update needs an APK signed by Play with the matching app-signing certificate.
No Play upload/publication was performed. The device also returned to ChatGPT
during inspection; no unrelated screen content is used as SILGAPP evidence.

Physical evidence is private under `C:/Users/HP/.codex/tmp/silgapp-138-physical`.
The new captures do not establish a new delivery, acceptance race, FCM reception,
moving GPS, Victory playback or activated-zone behavior. Those remain NON TESTE
in this mission. The history and map checks are reads, not rewritten old courses.
No review, message, financial operation or city activation was submitted.

Residual visual findings: VENUS partially covers vehicle-choice controls in the
driver profile and a support action on client home; A06's reliability tile has
tight/wrapped typography. Those presentation components are unchanged by this
integration. They are not silently described as physically flawless.

Final local suite accounting: 47 suite files exercised, 46 PASS after documented
targeted reruns, one intact exclusive-priority experimental FAIL (deferred).
Two passing suites use pre-existing private preparation fixtures that are not
pushed. The city UI response handler test was rerun with exit code 0.
`git diff --check` reports four additional blank EOF lines in cityDispatchFilter,
cityNames, cityResolution and ecoOptimizationEngine; these whitespace warnings
were not turned into an unnecessary production redeployment/rebuild.

### Google Play readiness

The signed AAB, package identity, target API 36 and non-debug configuration passed
local validation. API 36 meets the current published target requirement for app
updates ([official Play guidance](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN)).
This is not a Play Console acceptance result. Verify the registered upload key,
latest published versionCode, Data Safety and existing sensitive-permission
declarations (background location, contacts, microphone, camera and notifications)
in the owner's Console before publication. No automatic publication is authorized.

### GitHub handoff

The release documentation commit follows functional commit `3a3313e7`.
The final `HEAD:ios` push and exact `ls-remote` hash are verified after committing
this report and reported in the delivery response. `origin/main` remains
`a4c8f6fd5b582af43d30e79a786fcf9f6b97d280`; native iOS changes are not introduced.

## Residual limits

- New-city creation uses inactive creation plus duplicate read-back checks. No
  database uniqueness constraint or multi-entity transaction is claimed.
- Geographic caches have a 30-second TTL across function instances; local invalidation
  does not prove instant global invalidation. Validate activation rollout separately.
- Old APKs remain compatible with all cities OFF. Backend acceptance stays authoritative
  when ON, but old clients' cross-zone list visibility is not certified.
- Map counts are bounded samples, not automatically whole-country totals.
- Actual FCM, device GPS movement and production ON behavior require a controlled pilot.
- Google Play publication, latest published versionCode and Play Console certificate
  registration require owner-side verification. No store publication is performed.

## Changed files relative to the delivered baseline

The list includes incoming Base44 changes preserved during integration, not only
new Codex corrections. A changed local backend source is not automatically a
deployed function; the exact 15-function deployment list above is authoritative.

```text
AGENTS.md
android/app/build.gradle
base44/entities/OperationalCity.jsonc
base44/entities/Quartier.jsonc
base44/functions/assignerLivreurAdmin/entry.ts
base44/functions/courseEventOrchestrator/entry.ts
base44/functions/creerCourseAdmin/entry.ts
base44/functions/creerCourseClient/entry.ts
base44/functions/exportClientsBF/entry.ts
base44/functions/getOnRouteProposalsForLivreur/entry.ts
base44/functions/heartbeatAuto/entry.ts
base44/functions/manageOperationalCity/entry.ts
base44/functions/rappelPeriodiqueAuto/entry.ts
base44/functions/recupererCoursesBloquees/entry.ts
base44/functions/relancerDispatchAdmin/entry.ts
base44/functions/setCityDispatchConfig/entry.ts
base44/functions/terminerCourseAdmin/entry.ts
base44/functions/transitionStatutAdmin/entry.ts
base44/shared/cityDispatchFilter.ts
base44/shared/cityNames.js
base44/shared/cityResolution.ts
base44/shared/dispatchEngine.ts
base44/shared/dispatchV2.ts
base44/shared/dispatchWatchdog.ts
base44/shared/ecoOptimizationEngine.ts
base44/shared/ecoRouteOptimizer.ts
base44/shared/geoUtils.ts
base44/shared/operationalZones.ts
base44/shared/pushRappelPeriodique.ts
base44/workflows/Rappels Periodiques (5 min).jsonc
base44/workflows/Recuperation Courses Bloquees (1 min).jsonc
base44/workflows/Recuperation Courses Bloquees (5 min).jsonc
docs/silgapp-regression-inventory.md
docs/silgapp-release-1.0.131.md
package-lock.json
package.json
src/App.jsx
src/components/admin/CityDispatchAdmin.jsx
src/components/admin/CityDispatchMap.jsx
src/components/admin/CityDispatchToggle.jsx
src/components/admin/OperationalCityManager.jsx
src/components/courses/CourseDetailDialog.jsx
src/components/courses/TerminerCourseButton.jsx
src/components/crm/ExportClientsBFButton.jsx
src/components/layout/Sidebar.jsx
src/hooks/useCoursesDisponibles.js
src/hooks/useHeartbeat.js
src/pages/CityDispatchAdminPage.jsx
src/pages/ClientsCRM.jsx
tests/city-dispatch-regression.mjs
tests/city-integration-safety-regression.mjs
tests/city-manual-assignment-regression.mjs
tests/eco-city-dispatch-regression.mjs
tests/eco-partial-grouping-reproduction.mjs
tests/eco-route-optimizer-regression.mjs
tests/operational-city-ui-response-regression.mjs
tests/operational-zones-regression.mjs
tests/operational-zones-safety-regression.mjs
```

Workflow labels above are transliterated; the repository retains their original
accented filenames. No workflow activation was deployed.
