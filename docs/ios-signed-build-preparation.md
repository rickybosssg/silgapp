# iOS signed build preparation — 2026-10-14

## Source and scope

This isolated worktree starts at the verified GitHub `ios` head
`d52bf1da9c2e8b794175f5d8e633b613f20fed5a` (2026-10-14 05:12:06 UTC).
Branch: `codex/prepare-ios-signed-20261014`.
Only the CI approach from `test-ios-cloud-build` is reused; its older application
tree is not merged. The original worktree and its 15 untracked entries are preserved.
The approved logo is selected only in native iOS. Existing Android/web image URLs,
business rules, dispatch, finance, and production services are unchanged.

## Version/build prepared from the owner's screenshot

The owner's App Store Connect screenshot received at 2026-10-14 06:30 UTC was
visually reviewed by the parent task. Library source:
`libfile_cac4a7f3cec481919821fb08561ea1bf`; numeric App Store app ID `6782046749`.
It shows TestFlight iOS version 1.0.59 opened with build 66, Ready to Submit, and
25 days remaining. This confirms the last visible build only; it is not an
exhaustive check of the highest uploaded build or independent proof of publication.

The authorized next local version is 1.0.60 / 67 in `ios/release-settings.json`
and both Xcode configurations. The evidence and its scope are recorded in the
settings, with `app_store_connect_confirmed` true and a required recheck before
submission. Immediately before any future submission, check App Store Connect
again for concurrent uploads and reconcile the selected numbers if needed.
Android 1.0.131 / 138 is a separate version stream and remains unchanged.

Eric prefers direct App Store review without a TestFlight campaign. Export uses
`app-store-connect`, destination `export`, and `testFlightInternalTestingOnly=false`;
no upload or submission is performed. A separate owner screenshot at 06:27 UTC
shows an Apple Developer agreement still pending. The owner must review and accept
it before Apple services requiring the agreement can proceed; this task did not
accept any agreement. Eric subsequently reported accepting it at 06:37 UTC;
the resulting Apple account state has not been independently rechecked.

The signed workflow fails closed if confirmation is removed and passes the
reviewed numbers explicitly to Xcode.
The source commit must still equal the current remote `ios` head and be an
ancestor of the CI checkout. A new remote release requires reconciliation first.

## Native configuration

- `App.entitlements` uses `APS_ENVIRONMENT`: development for Debug, production for
  Release. The existing location and remote-notification background modes remain.
- Release uses the existing verified iPhone Distribution identity, including its
  SDK-specific override, rather than requiring another Apple Distribution key.
- Existing `Downloads/GoogleService-Info.plist` matches the exact bundle ID
  `com.base6a0ec08f3af5e1d1284254c1.app`; its required fields were checked without
  displaying their values. A local copy is ignored by Git and included in the
  Xcode resource target. No Firebase/APNs access was created or changed.
- Existing Firebase initialization, native plugins, and business code remain.
  Firebase Console APNs configuration and actual device push delivery are untested.

## Workflows and separate authorizations

Ordinary branch pushes do not start either workflow. A future, explicitly approved
tag push starts the corresponding build:

- `ios-check-*`: simulator build without signing.
- `ios-signed-v<reviewed-version>-b<reviewed-build>`: signed archive and IPA export.

The signed tag must exactly match the reviewed release settings, with an optional
`-r<positive-integer>` suffix for a new build attempt. Existing tags are never
moved or force-pushed. `workflow_dispatch` is retained for an available registered
workflow, but the initial path does not rely on the default branch containing it.
`main` remains unchanged. The workflows use macos-15, Node 20, npm ci, the current
web build, Capacitor iOS sync, and the existing CocoaPods dependencies.

The owner must separately authorize transferring the local signing/configuration
files to GitHub Actions and configure the following names privately:

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`: the validated encrypted P12.
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`: its export password, not the PEM password.
- `IOS_APPSTORE_PROFILE_BASE64`: the validated new provisioning profile.
- `APPLE_TEAM_ID`: `X7N95F8KTJ`.
- `IOS_FIREBASE_CONFIG_BASE64`: the existing matching Firebase iOS plist.

Current remote presence/values of these names were not inspected. No credentials
are included in Git. Future CI checks the public certificate fingerprint, profile
name/UUID, team, exact app ID, dates, distribution type and production entitlements
before importing signing assets on its ephemeral macOS runner. Temporary signing
files/keychain/profile are cleaned up. Only the IPA is retained as a GitHub artifact
for three days; no App Store upload/submission step is present.

