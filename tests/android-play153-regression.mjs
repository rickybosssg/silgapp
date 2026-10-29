import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const filters = [...manifest.matchAll(/<intent-filter\b[^>]*>[\s\S]*?<\/intent-filter>/g)].map(m => m[0]);

test('Play protection minimum is 24 without changing target/compile SDK', () => {
  const variables = read('android/variables.gradle');
  assert.match(variables, /minSdkVersion\s*=\s*24\b/);
  assert.match(variables, /compileSdkVersion\s*=\s*36\b/);
  assert.match(variables, /targetSdkVersion\s*=\s*36\b/);
  assert.match(read('android/app/build.gradle'), /minSdkVersion rootProject.ext.minSdkVersion/);
});

test('all three existing HTTPS entry filters request domain verification', () => {
  const links = filters.filter(f => f.includes('android.intent.action.VIEW') && f.includes('android:scheme="https"'));
  assert.equal(links.length, 3);
  for (const link of links) {
    assert.match(link, /<intent-filter android:autoVerify="true">/);
    assert.match(link, /android:host="silga-dispatch-go.base44.app"/);
    assert.match(link, /android.intent.category.BROWSABLE/);
  }
  assert.ok(links.some(f => f.includes('android:pathPrefix="/auth-callback"')));
  assert.ok(links.some(f => f.includes('android:pathPrefix="/diagnostic-push-complet"')));
  assert.ok(links.some(f => !f.includes('android:path')));
});

test('custom authentication scheme and legacy notification actions are retained', () => {
  const custom = filters.find(f => f.includes('android:scheme="silgapp"'));
  assert.ok(custom);
  assert.match(custom, /android:host="auth-callback"/);
  assert.ok(!custom.includes('autoVerify'));
  assert.match(manifest, /android:name="OPEN_SILGAPP"/);
  assert.match(manifest, /android:name="https:\/\/app.base44.com"/);
});

test('association retains existing fingerprints and adds the exact Play signing fingerprint', () => {
  const statements = JSON.parse(read('public/.well-known/assetlinks.json'));
  const association = statements.find(s => s.target?.package_name === 'com.base6a0ec08f3af5e1d1284254c1.app');
  assert.ok(association.relation.includes('delegate_permission/common.handle_all_urls'));
  assert.equal(association.target.namespace, 'android_app');
  assert.deepEqual(association.target.sha256_cert_fingerprints, [
    'B7:5B:33:41:01:46:16:F1:A3:66:E0:82:60:81:F4:5C:C9:6C:22:08:B6:F7:51:80:A5:30:01:C1:3B:57:1A:1A',
    'C5:03:C5:7C:08:8B:8E:A9:AA:DA:03:2E:F7:47:7B:AD:54:94:DC:EB:0D:AC:C3:00:17:93:F0:8A:22:9C:87:2E',
    'C5:03:C5:7C:08:8B:8E:A9:AA:DA:03:2E:F7:47:7B:AD:54:94:DC:EB:0D:AC:C3:D0:17:93:F0:8A:22:9C:87:2E',
  ]);
});
