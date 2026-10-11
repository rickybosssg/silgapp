# SILGAPP 1.0.125 / 132

## Scope

Base44 source reference remains origin/main 3b051f74; previous validated release
is 459422538ae650057a8eab702b384515f83920a2. Local changes were backed up before
integration. No incoming main change was found. Preserve existing Android/iOS.

## Corrections

- Scoped VENUS visibility while ChatWindow is expanded, preserving other uses.
- Video-only fallback through Message.content when runtime omits video_url;
  reject video sends without a media URL; explicit unavailable state for older
  broken records. No historical message rewrite or schema migration.
- Thread unread badge refresh from existing push events and focus/chat return;
  timestamp-monotonic merge, reset on account change, accurate thread count.
- Existing Standard/Eco, tracking, Victory, GPS and finance implementations kept.

## Backend

Only envoyerMessage was deployed to official app 6a0ec08f3af5e1d1284254c1.
Fresh remote source matched prior HEAD before editing. Post-deployment pull
matched staged source exactly. Previous remote archive remains available locally.
No data migration, financial write, global settings change or dispatch deployment.

## Executed automated checks

- Typecheck, global lint and Web build: PASS.
- Fourteen historical regression scripts: PASS.
- Eleven additional current endpoint/component/browser regressions: PASS.
  These include simulated acceptance recovery, GPS transitions, permissions,
  message retries, badge refresh, video fallback, viewport and Victory lifecycle.
- Historical dispatch-v2-enterprise-reconstruction recovered from Git and run:
  FAIL v1_runtime_call_found. Current tree no longer contains that old script.
  dispatchExterneAuto still has a conditional V1 fallback when V2 is disabled;
  the production DISPATCH_V2_ENABLED value was read as true. Neither dispatch
  code nor settings were changed. This historical failure is not claimed resolved.

## Physical validation boundaries

Three authorized devices detected. New course scenarios are blocked by fourteen
other eligible drivers outside the test accounts; no global isolation assumed.
Prior test-course chat text/photo/audio and background notifications were observed.
Version 1.0.125 / 132 was installed with adb install -r on all three devices;
package version was verified and the app launched without erasing user data.
On the client device, the existing history opened tracking and Discuter opened
ChatWindow for the correct test course. Keyboard and Send were visible without
VENUS overlap. A new text was sent, read back from Base44 and received on the
driver device. Its unread badge and Android notification were observed.
Existing photo/audio history remained visible. An older broken video now shows
an explicit unavailable message instead of an empty bubble. Fresh video upload
and playback remain NOT TESTED on devices: media pickers exposed Android locks.
Foreground notification was observed; background/terminated delivery is not
established by that observation. No fresh delivery/Victory/concurrency or live
GPS test was performed in this release because test dispatch is not isolated.
Do not infer real concurrency, live GPS, delivery or accounting from mocks.

## Publication

No Play Store publication. No payments or balance adjustments. Private captures
and test identities must not be committed. Existing broken video rows remain intact.

## Release artifacts and remaining delivery gate

APK: 8869128 bytes; SHA256
0ead50b33d059af579d6a314fdcc9704496ad2281fc9052d801096aeb9cfb3dd.
AAB: 8420167 bytes; SHA256
479c6dfe96c2fa71dffa365316d9bfc215bc30f0fe31ffab3d6b9d2cadd3f784.
Both signatures were verified against the previous release certificate:
9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699.
Application id, SDK configuration and native iOS configuration were preserved.
Follow-up validation removed the real conditional V1 call in dispatchExterneAuto:
V2 enabled keeps the unchanged publication path; V2 disabled returns HTTP 503
without calling another engine. The old import was commented, so that branch
previously risked a ReferenceError rather than providing a valid fallback.
The targeted function was deployed and its re-read SHA256 matched staging.
The restored historical regression uses AST checks, isolated execution of both
flag branches and current tenant isolation guards. Obsolete 978abc53 release
diff allowlists were not restored; approved UI/native changes are not errors.
Targeted Dispatch/Eco/idempotency/zero-commission tests, typecheck and lint pass.
This is not a live dispatch or concurrency proof. No Android rebuild is needed
for this backend/test/documentation-only follow-up.
