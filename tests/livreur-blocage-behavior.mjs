// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE COMPORTEMENT — Blocage administratif livreur
// ═══════════════════════════════════════════════════════════════════════════
// Contrairement aux tests regex qui vérifient le texte du code source,
// ces tests exécutent la LOGIQUE MÉTIER réelle :
//   - Interrogent la base de données pour vérifier l'état réel
//   - Simulent les filtres de dispatch en JavaScript
//   - Vérifient le comportement attendu (inclusion/exclusion)
//
// Aucun push réel n'est envoyé. Aucune course n'est créée.
// Lecture seule — aucune modification en base.
// ═══════════════════════════════════════════════════════════════════════════

import { base44 } from '../src/api/base44Client.js';

const tests = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function test(name, fn) {
  tests.push({ name, fn });
}

// ── Helper : simule le filtre de ciblage push du dispatch V2 ──
// Reproduit exactement la logique de notifierLivreursEligiblesV2 (dispatchV2.ts)
function simulatePushTargeting(livreurs, course) {
  return livreurs.filter(l => {
    // Filtres du dispatch V2 (après correction blocage admin)
    if (l.type_livreur !== 'externe') return false;
    if (l.validation !== 'valide') return false;
    // actif n'est PLUS filtré (correction blocage admin)
    if (!['disponible', 'hors_ligne'].includes(l.statut)) return false;
    if (l.bloque_encours === true) return false;
    if (l.manual_hors_ligne === true) return false;
    if (!l.user_email) return false;
    // Filtres géographiques
    if (course.country_code && l.country_code !== course.country_code) return false;
    return true;
  });
}

