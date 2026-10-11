# SILGAPP 1.0.127 / 134

Base44 reference: origin/main f481f1ec (corrections 18 and 19), merged without
replacing existing Codex/native changes. Backup branch:
backup/pre-corrections18-19-20261011. Private untracked work was copied separately
and is excluded from commits.

## Changes

- On-route courses excluded from the ordinary waiting modal; preserve the
  respond_proposal path to respondToOnRouteProposal, SDK response extraction,
  EcoProposal realtime, push invalidation and 15-second fallback polling.
- Cancellation recalculates remaining mission steps and restores the single
  course card through active mission invalidation/realtime refresh.
- Preserve pickup traces, completed steps and collected parcels; prevent their
  client-initiated redispatch. Do not prematurely release an Eco driver.
- Conditional mission update precedes detachment. Failed reads/writes are not
  reported as successful recalculation. Retry can finish an interrupted detach.
  Unassigned survivors use the existing candidate compensation/recovery path.
- No Dispatch V2, price, commission, finance, native identity or iOS changes.

## Backend

Only annulerCourseExterne and deciderApresAnnulationLivreur were deployed via the
official CLI to app 6a0ec08f3af5e1d1284254c1. Both entry sources and their bundled
ecoOptimizationEngine were pulled again and matched the staged code.
Original exports are retained privately for rollback. Two rejected packaging
attempts identified nested-path and missing dynamic-import dependencies; the
final targeted deployment succeeded after correcting the deployment package.
No global deploy, schema synchronization or production data write was used.
Source verification does not establish execution of the published runtime paths
or a multi-entity transaction guarantee.

## Executed Checks

- 27 incoming Base44 assertions: PASS (13 proposal responses + 14 cancellation
  simulations; not real backend tests).
- 14 historical suites: PASS.
- Actual cancellation function with injected read/CAS/detachment failures,
  pickup trace, route indexing, total cancellation and recovery handoff: PASS
  using isolated adapters.
- Actual waiting-modal predicate, accept/refuse/expiry handlers and realtime/
  push source contracts: PASS locally; not real FCM delivery.
- Dispatch V2/Enterprise, acceptance recovery, chat isolation, final corrections,
  unread state and viewport regression checks: PASS locally.
- Typecheck, lint and web build: PASS.

Real on-route acceptance/refusal/expiry, partial cancellation and concurrent
backend acceptance remain NOT TESTED. Other eligible production drivers remain
active. No new course, delivery, financial entry or test notification was made.
Physical installation/startup and release signature verification are recorded
in the final delivery report, separately from functional scenario validation.

## Release Evidence

APK and AAB signature verification: PASS, unchanged certificate SHA256:
9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699.
APK: 8869108 bytes, SHA256
fba268e1cf2245348616bc02c315dadb13ec6778301b50c1a3e0f923f3403421.
AAB: 8420140 bytes, SHA256
f9574ab1aaa1ae8d1582c5a0f2a43c1f2ce9a57c8767984ab51f998a4d4980a2.
Package/version verification: PASS, com.base6a0ec08f3af5e1d1284254c1.app,
1.0.127 / 134, minSdk 24 / targetSdk 36. Moto g35 update installation returned
Success; installed version and activity launch verified without data clearing.
Fold4 and A06 were absent at installation.
