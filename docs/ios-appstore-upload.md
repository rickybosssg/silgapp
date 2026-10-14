# Authorized r2 upload preparation

The owner created the App Store Connect team API key SILGAPP GITHUB himself,
with App Manager access, then personally configured these repository secrets:

- APP_STORE_CONNECT_API_KEY_ID: the public Key ID 5SWTL5V4JG.
- APP_STORE_CONNECT_API_ISSUER_ID: public Issuer ID 5f873051-bf9a-4708-afa6-303117a82089.
- APP_STORE_CONNECT_API_PRIVATE_KEY: complete raw p8 PEM text, without Base64.

No credential value was read back or entered by the agent. The upload workflow
uses only these three secrets; the existing five signing/Firebase secrets are
unchanged. It runs on the standard macos-15 runner with Xcode 26.2, only after
the separate immutable tag ios-upload-v1.0.60-b67-r2 is pushed. A branch push
does not run it. Automatic reruns are disabled; Apple is checked for any existing
build 67 before any upload. Do not retry an uncertain upload without checking Apple.

There is no rebuild. The source artifact is SILGAPP-signed-ipa from run 38528393904,
commit 54f95bec1cf505144834cc3210d336967d7e744d. Its exact IPA SHA-256 is
7cc210b408f5bb4fed735871ad8d6abcad68bada4b478762a6846c5221423306.
The workflow verifies 1.0.60/build67, the exact bundle, SDK26.2, approved logo and
native signature before using the API key. It sends the IPA once using Apple's
xcrun altool, checks processing, and retains only a public JSON receipt.
The temporary API key file is created with mode 0600 and removed on exit; neither
key files nor raw logs are artifacts. Local downloaded keys are never opened.

Sources checked: Apple's Upload builds help and the Apple-Actions
upload-testflight-build v3 source (altool arguments and private_keys convention).
This workflow starts no TestFlight campaign and makes no legal/privacy/encryption
declarations. Version preparation and App Review submission happen separately,
using the existing owner-provided app information where applicable.
