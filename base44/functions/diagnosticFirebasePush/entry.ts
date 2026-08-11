import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getFirebaseConfig, signJwt, FCM_TOKEN_URL } from '../../shared/fcmUtils.ts';

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);
    const cfg = getFirebaseConfig();
    const result = {
      source: cfg.source,
      projectId: cfg.projectId || null,
      clientEmailPresent: !!cfg.clientEmail,
      privateKeyPresent: !!cfg.privateKey,
      accessTokenOk: false,
      accessTokenError: null,
    };

    if (!cfg.projectId || !cfg.clientEmail || !cfg.privateKey) {
      return Response.json({ success: false, ...result, error: 'Firebase credentials incomplete' });
    }

    const assertion = await signJwt(cfg.clientEmail, cfg.privateKey);
    const response = await fetch(FCM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const payload = await response.json();
    result.accessTokenOk = response.ok && !!payload.access_token;
    result.accessTokenError = response.ok ? null : payload.error_description || payload.error || JSON.stringify(payload);

    return Response.json({ success: result.accessTokenOk, ...result });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});