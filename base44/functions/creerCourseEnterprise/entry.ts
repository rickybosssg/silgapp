import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId, isEnterpriseAdmin } from '../../shared/enterpriseFinance.ts';
import { normalizePhone, phoneVariants, loadCountryDialCodes } from '../../shared/phoneUtils.ts';
import { ensureCourseCodeMessage } from '../../shared/courseCodeMessage.ts';

// ═══════════════════════════════════════════════════════════════════════════
// creerCourseEnterprise — Création de course Enterprise avec déduplication client
//
// PRINCIPES :
//   1. enterprise_id résolu côté backend depuis l'admin authentifié (JAMAIS frontend)
//   2. ClientExterne est la BASE CENTRALE SILGAPP — pas de base client Enterprise
//   3. Déduplication par téléphone normalisé (phoneUtils)
//   4. ClientExterne.enterprise_id n'est JAMAIS setté (client partagé entre entreprises)
//   5. Pas de Happy Hour, pas de Pass sur les courses Enterprise
//   6. Dispatch V2 prend le relais (filtré par enterprise_id côté dispatch)
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
      return Response.json({ error: 'Aucune entreprise rattachée à ce compte' }, { status: 403 });
    }

    // ── Vérifier que l'entreprise est active ──
    const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
      enterprise_financier_id: enterpriseId,
    }).catch(() => []);
    const enterprise = enterprises?.[0];
    if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });
    if (!enterprise.actif || enterprise.statut !== 'actif') {
      return Response.json({ error: 'Entreprise suspendue' }, { status: 403 });
    }

    const body = await req.json();
    const countryCode = body.country_code || enterprise.country_code || 'BF';

    // ── Charger les indicatifs pays pour la normalisation téléphone ──
    await loadCountryDialCodes(base44, countryCode);

    // ── ÉTAPE 1 : Normaliser le téléphone ──
    const rawPhone = (body.client_telephone || '').toString().trim();
    if (!rawPhone) {
      return Response.json({ error: 'Téléphone client obligatoire', code: 'CLIENT_PHONE_REQUIRED' }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(rawPhone, countryCode);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      return Response.json({ error: 'Téléphone client invalide' }, { status: 400 });
    }

    // ── ÉTAPE 2 : Chercher un ClientExterne existant (BASE CENTRALE) ──
    // asServiceRole pour bypass RLS — un client créé par CDL doit être trouvé par Enterprise B
    const variants = phoneVariants(normalizedPhone);
    let client = null;
    for (const variant of variants) {
      const found = await base44.asServiceRole.entities.ClientExterne.filter({
        telephone_normalized: variant,
      }).catch(() => []);
      if (found?.length > 0) {
        client = found[0];
        break;
      }
    }

    // ── ÉTAPE 3 : Créer le client s'il n'existe pas (BASE CENTRALE) ──
    // ClientExterne.enterprise_id n'est JAMAIS setté — le client est partagé
    if (!client) {
      client = await base44.asServiceRole.entities.ClientExterne.create({
        nom: body.client_nom || 'Client',
        telephone: rawPhone,
        telephone_normalized: normalizedPhone,
        country_code: countryCode,
        cree_via_crm: true,
        actif: true,
        statut_crm: 'nouveau',
      });
    }
    // else: réutiliser le client existant — NE PAS écraser nom, email, adresse, GPS

    // ── ÉTAPE 4 : Créer CourseExterne avec enterprise_id backend-résolu ──
    const courseData: any = {
      ...body,
      source: 'admin',
      enterprise_id: enterpriseId, // backend-résolu, écrase toute valeur frontend
      country_code: countryCode,
      client_telephone: rawPhone,
      client_phone_normalized: normalizedPhone,
      contact_createur_course: normalizedPhone,
    };

    // Anti-falsification : supprimer tout enterprise_id fourni par le frontend
    // (déjà écrasé ci-dessus, mais explicite pour la clarté)

    const course = await base44.asServiceRole.entities.CourseExterne.create(courseData);

    // ── Messages automatiques (prix + PIN récupération + PIN livraison) ──
    if (course?.pickup_code_4_digits && course?.delivery_code_4_digits) {
      try {
        await ensureCourseCodeMessage(
          base44,
          course,
          null,
          course.pickup_code_4_digits,
          course.delivery_code_4_digits,
          '[CODE_MSG_ENT]'
        );
      } catch (err: any) {
        console.error('[creerCourseEnterprise] Erreur message codes (non-bloquant):', err?.message);
      }
    }

    return Response.json({ success: true, course, client });
  } catch (error) {
    console.error('[creerCourseEnterprise] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}