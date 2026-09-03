import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }

    const body = await req.json();
    const { token, platform, livreur_id, client_id, user_email, user_type, device_id } = body;
    const normalizedDeviceId = device_id ? String(device_id).trim() : '';
    console.log('[enregistrerTokenPush] Request received', {
      platform,
      hasToken: !!token,
      tokenPrefix: token ? String(token).slice(0, 16) : '',
      tokenIsWeb: token ? String(token).startsWith('web_') : false,
      livreur_id: livreur_id || '',
      client_id: client_id || '',
      user_email: user_email ? String(user_email).trim().toLowerCase() : '',
      user_type: user_type || '',
      device_id: normalizedDeviceId || '',
    });

    if (!token) {
      return Response.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!user_email) {
      return Response.json({ error: 'user_email is required' }, { status: 400 });
    }

    const normalizedPlatform = platform || 'android';
    const normalizedEmail = String(user_email).trim().toLowerCase();
    const authenticatedEmail = String(user.email || '').trim().toLowerCase();
    if (user.role !== 'admin' && normalizedEmail !== authenticatedEmail) {
      return Response.json({ error: 'Impossible d’enregistrer un token pour un autre utilisateur' }, { status: 403 });
    }

    // Résoudre le user_type correct
    let resolvedUserType = 'livreur';
    if (user_type === 'client') resolvedUserType = 'client';
    else if (user_type === 'admin') resolvedUserType = 'admin';
    else if (user_type === 'partenaire') resolvedUserType = 'partenaire';
    else if (client_id && !livreur_id) resolvedUserType = 'client';

    const existingTokens = await base44.asServiceRole.entities.NotificationToken.filter({
      token,
      platform: normalizedPlatform,
    });

    const payload = {
      user_email: normalizedEmail,
      token,
      platform: normalizedPlatform,
      user_type: resolvedUserType,
      livreur_id: livreur_id || '',
      client_id: client_id || '',
      device_id: normalizedDeviceId,
      actif: true,
      derniere_utilisation: new Date().toISOString(),
    };

    if (existingTokens.length > 0) {
      await base44.asServiceRole.entities.NotificationToken.update(existingTokens[0].id, payload);
      if (!String(token).startsWith('web_')) {
        // ── MULTI-APPAREIL : désactiver uniquement les anciens tokens
        //    du MÊME user_email ET du MÊME device_id ──
        // Si device_id est absent (ancien token ou erreur natif),
        // NE PAS désactiver (compatibilité — évite la désactivation massive).
        if (normalizedDeviceId) {
          const currentCreatedMs = new Date(existingTokens[0].created_date || Date.now()).getTime();
          const sameUserSameDeviceTokens = await base44.asServiceRole.entities.NotificationToken.filter({
            user_email: normalizedEmail,
            user_type: resolvedUserType,
            actif: true,
          });
          await Promise.all((sameUserSameDeviceTokens || [])
            .filter(item =>
              item.id !== existingTokens[0].id &&
              !String(item.token || '').startsWith('web_') &&
              String(item.device_id || '') === normalizedDeviceId &&
              new Date(item.created_date || 0).getTime() < currentCreatedMs
            )
            .map(item => base44.asServiceRole.entities.NotificationToken.update(item.id, { actif: false })));
        }

        // ── COMPTE A/B : un token natif = un compte actif à la fois ──
        // Désactiver tous les tokens actifs portant le MÊME token natif
        // mais appartenant à un AUTRE user_email (changement de compte).
        // Ne touche pas les autres appareils du compte A (tokens différents).
        const sameTokenDiffUser = await base44.asServiceRole.entities.NotificationToken.filter({
          token,
          actif: true,
        });
        await Promise.all((sameTokenDiffUser || [])
          .filter(item =>
            item.id !== existingTokens[0].id &&
            String(item.user_email || '').toLowerCase() !== normalizedEmail
          )
          .map(item => base44.asServiceRole.entities.NotificationToken.update(item.id, { actif: false })));
      }
      console.log('[enregistrerTokenPush] Token updated', {
        id: existingTokens[0].id,
        platform: normalizedPlatform,
        user_email: normalizedEmail,
        user_type: resolvedUserType,
        device_id: normalizedDeviceId || '',
      });
      return Response.json({ success: true, action: 'updated', user_email: normalizedEmail, user_type: resolvedUserType });
    }

    const created = await base44.asServiceRole.entities.NotificationToken.create(payload);
    if (!String(token).startsWith('web_')) {
      // ── MULTI-APPAREIL : désactiver uniquement les anciens tokens
      //    du MÊME user_email ET du MÊME device_id ──
      if (normalizedDeviceId) {
        const currentCreatedMs = new Date(created.created_date || Date.now()).getTime();
        const sameUserSameDeviceTokens = await base44.asServiceRole.entities.NotificationToken.filter({
          user_email: normalizedEmail,
          user_type: resolvedUserType,
          actif: true,
        });
        await Promise.all((sameUserSameDeviceTokens || [])
          .filter(item =>
            item.id !== created.id &&
            !String(item.token || '').startsWith('web_') &&
            String(item.device_id || '') === normalizedDeviceId &&
            new Date(item.created_date || 0).getTime() < currentCreatedMs
          )
          .map(item => base44.asServiceRole.entities.NotificationToken.update(item.id, { actif: false })));
      }

      // ── COMPTE A/B : un token natif = un compte actif à la fois ──
      const sameTokenDiffUser = await base44.asServiceRole.entities.NotificationToken.filter({
        token,
        actif: true,
      });
      await Promise.all((sameTokenDiffUser || [])
        .filter(item =>
          item.id !== created.id &&
          String(item.user_email || '').toLowerCase() !== normalizedEmail
        )
        .map(item => base44.asServiceRole.entities.NotificationToken.update(item.id, { actif: false })));
    }
    console.log('[enregistrerTokenPush] Token created', {
      platform: normalizedPlatform,
      user_email: normalizedEmail,
      user_type: resolvedUserType,
      native: !String(token).startsWith('web_'),
    });
    return Response.json({ success: true, action: 'created', user_email: normalizedEmail, user_type: resolvedUserType });
  } catch (error) {
    console.error('[enregistrerTokenPush] Error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});