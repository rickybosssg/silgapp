import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Service role pour accéder à toutes les données
        const asService = base44.asServiceRole;

        // Récupérer le payload
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'rappel_24h';

        // Chercher les demandes en attente
        const enAttente = await asService.entities.Livreur.filter({
            validation: "en_attente",
            type_livreur: "externe"
        });

        if (!enAttente || enAttente.length === 0) {
            return Response.json({ success: true, message: "Aucune demande en attente", count: 0 });
        }

        const now = new Date();

        if (action === 'nouveau_livreur') {
            // Notification pour le dernier livreur inscrit
            const dernier = enAttente[enAttente.length - 1];

            await asService.entities.Notification.create({
                type: "demande_livreur",
                titre: " Nouveau livreur en attente",
                message: `${dernier.prenom || ""} ${dernier.nom || "Inconnu"} · ${dernier.telephone || "N/A"} · ${dernier.country_code || "BF"}`,
                lien: "/admin/demandes-livreurs",
                lue: false,
                priorite: "haute",
            });

            return Response.json({
                success: true,
                action: "nouveau_livreur",
                livreur_id: dernier.id,
                total_en_attente: enAttente.length,
            });
        }

        if (action === 'rappel_24h') {
            // Vérifier les demandes de plus de 24h
            const vieillesDemandes = enAttente.filter(d => {
                const created = new Date(d.created_date);
                const diffMs = now - created;
                const diffH = diffMs / (1000 * 60 * 60);
                return diffH >= 24;
            });

            if (vieillesDemandes.length > 0) {
                const noms = vieillesDemandes.slice(0, 3).map(d => `${d.prenom || ""} ${d.nom || "?"}`).join(", ");
                const suffixe = vieillesDemandes.length > 3 ? ` et ${vieillesDemandes.length - 3} autre(s)` : "";

                await asService.entities.Notification.create({
                    type: "demande_livreur_rappel",
                    titre: `⏰ ${vieillesDemandes.length} demande(s) en attente depuis +24h`,
                    message: `${noms}${suffixe} — ${vieillesDemandes.length} dossier(s) non traité(s)`,
                    lien: "/admin/demandes-livreurs",
                    lue: false,
                    priorite: "urgente",
                });
            }

            return Response.json({
                success: true,
                action: "rappel_24h",
                vieilles_demandes: vieillesDemandes.length,
                total_en_attente: enAttente.length,
            });
        }

        return Response.json({ success: false, error: "Action inconnue" }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});