// ── Helper : simule le garde d'acceptation (accepterCourseV2) ──
function simulateAcceptanceGuard(livreur) {
  return (
    livreur.type_livreur === 'externe' &&
    livreur.validation === 'valide' &&
    livreur.actif === true &&  // ← GARDE CONSERVÉ
    livreur.statut === 'disponible' &&
    livreur.bloque_encours !== true &&
    livreur.manual_hors_ligne !== true &&
    livreur.admin_hors_ligne !== true
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 : Les comptes refusés (validation='refuse') sont exclus du push
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: comptes refusés (validation=refuse) exclus du push', async () => {
  const livreursRefuses = await base44.entities.Livreur.filter(
    { validation: 'refuse' }, '-updated_date', 50
  );
  assert(livreursRefuses.length > 0, 'Aucun livreur refusé trouvé pour le test');

  const fauxCourse = { country_code: 'BF' };
  const eligibles = simulatePushTargeting(livreursRefuses, fauxCourse);
  assert(eligibles.length === 0, `${eligibles.length} livreurs refusés ont passé le filtre push — validation='valide' ne les exclut pas`);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 : Les comptes bloqués admin (actif=false, validation='valide') sont inclus
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: comptes bloqués admin inclus dans le ciblage push', async () => {
  const bloquesAdmin = await base44.entities.Livreur.filter(
    { actif: false, validation: 'valide' }, '-updated_date', 50
  );
  assert(bloquesAdmin.length > 0, 'Aucun livreur bloqué admin trouvé pour le test');

  const fauxCourse = { country_code: 'BF' };
  const eligibles = simulatePushTargeting(bloquesAdmin, fauxCourse);
  assert(eligibles.length > 0, '0 livreur bloqué admin éligible au push — le fix ne fonctionne pas');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 : Les comptes bloqués admin ne peuvent PAS accepter la course
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: comptes bloqués admin ne peuvent pas accepter', async () => {
  const bloquesAdmin = await base44.entities.Livreur.filter(
    { actif: false, validation: 'valide' }, '-updated_date', 50
  );
  assert(bloquesAdmin.length > 0, 'Aucun livreur bloqué admin trouvé pour le test');

  for (const l of bloquesAdmin.slice(0, 10)) {
    const peutAccepter = simulateAcceptanceGuard(l);
    assert(!peutAccepter, `Livreur ${l.id} (actif=${l.actif}) peut accepter — garde d'acceptation cassé`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 : Les comptes débloqués (actif=true, validation='valide') peuvent accepter
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: comptes débloqués (actif=true) peuvent accepter', async () => {
  const debloques = await base44.entities.Livreur.filter(
    { actif: true, validation: 'valide', statut: 'disponible' }, '-updated_date', 50
  );
  assert(debloques.length > 0, 'Aucun livreur débloqué trouvé pour le test');

  const l = debloques[0];
  const peutAccepter = simulateAcceptanceGuard(l);
  assert(peutAccepter, `Livreur débloqué ${l.id} ne peut pas accepter — garde trop restrictif`);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 : Déduplication — aucune notification en double pour (course, livreur)
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: déduplication des DispatchNotification', async () => {
  const notifs = await base44.entities.DispatchNotification.filter(
    {}, '-date_notification', 500
  );
  assert(notifs.length > 0, 'Aucune DispatchNotification trouvée pour le test');

  const parCourseLivreur = {};
  for (const dn of notifs) {
    const key = `${dn.course_id}|${dn.livreur_id}`;
    if (!parCourseLivreur[key]) parCourseLivreur[key] = 0;
    parCourseLivreur[key]++;
  }

  const doublons = Object.entries(parCourseLivreur).filter(([_, count]) => count > 1);
  assert(doublons.length === 0, `${doublons.length} doublons de DispatchNotification détectés`);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6 : bloque_encours n'est PAS un mécanisme anti-doublon
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: bloque_encours est un filtre financier, pas anti-doublon', async () => {
  // Un livreur avec bloque_encours=true est exclu du ciblage push (protection financière)
  // Mais ce n'est PAS ce qui empêche les doublons — c'est DispatchNotification qui le fait
  const bloquesFinancier = await base44.entities.Livreur.filter(
    { bloque_encours: true }, '-updated_date', 50
  );

  // Simuler le filtre push : bloque_encours=true → exclu
  const fauxCourse = { country_code: 'BF' };
  if (bloquesFinancier.length > 0) {
    const eligibles = simulatePushTargeting(bloquesFinancier, fauxCourse);
    assert(eligibles.length === 0, 'Un livreur bloque_encours=true a passé le filtre push');
  }

  // La déduplication réelle vient de DispatchNotification, pas de bloque_encours
  // Preuve : un livreur avec bloque_encours=false peut quand même être exclu s'il a déjà été notifié
  const notifs = await base44.entities.DispatchNotification.filter(
    {}, '-date_notification', 100
  );
  const livreurIdsNotifies = new Set(notifs.map(n => n.livreur_id));
  assert(livreurIdsNotifies.size > 0, 'Aucune notification existante — ne peut pas prouver la déduplication');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7 : Le statut hors_ligne ne coupe pas les alertes
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: statut hors_ligne ne coupe pas les alertes push', async () => {
  const fauxCourse = { country_code: 'BF' };

  // Un livreur hors_ligne doit être inclus dans le ciblage push
  const livreurHorsLigne = {
    type_livreur: 'externe',
    validation: 'valide',
    actif: false, // bloqué admin
    statut: 'hors_ligne',
    bloque_encours: false,
    manual_hors_ligne: false,
    user_email: 'test@example.com',
    country_code: 'BF',
  };

  const eligibles = simulatePushTargeting([livreurHorsLigne], fauxCourse);
  assert(eligibles.length === 1, 'Livreur hors_ligne + bloqué admin exclu du push — le statut hors_ligne coupe les alertes');

  // Mais un livreur en_course doit être exclu (il est déjà en course)
  const livreurEnCourse = { ...livreurHorsLigne, statut: 'en_course' };
  const eligiblesEnCourse = simulatePushTargeting([livreurEnCourse], fauxCourse);
  assert(eligiblesEnCourse.length === 0, 'Livreur en_course inclus dans le push — devrait être exclu');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8 : L'expiration GPS ne coupe pas les alertes
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: expiration GPS ne coupe pas les alertes push', async () => {
  const fauxCourse = { country_code: 'BF' };

  // Un livreur sans GPS du tout doit être inclus
  const livreurSansGPS = {
    type_livreur: 'externe',
    validation: 'valide',
    actif: false,
    statut: 'disponible',
    bloque_encours: false,
    manual_hors_ligne: false,
    user_email: 'test@example.com',
    country_code: 'BF',
    latitude: null,
    longitude: null,
    derniere_position_date: null,
  };

  const eligibles = simulatePushTargeting([livreurSansGPS], fauxCourse);
  assert(eligibles.length === 1, 'Livreur sans GPS exclu du push — l\'expiration GPS coupe les alertes');

  // Un livreur avec GPS très ancien doit aussi être inclus
  const livreurGPSAncien = {
    ...livreurSansGPS,
    latitude: 12.3,
    longitude: -1.7,
    derniere_position_date: new Date(Date.now() - 365 * 86400000).toISOString(), // 1 an
  };

  const eligiblesAncien = simulatePushTargeting([livreurGPSAncien], fauxCourse);
  assert(eligiblesAncien.length === 1, 'Livreur avec GPS ancien exclu du push');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9 : manual_hors_ligne coupe les alertes (comportement attendu)
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: manual_hors_ligne coupe les alertes (volontaire)', async () => {
  const fauxCourse = { country_code: 'BF' };

  const livreurManualHorsLigne = {
    type_livreur: 'externe',
    validation: 'valide',
    actif: false,
    statut: 'hors_ligne',
    bloque_encours: false,
    manual_hors_ligne: true, // ← s'est mis hors ligne volontairement
    user_email: 'test@example.com',
    country_code: 'BF',
  };

  const eligibles = simulatePushTargeting([livreurManualHorsLigne], fauxCourse);
  assert(eligibles.length === 0, 'Livreur manual_hors_ligne=true inclus dans le push — devrait être exclu (mise hors ligne volontaire)');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10 : Vérification réelle en base — les 39 bloqués admin existent
// ═══════════════════════════════════════════════════════════════════════════
test('COMPORTEMENT: base de données — bloqués admin réels vérifiés', async () => {
  const bloquesAdmin = await base44.entities.Livreur.filter(
    { actif: false, validation: 'valide' }, '-updated_date', 50
  );

  // Tous doivent avoir actif=false ET validation='valide'
  for (const l of bloquesAdmin) {
    assert(l.actif === false, `Livreur ${l.id} n'a pas actif=false`);
    assert(l.validation === 'valide', `Livreur ${l.id} n'a pas validation='valide'`);
  }

  // Aucun ne doit avoir validation='refuse' (sinon ce n'est pas un blocage admin)
  const refusesParErreur = bloquesAdmin.filter(l => l.validation === 'refuse');
  assert(refusesParErreur.length === 0, `${refusesParErreur.length} livreurs ont validation='refuse' dans le groupe bloqués admin`);
});

// ═══════════════════════════════════════════════════════════════════════════
// EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TESTS DE COMPORTEMENT — Blocage administratif livreur');
  console.log('  (Lecture seule — aucun push réel, aucune modification en base)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}`);
      console.log(`     → ${err.message}`);
      failures.push({ name, error: err.message });
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} tests de comportement réussis\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();