import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId, isEnterpriseAdmin } from '../../shared/enterpriseFinance.ts';
import { phoneVariants } from '../../shared/phoneUtils.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getEnterpriseClients — Liste des clients liés à une Enterprise
//
// PRINCIPES :
//   1. La relation client ↔ enterprise est dérivée des CourseExterne
//   2. NE PAS filtrer ClientExterne par enterprise_id (le client est central, partagé)
//   3. Un client partagé entre CDL et Enterprise B est visible chez les deux
//   4. Les stats (nb courses, dernière course) sont scoped à cette enterprise
//   5. asServiceRole pour bypass RLS (un client créé par CDL doit être visible par B)
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    if (!isEnterpriseAdmin(user)) {
      return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
    }

    const enterpriseId = normalizeEnterpriseId(user.enterprise_id);
    if (!enterpriseId) {
      return Response.json({ error: 'Aucune entreprise rattachée' }, { status: 403 });
    }

    // ── ÉTAPE 1 : Récupérer toutes les courses de cette enterprise ──
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { enterprise_id: enterpriseId },
      '-created_date', 500
    );

    // ── ÉTAPE 2 : Extraire les clients uniques depuis les courses ──
    const phoneMap = new Map<string, {
      phone: string;
      displayPhone: string;
      name: string;
      courseCount: number;
      lastDate: string;
      lastStatus: string;
      totalSpent: number;
    }>();

    for (const course of courses || []) {
      const phone = course.client_phone_normalized || course.client_telephone;
      if (!phone) continue;

      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, {
          phone,
          displayPhone: course.client_telephone || phone,
          name: course.client_nom || 'Client',
          courseCount: 0,
          lastDate: course.created_date,
          lastStatus: course.statut,
          totalSpent: 0,
        });
      }
      const entry = phoneMap.get(phone)!;
      entry.courseCount++;
      if (course.prix_final && course.statut === 'livree') {
        entry.totalSpent += course.prix_final;
      }
      if (course.created_date > entry.lastDate) {
        entry.lastDate = course.created_date;
        entry.lastStatus = course.statut;
      }
    }

    // ── ÉTAPE 3 : Enrichir avec les enregistrements ClientExterne ──
    const clients: any[] = [];
    const seenClientIds = new Set<string>();

    for (const [phone, info] of phoneMap) {
      const variants = phoneVariants(phone);
      let clientRecord: any = null;

      for (const variant of variants) {
        const found = await base44.asServiceRole.entities.ClientExterne.filter({
          telephone_normalized: variant,
        }).catch(() => []);
        if (found?.length > 0) {
          clientRecord = found[0];
          break;
        }
      }

      if (clientRecord && !seenClientIds.has(clientRecord.id)) {
        seenClientIds.add(clientRecord.id);
        clients.push({
          ...clientRecord,
          _enterprise_course_count: info.courseCount,
          _enterprise_last_course_date: info.lastDate,
          _enterprise_last_status: info.lastStatus,
          _enterprise_total_spent: info.totalSpent,
        });
      } else if (!clientRecord) {
        // Client sans fiche ClientExterne mais avec des courses
        clients.push({
          id: null,
          nom: info.name,
          telephone: info.displayPhone,
          telephone_normalized: phone,
          _enterprise_course_count: info.courseCount,
          _enterprise_last_course_date: info.lastDate,
          _enterprise_last_status: info.lastStatus,
          _enterprise_total_spent: info.totalSpent,
        });
      }
    }

    return Response.json({ success: true, clients });
  } catch (error) {
    console.error('[getEnterpriseClients] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}