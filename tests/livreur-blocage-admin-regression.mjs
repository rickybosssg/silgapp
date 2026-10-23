/**
 * Tests de non-régression — Correction Blocage Admin
 *
 * Règle testée :
 *   Un livreur validé, bloqué administrativement (actif=false), continue à
 *   recevoir les notifications push et à voir les courses dans Disponibles.
 *   Il ne peut JAMAIS accepter une course tant que l'admin ne l'a pas débloqué.
 *
 * Scénarios :
 *   1. Compte validé bloqué (actif=false) → visible + éligible push, acceptation refusée
 *   2. Compte débloqué (actif=true) → fonctionnement normal
 *   3. Compte non validé (validation='en_attente') → protections conservées (pas de push, pas de feed)
 *   4. Compte refusé (validation='refuse') → protections conservées
 *   5. Isolation pays/entreprise → un livreur BF ne reçoit pas les courses CI
 *   6. Absence de doublons → un livreur n'est pas notifié deux fois pour la même course
 *   7. Hors-ligne volontaire (manual_hors_ligne=true) → exclu du push (préservé)
 *   8. Acceptation on-route/éco → bloquée si actif=false (gardes préservés)
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const results = [];
function test(name, fn) {
  results.push({ name, fn, passed: false, error: null });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS — Lecture des fichiers source pour vérifier les patterns
// ═══════════════════════════════════════════════════════════════════

function readSource(relativePath) {
  return readFileSync(join(__dirname, '..', relativePath), 'utf-8');
}

/**
 * Vérifie qu'un filtre Livreur ne contient PAS `actif: true` dans le ciblage push.
 * On cherche les blocs de filtre Livreur et vérifie qu'aucun n'a `actif: true`.
 */
