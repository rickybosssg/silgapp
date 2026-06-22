import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Vérifier que l'utilisateur est admin ou le livreur concerné
    const { livreur_id, photo_url } = await req.json();

    if (!livreur_id || !photo_url) {
      return Response.json({ error: 'livreur_id et photo_url requis' }, { status: 400 });
    }

    // Vérification permissions
    const livreur = await base44.entities.Livreur.filter({ id: livreur_id }).then(r => r?.[0]);
    if (!livreur) {
      return Response.json({ error: 'Livreur non trouvé' }, { status: 404 });
    }

    // Seuls admin et le livreur lui-même peuvent modifier la photo
    const isAdmin = user.role === 'admin';
    const isLivreur = livreur.user_email === user.email;

    if (!isAdmin && !isLivreur) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Mise à jour de la photo
    await base44.entities.Livreur.update(livreur_id, { photo_url });

    return Response.json({
      success: true,
      message: 'Photo mise à jour',
      photo_url
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
