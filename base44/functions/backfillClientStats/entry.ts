import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { preloadDialCodes, computeClientStatsFromCourses, getVipThresholds, computeStatutCrm } from '../../shared/crmEngine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// backfillClientStats — Backfill BULK des statistiques clients
// ═══════════════════════════════════════════════════════════════════════════
//
// Recalcule nb_courses_total et les stats CRM depuis les vraies CourseExterne.
//
// SEMANTIQUE : ne compte QUE les courses où le client est le DEMANDEUR
// (client_phone_normalized ou client_user_email).
//
// Modes :
//   - test_mode=true + test_client_ids : traite uniquement les 5 clients spécifiés
//   - test_mode=false : traite tous les clients du pays
//
// Opérations API : ~4-6 (load) + 1-2 (bulkUpdate)
// Aucun N+1. Idempotent. Relançable sans double-comptage.
//
// NE MODIFIE PAS : CourseExterne, Livreur, Dispatch V2, comptabilité.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { country_code, test_mode, test_client_ids } = body || {};

    if (!country_code) {
      return Response.json({ error: 'country_code requis' }, { status: 400 });
    }

    await preloadDialCodes(base44, country_code);
    const thresholds = await getVipThresholds(base44);

    // ── 1. Charger les ClientExterne ──
    let clients: any[] = [];
    if (test_mode && Array.isArray(test_client_ids) && test_client_ids.length > 0) {
      // Mode test : charger uniquement les clients spécifiés
      for (const id of test_client_ids) {
        const c = await base44.asServiceRole.entities.ClientExterne.get(id).catch(() => null);
        if (c) clients.push(c);
      }
    } else {
      // Mode complet : tous les clients du pays
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
    }

    // ── 2. Charger toutes les CourseExterne LIVRÉES du pays ──
    const deliveredCourses: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code, statut: 'livree' },
        '-created_date',
        limit,
        skip
      );
      deliveredCourses.push(...(batch || []));
      if (!batch || batch.length < limit) break;
      skip += limit;
      if (skip > 5000) break;
    }

    // ── 3. Construire les maps en mémoire ──
    const phoneToCourses = new Map<string, any[]>();
    const emailToCourses = new Map<string, any[]>();

    for (const c of deliveredCourses) {
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

    // ── 4. Calculer les corrections ──
    const updates: any[] = [];
    const beforeAfter: any[] = [];
    let corrected = 0;
    let alreadyCorrect = 0;

    for (const client of clients) {
      const phone = (client.telephone_normalized || '').trim();
      const email = (client.user_email || '').trim().toLowerCase();

      // Trouver les courses livrées où ce client est le DEMANDEUR
      const byPhone = phone ? (phoneToCourses.get(phone) || []) : [];
      const byEmail = email ? (emailToCourses.get(email) || []) : [];

      // Dédupliquer par course.id
      const seenIds = new Set<string>();
      const clientDeliveredCourses: any[] = [];
      for (const course of [...byPhone, ...byEmail]) {
        if (!seenIds.has(course.id)) {
          seenIds.add(course.id);
          clientDeliveredCourses.push(course);
        }
      }

      // Calculer les nouvelles stats
      const newStats = computeClientStatsFromCourses(client, clientDeliveredCourses);
      const newStatut = computeStatutCrm(
        newStats.nb_courses_total,
        newStats.montant_total_depense,
        newStats.derniere_course_date,
        thresholds
      );

      // Comparer avec les stats actuelles
      const currentNb = Number(client.nb_courses_total || 0);
      const currentMontant = Number(client.montant_total_depense || 0);

      if (newStats.nb_courses_total === currentNb && newStats.montant_total_depense === currentMontant) {
        alreadyCorrect++;
        continue;
      }

      // Préparer l'update
      updates.push({
        id: client.id,
        nb_courses_total: newStats.nb_courses_total,
        nb_courses_admin: newStats.nb_courses_admin,
        montant_total_depense: newStats.montant_total_depense,
        derniere_course_date: newStats.derniere_course_date,
        dernier_quartier_depart: newStats.dernier_quartier_depart,
        dernier_quartier_arrivee: newStats.dernier_quartier_arrivee,
        quartiers_utilises: newStats.quartiers_utilises,
        statut_crm: newStatut,
      });

      beforeAfter.push({
        client_id: client.id,
        nom: `${client.prenom || ''} ${client.nom || ''}`.trim(),
        telephone: phone,
        before: {
          nb_courses_total: currentNb,
          montant_total_depense: currentMontant,
          statut_crm: client.statut_crm,
        },
        after: {
          nb_courses_total: newStats.nb_courses_total,
          montant_total_depense: newStats.montant_total_depense,
          statut_crm: newStatut,
        },
      });

      corrected++;
    }

    // ── 5. Appliquer les corrections en BULK ──
    let updated = 0;
    if (updates.length > 0) {
      // bulkUpdate par batches de 200
      for (let i = 0; i < updates.length; i += 200) {
        const batch = updates.slice(i, i + 200);
        await base44.asServiceRole.entities.ClientExterne.bulkUpdate(batch);
        updated += batch.length;
      }
    }

    return Response.json({
      success: true,
      mode: test_mode ? 'test' : 'full',
      country_code,
      clients_scanned: clients.length,
      clients_corrected: corrected,
      clients_already_correct: alreadyCorrect,
      clients_updated_in_db: updated,
      delivered_courses_loaded: deliveredCourses.length,
      before_after: test_mode ? beforeAfter : undefined,
      api_calls: Math.ceil(clients.length / 500) + Math.ceil(deliveredCourses.length / 500) + Math.ceil(updates.length / 200),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}