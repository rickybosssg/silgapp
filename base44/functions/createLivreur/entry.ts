import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    console.log("🔵 [createLivreur] Requête reçue");
    const base44 = createClientFromRequest(req);
    const { data } = await req.json();
    console.log("📦 [createLivreur] Data:", data);
    
    if (!data) {
      console.log("❌ [createLivreur] Data manquante");
      return Response.json({ success: false, error: 'data requis' }, { status: 400 });
    }

    // Vérifier unicité du code
    const countryCode = String(data.country_code || '').trim().toUpperCase();
    if (!countryCode) {
      console.error('[createLivreur][CRITICAL_COUNTRY_MISSING] country_code obligatoire absent');
      return Response.json({
        success: false,
        error: 'country_code obligatoire pour creer un livreur',
        blocked_reason: 'missing_livreur_country_code',
      }, { status: 400 });
    }

    const codeIdentification = String(data.code_identification || '').toUpperCase().trim();
    console.log("🔍 [createLivreur] Code à vérifier:", codeIdentification);
    const existing = await base44.asServiceRole.entities.Livreur.filter({ code_identification: codeIdentification });
    if (existing && existing.length > 0) {
      console.log("⚠️ [createLivreur] Code déjà utilisé");
      return Response.json({ success: false, error: "Ce code d'identification est déjà utilisé" }, { status: 409 });
    }

    console.log("✅ [createLivreur] Création du livreur...");
    const created = await base44.asServiceRole.entities.Livreur.create({
      ...data,
      country_code: countryCode,
      code_identification: codeIdentification,
      validation: 'valide',   // Toujours valide quand créé par admin
      statut: 'hors_ligne',
      actif: true,            // Toujours actif dès la création
      app_active: false,
      courses_du_jour: 0,
      note_moyenne: 0,
      nombre_avis: 0,
      montant_du_silga: 0,
      statut_paiement: 'non_paye',
    });
    console.log("✅ [createLivreur] Livreur créé:", created.id);
    return Response.json({ success: true, livreur: created });
  } catch (error) {
    console.error("❌ [createLivreur] Erreur:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
