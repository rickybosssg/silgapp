import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type_course, expediteur_client_id, destinataire_client_id, created_by_id } = body;

    // Validation : empêcher les rôles incompatibles
    const errors = [];

    // Règle 1 : Dans une course "expedier", l'expéditeur ne peut pas être le destinataire
    if (type_course === "expedier") {
      if (expediteur_client_id && destinataire_client_id && expediteur_client_id === destinataire_client_id) {
        errors.push("Dans une expédition, l'expéditeur et le destinataire doivent être différents");
      }
    }

    // Règle 2 : Dans une course "recevoir", la personne chez qui récupérer (expéditeur) ne peut pas être le destinataire
    // Car "recevoir" = je demande à ce qu'on récupère un colis CHEZ quelqu'un pour me l'apporter
    // Le destinataire = moi (le créateur), la personne chez qui récupérer = quelqu'un d'autre
    if (type_course === "recevoir") {
      // expediteur_client_id = personne chez qui récupérer
      // destinataire_client_id = client qui demande (créateur)
      // Ils doivent être DIFFÉRENTS
      if (expediteur_client_id && destinataire_client_id && expediteur_client_id === destinataire_client_id) {
        errors.push("Dans une demande de réception, vous ne pouvez pas demander de récupérer un colis chez vous-même");
      }
    }

    // Règle 3 : Vérifier qu'au moins un des deux clients existe
    if (!expediteur_client_id && !destinataire_client_id) {
      errors.push("Au moins un client (expéditeur ou destinataire) doit être renseigné");
    }

    if (errors.length > 0) {
      return Response.json({ 
        valid: false, 
        errors 
      }, { status: 400 });
    }

    return Response.json({ 
      valid: true,
      message: "Course valide - rôles cohérents"
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      valid: false 
    }, { status: 500 });
  }
});