## Logo handoff

The approved Library image is now the 1024x1024 PNG at
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`; its Contents.json
already selects this universal 1024 icon. The same approved bytes are packaged at
`src/assets/silgapp-logo-ios.png`. `ios/logo-source.json` records the exact Library
ID, approval timestamp and image SHA-256. No AI generation or redraw was performed.
The native launch-screen images retain their 2732 square white canvas and replace
the Capacitor placeholder with a centered 512px resize of the approved logo.

Verified brand references are `src/components/auth/AuthGate.jsx` (three images),
`src/components/layout/MobileNav.jsx`, `src/components/layout/Sidebar.jsx`,
`src/components/IOSAppStoreBanner.jsx`, `src/pages/RoleSelection.jsx` and
`src/pages/TelechargerSILGAPP.jsx`. `index.html` also has favicon/apple-touch-icon
references shared with the web/Android entry point. Do not globally replace image
URLs: `silgappLogo` selects the new image only when the native platform is iOS.
`SplashScreen.jsx` also uses this selection. The nine changed image references are
tested against their original source: no authentication, navigation or other
component logic changes. Shared enterprise/partner/merchant/user logos and the
web/Android favicon references are preserved.

## Local verification and limits

- Python unittest: 15 release/profile/entitlement/identity safety tests passed.
- Node test: 5 workflow YAML/trigger/artifact/private-key handling and embedded
  Bash syntax tests passed.
- Node branding tests: 4 passed. Approved image SHA-256/opaque RGB dimensions,
  native launch variants, Android/web fallback and exact component-source
  preservation (apart from the image selector/import and EOF newline) are checked.
- Typecheck and ESLint completed with exit code 0.
- Local Vite web build completed with exit code 0 in 263 seconds using
  `node node_modules/vite/bin/vite.js build --configLoader native`.
  The prior `runner` loader timed out on its module-fetch transport at 60 seconds;
  native configuration import completed in 9.8 seconds. Junction dependency
  metadata reads took 15–97ms. No dependency installation or global config change
  was needed. The temporary node_modules junction is retained, not removed.
- The built iOS logo has the approved SHA-256. Both previous brand URL filenames
  remain in the generated JavaScript bundle; platform tests retain Android/web URLs.
- Base44's plugin warned about absent VITE_BASE44_APP_ID in the isolated worktree.
  The existing source already falls back to the official public BASE44_APP_ID;
  no secret or new configuration value was read/introduced. Browserslist also
  reported old browser data; no dependency update was performed for this warning.
- Existing matching Firebase plist validation passed without values being printed.
- The actual downloaded profile and public certificate pass the new profile
  validator; the CMS signature check also returns success. Signer trust-chain
  validation remains outside this local check.
- Bash syntax validation passed; archive script was not executed.
- Native archive/export completion, App Store Connect acceptance and device
  behavior remain unverified. See the authorized CI attempt below.

No P12/private key was opened or decrypted on the Windows host during source
preparation. The owner configured all five GitHub secrets himself and explicitly
authorized branch push and signed CI at 06:58:52 UTC. No secret was read back or
transferred again by this task. App Store upload/publication remains unauthorized.

## Authorized CI attempts

The first commit `a21209fa9cfe3c10a34c838a907d197baff316b3` was pushed only to
`codex/prepare-ios-signed-20261014`, then tagged `ios-signed-v1.0.60-b67`.
Run https://github.com/rickybosssg/silgapp/actions/runs/38525979819 started on the
standard `macos-15` runner in the public repository. Source/version checks, secret
presence, Firebase validation, web build and CocoaPods succeeded. The existing
P12/profile were used by the authorized ephemeral signing job, without being
included in artifacts. Archive failed with exit 65 because a workspace command-line
provisioning profile override also reached Pods targets, which cannot use an app
profile. The Firebase cleanup step succeeded; no IPA artifact was produced.

The correction applies signing and version settings only to the App Release target
through the existing CocoaPods xcodeproj library, with no workspace-wide signing
override. A regression check protects that scope. Retry tags retain 1.0.60/67 and
use a suffix instead of moving the original tag. The remote ios source and the
App Store Connect concurrent-upload recheck still guard a future submission.
