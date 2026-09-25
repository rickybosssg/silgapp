import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import {
  generateEnterpriseFinancierId,
  generateSlug,
  modifierTauxEnterprise,
  enregistrerPaiementEnterprise,
} from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// manageEnterprise — Super Admin SILGAPP: CRUD entreprises + admins + taux + paiements
//
// RÉSERVÉ AU SUPER ADMIN SILGAPP (user.role === 'admin').
// Un Admin Entreprise ne peut JAMAIS appeler cette fonction.
//
// Actions:
//   create_enterprise — Crée une entreprise
//   update_enterprise — Modifie une entreprise
//   suspend_enterprise — Suspend une entreprise
//   reactivate_enterprise — Réactive une entreprise
//   create_admin — Crée un Admin Entreprise
//   toggle_admin — Active/désactive un Admin Entreprise
//   modify_rate — Modifie le taux SILGAPP d'une entreprise
//   record_payment — Enregistre un paiement d'une entreprise
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    // ── RÉSERVÉ AU SUPER ADMIN SILGAPP ──
    if (user.role !== 'admin') {
      return Response.json({ error: 'Réservé au Super Admin SILGAPP' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Créer une entreprise ──
      case 'create_enterprise': {
        const { nom, country_code, telephone, email, adresse, logo_url, couleur_primaire, commission_silgapp_pct } = body;

        if (!nom || !country_code) {
          return Response.json({ error: 'nom et country_code requis' }, { status: 400 });
        }

        const financierId = generateEnterpriseFinancierId();
        const slug = generateSlug(nom);

        // Vérifier l'unicité du slug
        const existing = await base44.asServiceRole.entities.Enterprise.filter({ slug });
        if (existing?.length > 0) {
          return Response.json({ error: 'Une entreprise avec ce nom existe déjà' }, { status: 409 });
        }

        const enterprise = await base44.asServiceRole.entities.Enterprise.create({
          nom,
          slug,
          country_code,
          telephone,
          email,
          adresse,
          logo_url,
          couleur_primaire: couleur_primaire || '#007AFF',
          commission_silgapp_pct: Number(commission_silgapp_pct) || 5,
          enterprise_financier_id: financierId,
          statut: 'actif',
          actif: true,
          date_creation: new Date().toISOString(),
          nb_admins: 0,
          nb_livreurs: 0,
          volume_courses_total: 0,
          total_commissions_silgapp: 0,
          total_paiements: 0,
          montant_du_silgapp: 0,
        });

        return Response.json({ success: true, enterprise });
      }

      // ── Modifier une entreprise ──
      case 'update_enterprise': {
        const { enterprise_id, nom, telephone, email, adresse, logo_url, couleur_primaire } = body;

        if (!enterprise_id) return Response.json({ error: 'enterprise_id requis' }, { status: 400 });

        const updateData: any = {};
        if (nom) updateData.nom = nom;
        if (telephone) updateData.telephone = telephone;
        if (email) updateData.email = email;
        if (adresse) updateData.adresse = adresse;
        if (logo_url) updateData.logo_url = logo_url;
        if (couleur_primaire) updateData.couleur_primaire = couleur_primaire;

        const updated = await base44.asServiceRole.entities.Enterprise.update(enterprise_id, updateData);
        return Response.json({ success: true, enterprise: updated });
      }

      // ── Suspendre une entreprise ──
      case 'suspend_enterprise': {
        const { enterprise_id, motif } = body;
        if (!enterprise_id) return Response.json({ error: 'enterprise_id requis' }, { status: 400 });

        const updated = await base44.asServiceRole.entities.Enterprise.update(enterprise_id, {
          statut: 'suspendu',
          actif: false,
          date_suspension: new Date().toISOString(),
          motif_suspension: motif || 'Suspension par Super Admin',
        });
        return Response.json({ success: true, enterprise: updated });
      }

      // ── Réactiver une entreprise ──
      case 'reactivate_enterprise': {
        const { enterprise_id } = body;
        if (!enterprise_id) return Response.json({ error: 'enterprise_id requis' }, { status: 400 });

        const updated = await base44.asServiceRole.entities.Enterprise.update(enterprise_id, {
          statut: 'actif',
          actif: true,
          date_suspension: null,
          motif_suspension: null,
        });
        return Response.json({ success: true, enterprise: updated });
      }

      // ── Créer un Admin Entreprise ──
      case 'create_admin': {
        const { enterprise_id, nom, prenom, telephone, email } = body;

        if (!enterprise_id || !email) {
          return Response.json({ error: 'enterprise_id et email requis' }, { status: 400 });
        }

        // Charger l'enterprise pour récupérer le enterprise_financier_id
        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: enterprise_id });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

        // Inviter l'utilisateur via le système d'invitation Base44
        try {
          await base44.asServiceRole.users.inviteUser(email, 'user');
        } catch (inviteErr: any) {
          // Si l'utilisateur existe déjà, continuer
          if (!String(inviteErr?.message || '').includes('already')) {
            return Response.json({ error: 'Impossible d\'inviter l\'utilisateur: ' + (inviteErr?.message || '') }, { status: 500 });
          }
        }

        // Mettre à jour le User avec enterprise_id et silgapp_role
        const users = await base44.asServiceRole.entities.User.filter({ email });
        if (!users || users.length === 0) {
          return Response.json({ error: 'Utilisateur introuvable après invitation' }, { status: 404 });
        }

        const targetUser = users[0];
        await base44.asServiceRole.entities.User.update(targetUser.id, {
          enterprise_id: enterprise.enterprise_financier_id,
          silgapp_role: 'admin_entreprise',
        });

        // Incrémenter le compteur d'admins
        await base44.asServiceRole.entities.Enterprise.update(enterprise.id, {
          nb_admins: Number(enterprise.nb_admins || 0) + 1,
        });

        return Response.json({ success: true, user_email: email, enterprise_id: enterprise.enterprise_financier_id });
      }

      // ── Activer/désactiver un Admin Entreprise ──
      case 'toggle_admin': {
        const { user_email, active } = body;
        if (!user_email) return Response.json({ error: 'user_email requis' }, { status: 400 });

        const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
        if (!users || users.length === 0) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const targetUser = users[0];
        if (targetUser.silgapp_role !== 'admin_entreprise') {
          return Response.json({ error: 'Cet utilisateur n\'est pas un Admin Entreprise' }, { status: 400 });
        }

        if (active) {
          await base44.asServiceRole.entities.User.update(targetUser.id, { silgapp_role: 'admin_entreprise' });
        } else {
          await base44.asServiceRole.entities.User.update(targetUser.id, { silgapp_role: null });
        }

        return Response.json({ success: true, active });
      }

      // ── Modifier le taux SILGAPP d'une entreprise ──
      case 'modify_rate': {
        const { enterprise_id, nouveau_taux, motif } = body;
        if (!enterprise_id || nouveau_taux == null) {
          return Response.json({ error: 'enterprise_id et nouveau_taux requis' }, { status: 400 });
        }

        const result = await modifierTauxEnterprise(
          base44.asServiceRole,
          enterprise_id,
          Number(nouveau_taux),
          user.email,
          motif
        );

        return Response.json(result);
      }

      // ── Enregistrer un paiement ──
      case 'record_payment': {
        const { enterprise_id, montant, moyen_paiement, reference, request_id } = body;
        if (!enterprise_id || !montant || !request_id) {
          return Response.json({ error: 'enterprise_id, montant et request_id requis' }, { status: 400 });
        }

        const result = await enregistrerPaiementEnterprise(
          base44.asServiceRole,
          enterprise_id,
          Number(montant),
          request_id,
          moyen_paiement || 'especes',
          reference,
          user.email
        );

        return Response.json(result);
      }

      // ── Lister toutes les entreprises ──
      case 'list_enterprises': {
        const enterprises = await base44.asServiceRole.entities.Enterprise.list('-date_creation', 200);
        return Response.json({ success: true, enterprises });
      }

      // ── Détail d'une entreprise ──
      case 'get_enterprise': {
        const { enterprise_id } = body;
        if (!enterprise_id) return Response.json({ error: 'enterprise_id requis' }, { status: 400 });

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: enterprise_id });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

        // Charger les admins
        const admins = await base44.asServiceRole.entities.User.filter({ enterprise_id: enterprise.enterprise_financier_id });

        // Charger le ledger
        const ledger = await base44.asServiceRole.entities.EnterpriseLedger.filter(
          { enterprise_financier_id: enterprise.enterprise_financier_id },
          '-created_date',
          50
        );

        return Response.json({ success: true, enterprise, admins, ledger });
      }

      default:
        return Response.json({ error: 'Action inconnue: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}