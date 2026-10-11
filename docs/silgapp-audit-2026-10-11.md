# SILGAPP - Integration and audit, 2026-10-11

## Sources and preservation

- Base before integration: c9c53244850585df0dd5c08c556e7fd982e848c5.
- Incoming Base44 GitHub reference: origin/main, 3b051f74 (fetched this mission).
- Integration merge: 8af5e5bf. No production backend deployment performed.
- Restore branch: backup/pre-final-sync-20261011.
- Uncommitted work preserved in stash backup-before-base44-final-20261011,
  then applied without dropping the backup.

Incoming changes cover 18 files: Notification schema, courseEventOrchestrator,
ecoOptimizationOrchestrator, finaliserLivraisonLivreur,
getOnRouteProposalsForLivreur, dispatchV2, ecoOptimizationEngine, CourseListItem,
Sidebar, CoursesDisponibles, EcoMissionCard, EcoMissionDashboard,
OnRouteProposalCard, useCoursesDisponibles, useOnRouteProposals,
CourseExterneFormSync, LivreurExterneApp and tailwind.config.js.

The two feed merge conflicts were resolved retaining country/Enterprise
filtering, local dismiss persistence, one available-mission query and the
existing isolated-course feed. The incoming duplicate queries/cards were not
added. Android/iOS native files were not replaced by incoming versions.

## Audit matrix

CORRECTED means a local change, not a deployed or device-validated fix.

| Priority | Finding / change | Executed evidence | Status and remaining checks |
| --- | --- | --- | --- |
| Admin country | MobileNav rendered a flag outside the native select AND inside each option. Removed the second flag; explicit white/black selector and visible arrow. Sidebar incoming fix retained. | Source assertions in october-delivery-regression | CORRECTED locally; Android/Web visual interaction NOT TESTED |
| Client creation | Existing recap and confirmation retained. Added synchronous confirmation ref and prevention of implicit Enter submit in inputs on every step. | Typecheck/lint; no authenticated form test | PARTIAL: Admin/public form and full UI tests still required |
| Acceptance | Response normalization retained/added. Correct Eco query invalidation; disabled mission acceptance UI for blocked/ineligible drivers. Added local backend country/public/feature-stop checks. | Local policy tests; code review | PARTIAL: delayed response reconciliation and real concurrent attribution NOT TESTED |
| Victory | Direct Standard delivery updated cache to livree BEFORE backend response, potentially unmounting the card. Removed optimistic finalization; exact-course readback after a lost response; use existing parent Victory callback. Admin recap no longer navigates away immediately. | october-delivery-regression and victory-overlay-regression | CORRECTED for tested helper/direct flow; visual Standard/Eco/Enterprise/multi-colis still NOT TESTED |
| Available/status | Local isolated feed and dispatch guards preserved; removed duplicate incoming pollers. Base44 conversion now sets recherche_livreur/disponible_push. | eco-dispatch-guards-regression | PARTIAL: live visibility/status writer history NOT TESTED |
| Grouping speed | Creation event integration imported. Hold check no longer reads config; grouping flag checked at engine entry. No polling added. | eco-october-policy-regression | PARTIAL: end-to-end latency and real backend credits NOT MEASURED |
| Geography | Existing scorer primarily uses geographic distances. Added six valid pickup-before-delivery route orders, preserving zero coordinates. Existing scorer not replaced. | eco-route-order-regression: six synthetic scenarios; 10,000 iterations in 48 ms; zero network calls | IMPROVED pre-ranking only; road detours/direction eligibility remain incomplete |
| Eco price | Creation mode helper accepts 500/1000/2000/3000 without changing price. Disabled Eco now errors instead of silently changing mode. Configured zero thresholds no longer fall back via boolean OR. | eco-october-policy-regression | PARTIAL: geographic scorer still has configured profitability gates; complete client/backend price flow NOT TESTED |
| On-route/dashboard | Latest modals, on_route/destination_chain endpoint and dashboard imported. Cancelled pickup no longer blocks next course; missing course cannot close mission; delivery button requires pickup. | Progress tests in october-delivery-regression | PARTIAL: manual reordering, notification/device path and complete acceptance workflow NOT FINISHED/TESTED |
| Admin individual tracking | Incoming grouped-course badge preserved. Per-course IDs/prices/accounting remain separate. | Source comparison only | NOT TESTED functionally |
| Cleanup/progress | updateEcoMissionRouteProgress exists in four finalizer branches. Cleanup now stops driver release on failed reads/mission updates, queries active courses directly and preserves admin OFF. | eco-october-policy-regression with fake entities | CORRECTED locally; backend deployment and real tests pending |
| Conversion | Incoming status fix imported; local hold guard survives feature shutdown. | Local guards/policy tests | PARTIAL: real scheduled runs and retry after conversion-before-dispatch failure NOT TESTED |
| Finance/Pass/HH | Existing commission lock and Axios backend normalization retained. No production writes. | pass-zero-commission-lock; course-idempotency-lock-regression | PARTIAL: actual accounting, quotas, expiry and Enterprise ledger NOT TESTED |
| GPS/FCM/native | Existing files/config retained; no extra GPS-driven searches or ORS calls added. | Local regression checks and config inspection | NOT TESTED on phone (adb devices lists none) |

## Critical residual risks

1. acceptEcoMission claims the mission then updateMany on its courses. A partial
   update invalidates the mission but does not demonstrate recovery of already
   claimed courses. Multi-entity atomicity has NOT been proven. Do not call the
   feature production-ready or activate it based on local tests.
2. Grouping has a similar partial-claim risk. A transaction or a proven common
   reservation/recovery protocol is required; a successful updateMany mock is
   not evidence of Base44 transactional behavior.
3. Conversion writes converted before dispatch and catches dispatch failure.
   The isolated-only scan does not itself retry that converted course. Verify
   a durable replay path before claiming reliable conversion end to end.
4. Local cleanup safeguards require remote deployment approval and isolated
   backend validation. No cleanup was run in production.
5. Geographic scoring does not currently prove the configured maximum road
   detour. Route-order improvement alone is not a fix for this eligibility gap.
6. Manual reordering of remaining steps is not implemented by this mission.
7. Production ECO:BF:ON_ROUTE_ENABLED was neither changed nor remotely verified.
   It must remain false until explicit validation. No production test created.

## Validation scope

Local fake API tests check exact-course delivery readback, nested response
normalization, real error propagation, no automatic financial retry and
progression of cancelled/delivered courses. Policy tests execute extracted real
functions with fake config. Geographic tests are synthetic, not ORS/road tests.
Historical tests include source assertions and in-memory simulations; none
establish Base44 concurrency or physical Android behavior.

Growth KPI module only printed expected values: not a functional PASS.
dispatch-v2-enterprise-reconstruction.mjs is absent from the current tests tree;
its historical failure was not rerun or declared resolved.

## Release scope

Version 128 / 1.0.121 already exists locally. New requested test build uses
129 / 1.0.122, existing package, keystore, SDK configuration and FCM/App Links.
No release is ready for public distribution while the critical backend risks
above remain. Build and signature results must be reported separately from
functional validation. No Google Play publication or backend activation.
