import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { preloadDialCodes } from '../../shared/crmEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getClientsStats — KPI clients BULK depuis les vraies CourseExterne
// ═══════════════════════════════════════════════════════════════════════════
//
// Source de vérité : CourseExterne (pas nb_courses_total)
// Matching : client_phone_normalized ↔ ClientExterne.telephone_normalized
//            client_user_email ↔ ClientExterne.user_email
//
// SEMANTIQUE : "A commandé" = le client est le DEMANDEUR de la course.
// Les expéditeurs et destinataires ne sont PAS comptés comme "ayant commandé".
//
// Opérations API : ~4-6 (load clients paginated + load courses paginated)
// Aucun N+1.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { country_code } = body || {};

    if (!country_code) {
      return Response.json({ error: 'country_code requis' }, { status: 400 });
    }

    await preloadDialCodes(base44, country_code);

    // ── 1. Charger tous les ClientExterne du pays (paginé) ──
    const clients: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.ClientExterne.filter(
        { actif: true, country_code },
        '-created_date',
        limit,
        skip
      );
      clients.push(...(batch || []));
      if (!batch || batch.length < limit) break;
      skip += limit;
      if (skip > 2000) break; // safety
    }

    // ── 2. Charger toutes les CourseExterne du pays (paginé) ──
    const courses: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code },
        '-created_date',
        limit,
        skip
      );
      courses.push(...(batch || []));
      if (!batch || batch.length < limit) break;
      skip += limit;
      if (skip > 5000) break; // safety
    }

    // ── 3. Construire les maps en mémoire ──
    // Map: telephone_normalized → [courses où cette personne est le DEMANDEUR]
    const phoneToCourses = new Map<string, any[]>();
    // Map: user_email → [courses où cette personne est le DEMANDEUR]
    const emailToCourses = new Map<string, any[]>();

    for (const c of courses) {
      const phone = (c.client_phone_normalized || '').trim();
      if (phone) {
        if (!phoneToCourses.has(phone)) phoneToCourses.set(phone, []);
        phoneToCourses.get(phone).push(c);
      }
      const email = (c.client_user_email || '').trim().toLowerCase();
      if (email) {
        if (!emailToCourses.has(email)) emailToCourses.set(email, []);
        emailToCourses.get(email).push(c);
      }
    }

    // ── 4. Calculer les KPI ──
    const phoneSet = new Set<string>();
    let app = 0;
    let crm = 0;
    let jamaisCommande = 0;
    let avecCourseCreee = 0;
    let avecCourseLivree = 0;
    let courseCreeeNonLivree = 0;

    for (const c of clients) {
      const phone = (c.telephone_normalized || '').trim();
      if (phone) phoneSet.add(phone);

      if (c.user_email) app++;
      if (c.cree_via_crm === true) crm++;

      // Trouver les courses où ce client est le DEMANDEUR
      const byPhone = phone ? (phoneToCourses.get(phone) || []) : [];
      const byEmail = c.user_email ? (emailToCourses.get(c.user_email.toLowerCase()) || []) : [];

      // Dédupliquer par course.id
      const seenIds = new Set<string>();
      const clientCourses: any[] = [];
      for (const course of [...byPhone, ...byEmail]) {
        if (!seenIds.has(course.id)) {
          seenIds.add(course.id);
          clientCourses.push(course);
        }
      }

      if (clientCourses.length === 0) {
        jamaisCommande++;
      } else {
        avecCourseCreee++;
        const hasLivree = clientCourses.some(c => c.statut === 'livree');
        if (hasLivree) {
          avecCourseLivree++;
        } else {
          courseCreeeNonLivree++;
        }
      }
    }

    return Response.json({
      success: true,
      country_code,
      total_clients: clients.length,
      clients_uniques: phoneSet.size,
      clients_app: app,
      clients_crm: crm,
      jamais_commande: jamaisCommande,
      avec_course_creee: avecCourseCreee,
      avec_course_livree: avecCourseLivree,
      course_creee_non_livree: courseCreeeNonLivree,
      total_courses_loaded: courses.length,
      api_calls: Math.ceil(clients.length / limit) + Math.ceil(courses.length / limit),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}