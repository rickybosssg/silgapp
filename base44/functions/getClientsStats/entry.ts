import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { preloadDialCodes } from '../../shared/crmEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getClientsStats — KPI clients BULK par PERSONNE UNIQUE HYBRIDE
// ═══════════════════════════════════════════════════════════════════════════
//
// IDENTITÉ UNIQUE HYBRIDE :
//   PRIORITÉ 1 : telephone_normalized (1 téléphone = 1 personne)
//   PRIORITÉ 2 : user_email normalisé (fallback pour clients App sans téléphone)
//
// Un profil avec téléphone + email n'est JAMAIS compté deux fois.
// Les courses sont reliées par téléphone OU par client_user_email.
//
// SEMANTIQUE : "A commandé" = le client est le DEMANDEUR de la course
// (client_phone_normalized ou client_user_email).
//
// Opérations API : ~8-10 (load clients + courses + users paginés)
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

    // ── 3. Charger tous les User du pays (paginé) pour vérifier user_email ──
    const users: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.User.list(null, 200, skip);
      users.push(...(batch || []));
      if (!batch || batch.length < 200) break;
      skip += 200;
      if (skip > 2000) break;
    }
    const userEmails = new Set(users.map(u => (u.email || '').trim().toLowerCase()));

    // ── 4. Charger les NotificationToken pour clients (FCM) ──
    const tokens: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.NotificationToken.filter(
        { user_type: 'client' },
        '-created_date',
        200,
        skip
      );
      tokens.push(...(batch || []));
      if (!batch || batch.length < 200) break;
      skip += 200;
      if (skip > 1000) break;
    }
    const tokenEmails = new Set(
      tokens.filter(t => t.actif !== false).map(t => (t.user_email || '').trim().toLowerCase())
    );

    // ── 5. Construire les maps course → phone / email ──
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

    // ── 6. Construire les PERSONNES UNIQUES HYBRIDES ──
    // unique_key = "phone:" + telephone_normalized  (priorité 1)
    //            ou "email:" + lowercase(user_email) (priorité 2, si user_email matche un User réel)
    const uniquePersons = new Map<string, {
      key: string;
      phone: string | null;
      email: string | null;
      isApp: boolean;
      isCrm: boolean;
      profiles: any[];
    }>();

    let profilsSansTelephone = 0;
    let profilsSansTelephoneEtEmail = 0;

    for (const c of clients) {
      const phone = (c.telephone_normalized || '').trim();
      const email = (c.user_email || '').trim().toLowerCase();

      if (!phone) {
        profilsSansTelephone++;
        if (!email) {
          profilsSansTelephoneEtEmail++;
          continue;
        }
      }

      let key: string;
      if (phone) {
        key = `phone:${phone}`;
      } else if (email && userEmails.has(email)) {
        key = `email:${email}`;
      } else {
        // Email sans User correspondant — pas une personne unique fiable
        continue;
      }

      if (!uniquePersons.has(key)) {
        uniquePersons.set(key, {
          key,
          phone: phone || null,
          email: email || null,
          isApp: false,
          isCrm: false,
          profiles: [],
        });
      }
      const entry = uniquePersons.get(key);
      entry.profiles.push(c);
      if (email && userEmails.has(email)) entry.isApp = true;
      if (c.cree_via_crm === true) entry.isCrm = true;
    }

    // ── 7. Calculer les KPI par PERSONNE UNIQUE ──
    let jamaisCommande = 0;
    let creeeNonLivree = 0;
    let auMoinsUneLivree = 0;
    let appUniques = 0;
    let crmUniques = 0;
    let crmThenApp = 0;
    let appAvecFcm = 0;
    let appSansFcm = 0;
    let identifieParTelephone = 0;
    let identifieParEmail = 0;

    for (const [key, entry] of uniquePersons) {
      // Trouver les courses de cette personne (phone + email)
      const seenIds = new Set<string>();
      const clientCourses: any[] = [];
      for (const course of (phoneToCourses.get(entry.phone) || [])) {
        if (!seenIds.has(course.id)) { seenIds.add(course.id); clientCourses.push(course); }
      }
      if (entry.email) {
        for (const course of (emailToCourses.get(entry.email) || [])) {
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

      // Classification App/CRM (mutuellement exclusive)
      if (entry.isApp && entry.isCrm) {
        crmThenApp++;
      } else if (entry.isApp) {
        appUniques++;
      } else if (entry.isCrm) {
        crmUniques++;
      }

      // FCM
      if (entry.isApp) {
        if (entry.email && tokenEmails.has(entry.email)) {
          appAvecFcm++;
        } else {
          appSansFcm++;
        }
      }

      // Identification
      if (entry.phone) {
        identifieParTelephone++;
      } else {
        identifieParEmail++;
      }
    }

    const uniqueTotal = uniquePersons.size;
    const doublonsEcarts = clients.length - profilsSansTelephoneEtEmail - uniqueTotal;

    return Response.json({
      success: true,
      country_code,
      // ── KPI par PERSONNE UNIQUE HYBRIDE ──
      personnes_uniques: uniqueTotal,
      jamais_commande: jamaisCommande,
      creee_non_livree: creeeNonLivree,
      au_moins_une_livree: auMoinsUneLivree,
      // ── Identification ──
      identifie_par_telephone: identifieParTelephone,
      identifie_par_email: identifieParEmail,
      non_identifiables: profilsSansTelephoneEtEmail,
      // ── App / CRM (mutuellement exclusifs) ──
      clients_app_uniques: appUniques,
      clients_crm_uniques: crmUniques,
      crm_puis_app: crmThenApp,
      // ── FCM ──
      app_avec_fcm: appAvecFcm,
      app_sans_fcm: appSansFcm,
      // ── Qualité de la base ──
      total_profiles: clients.length,
      profils_sans_telephone: profilsSansTelephone,
      profils_sans_telephone_et_email: profilsSansTelephoneEtEmail,
      doublons_ecartes: doublonsEcarts,
      // ── Technique ──
      total_courses_loaded: courses.length,
      api_calls: Math.ceil(clients.length / limit) + Math.ceil(courses.length / limit) + Math.ceil(users.length / 200) + Math.ceil(tokens.length / 200),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}