# iOS signed archive preparation

## Source and release gates

`ios/release-settings.json` records the bundle, team, expected certificate/profile,
source pin and provisional version/build. Before signing, recheck App Store Connect
for the current version, all used build numbers and submission state. A provisional
number is not an allocation. Never modify an existing submission implicitly.

The source pin must equal the current remote `ios` head and be an ancestor of the
CI checkout. After synchronizing a new application source, prepare a reviewed
release commit/tag with the matching pin; do not defeat the equality guard by
assuming an older branch state. Existing tags are immutable.

## Workflows

- `ios-check-*` or the unsigned workflow's manual dispatch runs a simulator check.
- `ios-signed-v<version>-b<build>` runs the signed archive/export workflow. An
  optional positive `-r` retry suffix preserves immutable previous attempts.
- Ordinary branch pushes do not start these workflows. Each remote execution
  must use the applicable authorization and existing configuration.

The signed job uses standard `macos-15`, Xcode 26.2, Node 20, the locked npm
dependencies, a web build, Capacitor iOS synchronization and CocoaPods. It checks
the reviewed source/version, SDK, bundle/team, signing certificate and distribution
profile before creating an archive and exporting an IPA. Signing/version overrides
apply only to the App Release target, never to Pods. The IPA artifact has a
three-day retention; temporary signing and restored configuration files are cleaned.

## Existing configuration

The workflow expects these existing secret names:

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `IOS_APPSTORE_PROFILE_BASE64`
- `APPLE_TEAM_ID`
- `IOS_FIREBASE_CONFIG_BASE64`

Do not include their values or signing files in Git, logs or artifacts. Do not
create, replace, export or transfer signing material as an implicit release step.
New access or configuration requires its own approval. Runtime presence is checked
by the authorized workflow without exposing values.

Release entitlements use production APNs; Debug uses development. Preserve the
existing location and remote-notification background modes. Firebase initialization
and the existing native plugins remain part of the project. Real APNs/FCM receipt
is separate from a successful archive.

## Branding and validation

Preserve the approved 1024 icon, launch images and `src/assets/silgapp-logo-ios.png`.
`ios/logo-source.json` records asset provenance and hashes. The iOS selector keeps
Android/web branding behavior unchanged. No redraw or replacement is implied.

Python release/profile tests, workflow/branding tests, source checks and web
validation have distinct scopes. None proves native execution or device receipt.
Google/Apple native login remains disabled until its supported session flow and
access isolation are verified. Keep email/password and existing preparatory code.

Archive/export does not upload to Apple or submit App Review. Direct App Store
review does not require a TestFlight campaign; uploading and selecting/submitting
the reviewed build remain separate, explicitly controlled release actions.
