import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { authorizeClientDecision, canEditSearchPrice } from '../../shared/clientRelaunch.js';
import { recordSearchActivity, readSearchActivity, searchAttempt } from '../../shared/courseSearchActivity.js';

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    let user;
    try { user = await api.auth.me(); }
    catch (error: any) {
      const status = Number(error?.response?.status ?? error?.status);
      if (status === 401 || status === 403) return Response.json({ success: false, error: 'Authentification requise.' }, { status });
      throw error;
    }
    if (!user?.id || !user.email) return Response.json({ success: false }, { status: 401 });
    const body = await req.json();
    if (typeof body.course_id !== 'string' || body.course_id.length > 100) return Response.json({ success: false }, { status: 400 });
    const entities = api.asServiceRole.entities;
    const course = await entities.CourseExterne.get(body.course_id);
    if (body.action === 'read') {
      await authorizeClientDecision(entities, user, course);
      return Response.json({ success: true, activity: await readSearchActivity(entities, course) });
    }
    if (body.action !== 'view' || body.attempt !== searchAttempt(course) || !canEditSearchPrice(course)) return Response.json({ success: false }, { status: 409 });
    // Normal entity permissions remain mandatory; service access never grants visibility.
    const visible = await api.entities.CourseExterne.get(body.course_id);
    const drivers = await entities.Livreur.filter({ user_email: user.email }, undefined, 2);
    const driver = drivers.length === 1 ? drivers[0] : null;
    const tenant = (v: unknown) => v || null;
    if (!visible?.id || !driver || driver.actif !== true || driver.bloque_encours || driver.statut !== 'disponible'
      || driver.country_code !== course.country_code || (user.country_code && user.country_code !== course.country_code)
      || tenant(driver.enterprise_id) !== tenant(course.enterprise_id) || tenant(user.enterprise_id || user.data?.enterprise_id) !== tenant(course.enterprise_id)) return Response.json({ success: false }, { status: 403 });
    const offers = await entities.DispatchNotification.filter({ course_id: course.id, livreur_id: driver.id }, '-date_notification', 1);
    const since = Date.parse(course.client_relaunch_at || course.created_date || '');
    if (!offers.length || ['refuse', 'expire', 'annule'].includes(offers[0].statut)
      || !Number.isFinite(since) || Date.parse(offers[0].date_notification || '') < since
      || !Number.isFinite(Date.parse(offers[0].date_notification || ''))) return Response.json({ success: false }, { status: 403 });
    await recordSearchActivity(entities, course, driver.id, 'view');
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ success: false, error: e.guest_public ? e.message : 'Mesure momentanément indisponible.' }, { status: e.guest_public ? e.status : 503 });
  }
});
