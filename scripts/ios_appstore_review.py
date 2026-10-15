"""Administrative review of the already uploaded build 68; never uploads or builds."""
import argparse
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from ios_appstore_upload import APP_ID, BUNDLE_ID, VERSION, BUILD, IPA_SHA256, KEY_ID, ISSUER_ID, access_token

APPLE_BUILD_ID = "ce976436-d543-467b-a1cb-fca796815a81"
REVIEW_TAG = "refs/tags/ios-review-v1.0.61-b68-r2"
SUBMITTED_STATES = {"WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE",
                    "PENDING_APPLE_RELEASE", "READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}
NOTES = {
    "fr": "Corrections de l’enregistrement des notifications et améliorations de stabilité.",
    "en": "Notification registration fixes and stability improvements.",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def collection(payload):
    require(isinstance(payload.get("data"), list) and not payload.get("links", {}).get("next"),
            "Incomplete Apple collection; stop before any further write.")
    return payload["data"]


def verify_upload_receipt(receipt):
    expected = {"app_id": APP_ID, "bundle_id": BUNDLE_ID, "version": VERSION, "build": BUILD,
                "ipa_sha256": IPA_SHA256, "source_run": 38714981800,
                "uploaded": True, "processing_state": "VALID", "apple_build_id": APPLE_BUILD_ID}
    require(all(receipt.get(k) == v for k, v in expected.items()),
            "Upload receipt does not identify the exact accepted and processed build 68.")


class Apple:
    def __init__(self, token):
        self.token = token

    def call(self, path, method="GET", body=None, query=None):
        require(path.startswith("/v1/") and "?" not in path, "Only documented Apple v1 endpoints are allowed.")
        url = "https://api.appstoreconnect.apple.com" + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        request = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                         headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
                return json.loads(data) if data else {}
        except urllib.error.HTTPError as error:
            try:
                errors = json.load(error).get("errors", [])
                public = [{k: str(e.get(k, ""))[:600] for k in ("code", "title", "detail")}
                          for e in errors[:8]]
            except (ValueError, TypeError):
                public = []
            raise ValueError(f"Apple {method} {path}: HTTP {error.code}; {json.dumps(public)}. No automatic retry.") from None
        except (urllib.error.URLError, TimeoutError):
            outcome = "read failed" if method == "GET" else "write outcome unknown; inspect Apple before retry"
            raise ValueError(f"Apple {method} {path}: {outcome}.") from None


def relation(item, key):
    return item.get("relationships", {}).get(key, {}).get("data")


def version_info(api, version_id):
    return api.call(f"/v1/appStoreVersions/{version_id}", query={
        "fields[appStoreVersions]": "versionString,platform,appStoreState,releaseType,build",
        "include": "build", "fields[builds]": "version"})["data"]


def validate_build(payload):
    data = payload.get("data", {})
    attrs = data.get("attributes", {})
    prerelease = relation(data, "preReleaseVersion") or {}
    included = {x["id"]: x for x in payload.get("included", [])}
    require(data.get("id") == APPLE_BUILD_ID and attrs.get("version") == BUILD
            and attrs.get("processingState") == "VALID" and attrs.get("expired") is False,
            "The exact uploaded build is not currently valid and unexpired.")
    require((relation(data, "app") or {}).get("id") == APP_ID
            and included.get(prerelease.get("id"), {}).get("attributes", {}).get("version") == VERSION,
            "Apple build belongs to another app or marketing version.")
    require(isinstance(attrs.get("usesNonExemptEncryption"), bool),
            "Export compliance is unanswered for build 68 (usesNonExemptEncryption=null). Owner must confirm it in App Store Connect; no legal declaration will be invented.")
    return attrs["usesNonExemptEncryption"]


def select_version(payload):
    versions = collection(payload)
    target = [v for v in versions if v.get("attributes", {}).get("versionString") == VERSION]
    require(len(target) <= 1, "Multiple target version records; inspect Apple before writing.")
    for version in versions:
        attrs = version.get("attributes", {})
        value = attrs.get("versionString", "")
        try:
            parts = tuple(int(x) for x in value.split("."))
        except ValueError:
            raise ValueError("Unexpected Apple version number.") from None
        require(1 <= len(parts) <= 3 and parts + (0,) * (3 - len(parts)) <= (1, 0, 61),
                "A newer or unexpected Apple version exists; stop before writing.")
        if value != VERSION:
            require(attrs.get("appStoreState") not in {"WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_REVIEW",
                    "PENDING_DEVELOPER_RELEASE", "PENDING_APPLE_RELEASE", "PROCESSING_FOR_APP_STORE"},
                    f"Another version {value} has active state {attrs.get('appStoreState')}; it will not be changed.")
    if not target:
        require(any(v.get("attributes", {}).get("versionString") == "1.0.60"
                    and v.get("attributes", {}).get("appStoreState") in {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}
                    for v in versions), "Previous version 1.0.60 is not available; cannot create a replacement.")
    return target[0] if target else None


def submit(api, receipt, save):
    app = api.call(f"/v1/apps/{APP_ID}", query={"fields[apps]": "bundleId,primaryLocale"})["data"]
    require(app.get("id") == APP_ID and app.get("attributes", {}).get("bundleId") == BUNDLE_ID,
            "Apple app identity differs from SILGAPP.")
    build = api.call(f"/v1/builds/{APPLE_BUILD_ID}", query={
        "fields[builds]": "version,processingState,expired,usesNonExemptEncryption,app,preReleaseVersion",
        "include": "app,preReleaseVersion", "fields[apps]": "bundleId",
        "fields[preReleaseVersions]": "version,platform"})
    receipt["uses_non_exempt_encryption_existing"] = validate_build(build)
    versions = api.call(f"/v1/apps/{APP_ID}/appStoreVersions", query={
        "filter[platform]": "IOS", "fields[appStoreVersions]": "versionString,appStoreState,releaseType,platform", "limit": 200})
    target = select_version(versions)
    if target:
        target = version_info(api, target["id"])
        state = target.get("attributes", {}).get("appStoreState")
        if state in SUBMITTED_STATES:
            require((relation(target, "build") or {}).get("id") == APPLE_BUILD_ID,
                    "Submitted version uses a different build; it will not be changed.")
            receipt.update(version_id=target["id"], version_state=state, submitted=True, already_submitted=True)
            save("already_submitted")
            return
        require(state == "PREPARE_FOR_SUBMISSION", f"Target version state {state} requires inspection before modifying it.")
        require((relation(target, "build") or {}).get("id") in (None, APPLE_BUILD_ID),
                "Target draft already has another build; it will not be replaced.")
    reviews = collection(api.call("/v1/reviewSubmissions", query={"filter[app]": APP_ID,
        "filter[platform]": "IOS", "fields[reviewSubmissions]": "state,platform,submittedDate", "limit": 200}))
    active = [{"id": x["id"], "state": x.get("attributes", {}).get("state")}
              for x in reviews if x.get("attributes", {}).get("state") != "COMPLETE"]
    receipt["existing_active_review_submissions"] = active
    require(not active, "An existing draft or active Apple review submission needs inspection; refusing to duplicate or alter it.")
    if not target:
        save("creating_version_outcome_not_yet_known")
        target = api.call("/v1/appStoreVersions", "POST", {"data": {"type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": VERSION, "releaseType": "MANUAL"},
            "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})["data"]
        receipt["version_created"] = True
    version_id = target["id"]
    receipt["version_id"] = version_id
    target = version_info(api, version_id)
    require(target.get("attributes", {}).get("versionString") == VERSION
            and target.get("attributes", {}).get("appStoreState") == "PREPARE_FOR_SUBMISSION",
            "Version changed concurrently; stop before further writes.")
    receipt["release_type"] = target.get("attributes", {}).get("releaseType")
    require(receipt["release_type"] in {"MANUAL", "AFTER_APPROVAL", "SCHEDULED"}, "Unknown existing release policy.")
    attached = relation(target, "build")
    require((attached or {}).get("id") in (None, APPLE_BUILD_ID), "Another build was attached concurrently.")
    if not attached:
        save("attaching_verified_build")
        api.call(f"/v1/appStoreVersions/{version_id}/relationships/build", "PATCH",
                 {"data": {"type": "builds", "id": APPLE_BUILD_ID}})
    localizations = collection(api.call(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations",
        query={"fields[appStoreVersionLocalizations]": "locale,whatsNew", "limit": 200}))
    require(localizations, "No inherited version localization; owner metadata is required.")
    receipt["locales"] = []
    for localization in localizations:
        attrs = localization.get("attributes", {})
        locale = attrs.get("locale", "")
        notes = NOTES.get(locale.split('-')[0])
        require(notes or str(attrs.get("whatsNew") or "").strip(), f"Missing release notes for locale {locale}; owner text required.")
        if notes:
            save("updating_factual_release_notes")
            api.call(f"/v1/appStoreVersionLocalizations/{localization['id']}", "PATCH",
                     {"data": {"type": "appStoreVersionLocalizations", "id": localization["id"],
                               "attributes": {"whatsNew": notes}}})
        receipt["locales"].append(locale)
    save("creating_review_draft_outcome_not_yet_known")
    review = api.call("/v1/reviewSubmissions", "POST", {"data": {"type": "reviewSubmissions",
        "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})["data"]
    review_id = review["id"]
    receipt["review_submission_id"] = review_id
    save("adding_only_authorized_version_for_review")
    api.call("/v1/reviewSubmissionItems", "POST", {"data": {"type": "reviewSubmissionItems",
        "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                          "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}}}})
    items = collection(api.call(f"/v1/reviewSubmissions/{review_id}/items",
        query={"fields[reviewSubmissionItems]": "state,appStoreVersion", "include": "appStoreVersion",
               "fields[appStoreVersions]": "versionString", "limit": 200}))
    require(len(items) == 1 and (relation(items[0], "appStoreVersion") or {}).get("id") == version_id,
            "Review contents differ from the single authorized app version; do not submit.")
    fresh = version_info(api, version_id)
    require((relation(fresh, "build") or {}).get("id") == APPLE_BUILD_ID
            and fresh.get("attributes", {}).get("appStoreState") in {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW"}
            and fresh.get("attributes", {}).get("releaseType") == receipt["release_type"],
            "Version, build or release policy changed concurrently; do not submit.")
    save("submitting_review_outcome_not_yet_known")
    api.call(f"/v1/reviewSubmissions/{review_id}", "PATCH", {"data": {
        "type": "reviewSubmissions", "id": review_id, "attributes": {"submitted": True}}})
    for attempt in range(6):
        confirmed = api.call(f"/v1/reviewSubmissions/{review_id}", query={
            "fields[reviewSubmissions]": "state,submittedDate,platform"})["data"]
        receipt["review_state"] = confirmed.get("attributes", {}).get("state")
        receipt["submitted_date"] = confirmed.get("attributes", {}).get("submittedDate")
        receipt["version_state"] = version_info(api, version_id).get("attributes", {}).get("appStoreState")
        if receipt["review_state"] in {"WAITING_FOR_REVIEW", "IN_REVIEW", "COMPLETING", "COMPLETE"}:
            receipt["submitted"] = True
            save("submission_confirmed_by_apple")
            print(f"APPLE_REVIEW_SUBMITTED: {review_id}; {receipt['review_state']}; version {receipt['version_state']}", flush=True)
            return
        save("awaiting_review_state_confirmation")
        if attempt < 5:
            time.sleep(10)
    raise ValueError("Apple submission write returned, but review state is not confirmed. Inspect this review ID before any retry.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upload-receipt", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    receipt = {"app_id": APP_ID, "bundle_id": BUNDLE_ID, "version": VERSION, "build": BUILD,
        "apple_build_id": APPLE_BUILD_ID, "ipa_sha256": IPA_SHA256, "source_upload_run": 38721421848,
        "submitted": False, "new_upload": False, "application_rebuilt": False}
    def save(stage):
        receipt["stage"] = stage
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    try:
        require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_OS") == "macOS"
                and os.environ.get("GITHUB_REPOSITORY") == "rickybosssg/silgapp"
                and os.environ.get("GITHUB_EVENT_NAME") == "push" and os.environ.get("GITHUB_REF") == REVIEW_TAG
                and os.environ.get("GITHUB_RUN_ATTEMPT") == "1",
                "Review is restricted to the first authorized immutable-tag macOS CI attempt.")
        verify_upload_receipt(json.loads(args.upload_receipt.read_text()))
        require(os.environ.get("APP_STORE_CONNECT_API_KEY_ID", "").strip() == KEY_ID
                and os.environ.get("APP_STORE_CONNECT_API_ISSUER_ID", "").strip() == ISSUER_ID,
                "Existing public API key and issuer IDs do not match.")
        key_text = os.environ.pop("APP_STORE_CONNECT_API_PRIVATE_KEY", "").replace("\r\n", "\n").strip()
        require(key_text.startswith("-----BEGIN PRIVATE KEY-----\n")
                and key_text.endswith("\n-----END PRIVATE KEY-----"), "Existing runner key secret is malformed.")
        with tempfile.TemporaryDirectory(prefix="silgapp-review-", dir=os.environ["RUNNER_TEMP"]) as temporary:
            key_path = Path(temporary) / f"AuthKey_{KEY_ID}.p8"
            descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descriptor, "w") as key_file:
                    key_file.write(key_text + "\n")
                del key_text
                save("checking_live_apple_state")
                submit(Apple(access_token(key_path)), receipt, save)
            finally:
                key_path.unlink(missing_ok=True)
        return 0
    except (ValueError, KeyError, OSError) as error:
        message = str(error) if isinstance(error, ValueError) else "Runner file or Apple response check failed. No automatic retry."
        receipt["blocked_reason"] = message
        print("Review blocked: " + message, flush=True)
        return 2
    finally:
        save(receipt.get("stage", "blocked_before_apple_access"))


if __name__ == "__main__":
    raise SystemExit(main())
