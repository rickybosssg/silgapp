# SILGAPP 1.0.128 / 135

## Scope

Owner-authorized release with corrections 17, 18 and 19 preserved. Correction 20
is deferred. Its original tests remain unchanged and separate from production
release checks. Last experimental result: 9/20 passed, 11 failed, not nine failed.
No claim of Base44 multi-entity transactions or live concurrency validation.

## Production Safety

- Priority configuration is forced false and creation fails closed, including
  stale true flags. Experimental release actions perform no backend access.
- Old exclusive proposals are hidden and rejected. Ordinary proposals remain
  non-exclusive and follow Standard dispatch; Dispatch V2 implementation unchanged.
- Official admin authentication passed. BF priority flag was absent (default OFF);
  ON_ROUTE_ENABLED=true and EMERGENCY_STOP=false. No global configuration changed.
- Read-only inspection found zero pending exclusive proposals. No course repair,
  balance change, payment, test dispatch or test notification was performed.
- Production health check via the official SDK functions.fetch with explicit
  Base44-Functions-Version=prod returned HTTP 200, success=true.

## Targeted Deployment

Functions: courseEventOrchestrator, ecoOptimizationOrchestrator,
getOnRouteProposalsForLivreur. CLI reported all three deployed successfully.
Private pre-deployment source snapshots exist outside Git. Shared engine snapshots
differ from local historical work; deployment preserves each remote dependency
and applies only priority-disable guards rather than replacing the whole engine.
No entities, workflows, financial or Dispatch V2 code are deployed in this release.
Official re-read matched all 31 staged TypeScript files across the three functions.

## Tests

- 14 historical suites: PASS.
- 13 SDK proposal cases and 14 cancellation cases: PASS (simulations).
- Real extracted handlers, waiting predicate, cancellation fault recovery,
  acceptance recovery, message permissions, financial guards, source isolation,
  unread state and Dispatch V2 reconstruction: PASS locally with isolated adapters.
- Disabled exclusive creation/cleanup with backend access forbidden: PASS.
- Typecheck, lint and Web build with official app ID: PASS.
- Live acceptance concurrency, delivery, FCM receipt, GPS movement, partial
  cancellation and modal latency: NOT TESTED in this campaign. No isolated
  fictitious-course dispatch to only the designated drivers was established.

## Android And Play

- Official package and signing configuration retained. Version 1.0.128 / 135.
- WebView debugging disabled; no development server URL configured.
- Only Moto g35 ZE223GT5WJ detected; other two phones absent.
- Play Console highest published version, upload-certificate match, permissions
  declarations, data safety and pre-launch checks require Console verification.
- Existing background location, contacts, camera, microphone and battery-related
  permissions are preserved, not evidence of Play policy approval.
- No Google Play publication is authorized or attempted.

## Delivered Artifact Checks

- Gradle assembleRelease and bundleRelease succeeded in one build.
- APK signature v2 verified; AAB jarsigner verified. Both certificates match
  the existing certificate SHA256:
  9dcb9cd32c6ca78b6868f446c883aa0694a1cc93622d8765522804b6708a9699.
- APK: 8,869,108 bytes; SHA256
  0a08069b02bdf90a911c99d7001fe37801a90b31de3225ef53b13f2b76c68d85.
- AAB: 8,420,145 bytes; SHA256
  cc75b93c47b2044a2cc237665cb5e423240ca7ea472d97ea8de17dfe2ebd2c5a.
- bundletool 1.18.3 validate passed. AAB manifest confirms package/version,
  Release not debuggable; no bundled native .so libraries. APK zipalign with
  16 KB page checking passed. No actual 16 KB device test was performed.
- APK installed with adb install -r on Moto; package reports 1.0.128 / 135.
  Session survived, driver dashboard, available-courses and history screens
  opened. Messages screen opened; conversation/data behavior is not validated
  by opening a loading screen. No new course or message was sent.
- Device log sample has platform EGL/Google flags warnings; no AndroidRuntime
  fatal exception observed in that sample. This is not a full crash-free proof.
