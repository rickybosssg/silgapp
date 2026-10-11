# SILGAPP Regression Inventory

This file is the local reference used before Base44 -> Codex integrations and
before Android/iOS delivery builds.

## Critical Functional Areas

- Client: account access, draft-only course creation, explicit confirmation,
  Standard/Eco selection, proposed client price, immediate follow/search screen,
  GPS tracking, cancellation decisions, history, messaging.
- Driver: availability, available feed, blocked-admin visibility with backend
  acceptance refusal, Standard acceptance, Eco mission acceptance, on-route
  proposals, pickup/delivery buttons, GPS heartbeat, FCM, messaging, Victory
  overlay, accounting.
- Dispatch: V2 publication, atomic acceptance, redispatch, watchdog, blocked
  client-decision guard, public/Enterprise isolation, country isolation.
- SILGAPP Eco: feature flags, grouping, isolated-course hold, grouped mission
  acceptance, on-route/destination-chain proposals, conversion to Standard,
  admin mission follow-up, client-visible statuses.
- Finance: client price preservation, commission locks, Pass Zero, Happy Hour,
  encours, payments, Enterprise ledger separation.
- Mobile: Android package/signing, iOS configuration, App Links, FCM, no
  unintended `server.url`.

## Explicitly Protected Decisions

- New Standard public courses keep the client/admin explicit price; ORS may
  calculate distance/ETA but does not replace the price.
- New Standard, Eco, and Enterprise button flows do not require QR/PIN. Legacy
  QR/PIN data may remain compatible where code still supports it.
- Isolated Eco courses may be visible as waiting for grouping, but are not
  directly acceptable and are not dispatched as Standard before conversion.
- Eco V1 is public-only unless a later validated decision changes that.
- Public Pass/Happy Hour 0% does not apply to Enterprise commissions.

## Regression Tests To Keep

- `tests/victory-overlay-regression.mjs`
- `tests/pass-zero-commission-lock.mjs`
- `tests/eco-dispatch-guards-regression.mjs`
- Existing active tests in `tests/`.

Historical tests removed during prior syncs should be restored selectively only
when their assertions still match current product decisions.

## Integration Procedure

1. `git fetch origin --prune`.
2. Confirm current branch, `origin/main`, `origin/ios`, and a backup branch.
3. Compare incoming changes before merging.
4. Merge conservatively; resolve conflicts by preserving newer Base44 fixes and
   validated Codex behavior.
5. Run typecheck, lint, active tests, and restored regression tests.
6. Do not build Android or push `origin/ios` until explicitly authorized.
