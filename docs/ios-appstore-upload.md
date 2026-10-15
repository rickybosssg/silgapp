# Verified iOS artifact upload

The current upload workflow is pinned to the historical artifact for version
1.0.60/build 67, run `38528393904`, and immutable tag
`ios-upload-v1.0.60-b67-r2`. It cannot upload a new candidate unchanged.

Before a new upload, verify current App Store Connect state and prepare the exact
reviewed version/build, signed artifact run, IPA SHA-256 and new immutable tag.
Keep the bundle, SDK and approved-brand checks. Do not rebuild during upload or
replace the verified artifact with a different file. Ordinary branch pushes do
not trigger this upload workflow.

The existing configuration names are `APP_STORE_CONNECT_API_KEY_ID`,
`APP_STORE_CONNECT_API_ISSUER_ID` and `APP_STORE_CONNECT_API_PRIVATE_KEY`.
Only the authorized ephemeral job reads these existing values. Private key files,
raw logs and credentials must never be committed or retained as artifacts.

The guarded script checks for an existing matching Apple build, uploads once using
Apple's upload tool and checks processing. Keep a non-sensitive receipt. For an
uncertain outcome, inspect Apple before another attempt; never automatically retry
an upload or move a previous tag.

Upload/processing does not constitute App Review submission or public release.
Review submission, declarations and any change to an existing submission require
their own reviewed scope. No TestFlight campaign is imposed by this workflow.
