import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const body = await req.json();
    const { subject, message, country_code } = body;
    if (!subject || !message) return Response.json({ error: 'Sujet et message requis' }, { status: 400 });

    // Récupérer tous les livreurs validés avec email
    const filter = { type_livreur: 'externe', validation: 'valide' };
    if (country_code) filter.country_code = country_code;
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(filter, '-created_date', 200);

    const emails = [...new Set(livreurs.map(l => l.user_email).filter(Boolean))];
    if (emails.length === 0) return Response.json({ success: false, error: 'Aucun livreur avec email trouvé' });

    let sent = 0;
    let failed = 0;
    const errors = [];

    // Envoi séquentiel pour éviter surcharge
    for (const email of emails) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body: message,
          from_name: 'SILGAPP',
        });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ email, error: err.message });
      }
    }

    return Response.json({ success: true, total: emails.length, sent, failed, errors: errors.slice(0, 5) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});