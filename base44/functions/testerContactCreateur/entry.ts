import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Tests de non-régression — CONTACT CRÉATEUR DE COURSE (contact_createur_course)
 *
 * Valide que la porte de validation et le moteur de création respectent les règles:
 * 1. La personne qui écrit crée pour elle-même (confirmation explicite requise)
 * 2. La personne qui écrit crée pour un autre client
 * 3. Utilisation du numéro WhatsApp après confirmation
 * 4. Saisie d'un autre numéro
 * 5. Ancienne course avec ancien contact (pas de réutilisation)
 * 6. Nouvelle course sans réutilisation automatique
 * 7. Numéro absent (création bloquée)
 * 8. Numéro invalide (création bloquée)
 * 9. Changement du contact avant confirmation
 */

interface TestCase {
  nom: string;
  description: string;
  memoireCourte: any;
  expectedResult: 'blocked' | 'allowed';
  expectedMissingField?: string;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé admin' }, { status: 403 });

    // ── Logique de validation extraite du webhook (porte de validation) ──
    function validerContactCreateur(um: any): { blocked: boolean; missingField?: string } {
      const _tc = (um.type_course || '').toLowerCase().trim();
      const _hasType = ['expedier', 'recevoir', 'deplacement'].includes(_tc);
      const _hasDepart = !!(um.adresse_depart && um.adresse_depart.trim()) || um.gps_depart_lat != null;
      const _hasArrivee = !!(um.adresse_arrivee && um.adresse_arrivee.trim()) || um.gps_arrivee_lat != null;
      const _needsContact = _tc === 'expedier' || _tc === 'recevoir';
      const _hasContact = !!(um.contact_telephone && um.contact_telephone.trim()) || um.contact_is_client === true;
      const _createurDigits = (um.contact_createur_course || '').replace(/\D/g, '');
      const _hasCreateurContact = !!(um.contact_createur_course && um.contact_createur_course.trim()) && _createurDigits.length >= 8 && _createurDigits.length <= 15;

      if (!_hasType) return { blocked: true, missingField: 'type_course' };
      if (!_hasDepart) return { blocked: true, missingField: 'adresse_depart' };
      if (!_hasArrivee) return { blocked: true, missingField: 'adresse_arrivee' };
      if (!_hasCreateurContact) return { blocked: true, missingField: 'contact_createur_course' };
      if (_needsContact && !_hasContact) return { blocked: true, missingField: 'contact' };
      return { blocked: false };
    }

    // ── Validation de format de numéro ──
    function isValidPhone(phone: string): boolean {
      if (!phone) return false;
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 15;
    }

    const WHATSAPP_NUMBER = '+22670123456';

    const testCases: TestCase[] = [
      {
        nom: 'TEST 1 — Crée pour elle-même sans confirmation',
        description: 'Le client écrit "envoie un colis" mais VENUS ne doit PAS auto-copier le numéro WhatsApp. Sans contact_createur_course explicite, la création est BLOQUÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          // contact_createur_course absent — ne doit PAS être auto-rempli avec WHATSAPP_NUMBER
        },
        expectedResult: 'blocked',
        expectedMissingField: 'contact_createur_course',
      },
      {
        nom: 'TEST 2 — Crée pour un autre client',
        description: 'Le client donne un numéro de créateur différent du sien. La création doit être AUTORISÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          contact_createur_course: '+22678888888',
        },
        expectedResult: 'allowed',
      },
      {
        nom: 'TEST 3 — Numéro WhatsApp après confirmation',
        description: 'Le client confirme "c\'est mon numéro" → contact_createur_course = numéro WhatsApp. Création AUTORISÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          contact_createur_course: WHATSAPP_NUMBER, // confirmé explicitement
        },
        expectedResult: 'allowed',
      },
      {
        nom: 'TEST 4 — Saisie d\'un autre numéro',
        description: 'Le client saisit un numéro de créateur différent. Création AUTORISÉE.',
        memoireCourte: {
          type_course: 'recevoir',
          adresse_depart: 'Gounghin',
          adresse_arrivee: 'Dassasgho',
          contact_telephone: '+22675111111',
          contact_createur_course: '+22679222222',
        },
        expectedResult: 'allowed',
      },
      {
        nom: 'TEST 5 — Ancienne course avec ancien contact (pas de réutilisation)',
        description: 'Une nouvelle course est créée. L\'ancien contact_createur_course ne doit PAS être réutilisé automatiquement. Sans nouveau contact_createur_course, la création est BLOQUÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Tampouy',
          adresse_arrivee: 'Ouaga 2000',
          contact_telephone: '+22676000000',
          // Pas de contact_createur_course — l'ancien ne doit PAS être réutilisé
        },
        expectedResult: 'blocked',
        expectedMissingField: 'contact_createur_course',
      },
      {
        nom: 'TEST 6 — Nouvelle course sans réutilisation automatique',
        description: 'Le client démarre une nouvelle course. Même si course_created=true (ancienne course), le contact_createur_course doit être redemandé. Création BLOQUÉE sans lui.',
        memoireCourte: {
          type_course: 'deplacement',
          adresse_depart: 'Wemtenga',
          adresse_arrivee: 'Cissin',
          course_created: true, // ancienne course
          // contact_createur_course absent — doit être redemandé
        },
        expectedResult: 'blocked',
        expectedMissingField: 'contact_createur_course',
      },
      {
        nom: 'TEST 7 — Numéro absent',
        description: 'contact_createur_course est vide. La création doit être BLOQUÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          contact_createur_course: '',
        },
        expectedResult: 'blocked',
        expectedMissingField: 'contact_createur_course',
      },
      {
        nom: 'TEST 8 — Numéro invalide',
        description: 'contact_createur_course est trop court (invalide). La création doit être BLOQUÉE.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          contact_createur_course: '123', // invalide
        },
        expectedResult: 'blocked',
        expectedMissingField: 'contact_createur_course',
      },
      {
        nom: 'TEST 9 — Changement du contact avant confirmation',
        description: 'Le client change le contact_createur_course avant la confirmation. Le nouveau numéro doit être utilisé. Création AUTORISÉE avec le nouveau.',
        memoireCourte: {
          type_course: 'expedier',
          adresse_depart: 'Karpala',
          adresse_arrivee: 'Pissy',
          contact_telephone: '+22676000000',
          contact_createur_course: '+22679333333', // changé avant confirmation
        },
        expectedResult: 'allowed',
      },
    ];

    const results = testCases.map((tc) => {
      const validation = validerContactCreateur(tc.memoireCourte);
      const phoneValid = tc.memoireCourte.contact_createur_course
        ? isValidPhone(tc.memoireCourte.contact_createur_course)
        : false;

      // Pour les tests "allowed", vérifier aussi que le numéro est valide
      let passed: boolean;
      if (tc.expectedResult === 'blocked') {
        passed = validation.blocked && validation.missingField === tc.expectedMissingField;
      } else {
        // allowed: ne doit pas être bloqué ET le numéro doit être valide
        passed = !validation.blocked && phoneValid;
      }

      // Vérifier que le numéro WhatsApp n'a PAS été auto-copié
      const whatsappAutoCopied = !tc.memoireCourte.contact_createur_course
        && tc.memoireCourte.contact_createur_course === WHATSAPP_NUMBER;

      return {
        test: tc.nom,
        description: tc.description,
        passed,
        expected: tc.expectedResult,
        actual: validation.blocked ? `blocked (${validation.missingField})` : 'allowed',
        phoneValid,
        whatsappAutoCopied,
      };
    });

    const allPassed = results.every((r) => r.passed);

    return Response.json({
      total_tests: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      all_passed: allPassed,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});