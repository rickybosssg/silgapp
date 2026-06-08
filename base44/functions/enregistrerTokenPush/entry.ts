import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { token, platform, livreur_id, client_id, user_email, user_type } = body;

    if (!token) {
      return Response.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!user_email) {
      return Response.json({ error: 'user_email is required' }, { status: 400 });
    }

    const normalizedPlatform = platform || 'android';
    const normalizedEmail = String(user_email).trim().toLowerCase();

    // Résoudre le user_type correct
    let resolvedUserType = 'livreur';
    if (user_type === 'client') resolvedUserType = 'client';
    else if (user_type === 'admin') resolvedUserType = 'admin';
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
      actif: true,
      derniere_utilisation: new Date().toISOString(),
    };

    if (existingTokens.length > 0) {
      await base44.asServiceRole.entities.NotificationToken.update(existingTokens[0].id, payload);
      return Response.json({ success: true, action: 'updated', user_email: normalizedEmail, user_type: resolvedUserType });
    }

    await base44.asServiceRole.entities.NotificationToken.create(payload);
    return Response.json({ success: true, action: 'created', user_email: normalizedEmail, user_type: resolvedUserType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});