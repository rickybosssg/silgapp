import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { preloadDialCodes } from '../../shared/crmEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getClientsStats — KPI clients BULK par PERSONNE UNIQUE
// ═══════════════════════════════════════════════════════════════════════════
//
// Déduplication par telephone_normalized (1 téléphone = 1 personne unique).
// Les profils sans téléphone sont comptés séparément (qualité de la base).
//
// SEMANTIQUE : "A commandé" = le client est le DEMANDEUR de la course
// (client_phone_normalized ou client_user_email).
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
      if (skip > 2000) break;
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
      if (skip > 5000) break;
    }

    // ── 3. Construire les maps course → phone / email ──
    const phoneToCourses = new Map<string, any[]>();
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

    // ── 4. Construire les PERSONNES UNIQUES par téléphone ──
    const uniquePersons = new Map<string, {
      phone: string;
      emails: Set<string>;
      hasApp: boolean;
      hasCrm: boolean;
      profiles: any[];
    }>();

    let profilsSansTelephone = 0;

    for (const c of clients) {
      const phone = (c.telephone_normalized || '').trim();
      if (!phone) {
        profilsSansTelephone++;
        continue;
      }
      if (!uniquePersons.has(phone)) {
        uniquePersons.set(phone, {
          phone,
          emails: new Set(),
          hasApp: false,
          hasCrm: false,
          profiles: [],
        });
      }
      const entry = uniquePersons.get(phone);
      entry.profiles.push(c);
      if (c.user_email) {
        entry.emails.add(c.user_email.trim().toLowerCase());
        entry.hasApp = true;
      }
      if (c.cree_via_crm === true) entry.hasCrm = true;
    }

    // ── 5. Calculer les KPI par PERSONNE UNIQUE ──
    let jamaisCommande = 0;
    let creeeNonLivree = 0;
    let auMoinsUneLivree = 0;
    let appUniques = 0;
    let crmUniques = 0;
    let appSansCourse = 0;
    let crmSansCourse = 0;

    for (const [phone, entry] of uniquePersons) {
      // Trouver les courses de cette personne (phone + email)
      const seenIds = new Set<string>();
      const clientCourses: any[] = [];
      for (const course of (phoneToCourses.get(phone) || [])) {
        if (!seenIds.has(course.id)) { seenIds.add(course.id); clientCourses.push(course); }
      }
      for (const email of entry.emails) {
        for (const course of (emailToCourses.get(email) || [])) {
          if (!seenIds.has(course.id)) { seenIds.add(course.id); clientCourses.push(course); }
        }
      }

      const hasLivree = clientCourses.some(c => c.statut === 'livree');
      const hasCreee = clientCourses.length > 0;

      if (!hasCreee) {
        jamaisCommande++;
      } else if (hasLivree) {
        auMoinsUneLivree++;
      } else {
        creeeNonLivree++;
      }

      if (entry.hasApp) {
        appUniques++;
        if (!hasCreee) appSansCourse++;
      }
      if (entry.hasCrm) {
        crmUniques++;
        if (!hasCreee) crmSansCourse++;
      }
    }

    const uniqueTotal = uniquePersons.size;
    const doublonsEcarts = clients.length - profilsSansTelephone - uniqueTotal;

    return Response.json({
      success: true,
      country_code,
      // ── KPI par PERSONNE UNIQUE ──
      personnes_uniques: uniqueTotal,
      jamais_commande: jamaisCommande,
      creee_non_livree: creeeNonLivree,
      au_moins_une_livree: auMoinsUneLivree,
      // ── App / CRM uniques ──
      clients_app_uniques: appUniques,
      clients_crm_uniques: crmUniques,
      clients_app_sans_course: appSansCourse,
      clients_crm_sans_course: crmSansCourse,
      // ── Qualité de la base ──
      total_profiles: clients.length,
      profils_sans_telephone: profilsSansTelephone,
      doublons_ecartes: doublonsEcarts,
      // ── Legacy (pour compatibilité dashboard existant) ──
      total_clients: clients.length,
      clients_uniques: uniqueTotal,
      clients_app: appUniques,
      clients_crm: crmUniques,
      avec_course_creee: creeeNonLivree + auMoinsUneLivree,
      avec_course_livree: auMoinsUneLivree,
      course_creee_non_livree: creeeNonLivree,
      // ── Technique ──
      total_courses_loaded: courses.length,
      api_calls: Math.ceil(clients.length / limit) + Math.ceil(courses.length / limit),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}