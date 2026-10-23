import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ios_upload", ROOT / "scripts/ios_appstore_upload.py")
upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)


class UploadTests(unittest.TestCase):
    def fixture_ipa(self, directory, **changes):
        info = dict(CFBundleIdentifier=upload.BUNDLE_ID, CFBundleShortVersionString="1.0.64",
                    CFBundleVersion="72", DTSDKName="iphoneos26.2", DTXcode="2620")
        info.update(changes)
        path = Path(directory) / "fixture.ipa"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("Payload/App.app/Info.plist", plistlib.dumps(info))
            archive.writestr("Payload/App.app/public/assets/silgapp-logo-ios-fixture.png", b"synthetic logo")
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def test_exact_digest_and_release_identity_are_required(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(upload, "LOGO_SHA256", hashlib.sha256(b"synthetic logo").hexdigest()):
            path, digest = self.fixture_ipa(directory)
            self.assertEqual(upload.verify_ipa(path, digest), "Payload/App.app")
            with self.assertRaisesRegex(ValueError, "exact verified build 72"):
                upload.verify_ipa(path)
            for changes in ({"CFBundleVersion": "66"}, {"CFBundleShortVersionString": "1.0.59"},
                            {"CFBundleIdentifier": "another.app"}, {"DTSDKName": "iphoneos18.5"}, {"DTXcode": "1640"}):
                path, digest = self.fixture_ipa(directory, **changes)
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    upload.verify_ipa(path, digest)

    def test_unknown_logo_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path, digest = self.fixture_ipa(directory)
            with self.assertRaisesRegex(ValueError, "approved logo"):
                upload.verify_ipa(path, digest)

    def test_existing_or_malformed_apple_build_response_blocks_upload(self):
        upload.require_absent({"data": []})
        for payload in ({"data": [{"id": "already-uploaded"}]}, {}, {"data": None}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                upload.require_absent(payload)

    def test_receipt_requires_correct_apple_version_and_build(self):
        payload = {"data": [{"id": "build-id", "attributes": {"version": "72", "processingState": "VALID"},
                    "relationships": {"preReleaseVersion": {"data": {"id": "version-id"}}}}],
                   "included": [{"type": "preReleaseVersions", "id": "version-id", "attributes": {"version": "1.0.64"}}]}
        self.assertEqual(upload.public_build(payload)["processing_state"], "VALID")
        payload["included"][0]["attributes"]["version"] = "1.0.59"
        with self.assertRaises(ValueError):
            upload.public_build(payload)

    def test_es256_der_signature_is_converted_to_64_byte_jose(self):
        r, s = b"\x80" + b"\x01" * 31, b"\x02" * 32
        sequence = b"\x02\x21\0" + r + b"\x02\x20" + s
        der = b"\x30" + bytes([len(sequence)]) + sequence
        self.assertEqual(upload.raw_es256_signature(der), r + s)
        for invalid in (b"", der[:-1], der + b"extra", b"\x30\x06\x02\x01\x80\x02\x01\x01"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                upload.raw_es256_signature(invalid)

    def test_token_claims_use_known_team_and_at_most_twenty_minutes(self):
        sequence = b"\x02\x20" + b"\x01" * 32 + b"\x02\x20" + b"\x02" * 32
        result = type("Result", (), {"returncode": 0, "stdout": b"\x30" + bytes([len(sequence)]) + sequence})()
        with patch.object(upload.subprocess, "run", return_value=result), patch.object(upload.time, "time", return_value=1000):
            token = upload.access_token(Path("synthetic-not-opened.p8"))
        header, claims, signature = [base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)) for part in token.split(".")]
        self.assertEqual(json.loads(header)["kid"], upload.KEY_ID)
        self.assertEqual(json.loads(claims), {"iss": upload.ISSUER_ID, "iat": 1000, "exp": 2200, "aud": "appstoreconnect-v1"})
        self.assertEqual(len(signature), 64)

    def test_current_store_state_and_no_pending_review_required(self):
        current = {"data": [{"id": "previous", "attributes": {"versionString": "1.0.63", "appStoreState": "READY_FOR_SALE"}}]}
        self.assertEqual(len(upload.require_reviewed_apple_state(current)), 1)
        for state in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"):
            payload = {"data": current["data"] + [{"id": "pending", "attributes": {"versionString": "1.0.64", "appStoreState": state}}]}
            with self.subTest(state=state), self.assertRaises(ValueError):
                upload.require_reviewed_apple_state(payload)
        with self.assertRaises(ValueError):
            upload.require_reviewed_apple_state({"data": current["data"], "links": {"next": "more"}})
        with self.assertRaises(ValueError):
            upload.require_reviewed_apple_state({"data": []})

    def test_local_or_manual_rerun_cannot_upload(self):
        with patch.object(upload.os, "environ", {}), patch("sys.argv", ["upload", "--ipa", "unopened.ipa", "--receipt", "unwritten.json"]):
            with patch("sys.stdout", new_callable=io.StringIO) as output:
                self.assertEqual(upload.main(), 2)
            self.assertIn("first authorized immutable-tag", output.getvalue())


if __name__ == "__main__":
    unittest.main()
