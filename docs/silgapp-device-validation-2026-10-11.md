# SILGAPP Device And Backend Validation

## Scope And Evidence

- First action: Android SDK ADB devices detection.
- One authorized Samsung SM-F936B, serial RFCT80QCFXT, Android 16.
- Installed version before: 1.0.121 / 128. Installed existing signed 1.0.122 /
  129 with adb install -r: Success. No uninstall, clear-data, or new build.
- Application launch: PASS. Screenshot confirms session retained and client
  dashboard visible. Displayed name Francois does not prove test-account identity.
- Physical client form navigation: PASS; Step 1 of 3 displays Standard selected
  and Eco visibly disabled, consistent with the effective flags. No submission.
- Filtered recent AndroidRuntime/chromium/Capacitor error log: no entries returned;
  this is not proof that every flow is error-free.
- Git fetch origin: main remains 3b051f74bd646e2bb0b02acdf7afee2f951c3c5c.
- Baseline and pre-device backup branch: e49eb7c966b4851afec73baad2227d9ed854fe0f.

## Official Base44 Access

CLI 0.1.32 authenticated as weezyh2@gmail.com. Initial network requests failed
with UNABLE_TO_VERIFY_LEAF_SIGNATURE. Node --use-system-ca resolved this using
the Windows trust store; TLS verification was never disabled.

Official CLI exec with Deno and system trust successfully executed auth.me():
authenticated true, weezyh2@gmail.com, role admin. No browser token extraction.
Runtime read found authorized driver 6a6bf25658d28818242a0f29, BF, active, valide,
disponible, admin_hors_ligne false, public (no enterprise).

Effective AppConfig read (unchanged): ECO:BF ENABLED=false,
GROUPING_ENABLED=false, ON_ROUTE_ENABLED=false, EMERGENCY_STOP=false;
CONVERT_DELAY_MIN=45, MAX_COURSES_PER_MISSION=2,
PROPOSAL_EXPIRATION_SEC=300, MAX_DETOUR_KM=6.

## Remote Comparison And Deployment

Official eject backup is outside Git in the local Codex temporary directory.
EcoMission, EcoProposal, CourseExterne match local schemas; all eight Eco fields
are present. Compared creation, finalization, cancellation, transition, event
orchestration, watchdog, V2 and lock sources match except the engine and dispatch
entry. Function-list presence alone is not runtime validation.

Remote dispatchExterneAuto lacked the local isolated-Eco early return. The local
guard also called nonexistent action process_course_created. Removed that call;
the existing courseEventOrchestrator remains responsible for event-driven grouping.

Deployed only dispatchExterneAuto from the controlled remote-eject folder after
adding the early return. Remote shared dependencies and automations were retained;
no entities push, global deploy, engine deployment or configuration update.
CLI reported one deployed function (17.9 seconds). Official functions pull then
returned that function and confirmed eco_isolated_pending_grouping present.
Rollback: remove only the added isolated-Eco early-return block and redeploy the
same function with preserved remote dependencies; no data migration is involved.

## Workflow And Test Limits

Official workflow listing confirms conversion workflow active; exported definition
uses ten-minute interval, convert_due then expire_proposals. Listing reports 147
runs and last success 2026-10-11T08:51:05.354000Z. Function logs return two HTTP200
invocations. These do not establish a successful real due-course conversion or
exactly-once dispatch. At normal scheduling, eligibility at 45 minutes can execute
up to roughly ten minutes later, plus execution/retry delay.

Ten local regression suites passed: delivery fake-API readback, Eco policy fake
configuration, geographic route order, driver course, idempotency source checks,
location search, Victory source, Pass zero lock, Eco dispatch guards, new dispatch
entry guard. These are static/unit/simulated, not real backend concurrency tests.
After removing the incorrect dispatch grouping call, the old source assertion
requiring that call failed. It was replaced with an invalid-action prohibition;
existing event-orchestrator grouping and isolated-course guard assertions remain.
Typecheck, lint and web build were executed again and passed.
Synthetic route benchmark: 10000 iterations about 46-51ms, zero ORS/backend calls.

No test courses, driver notifications, financial mutations, global flag changes,
or real acceptance/finalization were deliberately executed. Full physical
Standard/Eco delivery, FCM, moving GPS, accounting and concurrency remain untested.
An isolated environment and confirmed test sessions are needed. One phone does
not establish concurrency safety; two test identities and a backend harness are
required even if both are driven from one computer.

## Blocking Risks Not Hidden By Successful Checks

- Grouped updateMany is not proven transactional across both courses; partial
  claims are not safely compensated. Do not certify double-attribution safety.
- Conversion has no proven durable recovery after conversion succeeds but
  publication fails; isolated-only rescans cannot prove retry coverage.
- Geographic ordering is not verified road-detour/rentability validation.
- Emergency-stop behavior for engaged missions needs isolated runtime validation.

Keep Eco OFF; no general-public activation or risky engine rollout performed.
Current Android frontend unchanged, so existing APK/AAB remain reusable. Their
build tree is e49eb7c9; this mission adds backend-only guard and documentation.
