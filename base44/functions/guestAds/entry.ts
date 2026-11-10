import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { createGuestAdsService } from '../../shared/guestAds.js';

/** Public advertising content only. No entity permission changes or private audience data. */
export default async function(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Id' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return Response.json({ success: false, code: 'METHOD_INVALID' }, { status: 405, headers });
  try {
    const reader = req.body?.getReader();
    const decoder = new TextDecoder();
    let raw = '', size = 0;
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) { await reader.cancel(); return Response.json({ success: false, code: 'INPUT_TOO_LARGE' }, { status: 413, headers }); }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
    }
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ success: false, code: 'INPUT_INVALID' }, { status: 400, headers }); }
    // No production metrics adapter: never open Publicite/PubliciteVue writes to guests.
    const service = createGuestAdsService({
      listAds: async () => {
        const api = createClientFromRequest(req);
        return api.asServiceRole.entities.Publicite.filter({ actif: true, visible_invites: true, format: 'carrousel' }, 'ordre', 100);
      },
      getAd: async () => null,
    });
    return Response.json(await service(body), { headers });
  } catch (error: any) {
    const known = error?.guestAdPublic === true;
    const status = known ? error.status : Number(error?.status || error?.response?.status) === 429 ? 429 : 503;
    return Response.json({ success: false, code: known ? error.code : status === 429 ? 'RATE_LIMITED' : 'TEMPORARILY_UNAVAILABLE' },
      { status, headers: status === 429 ? { ...headers, 'Retry-After': '60' } : headers });
  }
}
