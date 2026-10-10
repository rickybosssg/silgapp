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
