import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ecoAdminSettings } from '../../shared/ecoAdminSettings.js';

Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req);
    let user;
    try {
      user = await api.auth.me();
    } catch (error: any) {
      const status = Number(error?.response?.status ?? error?.status);
      if (status === 401 || status === 403) {
        return Response.json({ success: false, error: status === 401 ? 'Authentification requise.' : 'Accès non autorisé.' }, { status });
      }
      throw error;
    }
    const result = await ecoAdminSettings(api.asServiceRole.entities, user, await req.json());
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ success: false, error: error.guest_public ? error.message : 'Configuration indisponible.' }, { status: error.guest_public ? error.status : 503 });
  }
});
