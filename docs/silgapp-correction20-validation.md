# Correction 20 Validation

## Source And Safety

- Fetched origin/main d1fed9db and merged into the existing integration branch.
- Backup branch: backup/pre-correction20-20261011. Existing private untracked
  work copied outside the repository and not staged.
- Corrections 17, 18 and 19 are retained. No native or financial code changed.
- Exclusive priority is blocked locally by both configuration loading and the
  reservation creation entry point. Normal proposals follow Standard dispatch.

## Confirmed Gaps

- Only a five-minute scheduled workflow and activity-driven lazy cleanup exist;
  no independently durable release at the 15-second deadline is demonstrated.
- Reservation creation uses a read then proposal insert, not an atomic course
  claim. All normal acceptance paths do not enforce this exclusive reservation.
- Expiry is stored before dispatch handoff. Interrupted or failed handoff is
  not replayed by the pending-only expiry scan.
- Reservation duration has no upper bound of 15 seconds.

These gaps prevent enabling or claiming correction 20 as validated. Its original
suite is preserved: 9/20 scenarios passed, 11 failed with the fail-closed gate.
Those failures are not evidence that the enabled protocol is safe.

## Evidence

- Official CLI production auth.me succeeded as the expected administrator.
- Read-only AppConfig returned ON_ROUTE_ENABLED=true and EMERGENCY_STOP=false
  for BF. ON_ROUTE_PRIORITY_ENABLED and ON_ROUTE_PRIORITY_SEC were absent in
  the query result; the source default for priority is false. No settings changed.
- Official functions pull retrieved courseEventOrchestrator and
  ecoOptimizationOrchestrator sources into private snapshots. This is source
  verification, not a runtime acceptance/concurrency proof.
- ADB detected only Moto g35 ZE223GT5WJ, running 1.0.127 / 134. The app opened
  and the available-courses screen was captured. No test course was created.
- 13 SDK proposal and 14 cancellation simulations passed; 14 historical suites
  passed. SDK source/handler, waiting-modal, cancellation recovery and Dispatch
  V2 reconstruction checks passed locally with isolated adapters.
- New disabled-priority test passed, with no backend reads/writes allowed.
- Typecheck, lint and Web build completed successfully. Web build was rerun
  with the official VITE_BASE44_APP_ID; the first unconfigured run was stopped.
- origin/ios was verified by git ls-remote as
  e40ef8b1ac112b80601751bfe0cc4fa3c8e00471. No new push was performed.

## Release Boundary

No production deployment, Android rebuild or GitHub push is approved by these
results while the critical priority suite remains failing. The last verified
release stays 1.0.127 / 134. A future release must be at least 1.0.128 / 135.
Play Console upload-certificate compatibility and highest published version
remain unverified. No Play publication was attempted.
