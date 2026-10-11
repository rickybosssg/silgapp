# SILGAPP 1.0.126 / 133 - Correction 17

Incoming Base44 reference: origin/main 9135d80b, merged conservatively.
Only proposal hook/card response extraction and the incoming regression suite
changed in the merge. Dispatch V2 and native configurations are preserved.

Executed local checks:
- 14 historical regression suites: PASS.
- 13 incoming SDK response assertions: PASS (simulated responses).
- Actual card accept/refuse/expired handlers: PASS with a simulated SDK.
- Dispatch V2/Enterprise AST and isolated runtime branch: PASS.
- Final corrections, chat scope and message notification contracts: PASS.
- Typecheck, lint and web build: PASS.
- Release runner acceptance recovery, unread state and viewport checks: PASS.

These checks are not evidence of live transactional guarantees or real FCM.
Read-only production verification found no pending proposal for the connected
authorized driver. Other eligible drivers remain active, so no new production
test course or proposal was created. Real proposal display/accept/refuse/expiry
remain NOT TESTED. No production configuration, finance or backend was changed.

Only the Moto g35 was detected at preparation. Other phones require reconnection
for installation. APK/AAB signature and device installation results are reported
separately after the release runner finishes.

Release build: PASS, APK and AAB both signed with the unchanged certificate
SHA256 9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699.
APK SHA256: 3da67833fe74edc560e1394aff1ce5bd12b349b9efd10b98b0eba5620a2cfd9c.
AAB SHA256: 594bab3807d3a8ed37558e78af9f208d6e87804ce89882299eed46680b3abbb9.
Package and version verified: com.base6a0ec08f3af5e1d1284254c1.app, 1.0.126 / 133.
Moto and Fold4 update installation returned Success without uninstall or data
clear. Samsung A06 was not connected during installation.
