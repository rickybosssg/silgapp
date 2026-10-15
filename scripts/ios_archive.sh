#!/usr/bin/env bash
# Prepared for an explicitly authorized macOS CI run. Never run on the Windows host.
set -euo pipefail
umask 077

: "${RUNNER_TEMP:?GitHub runner required}"
: "${CERTIFICATE_BASE64:?Signing certificate is required}"
: "${CERTIFICATE_PASSWORD:?P12 password is required}"
: "${PROFILE_BASE64:?Profile is required}"
: "${IOS_RELEASE_VERSION:?Reviewed version is required}"
: "${IOS_RELEASE_BUILD:?Reviewed build is required}"
: "${APP_BUNDLE_ID:?Bundle ID is required}"
: "${TEAM_ID:?Team ID is required}"

SIGNING_TEMP="$(mktemp -d "$RUNNER_TEMP/silgapp-signing.XXXXXX")"
KEYCHAIN_PATH="$SIGNING_TEMP/signing.keychain-db"
CERT_PATH="$SIGNING_TEMP/distribution.p12"
PROFILE_PATH="$SIGNING_TEMP/distribution.mobileprovision"
PROFILE_PLIST="$SIGNING_TEMP/profile.plist"
CERT_PEM="$SIGNING_TEMP/public-certificate.pem"
CERT_DER="$SIGNING_TEMP/public-certificate.der"
INSTALLED_PROFILE=""
ORIGINAL_KEYCHAINS=()
while IFS= read -r keychain; do
  keychain="${keychain#*\"}"
  keychain="${keychain%\"*}"
  if [[ -n "$keychain" ]]; then ORIGINAL_KEYCHAINS+=("$keychain"); fi
done < <(security list-keychains -d user)
cleanup() {
  if [[ ${#ORIGINAL_KEYCHAINS[@]} -gt 0 ]]; then
    security list-keychains -d user -s "${ORIGINAL_KEYCHAINS[@]}" >/dev/null 2>&1 || true
  fi
  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  rm -f -- "$CERT_PATH" "$PROFILE_PATH" "$PROFILE_PLIST" "$CERT_PEM" "$CERT_DER"
  if [[ -n "$INSTALLED_PROFILE" ]]; then rm -f -- "$INSTALLED_PROFILE"; fi
  unset KEYCHAIN_PASSWORD CERTIFICATE_PASSWORD CERTIFICATE_BASE64 PROFILE_BASE64
}
trap cleanup EXIT

printf '%s' "$CERTIFICATE_BASE64" | base64 --decode > "$CERT_PATH"
printf '%s' "$PROFILE_BASE64" | base64 --decode > "$PROFILE_PATH"
security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST"
# Extract the public certificate only. The private key is never exported to PEM.
openssl pkcs12 -in "$CERT_PATH" -clcerts -nokeys -passin env:CERTIFICATE_PASSWORD -out "$CERT_PEM"
openssl x509 -in "$CERT_PEM" -outform DER -out "$CERT_DER"
openssl x509 -in "$CERT_PEM" -noout -checkend 0
python3 scripts/ios_release.py profile --path "$PROFILE_PLIST" --certificate-der "$CERT_DER"
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$PROFILE_PLIST")"
PROFILE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$PROFILE_PLIST")"

KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERT_PATH" -P "$CERTIFICATE_PASSWORD" -t cert -f pkcs12 \
  -k "$KEYCHAIN_PATH" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH" >/dev/null
security list-keychains -d user -s "$KEYCHAIN_PATH" "${ORIGINAL_KEYCHAINS[@]}"
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
PROFILE_INSTALL_PATH="$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
test ! -e "$PROFILE_INSTALL_PATH" || { echo 'Profile already exists on runner; refusing overwrite.'; exit 1; }
cp "$PROFILE_PATH" "$PROFILE_INSTALL_PATH"
INSTALLED_PROFILE="$PROFILE_INSTALL_PATH"

# A workspace-wide signing override also reaches Pods, which cannot use the
# application's provisioning profile. Apply manual signing to App Release only.
PROFILE_NAME="$PROFILE_NAME" ruby -r xcodeproj <<'RUBY'
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
targets = project.targets.select do |target|
  target.name == 'App' && target.product_type == 'com.apple.product-type.application'
end
abort 'Expected exactly one App application target' unless targets.length == 1
configurations = targets.first.build_configurations.select { |config| config.name == 'Release' }
abort 'Expected exactly one App Release configuration' unless configurations.length == 1
settings = configurations.first.build_settings
settings['DEVELOPMENT_TEAM'] = ENV.fetch('TEAM_ID')
settings['CODE_SIGN_STYLE'] = 'Manual'
settings['CODE_SIGN_IDENTITY'] = 'iPhone Distribution'
settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'iPhone Distribution'
settings['PROVISIONING_PROFILE_SPECIFIER'] = ENV.fetch('PROFILE_NAME')
settings['PRODUCT_BUNDLE_IDENTIFIER'] = ENV.fetch('APP_BUNDLE_ID')
settings['MARKETING_VERSION'] = ENV.fetch('IOS_RELEASE_VERSION')
settings['CURRENT_PROJECT_VERSION'] = ENV.fetch('IOS_RELEASE_BUILD')
project.save
RUBY

ARCHIVE_PATH="$RUNNER_TEMP/SILGAPP.xcarchive"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE_PATH" \
  archive

APP_PATH="$ARCHIVE_PATH/Products/Applications/App.app"
python3 scripts/ios_release.py app-info --path "$APP_PATH/Info.plist"
codesign --verify --deep --strict "$APP_PATH"
codesign -d --entitlements :- "$APP_PATH" > "$SIGNING_TEMP/app-entitlements.plist"
python3 scripts/ios_release.py signed-app --path "$SIGNING_TEMP/app-entitlements.plist"

python3 - "$PROFILE_NAME" "$RUNNER_TEMP/ExportOptions.plist" <<'PY'
import json, plistlib, sys
settings = json.load(open('ios/release-settings.json', encoding='utf-8'))
options = {
    'method': 'app-store-connect', 'destination': 'export',
    'testFlightInternalTestingOnly': False,
    'teamID': settings['team_id'], 'signingStyle': 'manual',
    'manageAppVersionAndBuildNumber': False,
    'provisioningProfiles': {settings['bundle_id']: sys.argv[1]},
}
with open(sys.argv[2], 'wb') as output:
    plistlib.dump(options, output)
PY
xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" \
  -exportPath "$RUNNER_TEMP/ios-export" -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist"
