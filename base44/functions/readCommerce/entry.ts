import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { readCommerce } from '../../shared/commerceReadPolicy.js';
import { resolveCommerceAdminScope } from '../../shared/commerceAdminGrant.js';

// Prepared only: do not deploy until the RLS/front-end migration is approved.
Deno.serve(async (req) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
  try {
    const api = createClientFromRequest(req);
    const user = await api.auth.me();
    if (!user?.id || !user?.email) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers });
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers }); }
    const scope = body?.audience === 'admin' ? resolveCommerceAdminScope(user, Deno.env.get('COMMERCE_ADMIN_GRANTS_JSON')) : null;
    const result = await readCommerce(api, user, body, scope);
    return Response.json({ success: true, ...result }, { headers });
  } catch (error) {
    const failure = (error && typeof error === 'object' ? error : {}) as {code?:string;status?:number};
    const status = [400,401,403,404,503].includes(failure.status ?? 0) ? failure.status : 503;
    const codes = ['ORDER_NOT_FOUND','FINANCE_FORBIDDEN','TRUSTED_ADMIN_SCOPE_REQUIRED','INVALID_PAGINATION','AUTH_REQUIRED','INVALID_ID','COUNTRY_REQUIRED','INVALID_STORED_ITEMS','INVALID_READ_RESPONSE','ADMIN_REQUIRED','ADMIN_COUNTRY_FORBIDDEN','OWNER_PROFILE_REQUIRED','INVALID_REQUEST','INVALID_TYPE','UNSUPPORTED_VIEW','PARTNER_FORBIDDEN','COUNTRY_MISMATCH','SCOPE_MISMATCH','CATALOGUE_FORBIDDEN'];
    return Response.json({ error: codes.includes(failure.code || '') ? failure.code : 'READ_UNAVAILABLE' }, { status, headers });
  }
});



