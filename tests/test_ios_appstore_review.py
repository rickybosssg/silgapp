import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('review', ROOT / 'scripts/ios_appstore_review.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def build_payload(encryption=False):
    return {'data': {'id': review.APPLE_BUILD_ID, 'attributes': {'version': '68',
        'processingState': 'VALID', 'expired': False, 'usesNonExemptEncryption': encryption},
        'relationships': {'app': {'data': {'id': review.APP_ID}},
                          'preReleaseVersion': {'data': {'id': 'prerelease'}}}},
        'included': [{'id': 'prerelease', 'attributes': {'version': '1.0.61'}}]}


def version(state='PREPARE_FOR_SUBMISSION', build=None, release='MANUAL'):
    return {'id': 'target-version', 'attributes': {'versionString': review.VERSION,
        'platform': 'IOS', 'appStoreState': state, 'releaseType': release},
        'relationships': {'build': {'data': None if build is None else {'id': build}}}}


class AppleFixture:
    def __init__(self, target=None, encryption=False, active=None, uncertain=False):
        self.target = target
        self.encryption = encryption
        self.active = active or []
        self.calls = []
        self.review_state = 'READY_FOR_REVIEW'
        self.uncertain = uncertain

    @property
    def writes(self):
        return [x for x in self.calls if x[1] != 'GET']

    def call(self, path, method='GET', body=None, query=None):
        self.calls.append((path, method, copy.deepcopy(body), query))
        if path == f'/v1/apps/{review.APP_ID}':
            return {'data': {'id': review.APP_ID, 'attributes': {'bundleId': review.BUNDLE_ID}}}
        if path == f'/v1/builds/{review.APPLE_BUILD_ID}':
            return build_payload(self.encryption)
        if path.endswith('/appStoreVersions') and method == 'GET':
            old = {'id': 'old-version', 'attributes': {'versionString': '1.0.60', 'appStoreState': 'READY_FOR_SALE'}}
            return {'data': [old] + ([copy.deepcopy(self.target)] if self.target else [])}
        if path == '/v1/appStoreVersions' and method == 'POST':
            self.target = version(release=body['data']['attributes']['releaseType'])
            return {'data': copy.deepcopy(self.target)}
        if path == '/v1/appStoreVersions/target-version':
            return {'data': copy.deepcopy(self.target)}
        if path.endswith('/relationships/build') and method == 'PATCH':
            self.target['relationships']['build']['data'] = body['data']
            return {}
        if path.endswith('/appStoreVersionLocalizations'):
            return {'data': [{'id': 'fr-locale', 'attributes': {'locale': 'fr-FR', 'whatsNew': None}}]}
        if path == '/v1/appStoreVersionLocalizations/fr-locale' and method == 'PATCH':
            return {}
        if path == '/v1/reviewSubmissions' and method == 'GET':
            return {'data': self.active}
        if path == '/v1/reviewSubmissions' and method == 'POST':
            return {'data': {'id': 'only-review', 'attributes': {'state': self.review_state}}}
        if path == '/v1/reviewSubmissionItems' and method == 'POST':
            self.target['attributes']['appStoreState'] = 'READY_FOR_REVIEW'
            return {'data': {'id': 'only-item'}}
        if path == '/v1/reviewSubmissions/only-review/items':
            return {'data': [{'id': 'only-item', 'relationships': {'appStoreVersion': {'data': {'id': 'target-version'}}}}]}
        if path == '/v1/reviewSubmissions/only-review' and method == 'PATCH':
            if self.uncertain:
                raise ValueError('write outcome unknown; inspect Apple before retry')
            self.review_state = 'WAITING_FOR_REVIEW'
            self.target['attributes']['appStoreState'] = 'WAITING_FOR_REVIEW'
            return {'data': {'id': 'only-review'}}
        if path == '/v1/reviewSubmissions/only-review':
            return {'data': {'id': 'only-review', 'attributes': {'state': self.review_state,
                'submittedDate': '2026-10-15T11:00:00Z'}}}
        raise AssertionError(f'Unexpected API operation {method} {path}')


class ReviewTests(unittest.TestCase):
    def execute(self, api):
        receipt, stages = {}, []
        with patch('sys.stdout', new_callable=io.StringIO):
            review.submit(api, receipt, stages.append)
        return receipt, stages

    def test_full_review_uses_exact_existing_build_and_submits_only_one_item(self):
        api = AppleFixture()
        receipt, stages = self.execute(api)
        self.assertTrue(receipt['submitted'])
        self.assertEqual(receipt['review_state'], 'WAITING_FOR_REVIEW')
        self.assertEqual(receipt['review_submission_id'], 'only-review')
        self.assertEqual(receipt['release_type'], 'MANUAL')
        self.assertEqual(sum(x[0] == '/v1/reviewSubmissionItems' for x in api.writes), 1)
        self.assertEqual(sum(x[0] == '/v1/reviewSubmissions/only-review' for x in api.writes), 1)
        self.assertFalse(any('/v1/builds/' in x[0] for x in api.writes))
        self.assertFalse(any('appStoreReviewDetail' in x[0] for x in api.calls))
        association = [x for x in api.writes if x[0].endswith('/relationships/build')][0]
        self.assertEqual(association[2]['data']['id'], review.APPLE_BUILD_ID)
        self.assertEqual(stages[-1], 'submission_confirmed_by_apple')

    def test_unknown_export_compliance_stops_before_all_writes(self):
        api = AppleFixture(encryption=None)
        with self.assertRaisesRegex(ValueError, 'Owner must confirm'):
            self.execute(api)
        self.assertEqual(api.writes, [])

    def test_existing_target_release_policy_is_preserved(self):
        api = AppleFixture(target=version(release='AFTER_APPROVAL'))
        receipt, _ = self.execute(api)
        self.assertEqual(receipt['release_type'], 'AFTER_APPROVAL')
        self.assertFalse(any(x[0] == '/v1/appStoreVersions' for x in api.writes))
        self.assertFalse(any('releaseType' in json.dumps(x[2]) for x in api.writes))

    def test_already_submitted_exact_build_does_not_write_or_resubmit(self):
        api = AppleFixture(target=version('IN_REVIEW', review.APPLE_BUILD_ID))
        receipt, _ = self.execute(api)
        self.assertTrue(receipt['already_submitted'])
        self.assertEqual(api.writes, [])

    def test_another_build_or_active_draft_is_not_overwritten(self):
        fixtures = [AppleFixture(target=version(build='another-build')),
                    AppleFixture(target=version('IN_REVIEW', 'another-build')),
                    AppleFixture(active=[{'id': 'existing', 'attributes': {'state': 'READY_FOR_REVIEW'}}])]
        for api in fixtures:
            with self.subTest(api=api), self.assertRaises(ValueError):
                self.execute(api)
            self.assertEqual(api.writes, [])

    def test_uncertain_submission_write_is_never_retried(self):
        api = AppleFixture(uncertain=True)
        with self.assertRaisesRegex(ValueError, 'outcome unknown'):
            self.execute(api)
        self.assertEqual(sum(x[0] == '/v1/reviewSubmissions/only-review' for x in api.writes), 1)

    def test_receipt_and_build_identity_must_match_exact_release(self):
        good = {'app_id': review.APP_ID, 'bundle_id': review.BUNDLE_ID, 'version': review.VERSION,
                'build': review.BUILD, 'ipa_sha256': review.IPA_SHA256, 'source_run': 38714981800,
                'uploaded': True, 'processing_state': 'VALID', 'apple_build_id': review.APPLE_BUILD_ID}
        review.verify_upload_receipt(good)
        for key in good:
            wrong = dict(good, **{key: 'unexpected'})
            with self.subTest(key=key), self.assertRaises(ValueError):
                review.verify_upload_receipt(wrong)
        payload = build_payload()
        payload['included'][0]['attributes']['version'] = '1.0.60'
        with self.assertRaises(ValueError):
            review.validate_build(payload)

    def test_local_execution_never_opens_receipt_or_credentials(self):
        with patch.dict(review.os.environ, {}, clear=True), patch('sys.argv',
                ['review', '--upload-receipt', 'unopened.json', '--receipt', 'unwritten.json']), \
             patch.object(Path, 'read_text', side_effect=AssertionError('Must not read')), \
             patch.object(Path, 'write_text'), patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(review.main(), 2)


if __name__ == '__main__':
    unittest.main()
