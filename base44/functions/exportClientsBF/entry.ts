import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ═══════════════════════════════════════════════════════════════════════════
// exportClientsBF — Export CSV des clients SILGAPP du Burkina Faso
// ═══════════════════════════════════════════════════════════════════════════
//
// READ-ONLY : aucune donnée n'est modifiée, aucun message n'est envoyé.
//
// Colonnes :
//   - Identifiant client
//   - Nom complet
//   - Numéro au format +226XXXXXXXX
//   - Nombre de courses livrées
//   - Date de dernière livraison
//   - Statut de prospection (pipeline_status CrmProspection)
//   - Doublon (OUI/NON — si le numéro apparaît chez plusieurs clients)
//
// Exclusions :
//   - Comptes de test (nom contenant "test", "demo", numéro à chiffres répétés)
//   - Contacts marqués "ne_plus_contacter" dans CrmProspection
//   - Clients inactifs (actif=false)
//
// Sécurité : admin uniquement.
// ═══════════════════════════════════════════════════════════════════════════

function escapeCsv(value: string): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function isTestAccount(client: any): boolean {
  const nom = String(client?.nom || '').toLowerCase();
  const prenom = String(client?.prenom || '').toLowerCase();
  const notes = String(client?.notes_admin || '').toLowerCase();
  const phone = String(client?.telephone_normalized || '');

  // Nom/prénom contenant "test" ou "demo"
  if (nom.includes('test') || prenom.includes('test')) return true;
  if (nom.includes('demo') || prenom.includes('demo')) return true;

  // Notes contenant "compte test" ou "client test"
  if (notes.includes('compte test') || notes.includes('client test')) return true;

  // Numéro à chiffres répétés (ex: 00000000, 11111111)
  if (phone.length >= 8 && /^(\d)\1+$/.test(phone)) return true;

  // Numéro trop court ou évidemment fictif
  if (phone.length > 0 && phone.length < 8) return true;

  return false;
}

function formatPhonePlus226(normalized: string): string {
  if (!normalized) return '';
  // telephone_normalized est déjà au format international sans + (ex: 22670259008)
  // Si commence par 226, ajouter + devant
  if (normalized.startsWith('226')) {
    return `+${normalized}`;
  }
  // Si commence par 0 (format local), remplacer par +226
  if (normalized.startsWith('0')) {
    return `+226${normalized.substring(1)}`;
  }
  // Sinon, préfixer avec +226 si le numéro semble burkinabè (8 chiffres)
  if (/^\d{8}$/.test(normalized)) {
    return `+226${normalized}`;
  }
  // Fallback : retourner tel quel avec +
  return `+${normalized}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Sécurité : admin uniquement ──
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    // ── 1. Charger tous les ClientExterne du Burkina Faso ──
    const clients: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.ClientExterne.filter(
        { country_code: 'BF' }, '-created_date', limit, skip
      );
      clients.push(...(batch || []));
      if (!batch || batch.length < limit) break;
      skip += limit;
      if (skip > 5000) break;
    }

    // ── 2. Charger toutes les CrmProspection pour exclure ne_plus_contacter ──
    const prospections: any[] = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CrmProspection.filter(
        { country_code: 'BF' }, '-created_date', 500, skip
      );
      prospections.push(...(batch || []));
      if (!batch || batch.length < 500) break;
      skip += 500;
      if (skip > 3000) break;
    }
    const prospectionMap = new Map<string, any>();
    const doNotContactClientIds = new Set<string>();
    for (const p of prospections) {
      if (p.client_id) {
        prospectionMap.set(p.client_id, p);
        if (p.pipeline_status === 'ne_plus_contacter') {
          doNotContactClientIds.add(p.client_id);
        }
      }
    }

    // ── 3. Filtrer les clients ──
    const eligibleClients = clients.filter(c => {
      if (!c) return false;
      // Exclure inactifs
      if (c.actif === false) return false;
      // Exclure comptes de test
      if (isTestAccount(c)) return false;
      // Exclure "ne plus contacter"
      if (doNotContactClientIds.has(c.id)) return false;
      // Exclure les clients sans numéro de téléphone
      if (!c.telephone_normalized || c.telephone_normalized.length < 8) return false;
      return true;
    });

    // ── 4. Détecter les doublons de numéro ──
    const phoneCountMap = new Map<string, number>();
    for (const c of eligibleClients) {
      const phone = String(c.telephone_normalized || '');
      if (!phone) continue;
      phoneCountMap.set(phone, (phoneCountMap.get(phone) || 0) + 1);
    }

    // ── 5. Construire les lignes CSV ──
    const PIPELINE_LABELS: Record<string, string> = {
      a_contacter: 'À contacter',
      contacte: 'Contacté',
      interesse: 'Intéressé',
      a_relancer: 'À relancer',
      app_installee: 'App installée',
      converti: 'Converti',
      pas_interesse: 'Pas intéressé',
      ne_plus_contacter: 'Ne plus contacter',
    };

    const headers = [
      'Identifiant client',
      'Nom',
      'Numéro (+226)',
      'Courses livrées',
      'Dernière livraison',
      'Statut prospection',
      'Doublon',
    ];

    const rows: string[] = [];
    rows.push(headers.map(escapeCsv).join(','));

    for (const c of eligibleClients) {
      const prospect = prospectionMap.get(c.id);
      const phone = String(c.telephone_normalized || '');
      const isDuplicate = (phoneCountMap.get(phone) || 0) > 1;
      const nomComplet = [c.prenom, c.nom].filter(Boolean).join(' ').trim() || c.nom || '';
      const pipelineStatus = prospect?.pipeline_status
        ? (PIPELINE_LABELS[prospect.pipeline_status] || prospect.pipeline_status)
        : 'Non prospecté';

      const row = [
        c.id || '',
        nomComplet,
        formatPhonePlus226(phone),
        String(c.nb_courses_total || 0),
        formatDate(c.derniere_course_date),
        pipelineStatus,
        isDuplicate ? 'OUI' : 'NON',
      ];
      rows.push(row.map(escapeCsv).join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\n'); // BOM UTF-8 pour Excel

    const duplicatesCount = Array.from(phoneCountMap.values()).filter(v => v > 1).length;

    return Response.json({
      success: true,
      csv: csvContent,
      total_clients: eligibleClients.length,
      excluded_test: clients.filter(c => isTestAccount(c)).length,
      excluded_do_not_contact: doNotContactClientIds.size,
      duplicates_count: duplicatesCount,
      exported_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[exportClientsBF] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}