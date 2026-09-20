import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

async function chargerCommissionPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer la commission');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const pct = normalizeCommissionPct(countries?.[0]?.commission_pct);
  if (pct === null) throw new Error(`Commission non configuree pour le pays ${code}`);
  return pct;
}

// ── Compteur quotidien des primes (JSON: { date, spent }) ──
const COUNTER_KEY = 'PRIME_PROMO_SPENT_TODAY';
const MAX_BUDGET_RETRIES = 3;

function todayDateStr() {
  return new Date().toISOString().split('T')[0];
}

function parseCounter(valeur) {
  if (!valeur) return { date: '', spent: 0 };
  try {
    const p = JSON.parse(valeur);
    if (typeof p !== 'object' || p === null) return { date: '', spent: 0 };
    return { date: p.date || '', spent: Number(p.spent) || 0 };
  } catch {
    return { date: '', spent: 0 };
  }
}

/**
 * Réservation ATOMIQUE du budget primes via compare-and-set.
 * Pattern déjà utilisé par creerCourseClient (updateMany conditionnel).
 *
 * Retourne { reserved, counterId, spentBefore, budgetPerDay } ou { reserved: false, reason }.
 */
async function reservePrimeBudget(base44, primeAmount) {
  // ── Lire le budget journalier ──
  let budgetPerDay = 1000;
  try {
    const budgetConfigs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'PRIME_PROMO_BUDGET_PER_DAY' });
    if (budgetConfigs?.[0]?.valeur) {
      const parsed = Number(budgetConfigs[0].valeur);
      if (Number.isFinite(parsed) && parsed >= 0) budgetPerDay = parsed;
    }
  } catch {}

  if (budgetPerDay === 0) {
    return { reserved: false, reason: 'budget_zero', budgetPerDay: 0, spentToday: 0 };
  }

  // ── Acquérir ou créer le compteur ──
  let counter = null;
  try {
    const counters = await base44.asServiceRole.entities.AppConfig.filter({ cle: COUNTER_KEY });
    counter = counters?.[0];
  } catch {}

  if (!counter) {
    const today = todayDateStr();
    try {
      counter = await base44.asServiceRole.entities.AppConfig.create({
        cle: COUNTER_KEY,
        valeur: JSON.stringify({ date: today, spent: 0 }),
      });
    } catch {
      // Peut arriver si un autre appel a créé le compteur simultanément — relire
      const counters = await base44.asServiceRole.entities.AppConfig.filter({ cle: COUNTER_KEY });
      counter = counters?.[0];
    }
  }
  if (!counter) {
    return { reserved: false, reason: 'counter_unavailable' };
  }

  const counterId = counter.id;
  const today = todayDateStr();

  // ── Retry loop avec optimistic locking (compare-and-set) ──
  for (let attempt = 0; attempt < MAX_BUDGET_RETRIES; attempt++) {
    const current = await base44.asServiceRole.entities.AppConfig.get(counterId);
    if (!current?.valeur && current?.valeur !== '') {
      return { reserved: false, reason: 'counter_read_failed' };
    }

    const parsed = parseCounter(current.valeur);

    // Reset si nouveau jour
    if (parsed.date !== today) {
      parsed.date = today;
      parsed.spent = 0;
    }

    const currentSpent = parsed.spent;

    // Vérifier le plafond
    if (currentSpent + primeAmount > budgetPerDay) {
      return {
        reserved: false,
        reason: 'budget_exceeded',
        budgetPerDay,
        spentToday: currentSpent,
        primeAmount,
      };
    }

    // Compare-and-set atomique : on n'update QUE si la valeur n'a pas changé
    const newSpent = currentSpent + primeAmount;
    const newValue = JSON.stringify({ date: today, spent: newSpent });
    const currentValeurForCondition = current.valeur;

    const claimResult = await base44.asServiceRole.entities.AppConfig.updateMany(
      { id: counterId, valeur: currentValeurForCondition },
      { $set: { valeur: newValue } }
    );

    if (Number(claimResult?.updated || 0) === 1) {
      return { reserved: true, counterId, spentBefore: currentSpent, budgetPerDay };
    }

    // Quelqu'un d'autre a modifié le compteur — retry
    await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 50)));
  }

  return { reserved: false, reason: 'budget_lock_contention' };
}

/**
 * Rollback du compteur en cas d'échec après réservation.
 */
async function rollbackPrimeBudget(base44, counterId, primeAmount) {
  try {
    const current = await base44.asServiceRole.entities.AppConfig.get(counterId);
    if (!current?.valeur) return;
    const parsed = parseCounter(current.valeur);
    const newSpent = Math.max(0, (parsed.spent || 0) - primeAmount);
    await base44.asServiceRole.entities.AppConfig.update(counterId, {
      valeur: JSON.stringify({ date: parsed.date || todayDateStr(), spent: newSpent }),
    });
  } catch (err) {
    console.error('[validerPrimePromo] Erreur rollback budget:', err);
  }
}

