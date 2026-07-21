import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  detecterIncidentDansMessage,
  TYPE_INCIDENT_LABELS,
  GRAVITE_LABELS,
} from '../../shared/venusIncidentEngine.ts';
import {
  getChampsModifiables,
  verifierModificationsAutorisees,
  detecterIntentionModification,
  getChampLabel,
  appliquerModification,
} from '../../shared/venusCourseModifierEngine.ts';

/**
 * Tests dry-run pour la modification de course et la détection d'incidents.
 *
 * Aucune vraie course n'est créée, aucune notification envoyée, aucun livreur contacté.
 * Les tests de modification utilisent dry_run=true (aucune écriture DB).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const testFilter = body.test_filter || 'all'; // all, modification, incident

    const results: any[] = [];

    // ═══════════════════════════════════════════════════════════════
    // TESTS MODIFICATION DE COURSE
    // ═══════════════════════════════════════════════════════════════

    if (testFilter === 'all' || testFilter === 'modification') {

      // ── Test 1: Champs modifiables par statut ──
      const statutsTests = [
        { statut: 'recherche_livreur', expectedCategory: 'all', label: 'Recherche de livreur → tout modifiable' },
        { statut: 'nouvelle', expectedCategory: 'all', label: 'Nouvelle → tout modifiable' },
        { statut: 'livreur_en_route', expectedCategory: 'partial', label: 'Livreur en route → partiel' },
        { statut: 'colis_recupere', expectedCategory: 'instructions', label: 'Colis récupéré → instructions seulement' },
        { statut: 'en_livraison', expectedCategory: 'instructions', label: 'En livraison → instructions seulement' },
        { statut: 'livree', expectedCategory: 'none', label: 'Livrée → rien modifiable' },
        { statut: 'annulee', expectedCategory: 'none', label: 'Annulée → rien modifiable' },
      ];

      for (const t of statutsTests) {
        const champs = getChampsModifiables(t.statut);
        const passed = (t.expectedCategory === 'all' && champs.length > 10) ||
                       (t.expectedCategory === 'partial' && champs.includes('adresse_arrivee') && !champs.includes('adresse_depart')) ||
                       (t.expectedCategory === 'instructions' && champs.includes('notes') && champs.length <= 2) ||
                       (t.expectedCategory === 'none' && champs.length === 0);
        results.push({ test: t.label, category: 'modification', passed, detail: `Champs: ${champs.join(', ') || 'aucun'}` });
      }

      // ── Test 2: Vérification refus de modification après livraison ──
      const verifLivree = verifierModificationsAutorisees('livree', ['adresse_arrivee', 'notes']);
      results.push({
        test: 'Modification impossible après livraison',
        category: 'modification',
        passed: verifLivree.autorises.length === 0 && verifLivree.refuses.length === 2,
        detail: `Autorisés: ${verifLivree.autorises.length}, Refusés: ${verifLivree.refuses.length}`,
      });

      // ── Test 3: Vérification modification partielle après acceptation ──
      const verifPartielle = verifierModificationsAutorisees('livreur_en_route', ['adresse_depart', 'adresse_arrivee', 'notes']);
      results.push({
        test: 'Modification partielle après acceptation livreur',
        category: 'modification',
        passed: !verifPartielle.autorises.includes('adresse_depart') && verifPartielle.autorises.includes('adresse_arrivee') && verifPartielle.autorises.includes('notes'),
        detail: `Autorisés: ${verifPartielle.autorises.join(', ')}, Refusés: ${verifPartielle.refuses.join(', ')}`,
      });

      // ── Test 4: Détection d'intention de modification ──
      const intentionsTest = [
        { message: 'je veux modifier l adresse de livraison', expected: true },
        { message: 'changer le numero du destinataire', expected: true },
        { message: 'au lieu de Karpala c est Pissy', expected: true },
        { message: 'je voudrais changer les instructions', expected: true },
        { message: 'bonjour je veux envoyer un colis', expected: false },
        { message: 'combien ca coute', expected: false },
        { message: 'ou est mon livreur', expected: false },
      ];

      for (const t of intentionsTest) {
        const detecte = detecterIntentionModification(t.message);
        results.push({
          test: `Intention modification: "${t.message.substring(0, 40)}"`,
          category: 'modification',
          passed: detecte === t.expected,
          detail: `Détecté: ${detecte}, Attendu: ${t.expected}`,
        });
      }

      // ── Test 5: Application dry-run (changement d'adresse avant affectation) ──
      // Simule une course fictive — dry_run=true → aucune écriture DB
      const fakeCourseId = 'test-dry-run-' + Date.now();
      const dryRunResult = await appliquerModification(base44, {
        course_id: fakeCourseId,
        modifications: { adresse_arrivee: 'Pissy' },
        auteur: 'test@test.com',
        canal: 'simulateur',
        dry_run: true,
      }).catch(e => ({ success: false, errors: [{ error: e.message }], changes: [] }));

      results.push({
        test: 'Dry-run modification (course inexistante = échec attendu)',
        category: 'modification',
        passed: !dryRunResult.success && dryRunResult.errors?.length > 0,
        detail: `Success: ${dryRunResult.success}, Errors: ${dryRunResult.errors?.[0]?.error || 'N/A'}`,
      });

      // ── Test 6: Échec technique pendant une modification ──
      const echecResult = await appliquerModification(base44, {
        course_id: 'course-inexistante-12345',
        modifications: { adresse_arrivee: 'Test' },
        auteur: 'test@test.com',
        canal: 'simulateur',
        dry_run: false,
      }).catch(e => ({ success: false, errors: [{ error: e.message }], changes: [], course_before: null }));

      results.push({
        test: 'Échec technique (course inexistante)',
        category: 'modification',
        passed: !echecResult.success,
        detail: `Success: ${echecResult.success}, Error: ${echecResult.errors?.[0]?.error || 'N/A'}`,
      });

      // ── Test 7: Label des champs ──
      const labelTest = getChampLabel('adresse_arrivee') === 'Adresse de livraison';
      results.push({
        test: 'Label du champ adresse_arrivee',
        category: 'modification',
        passed: labelTest,
        detail: `Label: ${getChampLabel('adresse_arrivee')}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // TESTS DÉTECTION D'INCIDENTS
    // ═══════════════════════════════════════════════════════════════

    if (testFilter === 'all' || testFilter === 'incident') {

      // ── Test 8: Détection livreur injoignable ──
      const livreurInjoignable = detecterIncidentDansMessage('le livreur ne repond pas du tout');
      results.push({
        test: 'Détection: livreur injoignable',
        category: 'incident',
        passed: livreurInjoignable?.type_incident === 'livreur_injoignable' && livreurInjoignable?.niveau_gravite === 'moyen',
        detail: `Type: ${livreurInjoignable?.type_incident}, Gravité: ${livreurInjoignable?.niveau_gravite}`,
      });

      // ── Test 9: Détection panne ──
      const panne = detecterIncidentDansMessage('ma moto est en panne sur la route');
      results.push({
        test: 'Détection: panne de moto',
        category: 'incident',
        passed: panne?.type_incident === 'panne_moto' && panne?.niveau_gravite === 'eleve',
        detail: `Type: ${panne?.type_incident}, Gravité: ${panne?.niveau_gravite}`,
      });

      // ── Test 10: Détection accident ──
      const accident = detecterIncidentDansMessage('il y a eu un accident sur la route');
      results.push({
        test: 'Détection: accident',
        category: 'incident',
        passed: accident?.type_incident === 'accident' && accident?.niveau_gravite === 'critique',
        detail: `Type: ${accident?.type_incident}, Gravité: ${accident?.niveau_gravite}`,
      });

      // ── Test 11: Détection colis perdu ──
      const colisPerdu = detecterIncidentDansMessage('mon colis est perdu');
      results.push({
        test: 'Détection: colis perdu',
        category: 'incident',
        passed: colisPerdu?.type_incident === 'colis_perdu' && colisPerdu?.niveau_gravite === 'eleve',
        detail: `Type: ${colisPerdu?.type_incident}, Gravité: ${colisPerdu?.niveau_gravite}`,
      });

      // ── Test 12: Détection conflit ──
      const conflit = detecterIncidentDansMessage('il y a eu une dispute avec le livreur');
      results.push({
        test: 'Détection: conflit client/livreur',
        category: 'incident',
        passed: conflit?.type_incident === 'conflit_client_livreur' && conflit?.niveau_gravite === 'eleve',
        detail: `Type: ${conflit?.type_incident}, Gravité: ${conflit?.niveau_gravite}`,
      });

      // ── Test 13: Détection fraude ──
      const fraude = detecterIncidentDansMessage('je pense qu il y a une fraude');
      results.push({
        test: 'Détection: suspicion de fraude',
        category: 'incident',
        passed: fraude?.type_incident === 'suspicion_fraude' && fraude?.niveau_gravite === 'eleve',
        detail: `Type: ${fraude?.type_incident}, Gravité: ${fraude?.niveau_gravite}`,
      });

      // ── Test 14: Détection incident critique (agression) ──
      const agression = detecterIncidentDansMessage('on m a agresse pendant la livraison');
      results.push({
        test: 'Détection: menace/agression (critique)',
        category: 'incident',
        passed: agression?.type_incident === 'menace_agression' && agression?.niveau_gravite === 'critique',
        detail: `Type: ${agression?.type_incident}, Gravité: ${agression?.niveau_gravite}`,
      });

      // ── Test 15: Détection problème QR/PIN ──
      const qrPin = detecterIncidentDansMessage('le code pin est incorrect');
      results.push({
        test: 'Détection: problème QR/PIN',
        category: 'incident',
        passed: qrPin?.type_incident === 'probleme_qr_pin' && qrPin?.niveau_gravite === 'moyen',
        detail: `Type: ${qrPin?.type_incident}, Gravité: ${qrPin?.niveau_gravite}`,
      });

      // ── Test 16: Pas de faux positif ──
      const pasIncident1 = detecterIncidentDansMessage('bonjour je veux envoyer un colis a karpala');
      const pasIncident2 = detecterIncidentDansMessage('combien coute la livraison');
      const pasIncident3 = detecterIncidentDansMessage('merci beaucoup pour le service');
      results.push({
        test: 'Pas de faux positif (messages normaux)',
        category: 'incident',
        passed: pasIncident1 === null && pasIncident2 === null && pasIncident3 === null,
        detail: `Messages normaux: ${pasIncident1 === null}, ${pasIncident2 === null}, ${pasIncident3 === null}`,
      });

      // ── Test 17: Priorité de gravité (critique avant moyen) ──
      const priorite = detecterIncidentDansMessage('il y a eu un accident et le livreur ne repond pas');
      results.push({
        test: 'Priorité de gravité (accident avant injoignable)',
        category: 'incident',
        passed: priorite?.type_incident === 'accident' && priorite?.niveau_gravite === 'critique',
        detail: `Type: ${priorite?.type_incident}, Gravité: ${priorite?.niveau_gravite}`,
      });

      // ── Test 18: Destinataire introuvable ──
      const destinataireIntrouvable = detecterIncidentDansMessage('il n y a personne pour recevoir le colis');
      results.push({
        test: 'Détection: destinataire introuvable',
        category: 'incident',
        passed: destinataireIntrouvable?.type_incident === 'destinataire_introuvable',
        detail: `Type: ${destinataireIntrouvable?.type_incident}, Gravité: ${destinataireIntrouvable?.niveau_gravite}`,
      });

      // ── Test 19: Colis endommagé ──
      const endommage = detecterIncidentDansMessage('le colis est arrive endommage');
      results.push({
        test: 'Détection: colis endommagé',
        category: 'incident',
        passed: endommage?.type_incident === 'colis_endommage' && endommage?.niveau_gravite === 'eleve',
        detail: `Type: ${endommage?.type_incident}, Gravité: ${endommage?.niveau_gravite}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RAPPORT FINAL
    // ═══════════════════════════════════════════════════════════════

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const modificationTests = results.filter(r => r.category === 'modification');
    const incidentTests = results.filter(r => r.category === 'incident');

    return Response.json({
      resume: {
        total,
        passed,
        failed,
        taux_reussite: Math.round((passed / total) * 100),
      },
      modification: {
        total: modificationTests.length,
        passed: modificationTests.filter(r => r.passed).length,
        failed: modificationTests.filter(r => !r.passed).length,
      },
      incident: {
        total: incidentTests.length,
        passed: incidentTests.filter(r => r.passed).length,
        failed: incidentTests.filter(r => !r.passed).length,
      },
      tests: results,
    });
  } catch (e) {
    console.error('[testerModificationIncident] Erreur:', e.message);
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
});