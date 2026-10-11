import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlay = fs.readFileSync('src/components/livreur/LivreurVictoryOverlay.jsx', 'utf8');
const livreurApp = fs.readFileSync('src/pages/LivreurExterneApp.jsx', 'utf8');

assert.match(overlay, /const DURATION_MS = 9000/);
assert.match(overlay, /whiteSpace:\s*"nowrap"/);
assert.match(overlay, /wordBreak:\s*"keep-all"/);
assert.match(overlay, /overflowWrap:\s*"normal"/);
assert.match(overlay, /maxWidth:\s*"calc\(100vw - 24px\)"/);
assert.doesNotMatch(overlay, /whiteSpace:\s*"normal"/);
assert.doesNotMatch(overlay, /wordBreak:\s*"break-word"/);
assert.doesNotMatch(overlay, /overflowWrap:\s*"break-word"/);

assert.match(livreurApp, /<LivreurVictoryOverlay/);
assert.match(livreurApp, /setVictoryCourseId\(null\)/);
assert.match(livreurApp, /invalidateQueries\(\{ queryKey: \["mes-courses-externes"\] \}\)/);
assert.match(livreurApp, /setActiveTab\("courses"\)/);

const closeStart = livreurApp.indexOf('<LivreurVictoryOverlay');
const closeEnd = livreurApp.indexOf('</DashboardThemeProvider>', closeStart);
const closeBlock = livreurApp.slice(closeStart, closeEnd > closeStart ? closeEnd : undefined);
assert.doesNotMatch(closeBlock, /window\.location\.replace|window\.location\.href|location\.reload\(\)/);

const words = ['MAGNIFIQUE!', 'EXCELLENT!', 'FORMIDABLE!', 'BRAVO!'];
const viewports = [320, 360, 375, 390, 412, 480];
for (const viewport of viewports) {
  const maxWidth = viewport - 24;
  for (const word of words) {
    const wordLength = word.replace(/\s/g, '').length;
    const fontSizeVw = Math.floor(124 / wordLength);
    const fontPx = Math.min(Math.max(21.6, viewport * fontSizeVw / 100), 76);
    const estimatedWidth = wordLength * fontPx * 0.68;
    assert.ok(
      estimatedWidth <= maxWidth,
      `${word} should fit on one line at ${viewport}px (${estimatedWidth}px > ${maxWidth}px)`
    );
  }
}

console.log('VICTORY_OVERLAY_REGRESSION=PASS');
