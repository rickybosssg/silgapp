import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { data } = await req.json();
    if (!data) return Response.json({ success: false, error: 'data requis' }, { status: 400 });

    // Vérifier unicité du code
    const codeIdentification = String(data.code_identification || '').toUpperCase().trim();
    const existing = await base44.asServiceRole.entities.Livreur.filter({ code_identification: codeIdentification });
    if (existing && existing.length > 0) {
      return Response.json({ success: false, error: "Ce code d'identification est déjà utilisé" }, { status: 409 });
    }

    const created = await base44.asServiceRole.entities.Livreur.create({
      ...data,
      code_identification: codeIdentification,
      validation: 'valide',
      statut: 'hors_ligne',
      actif: true,
    });
    return Response.json({ success: true, livreur: created });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});