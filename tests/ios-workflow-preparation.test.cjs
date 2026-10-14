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
  for (const file of ['ios-cloud-build.yml', 'ios-signed-archive.yml']) {
    const workflow = yaml.load(read(`.github/workflows/${file}`));
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps.filter(item => item.run)) {
        const check = spawnSync(bash, ['-n'], { input: step.run, encoding: 'utf8' });
        assert.equal(check.status, 0, `${file}: ${step.name}: ${check.error || check.stderr}`);
      }
    }
  }
});
