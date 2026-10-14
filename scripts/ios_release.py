"""Public iOS release checks. Never opens a private key or a PKCS#12 file."""

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import plistlib
import re
import sys

BUNDLE_ID = "com.base6a0ec08f3af5e1d1284254c1.app"
TEAM_ID = "X7N95F8KTJ"


def version_tuple(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
        raise ValueError("Version must be an explicitly confirmed numeric x.y.z value.")
    return tuple(int(part) for part in value.split("."))


def build_number(value):
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]*", value):
        raise ValueError("Build must be an explicitly confirmed positive integer string.")
    return int(value)


def validate_release(settings, remote_head, ref=None):
    if settings.get("source_branch") != "ios":
        raise ValueError("Release source must be the ios branch.")
    if not re.fullmatch(r"[0-9a-f]{40}", settings.get("source_commit", "")):
        raise ValueError("A pinned source commit is required.")
    if settings["source_commit"] != remote_head:
        raise ValueError("Remote ios advanced: reconcile and review the new source before building.")
    if settings.get("bundle_id") != BUNDLE_ID or settings.get("team_id") != TEAM_ID:
        raise ValueError("Bundle or team differs from the verified SILGAPP signing identity.")
    if settings.get("app_store_connect_confirmed") is not True:
        raise ValueError("App Store Connect version/build still require owner confirmation.")
    version = settings.get("marketing_version")
    build = settings.get("build_number")
    if version_tuple(version) <= version_tuple(settings.get("latest_app_store_version")):
        raise ValueError("Release version must exceed the version confirmed in the App Store Connect evidence.")
    if build_number(build) <= build_number(settings.get("latest_app_store_build")):
        raise ValueError("Build must exceed the last visible build confirmed in the App Store Connect evidence.")
    tag_pattern = rf"ios-signed-v{re.escape(version)}-b{re.escape(build)}(?:-r[1-9][0-9]*)?"
    if ref is not None and re.fullmatch(tag_pattern, ref) is None:
        raise ValueError("Signed tag must exactly match the reviewed version and build settings.")
    return {"version": version, "build": build, "bundle_id": BUNDLE_ID, "team_id": TEAM_ID}


def validate_firebase(config):
    if config.get("BUNDLE_ID") != BUNDLE_ID:
        raise ValueError("Firebase configuration is for a different bundle ID.")
    for key in ("GOOGLE_APP_ID", "PROJECT_ID", "GCM_SENDER_ID", "API_KEY"):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError(f"Firebase configuration is missing required field: {key}.")


def validate_profile(profile, certificate_der, settings, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    creation = profile.get("CreationDate")
    expiry = profile.get("ExpirationDate")
    if not isinstance(creation, dt.datetime) or not isinstance(expiry, dt.datetime):
        raise ValueError("Profile validity dates are missing.")
    creation = creation.replace(tzinfo=dt.timezone.utc) if creation.tzinfo is None else creation
    expiry = expiry.replace(tzinfo=dt.timezone.utc) if expiry.tzinfo is None else expiry
    if not creation <= now < expiry:
        raise ValueError("Provisioning profile is outside its validity dates.")
    entitlements = profile.get("Entitlements", {})
    expected_app = f"{TEAM_ID}.{BUNDLE_ID}"
    checks = (
        profile.get("Name") == settings.get("profile_name"),
        profile.get("UUID") == settings.get("profile_uuid"),
        profile.get("TeamIdentifier") == [TEAM_ID],
        entitlements.get("application-identifier") == expected_app,
        entitlements.get("com.apple.developer.team-identifier") == TEAM_ID,
        entitlements.get("get-task-allow") is False,
        entitlements.get("aps-environment") == "production",
        profile.get("ProvisionedDevices") is None,
        profile.get("ProvisionsAllDevices") is not True,
    )
    if not all(checks):
        raise ValueError("Profile identity, distribution type or production entitlements do not match.")
    expected_hash = settings.get("certificate_sha256")
    actual_hash = hashlib.sha256(certificate_der).hexdigest().upper()
    allowed_hashes = {hashlib.sha256(item).hexdigest().upper()
                      for item in profile.get("DeveloperCertificates", []) if isinstance(item, bytes)}
    if actual_hash != expected_hash or actual_hash not in allowed_hashes:
        raise ValueError("The public certificate differs from the verified profile/certificate pair.")
    return {"profile_name": profile["Name"], "profile_uuid": profile["UUID"]}


def validate_signed_entitlements(entitlements):
    if not (
        entitlements.get("application-identifier") == f"{TEAM_ID}.{BUNDLE_ID}"
        and entitlements.get("com.apple.developer.team-identifier") == TEAM_ID
        and entitlements.get("aps-environment") == "production"
        and entitlements.get("get-task-allow") is False
    ):
        raise ValueError("Archived app signing entitlements are not the reviewed production identity.")


def write_outputs(values, output_path):
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as handle:
            for key, value in values.items():
                if "\n" in str(value) or "\r" in str(value):
                    raise ValueError("Multiline output is not permitted.")
                handle.write(f"{key}={value}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("release", "firebase", "profile", "signed-app"))
    parser.add_argument("--settings", default="ios/release-settings.json")
    parser.add_argument("--remote-head")
    parser.add_argument("--ref")
    parser.add_argument("--path")
    parser.add_argument("--certificate-der")
    parser.add_argument("--github-output")
    args = parser.parse_args()
    try:
        if args.command == "firebase":
            with Path(args.path).open("rb") as handle:
                validate_firebase(plistlib.load(handle))
            print("Firebase iOS bundle and required fields: OK. Configuration values are not printed.")
            return 0
        if args.command == "signed-app":
            with Path(args.path).open("rb") as handle:
                validate_signed_entitlements(plistlib.load(handle))
            print("Archived app production signing entitlements: OK.")
            return 0
        settings = json.loads(Path(args.settings).read_text(encoding="utf-8"))
        if args.command == "release":
            values = validate_release(settings, args.remote_head, args.ref)
        else:
            with Path(args.path).open("rb") as handle:
                profile = plistlib.load(handle)
            values = validate_profile(profile, Path(args.certificate_der).read_bytes(), settings)
        write_outputs(values, args.github_output)
        print(f"Public iOS {args.command} checks: OK.")
        return 0
    except (ValueError, TypeError, OSError, plistlib.InvalidFileException) as error:
        print(f"iOS preparation blocked: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
