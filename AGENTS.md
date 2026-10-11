# SILGAPP Release Rules

## Permanent non-regression policy

ON AVANCE. ON NE RECULE PAS. Every correction must preserve previously validated
features unless the user explicitly authorizes their removal or replacement.
This policy applies to Base44 synchronization, GitHub integration, Android and
iOS changes, and release builds.

Before changing functional code:

1. Inspect Git status and identify the last validated local commit.
2. Preserve uncommitted and untracked work; create an identifiable local restore
   point when needed. Never commit signing secrets or keystores.
3. Read `docs/silgapp-regression-inventory.md` and compare incoming Base44,
   current Codex, and last validated implementations.
4. Identify protected behavior and regression risks before resolving conflicts.

Never replace a corrected file wholesale with an older implementation to fix
one issue. Merge compatible improvements and preserve the most recently
validated product rules. If incompatible rules remain ambiguous, pause that
part of the integration and request a user decision.

After functional changes, run historical and relevant current regression tests,
add meaningful protection for new fixes, and run typecheck, lint and web build.
Inspect the final diff for unintended deletions. Never remove a regression test
merely to make checks pass. Update the inventory with rules, affected files,
tests and remaining validation gaps.

Before an authorized Android build, report preserved and new corrections,
passed and failed tests, untested features and residual risks. Distinguish
static checks, simulations, backend integration tests and physical-device
tests. A successful merge or build alone does not prove functional correctness.

Do not test using real production deliveries, payments or balances. Do not
trigger production dispatch or notifications without explicit authorization.
Do not undertake a general refactor or reintroduce explicitly abandoned
features such as Force Update or PushTelemetry.

Compilation and remote synchronization require explicit user authorization.
Follow the latest session authorization; never treat an older mission's limits
as a permanent ban. Production deployment and data changes require their own
authorization.

## Client tracking and messaging invariants

- `SuiviCourseFullscreen` is the existing Codex tracking presentation for
  Standard, Eco and authorized public tracking. Do not introduce a competing
  tracking screen. Public token views must not gain private entity queries.
- Open tracking only after explicit confirmation and successful creation,
  with the returned course id. Closing tracking must not cancel the course.
- `ChatWindow` owns the shared message history and composer. CourseChatPanel
  and MessagesPage are entry-point wrappers, not independent composers.
- Eco conversations are scoped to each course, never shared by mission.
  Validate participation before returning idempotent message responses.
- Preserve media, unread behavior, history and reconnect behavior; test these
  separately. Source presence does not establish device or backend validation.
- Keep a failed audio/text draft and avoid a fresh idempotency key when retrying
  the same uncertain send. Never alter production accounting to fix test data.

## Android release and GitHub ios sync

For every SILGAPP Android delivery that produces a new signed APK and AAB:

1. Fetch the latest corrections from `origin/main`.
2. Integrate them conservatively while preserving local improvements and Android/iOS-specific configuration.
3. Run the relevant tests and generate the signed APK/AAB with the official Android package and signing configuration.
4. After the build is validated, synchronize the GitHub branch `ios`.
5. Preserve iOS-specific configuration.
6. Push to `origin/ios` without force push.
7. Verify that the final commit is present on GitHub.
8. Report the Android version, GitHub commit, and `origin/ios` push confirmation.

Do not consider a SILGAPP Android release fully delivered until the `origin/ios` push is confirmed.

Never modify `origin/main` for this release flow. If conflicts, test failures, or unsafe changes appear, stop before pushing and report the blocker precisely.

Do not publish automatically to Google Play or the App Store.

## Base44 to Codex integration guard

SILGAPP must evolve without losing validated functionality. Before integrating
new Base44 or GitHub changes, keep or create a local backup branch, compare the
incoming tree with the current Codex tree, and preserve Android/iOS-specific
configuration.

Every integration must explicitly verify these historical invariants before any
APK/AAB build:

- Dispatch V2 remains the only active runtime dispatch for public courses.
- Isolated SILGAPP Eco courses are not published as Standard courses; only
  grouped Eco missions or explicitly converted Standard courses can be accepted.
- The SILGAPP Eco dispatch settings panel remains present in the existing
  Dispatch configuration UI and persists country-scoped AppConfig keys.
- Client course creation stays draft-only until explicit confirmation, then
  opens the existing follow/search experience using the real backend course id.
- The driver Victory overlay keeps celebration words on one line, lasts about
  9 seconds, closes cleanly, and returns to the driver dashboard.
- Pass Zero Commission and Happy Hour locked at 0% keep commission and debt at
  0 for public courses; Enterprise is not affected by public Pass/Happy Hour.
- Driver-blocked Admin rules are preserved: visibility/push may remain enabled,
  but backend acceptance stays refused.
- Annulation/redispatch client-decision guards are preserved.
- GPS, FCM, messaging, finance, public/Enterprise isolation, multi-country
  isolation, and official signing configuration are not regressed.

Do not restore old files wholesale when Base44 has newer fixes. Restore the
minimal behavior, add or update a regression test, and document any intentional
product decision that supersedes an older behavior.
