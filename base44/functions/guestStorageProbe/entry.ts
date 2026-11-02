import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
Deno.serve(async req => {
  if (Date.now() >= Date.parse('2026-11-03T00:00:00Z')) return Response.json({ error: 'expired' }, { status: 410 });
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  try {
    const api = createClientFromRequest(req), user = await api.auth.me();
    if (!user) return Response.json({ error: 'authentication_required' }, { status: 401 });
    const { action } = await req.json();
    if (!['service', 'fixture'].includes(action)) return Response.json({ error: 'action' }, { status: 400 });
    if (action === 'service' && user.role !== 'admin') return Response.json({ error: 'admin_required' }, { status: 403 });
    const entity = api.asServiceRole.entities.GuestOrderStoragePage;
    const scope = 'storage-probe-20261102';
    const rows = await entity.filter({ scope }, 'created_date', 2);
    if (rows.length > 1) return Response.json({ error: 'duplicate_fixture' }, { status: 409 });
    let row = rows[0];
    if (!row && action === 'service') row = await entity.create({ scope, payload: JSON.stringify({ fictive: true, padding: 'x'.repeat(3800) }) });
    if (!row) return Response.json({ error: 'fixture_absent' }, { status: 404 });
    const readBack = await entity.get(row.id);
    const payload = JSON.parse(readBack.payload);
    return Response.json({ id: row.id, service_read: true, intact: payload.fictive === true && payload.padding?.length === 3800, bytes: new TextEncoder().encode(readBack.payload).length });
  } catch (e) { return Response.json({ error: 'probe_failed', status: Number(e?.status || e?.response?.status) || 503 }, { status: 503 }); }
});