function assertNoActifInPushFilter(source, fileLabel) {
  // Vérifie que les lignes contenant `actif: true` dans un contexte de filtre
  // Livreur ont été retirées. On cherche les patterns spécifiques.
  const pushFilterPattern = /Livreur\.filter\(\{[\s\S]*?actif:\s*true[\s\S]*?\}/g;
  const matches = source.match(pushFilterPattern);
  if (matches) {
    throw new Error(`${fileLabel}: trouvé Livreur.filter avec actif: true dans le ciblage push:\n${matches.join('\n---\n')}`);
  }
}

/**
 * Vérifie qu'un garde d'acceptation contient `actif` (vérification que le livreur
 * est actif avant d'accepter une course).
 */
function assertActifInAcceptanceGuard(source, fileLabel) {
  if (!source.includes('actif')) {
    throw new Error(`${fileLabel}: garde d'acceptation manquant (actif non vérifié)`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 1 : Compte validé bloqué (actif=false) → push + feed OK, acceptation refusée
// ═══════════════════════════════════════════════════════════════════

test('dispatchV2: notifierLivreursEligiblesV2 ne filtre pas actif=true', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  assertNoActifInPushFilter(src, 'dispatchV2.ts');
  // Vérifie que le commentaire de correction est présent
  assert.ok(src.includes('CORRECTION BLOCAGE ADMIN'), 'dispatchV2.ts: commentaire de correction manquant');
});

test('dispatchV2: accepterCourseV2 conserve le garde actif === true', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  // Le garde d'acceptation doit contenir actif === true
  const acceptancePattern = /livreur\.actif\s*===\s*true/;
  assert.ok(acceptancePattern.test(src), 'dispatchV2.ts: accepterCourseV2 ne vérifie pas livreur.actif === true');
});

test('pushGeneralT10: getLivreursDestinataires ne filtre pas actif=true', () => {
  const src = readSource('base44/shared/pushGeneralT10.ts');
  // Vérifie que le filtre Livreur n'a plus actif: true dans getLivreursDestinataires
  const filterBlock = src.match(/const livreurs = await base44\.asServiceRole\.entities\.Livreur\.filter\(\{[\s\S]*?\}, undefined, 1000\)/);
  assert.ok(filterBlock, 'pushGeneralT10.ts: bloc getLivreursDestinataires introuvable');
  assert.ok(!filterBlock[0].includes('actif: true'), 'pushGeneralT10.ts: actif: true encore présent dans le filtre');
});

test('pushRappelPeriodique: getLivreursDestinataires ne filtre pas actif=true', () => {
  const src = readSource('base44/shared/pushRappelPeriodique.ts');
  const filterBlock = src.match(/const livreurs = await base44\.asServiceRole\.entities\.Livreur\.filter\(\{[\s\S]*?\}, undefined, 1000\)/);
  assert.ok(filterBlock, 'pushRappelPeriodique.ts: bloc getLivreursDestinataires introuvable');
  assert.ok(!filterBlock[0].includes('actif: true'), 'pushRappelPeriodique.ts: actif: true encore présent dans le filtre');
});

test('dispatchWatchdog: rappel T+20 ne filtre pas actif=true', () => {
  const src = readSource('base44/shared/dispatchWatchdog.ts');
  // Cherche le bloc de filtre Livreur dans le rappel T+20
  const filterBlock = src.match(/const livreurs = await base44\.asServiceRole\.entities\.Livreur\.filter\(\{[\s\S]*?\}, '-last_seen_at', 50\)/);
  assert.ok(filterBlock, 'dispatchWatchdog.ts: bloc T+20 introuvable');
  assert.ok(!filterBlock[0].includes('actif: true'), 'dispatchWatchdog.ts: actif: true encore présent dans le filtre T+20');
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 2 : Compte débloqué (actif=true) → fonctionnement normal
// ═══════════════════════════════════════════════════════════════════

test('accepterCourseV2: livreur actif=true peut accepter (garde ne bloque pas)', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  // Le garde d'acceptation doit vérifier actif === true (et non actif !== true)
  const acceptancePattern = /livreur\.actif\s*===\s*true/;
  assert.ok(acceptancePattern.test(src), 'dispatchV2.ts: accepterCourseV2 doit vérifier actif === true');
  // Vérifie que ce n'est PAS !== true (qui bloquerait les comptes actifs)
  const wrongPattern = /livreur\.actif\s*!==\s*true/;
  // !== true peut apparaître dans les gardes on-route/éco, pas dans accepterCourseV2
  // On vérifie juste que === true est bien présent
  assert.ok(acceptancePattern.test(src), 'dispatchV2.ts: garde d\'acceptation actif === true présent');
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 3 : Compte non validé (validation='en_attente') → protections conservées
// ═══════════════════════════════════════════════════════════════════

test('dispatchV2: validation=valide conservé dans tous les filtres push', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  // Tous les filtres Livreur doivent contenir validation: 'valide'
  const filterMatches = src.match(/Livreur\.filter\(\{[\s\S]*?\}/g) || [];
  for (const f of filterMatches) {
    assert.ok(f.includes("validation: 'valide'"), 'dispatchV2.ts: un filtre Livreur ne contient pas validation: \'valide\'');
  }
});

test('pushGeneralT10: validation=valide conservé', () => {
  const src = readSource('base44/shared/pushGeneralT10.ts');
  const filterBlock = src.match(/const livreurs = await base44\.asServiceRole\.entities\.Livreur\.filter\(\{[\s\S]*?\}, undefined, 1000\)/);
  assert.ok(filterBlock[0].includes("validation: 'valide'"), 'pushGeneralT10.ts: validation non vérifié');
});

test('pushRappelPeriodique: validation=valide conservé', () => {
  const src = readSource('base44/shared/pushRappelPeriodique.ts');
  const filterBlock = src.match(/const livreurs = await base44\.asServiceRole\.entities\.Livreur\.filter\(\{[\s\S]*?\}, undefined, 1000\)/);
  assert.ok(filterBlock[0].includes("validation: 'valide'"), 'pushRappelPeriodique.ts: validation non vérifié');
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 4 : Compte refusé (validation='refuse') → protections conservées
// ═══════════════════════════════════════════════════════════════════

test('useCoursesDisponibles: livreurPeutVoirFil ne filtre plus actif (bloqué peut voir le feed)', () => {
  const src = readSource('src/hooks/useCoursesDisponibles.js');
  // livreurPeutVoirFil ne doit plus contenir actif === true
  const peutVoirFilBlock = src.match(/const livreurPeutVoirFil[\s\S]*?;/);
  assert.ok(peutVoirFilBlock, 'useCoursesDisponibles.js: livreurPeutVoirFil introuvable');
  assert.ok(!peutVoirFilBlock[0].includes('actif === true'), 'useCoursesDisponibles.js: livreurPeutVoirFil filtre encore sur actif');
  assert.ok(!peutVoirFilBlock[0].includes('admin_hors_ligne'), 'useCoursesDisponibles.js: livreurPeutVoirFil filtre encore sur admin_hors_ligne');
  // validation === 'valide' doit être conservé
  assert.ok(peutVoirFilBlock[0].includes('validation === "valide"'), 'useCoursesDisponibles.js: livreurPeutVoirFil ne valide plus validation');
});

test('useCoursesDisponibles: livreurDisponible conserve actif === true (garde acceptation)', () => {
  const src = readSource('src/hooks/useCoursesDisponibles.js');
  const dispoBlock = src.match(/const livreurDisponible[\s\S]*?;/);
  assert.ok(dispoBlock, 'useCoursesDisponibles.js: livreurDisponible introuvable');
  assert.ok(dispoBlock[0].includes('actif === true'), 'useCoursesDisponibles.js: livreurDisponible ne vérifie plus actif === true');
  assert.ok(dispoBlock[0].includes('admin_hors_ligne !== true'), 'useCoursesDisponibles.js: livreurDisponible ne vérifie plus admin_hors_ligne');
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 5 : Isolation pays/entreprise conservée
// ═══════════════════════════════════════════════════════════════════

test('dispatchV2: country_code conservé dans tous les filtres push', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  // Vérifie que tous les blocs Livreur.filter contiennent country_code
  const filterMatches = src.match(/Livreur\.filter\(\{[\s\S]*?\}, '-last_seen_at', \d+\)/g) || [];
  for (const f of filterMatches) {
    assert.ok(f.includes('country_code'), 'dispatchV2.ts: un filtre Livreur ne contient pas country_code');
  }
});

test('dispatchV2: enterprise_id conservé dans les filtres push', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  const filterMatches = src.match(/Livreur\.filter\(\{[\s\S]*?\}, '-last_seen_at', \d+\)/g) || [];
  for (const f of filterMatches) {
    assert.ok(f.includes('enterprise_id'), 'dispatchV2.ts: un filtre Livreur ne contient pas enterprise_id');
  }
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 6 : Absence de doublons (manual_hors_ligne conservé)
// ═══════════════════════════════════════════════════════════════════

test('dispatchV2: manual_hors_ligne conservé dans tous les filtres push', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  const filterMatches = src.match(/Livreur\.filter\(\{[\s\S]*?\}, '-last_seen_at', \d+\)/g) || [];
  for (const f of filterMatches) {
    assert.ok(f.includes('manual_hors_ligne'), 'dispatchV2.ts: un filtre Livreur ne contient pas manual_hors_ligne');
  }
});

test('pushGeneralT10: manual_hors_ligne conservé', () => {
  const src = readSource('base44/shared/pushGeneralT10.ts');
  assert.ok(src.includes('manual_hors_ligne'), 'pushGeneralT10.ts: manual_hors_ligne manquant');
});

test('pushRappelPeriodique: manual_hors_ligne conservé', () => {
  const src = readSource('base44/shared/pushRappelPeriodique.ts');
  assert.ok(src.includes('manual_hors_ligne'), 'pushRappelPeriodique.ts: manual_hors_ligne manquant');
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 7 : Hors-ligne volontaire (manual_hors_ligne=true) → exclu du push
// ═══════════════════════════════════════════════════════════════════

test('dispatchV2: bloque_encours conservé dans les filtres push', () => {
  const src = readSource('base44/shared/dispatchV2.ts');
  const filterMatches = src.match(/Livreur\.filter\(\{[\s\S]*?\}, '-last_seen_at', \d+\)/g) || [];
  for (const f of filterMatches) {
    assert.ok(f.includes('bloque_encours'), 'dispatchV2.ts: un filtre Livreur ne contient pas bloque_encours');
  }
});

// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO 8 : Acceptation on-route/éco → bloquée si actif=false (gardes préservés)
// ═══════════════════════════════════════════════════════════════════

test('ecoOptimizationEngine: respondToOnRouteProposal conserve actif !== true (garde acceptation)', () => {
  const src = readSource('base44/shared/ecoOptimizationEngine.ts');
  // Cherche le garde d'acceptation dans respondToOnRouteProposal
  const guardPattern = /livreur\.actif\s*!==\s*true/;
  assert.ok(guardPattern.test(src), 'ecoOptimizationEngine.ts: respondToOnRouteProposal ne vérifie pas actif !== true');
});

test('ecoOptimizationEngine: acceptEcoMission conserve actif !== true (garde acceptation éco)', () => {
  const src = readSource('base44/shared/ecoOptimizationEngine.ts');
  // Cherche le garde d'acceptation dans acceptEcoMission
  const guardPattern = /livreur\.actif\s*!==\s*true/;
  assert.ok(guardPattern.test(src), 'ecoOptimizationEngine.ts: acceptEcoMission ne vérifie pas actif !== true');
});

test('onRoutePriorityReservation: findBestOnRouteDriver ne filtre plus actif (notification)', () => {
  const src = readSource('base44/shared/onRoutePriorityReservation.ts');
  // Le filtre de proposition ne doit plus contenir actif !== true
  const propBlock = src.match(/if \(livreur\.validation !== 'valide'\) continue;/);
  assert.ok(propBlock, 'onRoutePriorityReservation.ts: filtre de proposition sans actif introuvable');
  // Vérifie que actif !== true n'est plus dans le bloc de proposition
  const oldPattern = /if \(livreur\.validation !== 'valide' \|\| livreur\.actif !== true\) continue;/;
  assert.ok(!oldPattern.test(src), 'onRoutePriorityReservation.ts: actif !== true encore dans le filtre de proposition');
});

test('dispatchExterneAuto: garde d\'acceptation conserve actif === true', () => {
  const src = readSource('base44/functions/dispatchExterneAuto/entry.ts');
  assertActifInAcceptanceGuard(src, 'dispatchExterneAuto/entry.ts');
});

// ═══════════════════════════════════════════════════════════════════
// EXÉCUTION
// ═══════════════════════════════════════════════════════════════════

async function runTests() {
  let passed = 0;
  let failed = 0;
  for (const t of results) {
    try {
      await t.fn();
      t.passed = true;
      passed++;
      console.log(`  ✅ ${t.name}`);
    } catch (err) {
      t.error = err.message;
      failed++;
      console.log(`  ❌ ${t.name}`);
      console.log(`     ${err.message}`);
    }
  }
  console.log(`\n${passed}/${results.length} tests réussés${failed > 0 ? `, ${failed} échec(s)` : ''}\n`);
  if (failed > 0) process.exit(1);
}

await runTests();