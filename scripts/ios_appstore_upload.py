"""Upload only the verified r2 IPA on authorized macOS CI; never print credentials."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

APP_ID = "6782046749"
BUNDLE_ID = "com.base6a0ec08f3af5e1d1284254c1.app"
VERSION, BUILD = "1.0.65", "74"
IPA_SHA256 = "9c58adb44d966835533d6e03105169c03a4a61aab87445967c30bcce7f9906e9"
LOGO_SHA256 = "12f592bbdde1ed319dc4e5be4e58707622a4612e3102abb6d500f9667e139fee"
KEY_ID = "5SWTL5V4JG"
ISSUER_ID = "5f873051-bf9a-4708-afa6-303117a82089"
UPLOAD_TAG = "refs/tags/ios-upload-v1.0.65-b74-r2"


def verify_ipa(path, expected_digest=IPA_SHA256):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected_digest:
        raise ValueError("IPA differs from the exact verified r2 artifact.")
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        manifests = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", n)]
        if len(manifests) != 1:
            raise ValueError("Expected exactly one app in the IPA.")
        info = plistlib.loads(archive.read(manifests[0]))
        if not (info.get("CFBundleIdentifier") == BUNDLE_ID
                and info.get("CFBundleShortVersionString") == VERSION
                and info.get("CFBundleVersion") == BUILD
                and info.get("DTSDKName") == "iphoneos26.2"
                and info.get("DTXcode") == "2620"):
            raise ValueError("IPA identity, version/build or reviewed SDK does not match.")
        logos = [n for n in names if re.search(r"/silgapp-logo-ios-[^/]+\.png$", n)]
        if len(logos) != 1 or hashlib.sha256(archive.read(logos[0])).hexdigest() != LOGO_SHA256:
            raise ValueError("IPA does not contain the exact approved logo.")
    return manifests[0].removesuffix("/Info.plist")


def raw_es256_signature(der):
    # OpenSSL produces a short DER SEQUENCE of two positive INTEGERs.
    if len(der) < 8 or der[0] != 0x30 or der[1] != len(der) - 2:
        raise ValueError("Invalid public ES256 signature structure.")
    offset, values = 2, []
    for _ in range(2):
        if offset + 2 > len(der) or der[offset] != 2:
            raise ValueError("Invalid public ES256 signature integer.")
        length = der[offset + 1]
        value = der[offset + 2:offset + 2 + length]
        if len(value) != length or not value or value[0] & 0x80:
            raise ValueError("Invalid public ES256 signature integer.")
        value = value.lstrip(b"\0")
        if len(value) > 32:
            raise ValueError("Invalid public ES256 signature size.")
        values.append(value.rjust(32, b"\0"))
        offset += 2 + length
    if offset != len(der):
        raise ValueError("Unexpected public ES256 signature data.")
    return b"".join(values)


def b64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=")


def access_token(key_path):
    now = int(time.time())
    header = b64url(json.dumps({"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}).encode())
    claims = b64url(json.dumps({"iss": ISSUER_ID, "iat": now, "exp": now + 1200,
                              "aud": "appstoreconnect-v1"}).encode())
    signing_input = header + b"." + claims
    signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(key_path)],
                               input=signing_input, capture_output=True, check=False)
    if signature.returncode:
        raise ValueError("The owner-configured API private key could not sign authentication.")
    return (signing_input + b"." + b64url(raw_es256_signature(signature.stdout))).decode()


def apple_builds(token):
    query = urllib.parse.urlencode({"filter[app]": APP_ID, "filter[version]": BUILD,
                                   "include": "preReleaseVersion", "limit": 5})
    request = urllib.request.Request("https://api.appstoreconnect.apple.com/v1/builds?" + query,
                                    headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError(f"Apple API access failed (HTTP {error.code}); check the configured key and role.") from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError("Apple API connection failed; upload is not automatically retried.") from None


def require_absent(payload):
    if not isinstance(payload.get("data"), list):
        raise ValueError("Apple returned an unexpected build response.")
    if payload["data"]:
        raise ValueError("Build 74 already exists in Apple; refusing a duplicate upload. Verify its provenance first.")


def public_build(payload):
    if not payload.get("data"):
        return None
    build = payload["data"][0]
    prerelease = build.get("relationships", {}).get("preReleaseVersion", {}).get("data", {})
    versions = [v.get("attributes", {}).get("version") for v in payload.get("included", [])
                if v.get("type") == "preReleaseVersions" and v.get("id") == prerelease.get("id")]
    if build.get("attributes", {}).get("version") != BUILD or versions != [VERSION]:
        raise ValueError("Apple build/version differs from the reviewed release.")
    return {"apple_build_id": build["id"], "processing_state": build["attributes"].get("processingState"),
            "uploaded_date": build["attributes"].get("uploadedDate")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ipa", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    key_path = None
    receipt = {"app_id": APP_ID, "bundle_id": BUNDLE_ID, "version": VERSION, "build": BUILD,
               "ipa_sha256": IPA_SHA256, "source_run": 40815560130, "uploaded": False}
    try:
        if not (os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_OS") == "macOS"
                and os.environ.get("GITHUB_REPOSITORY") == "rickybosssg/silgapp"
                and os.environ.get("GITHUB_EVENT_NAME") == "push"
                and os.environ.get("GITHUB_REF") == UPLOAD_TAG
                and os.environ.get("GITHUB_RUN_ATTEMPT") == "1"):
            raise ValueError("Upload is restricted to the first authorized immutable-tag macOS CI attempt.")
        app_path = verify_ipa(args.ipa)
        with tempfile.TemporaryDirectory(prefix="silgapp-upload-", dir=os.environ["RUNNER_TEMP"]) as unpacked:
            subprocess.run(["ditto", "-x", "-k", str(args.ipa), unpacked], check=True, capture_output=True)
            subprocess.run(["codesign", "--verify", "--deep", "--strict", str(Path(unpacked) / app_path)],
                           check=True, capture_output=True)
        if (os.environ.get("APP_STORE_CONNECT_API_KEY_ID", "").strip() != KEY_ID
                or os.environ.get("APP_STORE_CONNECT_API_ISSUER_ID", "").strip() != ISSUER_ID):
            raise ValueError("Configured public API key/issuer IDs do not match the owner-created key.")
        key_text = os.environ.pop("APP_STORE_CONNECT_API_PRIVATE_KEY", "").replace("\r\n", "\n").strip()
        if not (key_text.startswith("-----BEGIN PRIVATE KEY-----\n")
                and key_text.endswith("\n-----END PRIVATE KEY-----")):
            raise ValueError("API private-key secret must contain the complete raw p8 PEM, not Base64.")
        key_dir = Path.home() / "private_keys"
        key_dir.mkdir(mode=0o700, exist_ok=True)
        candidate = key_dir / f"AuthKey_{KEY_ID}.p8"
        descriptor = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        key_path = candidate  # Cleanup only after creating this exact file ourselves.
        with os.fdopen(descriptor, "w") as key_file:
            key_file.write(key_text + "\n")
        del key_text
        token = access_token(key_path)
        require_absent(apple_builds(token))
        print("Apple API authentication succeeded; build 74 is absent. Uploading exact r2 once.", flush=True)
        uploaded = subprocess.run(["xcrun", "altool", "--output-format", "xml", "--upload-app",
            "--file", str(args.ipa), "--type", "ios", "--apiKey", KEY_ID, "--apiIssuer", ISSUER_ID],
            capture_output=True, text=True, check=False)
        if uploaded.returncode:
            codes = sorted(set(re.findall(r"ITMS-[0-9]{4,6}", uploaded.stdout + uploaded.stderr)))
            raise ValueError(f"Apple upload failed (exit {uploaded.returncode}; codes {','.join(codes) or 'none'}). No automatic retry.")
        receipt.update(uploaded=True, processing_state="AWAITING_APPLE_INDEX")
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
        print("APPLE_UPLOAD_ACCEPTED: SILGAPP 1.0.65/build74, exact r2 IPA.", flush=True)
        for attempt in range(16):
            found = public_build(apple_builds(token))
            if found:
                receipt.update(found)
                args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
                print(f"Apple build {found['apple_build_id']}: {found['processing_state']}", flush=True)
                if found["processing_state"] == "VALID":
                    return 0
                if found["processing_state"] in ("FAILED", "INVALID"):
                    raise ValueError("Apple processing failed; inspect App Store Connect before any retry.")
            if attempt < 15:
                time.sleep(15)
        print("Upload accepted; Apple processing is still pending. Do not upload again.")
        return 0
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        message = str(error) if isinstance(error, ValueError) else "Runner file/signature/tool check failed. No automatic retry."
        print("Upload blocked: " + message, flush=True)
        return 2
    finally:
        if key_path is not None:
            key_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
