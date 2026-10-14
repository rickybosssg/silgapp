const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ios/logo-source.json'), 'utf8'));
const sourceCommit = JSON.parse(fs.readFileSync(path.join(root, 'ios/release-settings.json'), 'utf8')).source_commit;
const normalize = text => text.replace(/\r\n/g, '\n').replace(/\n$/, '');
const branding = () => import(pathToFileURL(path.join(root, 'src/lib/iosBranding.js')).href);

test('native AppIcon and internal iOS asset exactly match the approved opaque 1024 PNG', () => {
  for (const file of ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
                      'src/assets/silgapp-logo-ios.png']) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1024);
    assert.equal(bytes[25], 2, 'RGB without alpha');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  }
});

test('only native iOS selects the new asset; Android and web preserve their exact existing URL', async () => {
  const { silgappLogo, SILGAPP_IOS_LOGO } = await branding();
  const original = 'https://existing.example/original-logo.jpg';
  assert.equal(silgappLogo(original, 'ios'), SILGAPP_IOS_LOGO);
  for (const platform of ['android', 'web', 'unknown', null]) {
    assert.equal(silgappLogo(original, platform), original);
  }
  const previous = globalThis.Capacitor;
  try {
    globalThis.Capacitor = { getPlatform: () => 'ios' };
    assert.equal(silgappLogo(original), SILGAPP_IOS_LOGO);
    globalThis.Capacitor = { getPlatform: () => { throw new Error('bridge unavailable'); } };
    assert.equal(silgappLogo(original), original);
  } finally {
    if (previous === undefined) delete globalThis.Capacitor;
    else globalThis.Capacitor = previous;
  }
});

test('shared components differ from the source only by brand-image selection and its import', () => {
  const git = process.env.IOS_TEST_GIT || 'git';
  const files = ['src/components/auth/AuthGate.jsx', 'src/components/layout/MobileNav.jsx',
    'src/components/layout/Sidebar.jsx', 'src/components/IOSAppStoreBanner.jsx',
    'src/pages/RoleSelection.jsx', 'src/pages/TelechargerSILGAPP.jsx', 'src/components/SplashScreen.jsx'];
  let imageCount = 0;
  for (const file of files) {
    const baseline = normalize(execFileSync(git, ['--no-optional-locks', '-C', root, 'show', `${sourceCommit}:${file}`], { encoding: 'utf8' }));
    let current = normalize(fs.readFileSync(path.join(root, file), 'utf8'));
    current = current.replace('import { silgappLogo } from "@/lib/iosBranding";\n', '');
    current = current.replace(/src=\{silgappLogo\(("[^"]+")\)\}/g, (_, url) => {
      imageCount += 1;
      return `src=${url}`;
    });
    assert.ok(current === baseline, `Unrelated logic changed in ${file}`);
  }
  assert.equal(imageCount, 9);
});

test('native launch assets keep their existing 2732 canvas and consistent variants', () => {
  const folder = 'ios/App/App/Assets.xcassets/Splash.imageset';
  const files = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
  const hashes = new Set();
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, folder, file));
    assert.equal(bytes.readUInt32BE(16), 2732);
    assert.equal(bytes.readUInt32BE(20), 2732);
    assert.equal(bytes[25], 2);
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 1);
});
