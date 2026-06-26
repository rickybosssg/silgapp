import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
 * - Le propriétaire peut être un client OU un livreur
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

    // Trouver le client par téléphone
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

    const PRIME_FIXE = 100;
    const prixClientPaye = prixFinal - PRIME_FIXE;
    const montantLivreur = Math.round(prixFinal * 0.70);
    const commissionSilga = prixFinal - montantLivreur - PRIME_FIXE;

    const proprietaireType = codePromo.proprietaire_type || 'client';

    // Créer la PrimePromo
    const prime = await base44.asServiceRole.entities.PrimePromo.create({
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

    // 🎯 Si le propriétaire est un livreur, réduire son montant_du_silga de 100 FCFA
    if (proprietaireType === 'livreur' && codePromo.proprietaire_livreur_id) {
      try {
        const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: codePromo.proprietaire_livreur_id });
        const livreur = livreurs?.[0];
        if (livreur) {
          const nouveauMontantDu = Math.max(0, (livreur.montant_du_silga || 0) - PRIME_FIXE);
          await base44.asServiceRole.entities.Livreur.update(livreur.id, {
            montant_du_silga: nouveauMontantDu,
          });
          console.log(`[validerPrimePromo] Prime livreur ${livreur.id}: montant_du_silga réduit de ${PRIME_FIXE} FCFA (nouveau: ${nouveauMontantDu})`);
        }
      } catch (err) {
        console.error(`[validerPrimePromo] Erreur crédit livreur:`, err);
      }
    }

    console.log(`[validerPrimePromo] Prime validée: client=${client.id}, code=${codePromo.code}, proprietaire=${proprietaireType}, prime=${PRIME_FIXE} FCFA`);

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