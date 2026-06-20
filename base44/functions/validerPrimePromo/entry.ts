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

/**
 * Valide et applique la prime code promo lors de la livraison d'une première course.
 * Appelé après qu'une course est marquée "livree".
 *
 * Règles :
 * - Client doit avoir un code_promo_utilise
 * - C'est la première course du client (premiere_course_faite = false)
 * - Prix final >= 1000 FCFA
 * - Course statut = "livree"
 * - Prime fixe = 100 FCFA (réduction client + prime propriétaire)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    // Peut être appelé manuellement avec course_id, ou via automation avec event.entity_id
    const course_id = body.course_id || body.event?.entity_id || body.data?.id;
    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    // Récupérer la course
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

    // Trouver le client
    const clients = await base44.asServiceRole.entities.ClientExterne.filter({
      user_email: course.expediteur_client_id ? undefined : undefined,
    });

    // Chercher le client par téléphone de l'expéditeur
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

    // Vérifier que le client a un code promo et que c'est sa première course
    if (!client.code_promo_utilise || !client.code_promo_id) {
      return Response.json({ success: false, reason: 'Pas de code promo associé' });
    }

    if (client.premiere_course_faite) {
      return Response.json({ success: false, reason: 'Première course déjà effectuée, code promo expiré' });
    }

    // Vérifier qu'aucune prime n'existe déjà pour ce client
    const primesExistantes = await base44.asServiceRole.entities.PrimePromo.filter({
      client_nouveau_id: client.id
    });
    const primeValidee = primesExistantes?.find(p => p.statut === 'validee');
    if (primeValidee) {
      return Response.json({ success: false, reason: 'Prime déjà versée pour ce client' });
    }

    // Récupérer le code promo
    const codePromos = await base44.asServiceRole.entities.CodePromo.filter({ id: client.code_promo_id });
    const codePromo = codePromos?.[0];
    if (!codePromo || !codePromo.actif) {
      return Response.json({ success: false, reason: 'Code promo inactif ou introuvable' });
    }

    // Calculer la répartition avec code promo
    // Prix final > 1000 → réduction fixe 100 FCFA (pas 10% du total)
    const PRIME_FIXE = 100;
    const prixClientPaye = prixFinal - PRIME_FIXE; // Client paie prix - 100
    const commissionPct = await chargerCommissionPays(base44, course.country_code);
    const commissionBrute = Math.round(prixFinal * (commissionPct / 100));
    const montantLivreur = prixFinal - commissionBrute;
    const commissionSilga = prixFinal - montantLivreur - PRIME_FIXE; // SILGAPP = reste

    // Créer la PrimePromo
    const prime = await base44.asServiceRole.entities.PrimePromo.create({
      code_promo_id: codePromo.id,
      code_promo_code: codePromo.code,
      proprietaire_email: codePromo.proprietaire_email || null,
      proprietaire_client_id: codePromo.proprietaire_client_id || null,
      client_nouveau_id: client.id,
      client_nouveau_nom: `${client.prenom || ''} ${client.nom || ''}`.trim(),
      course_id: course.id,
      prix_course: prixFinal,
      reduction_client: PRIME_FIXE,
      prime_proprietaire: PRIME_FIXE,
      country_code: course.country_code || 'BF',
      statut: 'validee',
      validee_at: new Date().toISOString(),
    });

    // Marquer première course faite sur le client
    await base44.asServiceRole.entities.ClientExterne.update(client.id, {
      premiere_course_faite: true,
    });

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

    console.log(`[validerPrimePromo] Prime validée: client=${client.id}, code=${codePromo.code}, prime=${PRIME_FIXE} FCFA`);

    return Response.json({
      success: true,
      prime_id: prime.id,
      reduction_client: PRIME_FIXE,
      prime_proprietaire: PRIME_FIXE,
      prix_client_paie: prixClientPaye,
      montant_livreur: montantLivreur,
      commission_silga: commissionSilga,
    });

  } catch (error) {
    console.error('[validerPrimePromo] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
