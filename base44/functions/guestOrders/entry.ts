import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { createGuestOrdersService } from '../../shared/guestOrders.js';
import { createGuestStore } from '../../shared/guestOrderStore.js';
import { failGuest, isGuestCourse, guestCanCancel } from '../../shared/guestOrderPolicy.js';
import { cancelCourseTerminal, expireCancelledCourseOffers, updateActiveCourse } from '../../shared/courseTerminalGuard.ts';
import { publierCourseDansFil } from '../../shared/dispatchV2.ts';
import { genererReferenceCourse } from '../../shared/venusCourseReference.ts';

export default async function(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Id' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return Response.json({ error: 'Méthode non autorisée.' }, { status: 405, headers });
  try {
    const reader = req.body?.getReader();
    const decoder = new TextDecoder();
    let text = '', size = 0;
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 8192) { await reader.cancel(); return Response.json({ error: 'Requête trop volumineuse.' }, { status: 413, headers }); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    }
    let body;
    try { body = JSON.parse(text); } catch { return Response.json({ error: 'Requête invalide.' }, { status: 400, headers }); }
    if (!body || Array.isArray(body) || typeof body !== 'object') return Response.json({ error: 'Requête invalide.' }, { status: 400, headers });
    const api = createClientFromRequest(req);
    const entities = api.asServiceRole.entities;
    const publish = async (course: any) => {
      if (!isGuestCourse(course) || course.enterprise_id || course.client_user_email || course.annulation_user_id || ['livree', 'annulee', 'terminee'].includes(course.statut)) failGuest('SCOPE', 'Publication refusée.', 409);
      // Read only: the historical isV2Enabled helper may provision a missing flag.
      const flags = await entities.AppConfig.filter({ cle: 'DISPATCH_V2_ENABLED' }, 'created_date', 2);
      if (flags.length !== 1 || flags[0].valeur !== 'true') return { success: false, reason: 'v2_unavailable' };
      return publierCourseDansFil(api, course);
    };
    const service = createGuestOrdersService({
      store: createGuestStore(api), entities, publish, reference: genererReferenceCourse,
      cancel: async (course: any, actor: string) => {
        const result = await cancelCourseTerminal(api, course.id, actor, 'client', (fresh: any) => {
          if (!isGuestCourse(fresh) || fresh.request_id !== course.request_id || fresh.country_code !== course.country_code || fresh.enterprise_id || !guestCanCancel(fresh)) failGuest('INCIDENT_ADMIN', 'Course modifiée : contactez le support.', 409);
          return {};
        });
        if (!result.success) failGuest('CANCELLATION_REFUSED', result.error || 'Annulation non confirmée.', 409);
        await expireCancelledCourseOffers(api, course.id);
      },
      decide: async (course: any) => {
        if (!await updateActiveCourse(api, course, { client_decision_attendue: false, client_decision_at: new Date().toISOString(),
          client_decision_action: 'chercher_autre_livreur', statut: 'nouvelle', dispatch_status: 'en_attente', accepted_by_livreur_id: '', accepted_at: null })) failGuest('CONCURRENT_UPDATE', 'Course modifiée simultanément.', 409);
        const fresh = await entities.CourseExterne.get(course.id);
        const publication = await publish(fresh);
        if (!publication || !('success' in publication) || publication.success !== true) failGuest('DISPATCH_PENDING', 'La demande est conservée, mais sa diffusion n’est pas confirmée. Actualisez le suivi.', 503);
      },
    });
    let result;
    if (['admin_list', 'set_enabled', 'revoke'].includes(body.action)) result = await service.admin(body, await api.auth.me().catch(() => null));
    else if (body.action === 'config') result = await service.config();
    else if (body.action === 'catalog') result = await service.catalog(body);
    else if (body.action === 'track') result = await service.track(body);
    else if (body.action === 'create') {
      const maintenance = await entities.SystemConfig.filter({ cle: 'APP_ACTIF' }, 'created_date', 2);
      if (maintenance.length > 1 || (maintenance.length && maintenance[0].valeur !== 'true')) failGuest('MAINTENANCE', 'Les nouvelles commandes sont temporairement suspendues.', 503);
      const v2 = await entities.AppConfig.filter({ cle: 'DISPATCH_V2_ENABLED' }, 'created_date', 2);
      if (v2.length !== 1 || v2[0].valeur !== 'true') failGuest('DISPATCH_UNAVAILABLE', 'La recherche de livreur est temporairement indisponible.', 503);
      result = await service.create(body);
    } else if (['cancel', 'retry_dispatch', 'consent'].includes(body.action)) result = await service.act(body);
    else failGuest('ACTION_INVALID', 'Action non autorisée.');
    return Response.json(result, { status: result && 'pending' in result && result.pending ? 202 : 200, headers });
  } catch (error: any) {
    // No request body, raw SDK error, phone or access token in logs/responses.
    const diagnostic_id = crypto.randomUUID();
    const known = error?.guest_public === true && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) && Number.isInteger(error.status);
    const upstreamStatus = Number(error?.response?.status || error?.status);
    const status = known ? error.status : Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 503;
    const code = known ? error.code : status === 429 ? 'RATE_LIMITED' : 'TEMPORARILY_UNAVAILABLE';
    if (status === 429) Object.assign(headers, { 'Retry-After': '30' });
    console.warn('[guestOrders]', { diagnostic_id, code, status });
    return Response.json({ success: false, code, error: known ? error.message : status === 429
      ? 'Service trop sollicité. Attendez avant de réessayer.'
      : 'Service indisponible. Conservez votre tentative et réessayez le suivi.', diagnostic_id }, { status, headers });
  }
}
