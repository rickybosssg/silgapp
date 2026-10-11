# SILGAPP Release Rules

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
