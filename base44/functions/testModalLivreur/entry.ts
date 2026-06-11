import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Récupérer le livreur - essayer avec email OU telephone
        let livreurs = await base44.entities.Livreur.filter({ user_email: user.email });
        if (!livreurs || livreurs.length === 0) {
            // Fallback: chercher tous les livreurs et filtrer manuellement
            const allLivreurs = await base44.entities.Livreur.filter({});
            livreurs = allLivreurs.filter(l => l.user_email === user.email);
        }
        
        const livreur = livreurs && livreurs.length > 0 ? livreurs[0] : null;
        
        if (!livreur) {
            return Response.json({ 
                error: 'Livreur not found', 
                user_email: user.email,
                found_count: livreurs?.length || 0
            }, { status: 404 });
        }

        // Créer une notification de test
        const notif = await base44.entities.Notification.create({
            titre: "🚨 COURSE TEST",
            message: "Ceci est un test d'affichage du modal",
            type: "nouvelle_course",
            destinataire_email: user.email,
            lue: false,
        });

        // Créer une course de test liée à cette notification
        const course = await base44.entities.CourseExterne.create({
            country_code: "BF",
            client_nom: "Test Admin",
            client_telephone: "+22670000000",
            type_course: "expedier",
            expediteur_nom: "Test Admin",
            expediteur_telephone: "+22670000000",
            destinataire_nom: "Test Destinataire",
            destinataire_telephone: "+22655555555",
            adresse_depart: "Ouagadougou, Centre",
            adresse_arrivee: "Ouagadougou, Gounghin",
            ville_depart: "Ouagadougou",
            ville_arrivee: "Ouagadougou",
            gps_depart_lat: 12.3714,
            gps_depart_lng: -1.5247,
            gps_arrivee_lat: 12.3580,
            gps_arrivee_lng: -1.5100,
            type_colis: "petit_colis",
            prix_estimate: 1500,
            statut: "recherche_livreur",
            dispatch_status: "propose",
            livreur_id: livreur.id,
            livreur_nom: livreur.prenom + " " + livreur.nom,
            timeout_expires_at: new Date(Date.now() + 300000).toISOString(),
            heure_sollicitation: new Date().toISOString(),
            dispatch_notified_ids: JSON.stringify([livreur.id])
        });

        // Mettre à jour la notification avec l'ID de la course
        await base44.entities.Notification.update(notif.id, { course_id: course.id });

        return Response.json({
            success: true,
            course_id: course.id,
            notif_id: notif.id,
            livreur_id: livreur.id,
            message: "Course de test créée - Actualise l'app pour voir le modal"
        });
    } catch (error) {
        return Response.json({ 
            error: error.message,
            details: error.toString()
        }, { status: 500 });
    }
});