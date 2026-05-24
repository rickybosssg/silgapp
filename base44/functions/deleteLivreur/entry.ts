import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { id } = await req.json();
    if (!id) return Response.json({ success: false, error: 'id requis' }, { status: 400 });
    await base44.asServiceRole.entities.Livreur.delete(id);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});