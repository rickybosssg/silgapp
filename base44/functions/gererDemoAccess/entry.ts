import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json();
    const { action } = payload; // "create", "revoke", "list"

    if (action === 'create') {
      // Générer un token unique
      const token = crypto.randomUUID();
      const expireLe = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 jours

      await base44.asServiceRole.entities.DemoAccess.create({
        token,
        expire_le: expireLe,
        actif: true,
        cree_par: user.email,
        note: payload.note || "Accès démo créé le " + new Date().toLocaleDateString('fr-FR'),
      });

      const demoUrl = `${Deno.env.get('VITE_BASE44_APP_BASE_URL') || req.headers.get('origin') || ''}/demo/${token}`;

      return Response.json({
        success: true,
        token,
        expire_le: expireLe,
        demo_url: demoUrl,
      });

    } else if (action === 'revoke') {
      const { token } = payload;
      const existing = await base44.asServiceRole.entities.DemoAccess.filter({ token, actif: true });

      if (existing.length === 0) {
        return Response.json({ error: 'Token non trouvé' }, { status: 404 });
      }

      await base44.asServiceRole.entities.DemoAccess.update(existing[0].id, { actif: false });

      return Response.json({ success: true, message: 'Accès révoqué' });

    } else if (action === 'list') {
      const tokens = await base44.asServiceRole.entities.DemoAccess.list('-created_date');
      return Response.json({ tokens });

    } else {
      // Default: vérifier un token
      const { token } = payload;
      const tokens = await base44.asServiceRole.entities.DemoAccess.filter({ token, actif: true });

      if (tokens.length === 0) {
        return Response.json({ valid: false });
      }

      const t = tokens[0];
      const expired = new Date(t.expire_le) < new Date();

      if (expired) {
        await base44.asServiceRole.entities.DemoAccess.update(t.id, { actif: false });
        return Response.json({ valid: false, reason: 'expired' });
      }

      return Response.json({ valid: true, expire_le: t.expire_le });
    }

  } catch (error) {
    console.error('[gererDemoAccess] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
