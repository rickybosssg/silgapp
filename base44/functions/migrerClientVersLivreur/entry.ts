import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Migration instantanée Client Externe → Livreur Externe
 * 
 * Règles :
 * 1. Récupérer l'email du client
 * 2. Créer automatiquement le profil livreur
 * 3. Copier : nom, prénom, téléphone, email, photo, pays, ville/quartier
 * 4. Validation automatique (pas d'attente)
 * 5. Éviter les doublons par email
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Vérifier auth admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin uniquement' }, { status: 403 });
    }

    const { client_id } = await req.json();
    
    if (!client_id) {
      return Response.json({ error: 'client_id requis' }, { status: 400 });
    }

    // 1. Récupérer le client
    const clients = await base44.entities.ClientExterne.filter({ id: client_id });
    const client = clients[0];
    
    if (!client) {
      return Response.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    // 2. Vérifier doublon par email
    if (client.user_email) {
      const livreursExistants = await base44.entities.Livreur.filter({ 
        user_email: client.user_email,
        type_livreur: 'externe'
      });
      
      if (livreursExistants.length > 0) {
        // Supprimer le client quand même car il est déjà livreur
        await base44.entities.ClientExterne.delete(client.id);
        return Response.json({ 
          error: 'Déjà livreur',
          message: 'Cet utilisateur est déjà enregistré comme livreur externe.',
          livreur_id: livreursExistants[0].id
        }, { status: 409 });
      }
    }

    // 3. Créer le livreur externe automatiquement
    const nouveauLivreur = {
      reseau: 'externe',
      type_livreur: 'externe',
      country_code: client.country_code || 'BF',
      prenom: client.prenom || '',
      nom: client.nom || '',
      telephone: client.telephone || '',
      user_email: client.user_email || '',
      quartier: client.quartier || '',
      ville: client.ville || '',
      latitude: client.latitude || null,
      longitude: client.longitude || null,
      validation: 'valide', // ✅ Validation automatique
      actif: true,
      statut: 'disponible', // ✅ Disponible immédiatement
      app_active: false,
      last_seen_at: new Date().toISOString(),
      derniere_position_date: client.last_seen_at || new Date().toISOString(),
      vehicule: 'moto', // Véhicule par défaut
      type_vehicule: 'moto',
      courses_du_jour: 0,
      note_moyenne: 0,
      nombre_avis: 0,
      montant_du_silga: 0,
      statut_paiement: 'non_paye',
    };

    // 4. Créer le livreur
    const created = await base44.entities.Livreur.create(nouveauLivreur);
    
    // 5. Générer code d'identification unique
    const codeIdentification = `LIV${client.country_code || 'BF'}${Date.now().toString().slice(-6)}`;
    await base44.entities.Livreur.update(created.id, {
      code_identification: codeIdentification
    });

    // 6. Supprimer le client de la base de données clients
    await base44.entities.ClientExterne.delete(client.id);

    console.log(`✅ Migration réussie : ${client.user_email || client.telephone} → Livreur Externe ${created.id} (client supprimé)`);

    return Response.json({
      success: true,
      message: `${client.prenom || ''} ${client.nom || ''} est maintenant livreur externe !`,
      livreur: {
        id: created.id,
        nom: nouveauLivreur.nom,
        prenom: nouveauLivreur.prenom,
        email: nouveauLivreur.user_email,
        telephone: nouveauLivreur.telephone,
        code_identification: codeIdentification,
        statut: nouveauLivreur.statut,
        validation: nouveauLivreur.validation,
        country_code: nouveauLivreur.country_code
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur migration:', error);
    return Response.json({ 
      error: error.message || 'Erreur migration' 
    }, { status: 500 });
  }
});