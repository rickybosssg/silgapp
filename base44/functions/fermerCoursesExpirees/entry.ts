import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Scheduled job — tourne toutes les 5 minutes.
 * Ferme les courses en recherche_livreur depuis > 4 minutes
 * et notifie le client pour qu'il puisse relancer.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const DELAI_FERMETURE_MS = 4 * 60 * 1000; // 4 minutes
    const now = new Date();
    const limite = new Date(now.getTime() - DELAI_FERMETURE_MS);

    // 🌍 FILTRE PAR PAYS — Récupérer tous les pays actifs
    const paysActifs = await base44.asServiceRole.entities.Country.filter({ actif: true });
    const countryCodes = paysActifs.map(p => p.code);
    
    console.log(`[FERMETURE] 🌍 Pays actifs: ${countryCodes.join(', ')}`);
    
    // Chercher toutes les courses encore en recherche_livreur TOUS PAYS CONFONDUS
    const coursesEnRecherche = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'recherche_livreur',
    }, '-created_date', 500);
    
    // Filtrer manuellement par pays actifs (sécurité)
    const coursesFiltrees = coursesEnRecherche.filter(c => countryCodes.includes(c.country_code));
    
    console.log(`[FERMETURE] 📊 ${coursesFiltrees.length} courses en recherche (sur ${coursesEnRecherche.length} totales)`);

    const aFermer = coursesFiltrees.filter(c => new Date(c.created_date) < limite);
    console.log(`[FERMETURE] ⏰ ${aFermer.length} course(s) à fermer (> 4 min sans livreur), sur ${coursesFiltrees.length} en recherche`);

    const fermetures = [];
    for (const c of aFermer) {
      // 1. Passer la course en annulée
      await base44.asServiceRole.entities.CourseExterne.update(c.id, {
        statut: 'annulee',
        dispatch_status: 'expire',
        remarque_livreur: 'Aucun livreur disponible après 4 minutes — fermée automatiquement',
      });
      console.log(`[FERMETURE] ✅ Course ${c.id.slice(-8)} annulée (créée à ${c.created_date})`);

      // 2. Notifier le client
      try {
        let clientEmail = null;

        if (c.created_by_id) {
          try {
            const creator = await base44.asServiceRole.entities.User.get(c.created_by_id);
            clientEmail = creator?.email || null;
          } catch (_) {}
        }

        if (!clientEmail && c.expediteur_client_id) {
          const clients = await base44.asServiceRole.entities.ClientExterne.filter({ id: c.expediteur_client_id });
          clientEmail = clients?.[0]?.user_email || null;
        }

        if (clientEmail) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '😔 Aucun livreur disponible',
            message: "Nous n'avons pas trouvé de livreur disponible pour votre course. Vous pouvez relancer la recherche ou créer une nouvelle course.",
            type: 'course_annulee',
            course_id: c.id,
            destinataire_email: clientEmail,
            lue: false,
          });
          console.log(`[FERMETURE] 📩 Client notifié : ${clientEmail}`);
        }
      } catch (err) {
        console.warn('[FERMETURE] ⚠️ Erreur notification client:', err.message);
      }

      fermetures.push({ course_id: c.id, created_date: c.created_date });
    }

    console.log(`[FERMETURE] ✅ Terminé : ${fermetures.length} course(s) fermée(s)`);
    return Response.json({ success: true, fermees: fermetures.length, details: fermetures });

  } catch (error) {
    console.error('[FERMETURE] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});