/**
 * Valide et applique la prime code promo lors de la livraison d'une première course.
 *
 * Ordre de sécurité :
 *   1. Kill switch (PRIME_PROMO_AUTO_ENABLED)
 *   2. Éligibilité (course livrée, prix >= 1000, client, code promo)
 *   3. Idempotence (aucune prime déjà validée pour ce client)
 *   4. Montant réel de la prime (PRIME_FIXE)
 *   5. Réservation atomique du budget (compare-and-set)
 *   6. Validation de la prime (création PrimePromo)
 *   7. Journalisation
 *
 * En cas d'échec après réservation, le budget est restauré (rollback).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. AUTH + KILL SWITCH ──
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin requis' }, { status: 403 });
      }
    } catch {
      // Appel depuis courseEventOrchestrator (service role)
    }

    let primeAutoEnabled = false;
    try {
      const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'PRIME_PROMO_AUTO_ENABLED' });
      primeAutoEnabled = configs?.[0]?.valeur === 'true';
    } catch {}

    if (!primeAutoEnabled) {
      return Response.json({
        success: false,
        skipped: 'kill_switch_active',
        message: 'Versement automatique de primes désactivé (PRIME_PROMO_AUTO_ENABLED != true). Aucune prime créée.',
      });
    }

    // ── 2. ÉLIGIBILITÉ ──
    const body = await req.json();
    const course_id = body.course_id || body.event?.entity_id || body.data?.id;
    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    const courses = await base44.asServiceRole.entities.CourseExterne.filter({ id: course_id });
    const course = courses?.[0];
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    if (course.statut !== 'livree') {
      return Response.json({ success: false, reason: 'Course non livrée' });
    }

    const prixFinal = course.prix_final || 0;
    if (prixFinal < 1000) {
      return Response.json({
        success: false,
        reason: 'Prix minimum non atteint',
        message: 'Le montant minimum pour le code promo est 1000 FCFA'
      });
    }

    let client = null;
    if (course.expediteur_telephone) {
      const byPhone = await base44.asServiceRole.entities.ClientExterne.filter({
        telephone: course.expediteur_telephone
      });
      if (byPhone?.length > 0) client = byPhone[0];
    }
    if (!client && course.client_telephone) {
      const byPhone = await base44.asServiceRole.entities.ClientExterne.filter({
        telephone: course.client_telephone
      });
      if (byPhone?.length > 0) client = byPhone[0];
    }

    if (!client) return Response.json({ success: false, reason: 'Client introuvable' });

    if (!client.code_promo_utilise || !client.code_promo_id) {
      return Response.json({ success: false, reason: 'Pas de code promo associé' });
    }

    // ── VERROU ATOMIQUE : compare-and-set sur premiere_course_faite ──
    // Garantit qu'un seul appel concurrent peut traiter ce client.
    // Si deux appels arrivent simultanément, un seul obtient updated=1.
    const claimResult = await base44.asServiceRole.entities.ClientExterne.updateMany(
      { id: client.id, premiere_course_faite: false },
      { $set: { premiere_course_faite: true } }
    );
    if (Number(claimResult?.updated || 0) === 0) {
      return Response.json({ success: false, reason: 'Première course déjà effectuée ou en cours de validation' });
    }

    // ── 3. IDEMPORENCE ──
    const primesExistantes = await base44.asServiceRole.entities.PrimePromo.filter({
      client_nouveau_id: client.id
    });
    const primeValidee = primesExistantes?.find(p => p.statut === 'validee');
    if (primeValidee) {
      return Response.json({ success: false, reason: 'Prime déjà versée pour ce client' });
    }

    const codePromos = await base44.asServiceRole.entities.CodePromo.filter({ id: client.code_promo_id });
    const codePromo = codePromos?.[0];
    if (!codePromo || !codePromo.actif) {
      return Response.json({ success: false, reason: 'Code promo inactif ou introuvable' });
    }

    // ── 4. MONTANT RÉEL DE LA PRIME ──
    const PRIME_FIXE = 100; // Montant réel engagé (reduction_client + prime_proprietaire)
    const primeAmount = PRIME_FIXE;

    // ── 5. RÉSERVATION ATOMIQUE DU BUDGET ──
    const reservation = await reservePrimeBudget(base44, primeAmount);
    if (!reservation.reserved) {
      if (reservation.reason === 'budget_zero') {
        return Response.json({
          success: false,
          skipped: 'budget_zero',
          message: 'Budget primes journalier = 0 FCFA. Aucune prime autorisée.',
          budget_per_day: 0,
          spent_today: 0,
        });
      }
      if (reservation.reason === 'budget_exceeded') {
        return Response.json({
          success: false,
          skipped: 'budget_exceeded',
          message: `Plafond journalier dépassé : ${reservation.spentToday} + ${primeAmount} = ${reservation.spentToday + primeAmount} > ${reservation.budgetPerDay} FCFA`,
          budget_per_day: reservation.budgetPerDay,
          spent_today: reservation.spentToday,
          prime_amount: primeAmount,
        });
      }
      return Response.json({
        success: false,
        skipped: reservation.reason,
        message: 'Impossible de réserver le budget primes (concurrence).',
      });
    }

    // ── 6. VALIDATION DE LA PRIME (avec rollback si échec) ──
    let prime;
    let prixClientPaye, montantLivreur, commissionSilga, proprietaireType;
    try {
      prixClientPaye = prixFinal - PRIME_FIXE;
      const commissionPct = await chargerCommissionPays(base44, course.country_code);
      const commissionBrute = Math.round(prixFinal * (commissionPct / 100));
      montantLivreur = prixFinal - commissionBrute;
      commissionSilga = prixFinal - montantLivreur - PRIME_FIXE;
      proprietaireType = codePromo.proprietaire_type || 'client';

      prime = await base44.asServiceRole.entities.PrimePromo.create({
        code_promo_id: codePromo.id,
        code_promo_code: codePromo.code,
        proprietaire_email: codePromo.proprietaire_email || null,
        proprietaire_client_id: proprietaireType === 'client' ? (codePromo.proprietaire_client_id || null) : null,
        proprietaire_livreur_id: proprietaireType === 'livreur' ? (codePromo.proprietaire_livreur_id || null) : null,
        proprietaire_partenaire_id: proprietaireType === 'partenaire' ? (codePromo.proprietaire_partenaire_id || null) : null,
        proprietaire_type: proprietaireType,
        client_nouveau_id: client.id,
        client_nouveau_nom: `${client.prenom || ''} ${client.nom || ''}`.trim(),
        course_id: course.id,
        prix_course: prixFinal,
        reduction_client: PRIME_FIXE,
        prime_proprietaire: PRIME_FIXE,
        country_code: course.country_code || null,
        statut: 'validee',
        validee_at: new Date().toISOString(),
      });

      // premiere_course_faite déjà positionné par le verrou atomique ci-dessus

      // Mettre à jour les compteurs du CodePromo
      await base44.asServiceRole.entities.CodePromo.update(codePromo.id, {
        nb_premieres_courses: (codePromo.nb_premieres_courses || 0) + 1,
        total_primes_generees: (codePromo.total_primes_generees || 0) + PRIME_FIXE,
      });

      // Mettre à jour les montants sur la course
      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        commission_silga: commissionSilga,
        montant_livreur: montantLivreur,
      });

      // Si le propriétaire est un livreur, réduire son montant_du_silga
      if (proprietaireType === 'livreur' && codePromo.proprietaire_livreur_id) {
        try {
          const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: codePromo.proprietaire_livreur_id });
          const livreur = livreurs?.[0];
          if (livreur) {
            const nouveauMontantDu = Math.max(0, (livreur.montant_du_silga || 0) - PRIME_FIXE);
            await base44.asServiceRole.entities.Livreur.update(livreur.id, {
              montant_du_silga: nouveauMontantDu,
            });
          }
        } catch (err) {
          console.error('[validerPrimePromo] Erreur crédit livreur:', err);
        }
      }
    } catch (creationErr) {
      if (!prime) {
        // ── PrimePromo.create a échoué → restaurer budget ET premiere_course_faite ──
        await rollbackPrimeBudget(base44, reservation.counterId, primeAmount);
        await base44.asServiceRole.entities.ClientExterne.update(client.id, { premiere_course_faite: false }).catch(() => {});
        console.error('[validerPrimePromo] Échec création prime — budget restauré:', creationErr);
        return Response.json({ error: 'Échec validation prime. Budget restauré.' }, { status: 500 });
      }
      // ── Prime créée mais opération secondaire échouée → budget NON restauré ──
      // La prime validée existe, les 100 FCFA doivent rester consommés.
      console.error('[validerPrimePromo] Prime créée mais opération secondaire échouée — budget conservé:', creationErr);
      return Response.json({ error: 'Prime créée mais une opération secondaire a échoué. Budget conservé.' }, { status: 500 });
    }

    // ── 7. JOURNALISATION ──
    console.log(`[validerPrimePromo] Prime validée: client=${client.id}, code=${codePromo.code}, prime=${PRIME_FIXE} FCFA, budget_before=${reservation.spentBefore}, budget_after=${reservation.spentBefore + PRIME_FIXE}, plafond=${reservation.budgetPerDay}`);

    return Response.json({
      success: true,
      prime_id: prime.id,
      reduction_client: PRIME_FIXE,
      prime_proprietaire: PRIME_FIXE,
      prix_client_paie: prixClientPaye,
      montant_livreur: montantLivreur,
      commission_silga: commissionSilga,
      proprietaire_type: proprietaireType,
    });

  } catch (error) {
    console.error('[validerPrimePromo] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});