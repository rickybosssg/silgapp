import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlay = fs.readFileSync('src/components/livreur/LivreurVictoryOverlay.jsx', 'utf8');
const livreurApp = fs.readFileSync('src/pages/LivreurExterneApp.jsx', 'utf8');
const finaliser = fs.readFileSync('base44/functions/finaliserLivraisonLivreur/entry.ts', 'utf8');
const autoTimeout = fs.readFileSync('base44/functions/cloturerCoursesAutoTimeout/entry.ts', 'utf8');

assert.match(overlay, /const DURATION_MS = 9000/);
assert.match(overlay, /whiteSpace:\s*"nowrap"/);
assert.match(overlay, /wordBreak:\s*"keep-all"/);
assert.match(overlay, /overflowWrap:\s*"normal"/);
assert.match(overlay, /maxWidth:\s*"calc\(100vw - 24px\)"/);
assert.match(overlay, /onClose\?\.\(courseId\)/);
assert.doesNotMatch(overlay, /whiteSpace:\s*"normal"/);
assert.doesNotMatch(overlay, /wordBreak:\s*"break-word"/);
assert.doesNotMatch(overlay, /overflowWrap:\s*"break-word"/);

assert.match(livreurApp, /const handleVictoryClose = useCallback\(async \(courseId\) =>/);
assert.match(livreurApp, /setQueryData\(\["mes-courses-externes", livreurId, livreurEmail, notificationCourseId\]/);
assert.match(livreurApp, /statut:\s*"livree"/);
assert.match(livreurApp, /invalidateQueries\(\{ queryKey: \["mes-courses-externes"\] \}\)/);
assert.match(livreurApp, /invalidateQueries\(\{ queryKey: \["livreur-externe-profil"\] \}\)/);
assert.match(livreurApp, /invalidateQueries\(\{ queryKey: \["courses-externes-disponibles"\] \}\)/);
assert.match(livreurApp, /setActiveTab\("courses"\)/);
const closeStart = livreurApp.indexOf('const handleVictoryClose = useCallback');
const closeEnd = livreurApp.indexOf('// ── Auto-activation GPS', closeStart);
const closeBlock = livreurApp.slice(closeStart, closeEnd);
assert.doesNotMatch(closeBlock, /window\.location\.replace|window\.location\.href|location\.reload\(\)/);

assert.match(finaliser, /const rawRes = await base44\.asServiceRole\.functions\.invoke\('calculPrixCourseExterne'/);
assert.match(finaliser, /const calcResult = rawRes\?\.data \?\? rawRes \?\? \{\}/);
assert.match(autoTimeout, /const rawRes = await base44\.asServiceRole\.functions\.invoke\('calculPrixCourseExterne'/);
assert.match(autoTimeout, /const res = rawRes\?\.data \?\? rawRes \?\? \{\}/);

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

console.log('PASS: victory overlay stays single-line and returns to dashboard without black screen.');
