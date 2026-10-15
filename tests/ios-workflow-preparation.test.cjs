const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require(process.env.IOS_TEST_YAML_PATH || 'js-yaml');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('workflows parse and only explicit tags can trigger a push build', () => {
  for (const [file, tag] of [['ios-cloud-build.yml', 'ios-check-*'], ['ios-signed-archive.yml', 'ios-signed-v*']]) {
    const workflow = yaml.load(read(`.github/workflows/${file}`));
    assert.deepEqual(workflow.on.push.tags, [tag]);
    assert.equal(workflow.on.push.branches, undefined);
    assert.equal(workflow.permissions.contents, 'read');
    assert.ok(Object.values(workflow.jobs).every(job => job['runs-on'] === 'macos-15'));
  }
});

test('signed workflow checks the current ios head and reviewed release before using signing assets', () => {
  const workflow = yaml.load(read('.github/workflows/ios-signed-archive.yml'));
  const steps = workflow.jobs['signed-archive'].steps;
  const preflight = steps.findIndex(step => step.id === 'release');
  const archive = steps.findIndex(step => step.run === 'bash scripts/ios_archive.sh');
  assert.ok(preflight >= 0 && archive > preflight);
  assert.match(steps[preflight].run, /refs\/heads\/ios/);
  assert.match(steps[preflight].run, /merge-base --is-ancestor/);
  const artifact = steps.find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(artifact.with.path, '${{ runner.temp }}/ios-export/*.ipa');
  assert.equal(artifact.with['retention-days'], 3);
  assert.ok(steps.some(step => step.if === 'always()'));
});

test('archive never exports a plaintext private key or submits to a store', () => {
  const archive = read('scripts/ios_archive.sh');
  assert.match(archive, /-clcerts -nokeys -passin env:CERTIFICATE_PASSWORD/);
  assert.doesNotMatch(archive, /-nodes\b|-noenc\b|set -x|altool|iTMSTransporter/);
  assert.match(archive, /'destination': 'export'/);
  assert.match(archive, /'method': 'app-store-connect'/);
  assert.match(archive, /'testFlightInternalTestingOnly': False/);
  assert.match(archive, /settings\['MARKETING_VERSION'\] = ENV.fetch\('IOS_RELEASE_VERSION'\)/);
  assert.match(archive, /settings\['CURRENT_PROJECT_VERSION'\] = ENV.fetch\('IOS_RELEASE_BUILD'\)/);
  assert.match(archive, /trap cleanup EXIT/);
  assert.match(archive, /security delete-keychain/);
});

test('archive provisioning applies only to App Release and cannot leak into Pods', () => {
  const archive = read('scripts/ios_archive.sh');
  assert.match(archive, /target.name == 'App' && target.product_type == 'com.apple.product-type.application'/);
  assert.match(archive, /config.name == 'Release'/);
  assert.match(archive, /settings\['PROVISIONING_PROFILE_SPECIFIER'\] = ENV.fetch\('PROFILE_NAME'\)/);
  const archiveCommand = archive.match(/xcodebuild -workspace[\s\S]*?\n  archive/)[0];
  assert.doesNotMatch(archiveCommand, /PROVISIONING_PROFILE|CODE_SIGN_|DEVELOPMENT_TEAM/);
});

test('all embedded workflow shell blocks pass a syntax-only Bash check', () => {
  const bash = process.env.IOS_TEST_BASH || 'bash';
  for (const file of ['ios-cloud-build.yml', 'ios-signed-archive.yml', 'ios-appstore-upload.yml']) {
    const workflow = yaml.load(read(`.github/workflows/${file}`));
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps.filter(item => item.run)) {
        const check = spawnSync(bash, ['-n'], { input: step.run, encoding: 'utf8' });
        assert.equal(check.status, 0, `${file}: ${step.name}: ${check.error || check.stderr}`);
      }
    }
  }
});

test('upload uses only exact r2 artifact and an immutable separate tag, with a public receipt artifact', () => {
  const workflow = yaml.load(read('.github/workflows/ios-appstore-upload.yml'));
  assert.deepEqual(workflow.on.push.tags, ['ios-upload-v1.0.60-b67-r2']);
  assert.equal(workflow.on.workflow_dispatch, undefined);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const job = workflow.jobs.upload;
  assert.equal(job.if, 'github.run_attempt == 1');
  assert.equal(job['runs-on'], 'macos-15');
  const download = job.steps.find(step => step.uses === 'actions/download-artifact@v4');
  assert.equal(download.with['run-id'], 38528393904);
  assert.equal(download.with.name, 'SILGAPP-signed-ipa');
  const artifact = job.steps.find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(artifact.with.path, '${{ runner.temp }}/ios-appstore-upload-receipt.json');
  const upload = job.steps.find(step => step.run?.includes('ios_appstore_upload.py'));
  assert.deepEqual(Object.keys(upload.env).sort(), ['APP_STORE_CONNECT_API_ISSUER_ID', 'APP_STORE_CONNECT_API_KEY_ID', 'APP_STORE_CONNECT_API_PRIVATE_KEY']);
  assert.ok(job.steps.every(step => !/npm ci|xcodebuild.*archive|ios_archive.sh/.test(step.run || '')));
});

test('both workflows select installed Xcode 26.2 and reject an obsolete SDK before restoring secrets', () => {
  for (const file of ['ios-cloud-build.yml', 'ios-signed-archive.yml']) {
    const workflow = yaml.load(read(`.github/workflows/${file}`));
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job.env.DEVELOPER_DIR, '/Applications/Xcode_26.2.app/Contents/Developer');
      const check = job.steps.findIndex(step => step.name === 'Validate App Store Xcode and iOS SDK');
      const restore = job.steps.findIndex(step => step.name === 'Restore existing Firebase iOS configuration');
      assert.ok(check >= 0 && check < restore);
      assert.match(job.steps[check].run, /"\$XCODE_MAJOR" -ge 26 && test "\$SDK_MAJOR" -ge 26/);
    }
  }
  const archive = read('scripts/ios_archive.sh');
  assert.ok(archive.indexOf('ios_release.py app-info') < archive.indexOf('xcodebuild -exportArchive'));
});
