import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { mergeClients } from "../../shared/crmEngine.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const body = await req.json();
    const { source_client_id, target_client_id } = body || {};

    if (!source_client_id || !target_client_id) {
      return Response.json({ error: 'source_client_id et target_client_id requis' }, { status: 400 });
    }

    const result = await mergeClients(base44, source_client_id, target_client_id);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}