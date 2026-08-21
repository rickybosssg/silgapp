import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizePhone, upsertClientContact, recalculateClientStats } from "../../shared/crmEngine.ts";
import { resolveCountryCode } from "../../shared/countryResolver.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const body = await req.json();
    const { dry_run = false } = body || {};

    const report = {
      courses_scanned: 0,
      courses_livrees: 0,
      clients_created: 0,
      clients_updated: 0,
      doublons_detectes: 0,
      stats_recalculated: 0,
      errors: [] as string[],
    };

    // ── Étape 1 : Normaliser les téléphones sur toutes les CourseExterne ──
    let skip = 0;
    let hasMore = true;
    const allCourseIds: string[] = [];

    while (hasMore) {
      let batch: any[] = [];
      try {
        batch = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 200, skip);
      } catch (e) {
        report.errors.push(`Erreur list courses skip=${skip}: ${(e as any).message}`);
        break;
      }
      if (!batch || batch.length === 0) break;
      report.courses_scanned += batch.length;

      for (const course of batch) {
        const updates: any = {};
        const cc = course.country_code || await resolveCountryCode({ entity: course });
        if (!cc) { report.errors.push(`Course ${course.id}: country_code manquant, ignoré`); continue; }

        // Normaliser client_telephone
        const clientNorm = normalizePhone(course.client_telephone, cc);
        if (course.client_telephone && (!course.client_phone_normalized || course.client_phone_normalized !== clientNorm)) {
          updates.client_phone_normalized = clientNorm;
        }

        // Normaliser expediteur_telephone
        const expedNorm = normalizePhone(course.expediteur_telephone, cc);
        if (course.expediteur_telephone && (!course.expediteur_phone_normalized || course.expediteur_phone_normalized !== expedNorm)) {
          updates.expediteur_phone_normalized = expedNorm;
        }

        // Normaliser destinataire_telephone
        const destinNorm = normalizePhone(course.destinataire_telephone, cc);
        if (course.destinataire_telephone && (!course.destinataire_phone_normalized || course.destinataire_phone_normalized !== destinNorm)) {
          updates.destinataire_phone_normalized = destinNorm;
        }

        if (Object.keys(updates).length > 0 && !dry_run) {
          try {
            await base44.asServiceRole.entities.CourseExterne.update(course.id, updates);
          } catch (e) {
            report.errors.push(`Erreur update course ${course.id}: ${(e as any).message}`);
          }
        }

        allCourseIds.push(course.id);
      }

      skip += batch.length;
      hasMore = batch.length === 200;
    }

    // ── Étape 2 : Créer/upserter les fiches CRM pour les courses LIVRÉES ──
    let skipLivrees = 0;
    let hasMoreLivrees = true;
    const processedPhones = new Set<string>();

    while (hasMoreLivrees) {
      let batch: any[] = [];
      try {
        batch = await base44.asServiceRole.entities.CourseExterne.filter(
          { statut: "livree" },
          "-created_date", 200, skipLivrees
        );
      } catch (e) {
        report.errors.push(`Erreur list livrees skip=${skipLivrees}: ${(e as any).message}`);
        break;
      }
      if (!batch || batch.length === 0) break;
      report.courses_livrees += batch.length;

      for (const course of batch) {
        const cc = course.country_code || await resolveCountryCode({ entity: course });
        if (!cc) { report.errors.push(`Course ${course.id}: country_code manquant, ignoré`); continue; }

        // Upsert client
        const clientPhone = course.client_telephone || course.contact_createur_course;
        if (clientPhone) {
          const norm = normalizePhone(clientPhone, cc);
          if (!processedPhones.has(norm) && !dry_run) {
            try {
              const existing = await upsertClientContact(base44, clientPhone, cc, course.client_nom, "client", course);
              if (existing) {
                if (existing.created_date === existing.updated_date) report.clients_created++;
                else report.clients_updated++;
              }
            } catch (e) {
              report.errors.push(`Erreur upsert client ${norm}: ${(e as any).message}`);
            }
            processedPhones.add(norm);
          }
        }

        // Upsert expediteur
        if (course.expediteur_telephone) {
          const norm = normalizePhone(course.expediteur_telephone, cc);
          if (!processedPhones.has(norm) && !dry_run) {
            try {
              await upsertClientContact(base44, course.expediteur_telephone, cc, course.expediteur_nom, "expediteur", course);
            } catch (e) {
              report.errors.push(`Erreur upsert expediteur ${norm}: ${(e as any).message}`);
            }
            processedPhones.add(norm);
          }
        }

        // Upsert destinataire
        if (course.destinataire_telephone) {
          const norm = normalizePhone(course.destinataire_telephone, cc);
          if (!processedPhones.has(norm) && !dry_run) {
            try {
              await upsertClientContact(base44, course.destinataire_telephone, cc, course.destinataire_nom, "destinataire", course);
            } catch (e) {
              report.errors.push(`Erreur upsert destinataire ${norm}: ${(e as any).message}`);
            }
            processedPhones.add(norm);
          }
        }
      }

      skipLivrees += batch.length;
      hasMoreLivrees = batch.length === 200;
    }

    // ── Étape 3 : Recalculer les stats pour tous les clients traités ──
    for (const phone of processedPhones) {
      if (dry_run) continue;
      try {
        await recalculateClientStats(base44, phone);
        report.stats_recalculated++;
      } catch (e) {
        report.errors.push(`Erreur recalculate ${phone}: ${(e as any).message}`);
      }
    }

    // ── Étape 4 : Détecter les doublons (même telephone_normalized) ──
    try {
      let skipClients = 0;
      let hasMoreClients = true;
      const phoneToClients: Record<string, any[]> = {};

      while (hasMoreClients) {
        let batch: any[] = [];
        try {
          batch = await base44.asServiceRole.entities.ClientExterne.list("-created_date", 200, skipClients);
        } catch { break; }
        if (!batch || batch.length === 0) break;

        for (const c of batch) {
          const cc = c.country_code || await resolveCountryCode({ entity: c });
          const norm = c.telephone_normalized || (cc ? normalizePhone(c.telephone, cc) : "");
          if (norm) {
            if (!phoneToClients[norm]) phoneToClients[norm] = [];
            phoneToClients[norm].push(c);
          }
        }

        skipClients += batch.length;
        hasMoreClients = batch.length === 200;
      }

      for (const [phone, clients] of Object.entries(phoneToClients)) {
        if (clients.length > 1) report.doublons_detectes += clients.length - 1;
      }
    } catch (e) {
      report.errors.push(`Erreur détection doublons: ${(e as any).message}`);
    }

    return Response.json({
      success: true,
      dry_run,
      report,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}