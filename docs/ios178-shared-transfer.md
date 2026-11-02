# iOS shared-source transfer from Android 178

Reference: Android 1.0.171 / 178, not the earlier cancellation-only patch.
APK SHA-256: edb8e9dda1b3c8e20e08bd74df784c92db5b9bd1af52333d60f1d86b866565fc.
iOS parent: f3442e39e4015239ca5e20e5664d5066d94d2426.

The Android 171 and 178 source manifests identify 38 changed frontend files.
The saved pre-172 sources match every applicable Android 171 hash. Every
Android input matches the 178 manifest. A three-way merge applies this full
delta over the existing iOS branch, retaining its independent adaptations.
The transfer manifest records exact input and resulting file hashes.

Included: same-course relaunch and price editing, observed price/revision on
driver acceptance, current-attempt partial view/refusal counters, guest/client
shared search and tracking, guest chat transport, automatic event modals,
three approved client MP3 files extracted byte-for-byte from APK 178, admin
guest-order design, authoritative Eco settings UI, optional platform-specific
store invitation, cancelled-offer filtering and cancelled terminal screen.

Preserved iOS differences: native identity and signing configuration, approved
branding, safe areas, secure persistent logout, account-scoped push/cold-start
handling, messaging pagination/media/scroll behavior and public tracking guards.
The obsolete direct Eco configuration editor is replaced by the Android 178
server-authorized editor; there are not two competing configuration panels.

Only four shared modules needed by the frontend are added: clientDecisionView,
coursePriceQuote, courseSearchActivity and forteDemandeView. No server function,
entity permission, production value or deployment is changed by this transfer.
Unbuilt local backend drafts and Android native files are excluded.

Branch push automation: the three existing GitHub workflows use explicit tags
or manual dispatch; no branch push trigger exists. No tag, workflow dispatch,
IPA upload or App Store publication is part of this transfer.

Native compilation remains unexecuted on this Windows host. Before a signed
archive, recheck the Apple version/build and signing inputs and update the
reviewed release-settings source pin/evidence. Its older release metadata is
preserved, not represented as current App Store evidence. No iPhone, background
audio, real push, production permission or business-flow validation is claimed.

Checks: 63 targeted tests PASS (cancellation screen, delivery171 safeguards,
price quote, partial counters, event/audio behavior, iOS notifications, branding
and workflow contracts). Changed-file lint PASS. Typecheck PASS with the
existing iOS jsconfig (checkJs=false); this does not resolve or certify the
stricter Android diagnostic baseline. The first test pass lacked a local
node_modules path for a Swift source assertion; rerun with existing dependencies
available passed without weakening the assertion. Web build checked separately.

Rollback: revert this transfer commit on ios with a normal reviewed commit;
do not reset or force-push the branch. This restores source only, does not alter
production data, and does not downgrade any installed mobile application.
