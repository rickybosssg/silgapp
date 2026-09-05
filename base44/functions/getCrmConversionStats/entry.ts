import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

// ═══════════════════════════════════════════════════════════════════════════
// getCrmConversionStats — Tableau de bord conversion CRM → App
// ═══════════════════════════════════════════════════════════════════════════
//
// Charge en bulk tous les ClientExterne, User, NotificationToken, CourseExterne
// et CrmProspection, puis calcule les KPI de conversion par PERSONNE UNIQUE.
//
// IDENTITÉ HYBRIDE : telephone_normalized priorité, user_email fallback.
// Aucun N+1 — ~10-12 appels API pour l'ensemble.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { country_code } = body || {};

    // ── 1. Charger tous les ClientExterne (paginé) ──
    const clients: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
      const filter: any = {};
      if (country_code) filter.country_code = country_code;
      const batch = await base44.asServiceRole.entities.ClientExterne.filter(
        filter, '-created_date', limit, skip
      );
      clients.push(...(batch || []));
      if (!batch || batch.length < limit) break;
      skip += limit;
      if (skip > 3000) break;
    }

    // ── 2. Charger tous les User (paginé) ──
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

    // ── 3. Charger les NotificationToken client natifs actifs ──
    const tokens: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.NotificationToken.filter(
        { user_type: 'client', actif: true },
        '-created_date', 200, skip
      );
      tokens.push(...(batch || []));
      if (!batch || batch.length < 200) break;
      skip += 200;
      if (skip > 1000) break;
    }
    const tokenNativeEmails = new Set(
      tokens.filter(t => !String(t.token || '').startsWith('web_'))
        .map(t => (t.user_email || '').trim().toLowerCase())
    );

    // ── 4. Charger toutes les CourseExterne (paginé) ──
    const courses: any[] = [];
    skip = 0;
    const courseFilter: any = {};
    if (country_code) courseFilter.country_code = country_code;
    while (true) {
      const batch = await base44.asServiceRole.entities.CourseExterne.filter(
        courseFilter, '-created_date', 500, skip
      );
      courses.push(...(batch || []));
      if (!batch || batch.length < 500) break;
      skip += 500;
      if (skip > 5000) break;
    }

    // ── 5. Charger tous les CrmProspection ──
    const prospections: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CrmProspection.list('-created_date', 500, skip);
      prospections.push(...(batch || []));
      if (!batch || batch.length < 500) break;
      skip += 500;
      if (skip > 2000) break;
    }
    const prospectionByClientId = new Map<string, any>();
    for (const p of prospections) {
      if (p.client_id) prospectionByClientId.set(p.client_id, p);
    }

    // ── 6. Maps course → phone / email ──
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

    // ── 7. Personnes uniques hybrides ──
    const uniquePersons = new Map<string, {
      phone: string | null;
      email: string | null;
      isApp: boolean;
      isCrm: boolean;
      deliveredCount: number;
      hasAppCourse: boolean;
      clientIds: string[];
    }>();

    for (const c of clients) {
      const phone = (c.telephone_normalized || '').trim();
      const email = (c.user_email || '').trim().toLowerCase();

      let key: string;
      if (phone) {
        key = `phone:${phone}`;
      } else if (email && userEmails.has(email)) {
        key = `email:${email}`;
      } else {
        continue;
      }

      if (!uniquePersons.has(key)) {
        uniquePersons.set(key, {
          phone: phone || null,
          email: email || null,
          isApp: false,
          isCrm: false,
          deliveredCount: 0,
          hasAppCourse: false,
          clientIds: [],
        });
      }
      const entry = uniquePersons.get(key)!;
      entry.clientIds.push(c.id);
      if (email && userEmails.has(email)) entry.isApp = true;
      if (c.cree_via_crm === true) entry.isCrm = true;

      // Compter les courses livrées
      const seenIds = new Set<string>();
      for (const course of (phoneToCourses.get(phone) || [])) {
        if (!seenIds.has(course.id)) {
          seenIds.add(course.id);
          if (course.statut === 'livree') entry.deliveredCount++;
          if (course.source === 'client') entry.hasAppCourse = true;
        }
      }
      if (email) {
        for (const course of (emailToCourses.get(email) || [])) {
          if (!seenIds.has(course.id)) {
            seenIds.add(course.id);
            if (course.statut === 'livree') entry.deliveredCount++;
            if (course.source === 'client') entry.hasAppCourse = true;
          }
        }
      }
    }

    // ── 8. KPI Conversion ──
    let crmTotal = 0;
    let crmUniquement = 0;
    let crmAvecApp = 0;
    let crmConverti = 0;
    let appAvecFcm = 0;
    let appSansFcm = 0;
    let crmAvecTel = 0;
    let crmSansTel = 0;
    let crmPriorite1 = 0;
    let crmPriorite2 = 0;
    let crmPriorite3 = 0;

    // Pipeline stats (depuis CrmProspection)
    let pipelineAContacter = 0;
    let pipelineContacte = 0;
    let pipelineInteresse = 0;
    let pipelineARelancer = 0;
    let pipelineAppInstallee = 0;
    let pipelineConverti = 0;
    let pipelinePasInteresse = 0;
    let pipelineNePlusContacter = 0;

    for (const p of prospections) {
      switch (p.pipeline_status) {
        case 'a_contacter': pipelineAContacter++; break;
        case 'contacte': pipelineContacte++; break;
        case 'interesse': pipelineInteresse++; break;
        case 'a_relancer': pipelineARelancer++; break;
        case 'app_installee': pipelineAppInstallee++; break;
        case 'converti': pipelineConverti++; break;
        case 'pas_interesse': pipelinePasInteresse++; break;
        case 'ne_plus_contacter': pipelineNePlusContacter++; break;
      }
    }

    for (const [key, entry] of uniquePersons) {
      if (!entry.isCrm && !entry.isApp) continue;

      if (entry.isCrm && entry.isApp) {
        crmAvecApp++;
      } else if (entry.isCrm) {
        crmUniquement++;
      } else if (entry.isApp) {
        // App uniquement — pas un CRM
      }

      if (entry.isCrm) {
        crmTotal++;
        if (entry.phone && entry.phone.length >= 8) {
          crmAvecTel++;
        } else {
          crmSansTel++;
        }

        // Conversion: CRM + App + première commande App (source=client)
        if (entry.isApp && entry.hasAppCourse) {
          crmConverti++;
        }

        // Priorisation (CRM sans App)
        if (!entry.isApp) {
          if (entry.deliveredCount >= 2) {
            crmPriorite1++;
          } else if (entry.deliveredCount >= 1) {
            crmPriorite2++;
          } else {
            crmPriorite3++;
          }
        }
      }

      if (entry.isApp) {
        if (entry.email && tokenNativeEmails.has(entry.email)) {
          appAvecFcm++;
        } else {
          appSansFcm++;
        }
      }
    }

    const totalProfiles = clients.length;
    const uniqueTotal = uniquePersons.size;

    // Taux de conversion
    const tauxInstallation = crmTotal > 0 ? (crmAvecApp / crmTotal) * 100 : 0;
    const tauxConversion = crmTotal > 0 ? (crmConverti / crmTotal) * 100 : 0;

    return Response.json({
      success: true,
      country_code: country_code || 'ALL',
      // ── Population ──
      total_profiles: totalProfiles,
      personnes_uniques: uniqueTotal,
      // ── Classification ──
      crm_total: crmTotal,
      crm_uniquement: crmUniquement,
      crm_avec_app: crmAvecApp,
      crm_converti: crmConverti,
      app_uniquement: uniqueTotal - crmTotal,
      // ── FCM ──
      app_avec_fcm: appAvecFcm,
      app_sans_fcm: appSansFcm,
      // ── Téléphone ──
      crm_avec_tel: crmAvecTel,
      crm_sans_tel: crmSansTel,
      // ── Priorisation (CRM sans App) ──
      crm_priorite_1: crmPriorite1,
      crm_priorite_2: crmPriorite2,
      crm_priorite_3: crmPriorite3,
      // ── Pipeline (depuis CrmProspection) ──
      pipeline_a_contacter: pipelineAContacter,
      pipeline_contacte: pipelineContacte,
      pipeline_interesse: pipelineInteresse,
      pipeline_a_relancer: pipelineARelancer,
      pipeline_app_installee: pipelineAppInstallee,
      pipeline_converti: pipelineConverti,
      pipeline_pas_interesse: pipelinePasInteresse,
      pipeline_ne_plus_contacter: pipelineNePlusContacter,
      // ── Taux ──
      taux_installation_pct: Math.round(tauxInstallation * 10) / 10,
      taux_conversion_pct: Math.round(tauxConversion * 10) / 10,
      // ── Technique ──
      api_calls: Math.ceil(clients.length / limit) + Math.ceil(users.length / 200) + Math.ceil(tokens.length / 200) + Math.ceil(courses.length / 500) + Math.ceil(prospections.length / 500),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}