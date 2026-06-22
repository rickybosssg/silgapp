import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Récupérer TOUTES les notifications non lues
    let allUnread = [];
    let skip = 0;
    const limit = 200;

    while (true) {
      const batch = await base44.asServiceRole.entities.Notification.filter(
        { lue: false },
        '-created_date',
        limit,
        skip
      );
      if (batch.length === 0) break;
      allUnread = allUnread.concat(batch);
      skip += limit;
    }

    console.log(`[MARQUER LUES] ${allUnread.length} notifications non lues trouvées`);

    // Marquer toutes comme lues en batch
    let marquees = 0;
    const batchSize = 25;

    for (let i = 0; i < allUnread.length; i += batchSize) {
      const batch = allUnread.slice(i, i + batchSize);
      await Promise.all(batch.map(n =>
        base44.asServiceRole.entities.Notification.update(n.id, { lue: true })
      ));
      marquees += batch.length;
    }

    return Response.json({
      success: true,
      marquees: marquees,
      message: `${marquees} notifications marquées comme lues`,
    });
  } catch (error) {
    console.error('[MARQUER LUES] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
