import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { guestSuperAdmin } from '../../shared/guestOrderPolicy.js';
import { guestStorageMigration } from '../../shared/guestStorageMigration.js';
Deno.serve(async req => {
  if (Date.now() >= Date.parse('2026-11-03T00:00:00Z')) return Response.json({ error: 'expired' }, { status: 410 });
  if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  try {
    const api = createClientFromRequest(req);
    guestSuperAdmin(await api.auth.me());
    const body = await req.json();
    if (!body || Object.keys(body).some(k => k !== 'action') || !['inspect', 'freeze', 'migrate', 'rollbackFrozen'].includes(body.action)) return Response.json({ error: 'action' }, { status: 400 });
    const service = guestStorageMigration(api.asServiceRole.entities);
    return Response.json(await service[body.action]());
  } catch (e) {
    const code = /^MIGRATION_[A-Z_]+$/.test(e?.message || '') ? e.message : 'MIGRATION_UNAVAILABLE';
    return Response.json({ error: code, status: Number(e?.status || e?.response?.status) || 503 }, { status: e?.guest_public ? e.status : 503 });
  }
});
