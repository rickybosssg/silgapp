import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import plistlib
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ios_release", ROOT / "scripts/ios_release.py")
ios = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ios)


class IOSReleaseTests(unittest.TestCase):
    def setUp(self):
        self.settings = json.loads((ROOT / "ios/release-settings.json").read_text())
        # Review fixture, copied per test so rejection cases cannot alter the file.
        self.settings.update(app_store_connect_confirmed=True,
                             latest_app_store_version="1.0.59", latest_app_store_build="66",
                             marketing_version="1.0.60", build_number="67")

    def test_reviewed_release_and_matching_tag(self):
        result = ios.validate_release(self.settings, self.settings["source_commit"],
                                      "ios-signed-v1.0.60-b67")
        self.assertEqual(result["version"], "1.0.60")

    def test_repository_settings_and_native_versions_match_screenshot_review(self):
        reviewed = json.loads((ROOT / "ios/release-settings.json").read_text())
        self.assertEqual(ios.validate_release(reviewed, reviewed["source_commit"],
                                              "ios-signed-v1.0.60-b67")["build"], "67")
        self.assertEqual(reviewed["latest_app_store_build"], "66")
        self.assertTrue(reviewed["app_store_connect_recheck_required_before_submission"])
        evidence = reviewed["app_store_connect_evidence"]
        self.assertEqual(evidence["library_file_id"], "libfile_cac4a7f3cec481919821fb08561ea1bf")
        self.assertIn("last visible build only", evidence["scope"])
        project = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()
        self.assertEqual(project.count("MARKETING_VERSION = 1.0.60;"), 2)
        self.assertEqual(project.count("CURRENT_PROJECT_VERSION = 67;"), 2)

    def test_unconfirmed_release_still_blocks_signing(self):
        pending = json.loads((ROOT / "ios/release-settings.json").read_text())
        pending["app_store_connect_confirmed"] = False
        with self.assertRaisesRegex(ValueError, "owner confirmation"):
            ios.validate_release(pending, pending["source_commit"])

    def test_remote_ios_advancement_blocks_old_snapshot(self):
        with self.assertRaisesRegex(ValueError, "advanced"):
            ios.validate_release(self.settings, "a" * 40)

    def test_rejects_wrong_tag_old_version_or_reused_build(self):
        cases = ({"marketing_version": "1.0.56"}, {"build_number": "66"},
                 {"marketing_version": "1.0.60; echo unsafe"}, {"build_number": "67\nextra"})
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ios.validate_release(self.settings | changes, self.settings["source_commit"])
        with self.assertRaisesRegex(ValueError, "tag"):
            ios.validate_release(self.settings, self.settings["source_commit"], "ios-signed-v1.0.56-b63")

    def test_wrong_team_or_bundle_is_rejected(self):
        for key in ("bundle_id", "team_id"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                ios.validate_release(self.settings | {key: "wrong"}, self.settings["source_commit"])

    def test_firebase_uses_exact_bundle_and_reports_no_configuration_values(self):
        config = dict(BUNDLE_ID=ios.BUNDLE_ID, GOOGLE_APP_ID="test-app",
                      PROJECT_ID="test-project", GCM_SENDER_ID="test-sender", API_KEY="test-value")
        ios.validate_firebase(config)
        with self.assertRaisesRegex(ValueError, "different bundle"):
            ios.validate_firebase(config | {"BUNDLE_ID": "another.app"})
        del config["API_KEY"]
        with self.assertRaisesRegex(ValueError, "API_KEY") as caught:
            ios.validate_firebase(config)
        self.assertNotIn("test-value", str(caught.exception))

    def sample_profile(self):
        now = dt.datetime.now(dt.timezone.utc)
        cert = b"synthetic public certificate bytes"
        self.settings["certificate_sha256"] = hashlib.sha256(cert).hexdigest().upper()
        profile = {
            "Name": self.settings["profile_name"], "UUID": self.settings["profile_uuid"],
            "TeamIdentifier": [ios.TEAM_ID], "CreationDate": now - dt.timedelta(days=1),
            "ExpirationDate": now + dt.timedelta(days=1), "DeveloperCertificates": [cert],
            "Entitlements": {"application-identifier": f"{ios.TEAM_ID}.{ios.BUNDLE_ID}",
                             "com.apple.developer.team-identifier": ios.TEAM_ID,
                             "aps-environment": "production", "get-task-allow": False},
        }
        return profile, cert, now

    def test_correct_public_certificate_profile_pair(self):
        profile, cert, now = self.sample_profile()
        self.assertEqual(ios.validate_profile(profile, cert, self.settings, now)["profile_uuid"],
                         self.settings["profile_uuid"])

    def test_rejects_mismatched_public_certificate(self):
        profile, _, now = self.sample_profile()
        with self.assertRaisesRegex(ValueError, "certificate"):
            ios.validate_profile(profile, b"different public certificate", self.settings, now)

    def test_rejects_expired_or_future_profile(self):
        profile, cert, now = self.sample_profile()
        for key, date in (("ExpirationDate", now), ("CreationDate", now + dt.timedelta(days=1))):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "validity"):
                ios.validate_profile(profile | {key: date}, cert, self.settings, now)

    def test_rejects_debug_push_wrong_app_and_device_distribution_profiles(self):
        profile, cert, now = self.sample_profile()
        for key, value in (("get-task-allow", True), ("aps-environment", "development"),
                           ("application-identifier", "wrong.app")):
            changed = copy.deepcopy(profile)
            changed["Entitlements"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                ios.validate_profile(changed, cert, self.settings, now)
        for key, value in (("ProvisionedDevices", []), ("ProvisionsAllDevices", True)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                ios.validate_profile(profile | {key: value}, cert, self.settings, now)

    def test_native_push_entitlements_are_build_configuration_specific(self):
        with (ROOT / "ios/App/App/App.entitlements").open("rb") as handle:
            self.assertEqual(plistlib.load(handle)["aps-environment"], "$(APS_ENVIRONMENT)")
        project = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()
        self.assertEqual(project.count("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;"), 2)
        self.assertIn("APS_ENVIRONMENT = development;", project)
        self.assertIn("APS_ENVIRONMENT = production;", project)
        self.assertIn("GoogleService-Info.plist in Resources", project)

    def test_archived_app_must_actually_have_production_signing_entitlements(self):
        profile, _, _ = self.sample_profile()
        ios.validate_signed_entitlements(profile["Entitlements"])
        with self.assertRaisesRegex(ValueError, "Archived app"):
            ios.validate_signed_entitlements(profile["Entitlements"] | {"get-task-allow": True})

    def test_native_release_identity_matches_existing_ios_distribution_certificate(self):
        project = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()
        self.assertEqual(project.count('CODE_SIGN_IDENTITY = "iPhone Distribution";'), 2)
        self.assertEqual(project.count('"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Distribution";'), 2)
        self.assertEqual(project.count('CODE_SIGN_IDENTITY = "Apple Distribution";'), 0)


if __name__ == "__main__":
    unittest.main()
