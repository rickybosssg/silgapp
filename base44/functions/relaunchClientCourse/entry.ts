import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { authorizeClientDecision, canEditSearchPrice, relaunchClientCourse, relaunchView } from '../../shared/clientRelaunch.js';
import { clientDecisionView } from '../../shared/clientDecisionView.js';
import { relaunchDependencies } from '../../shared/clientRelaunchDispatch.ts';

Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req), user = await api.auth.me();
    const body = await req.json();
    if (typeof body.course_id !== 'string' || body.course_id.length > 100) return Response.json({ success: false, error: 'Course requise.' }, { status: 400 });
    const deps = relaunchDependencies(api), course = await deps.entities.CourseExterne.get(body.course_id);
    if (!course) return Response.json({ success: false, error: 'Course indisponible.' }, { status: 404 });
    await authorizeClientDecision(deps.entities, user, course);
    if (body.action === 'context') {
      const countries = await deps.entities.Country.filter({ code: course.country_code }, undefined, 2);
      if (countries.length !== 1 || !countries[0].devise) return Response.json({ success: false, error: 'Configuration du pays indisponible.' }, { status: 503 });
      return Response.json({ success: true, context: { ...relaunchView(course), can_edit_search_price: canEditSearchPrice(course), waiting: clientDecisionView(course).waiting, currency: countries[0].devise, minimum: course.delivery_mode === 'eco' ? 1 : countries[0].prix_minimum } });
    }
    const result = await relaunchClientCourse(deps, course, body);
    return Response.json(result, { status: result.pending ? 202 : 200 });
  } catch (e: any) {
    return Response.json({ success: false, error: e.guest_public ? e.message : 'Relance non confirmee. Conservez votre tentative et actualisez.', code: e.guest_public ? e.code : 'RELAUNCH_UNCERTAIN' }, { status: e.guest_public ? e.status : 503 });
  }
});
