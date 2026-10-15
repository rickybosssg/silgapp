# Native iOS push preparation

## Implementation

- `AppDelegate.swift` associates APNs with Firebase Messaging, obtains the FCM
  string and forwards registration and refresh events to Capacitor on the main
  thread. Token values are not logged. Firebase Messaging is already a dependency.
- `notifications.js` uses native iOS permissions and preserves foreground
  alert/sound/badge presentation. Android channels and native alert bridges remain
  Android-only; shared JavaScript cleanup remains active on iOS.
- Client registration passes the profile id. The registration handler and direct
  fallback retain a missing client id only for the same account. Account switches
  cannot inherit another account's client association; other devices and roles
  remain independent.
- Registration writes are serialized within one JavaScript runtime and recheck
  the active account. Delayed or logged-out contexts cannot start a fallback write.
  This does not cancel a request already accepted by the server or prove a
  distributed database transaction.
- Native listeners install before Android's cached-token return. Early iOS taps
  wait in memory for the matching account dashboard, consume once and clear on
  account switch or explicit logout. Diagnostics omit arbitrary payloads and tokens.

## Validation boundaries

`tests/ios-push-registration-regression.mjs` exercises the JavaScript and handler
with synthetic adapters and checks the Swift source contract. Historical suites
cover GPS/city, Eco recovery, route, finance and account isolation behavior.

A current macOS/Xcode build must compile the Swift changes. Actual notification
receipt requires the reviewed mobile build, separately authorized backend changes
where needed, existing Firebase/APNs configuration and a controlled device check.
FCM acceptance alone does not prove display or sound. Never read private keys or
send a production notification solely to validate source preparation.

References: [Capacitor token](https://capacitorjs.com/docs/v5/apis/push-notifications#token)
and [Firebase Messaging iOS](https://firebase.google.com/docs/cloud-messaging/ios/get-started).
