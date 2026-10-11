# SILGAPP 1.0.123 / 130: technical validation

## Artifacts verified

APK: android/app/build/outputs/apk/release/app-release.apk, 8863772 bytes.
SHA256: 4817a0f1231dc29daa091764119c98bdf60039c5c094f348740ab68e730cf5bc.
AAB: android/app/build/outputs/bundle/release/app-release.aab, 8414866 bytes.
SHA256: a798a03aa04ac9a0687e942c3f99c4668d8839e37e6498639d749bbdb9a11209.
Certificate SHA256:
9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699.
APK apksigner and AAB jarsigner verification succeeded with the existing key.
AAB self-signed certificate/timestamp warnings are reported by jarsigner.
ApplicationId unchanged; SDK 36/36/24; server.url absent. No store publication.

## Scope

Local base: 4e2dcbc1; origin/main remains 3b051f74 after fetch. No new upstream
commits required integration. Backup: backup/pre-release-20261011, plus a
hash-verified private copy of 50 dirty/untracked files. No iOS native changes.

Preserved: Dispatch V2, financial rules, independent course commissions,
Pass/Happy Hour, no QR/PIN, Android identity, signing and FCM configuration.
Official client tracking is SuiviCourseFullscreen, shared composer ChatWindow.
Course and general conversations use different scopes. History pagination
loads older messages without deleting records. Failed text/audio stays available.

Eco candidates are fenced before releasing partial claims. Failed cleanup
retains a recovery marker; the existing ten-minute convert_due workflow retries
stale candidates and pending compensation. This is compensation, not a claimed
multi-document database transaction. Platform atomicity needs real concurrency
verification. GPS capture is optional, range-validated and never fabricated.

## Backend

Explicit target: 6a0ec08f3af5e1d1284254c1. Authentication confirmed with auth.me.
Nine targeted function deployments, no entities push or global deploy:

- ecoOptimizationOrchestrator
- transitionStatutLivreur
- finaliserLivraisonLivreur
- annulerCourseExterne
- envoyerMessage
- creerCourseAdmin
- creerCourseClient
- courseEventOrchestrator
- deciderApresAnnulationLivreur

The last four entrypoints retain the remote source and package the updated
shared engine. Remote functions pull confirms the shared engine in all eight
dependent bundles and the four directly edited endpoints match local sources.
transitionStatutLivreur first returned `unusable`; a targeted retry succeeded.
The live ecoOptimizationOrchestrator health action returned success=true.
No production course or balance changes were made by the validation scripts.
The pre-deployment remote function snapshot is retained privately for rollback.

## Validation

PASS: npm typecheck, lint, web build; fourteen historical targeted suites;
isolated GPS/transition/message permission tests; partial grouping and crash
compensation tests. Browser React tests: Victory under StrictMode/rerenders,
two nine-second closures; actual ChatWindow with 205 messages, pagination,
failed text retry and scope changes. Backend adapters in these tests are mocks.

Additional unconfigured Deno strict check: FAIL, 90 typing diagnostics in the
backend dependency graph, including existing implicit-any/unknown handling.
This is separate from the repository's passing npm typecheck and the accepted
Base44 deployment. No broad financial/dispatch refactor was made to silence it.

Not yet verified: end-to-end FCM/media/read badges, device Victory, real
concurrent acceptance and crash recovery. Do not equate deployed code with a
successful real delivery. The historical dispatch-v2-enterprise-reconstruction
test file is absent from this checkout; its old finding is not declared fixed.

## Physical test prerequisites

Three Android devices detected. Device account state must be verified after
installation. Current backend read returned 251 public BF driver profiles,
zero admin_hors_ligne=true, and 16 eligible drivers including 14 outside the
test identities. Creating publicly dispatched tests is therefore not isolated.
No global availability changes or blind restoration of old statuses is allowed.
Prior test debt remains untouched; no payment or corrective ledger entry made.

## Remaining work

Confirm physical authenticated client/driver flows and media on the new build;
validate recipient-scoped unread badges and notification links; establish a
safe test-dispatch restriction before new end-to-end test courses. Production
RLS and concurrency must be checked against actual accounts. No store release.
