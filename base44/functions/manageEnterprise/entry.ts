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

        // Vérifier si l'utilisateur existe déjà (a déjà accepté une invitation)
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
        const existingUser = existingUsers?.[0];

        if (existingUser) {
          // L'utilisateur existe déjà → mise à jour immédiate
          await base44.asServiceRole.entities.User.update(existingUser.id, {
            enterprise_id: enterprise.enterprise_financier_id,
            silgapp_role: 'admin_entreprise',
          });

          // Mettre à jour le compteur d'admins (uniquement si ce n'était pas déjà un admin_entreprise)
          if (existingUser.silgapp_role !== 'admin_entreprise') {
            await base44.asServiceRole.entities.Enterprise.update(enterprise.id, {
              nb_admins: Number(enterprise.nb_admins || 0) + 1,
            });
          }

          // Marquer tout pending précédent comme activé
          const pendingOld = await base44.asServiceRole.entities.PendingEnterpriseAdmin.filter({ email, status: 'pending' });
          for (const p of pendingOld || []) {
            await base44.asServiceRole.entities.PendingEnterpriseAdmin.update(p.id, { status: 'activated', activated_at: new Date().toISOString() });
          }

          return Response.json({ success: true, user_email: email, enterprise_id: enterprise.enterprise_financier_id, mode: 'immediate' });
        }

        // L'utilisateur n'existe pas encore → créer un pending + inviter
        // Vérifier qu'il n'y a pas déjà un pending pour cet email
        const existingPending = await base44.asServiceRole.entities.PendingEnterpriseAdmin.filter({ email, status: 'pending' });
        if (existingPending?.length > 0) {
          // Mettre à jour le pending existant avec la nouvelle entreprise
          await base44.asServiceRole.entities.PendingEnterpriseAdmin.update(existingPending[0].id, {
            enterprise_id: enterprise.enterprise_financier_id,
            enterprise_name: enterprise.nom,
            invited_by: user.email,
            invited_at: new Date().toISOString(),
          });
        } else {
          await base44.asServiceRole.entities.PendingEnterpriseAdmin.create({
            email,
            enterprise_id: enterprise.enterprise_financier_id,
            enterprise_name: enterprise.nom,
            status: 'pending',
            invited_by: user.email,
            invited_at: new Date().toISOString(),
          });
        }

        // Inviter l'utilisateur via le système d'invitation Base44
        try {
          await base44.users.inviteUser(email, 'user');
        } catch (inviteErr: any) {
          // Si l'utilisateur existe déjà (déjà invité), continuer
          if (!String(inviteErr?.message || '').includes('already')) {
            return Response.json({ error: 'Impossible d\'inviter l\'utilisateur: ' + (inviteErr?.message || '') }, { status: 500 });
          }
        }

        return Response.json({ success: true, user_email: email, enterprise_id: enterprise.enterprise_financier_id, mode: 'pending' });
      }

      // ── Activer/désactiver un Admin Entreprise ──
      case 'toggle_admin': {
        const { user_email, active } = body;
        if (!user_email) return Response.json({ error: 'user_email requis' }, { status: 400 });

        const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
        if (!users || users.length === 0) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const targetUser = users[0];

        if (active) {
          // Réactivation : l'utilisateur doit avoir un enterprise_id rattaché
          if (!targetUser.enterprise_id) {
            return Response.json({ error: 'Cet utilisateur n\'a pas d\'entreprise rattachée' }, { status: 400 });
          }
          await base44.asServiceRole.entities.User.update(targetUser.id, { silgapp_role: 'admin_entreprise' });
        } else {
          // Désactivation : l'utilisateur doit être admin_entreprise
          if (targetUser.silgapp_role !== 'admin_entreprise') {
            return Response.json({ error: 'Cet utilisateur n\'est pas un Admin Entreprise actif' }, { status: 400 });
          }
          await base44.asServiceRole.entities.User.update(targetUser.id, { silgapp_role: null });
        }

        return Response.json({ success: true, active });
      }

      // ── Renvoyer l'invitation à un admin en attente ──
      case 'resend_invitation': {
        const { email } = body;
        if (!email) return Response.json({ error: 'email requis' }, { status: 400 });

        // Vérifier qu'un pending existe pour cet email
        const pendings = await base44.asServiceRole.entities.PendingEnterpriseAdmin.filter({ email, status: 'pending' });
        if (!pendings || pendings.length === 0) {
          return Response.json({ error: 'Aucune invitation en attente pour cet email' }, { status: 404 });
        }

        // Mettre à jour la date d'invitation
        await base44.asServiceRole.entities.PendingEnterpriseAdmin.update(pendings[0].id, {
          invited_at: new Date().toISOString(),
          invited_by: user.email,
        });

        // Renvoyer l'invitation via le système Auth
        try {
          await base44.users.inviteUser(email, 'user');
        } catch (inviteErr: any) {
          if (!String(inviteErr?.message || '').includes('already')) {
            return Response.json({ error: 'Impossible de renvoyer l\'invitation: ' + (inviteErr?.message || '') }, { status: 500 });
          }
        }

        return Response.json({ success: true, email });
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

        // ── Compter les courses par entreprise ──
        const enterpriseIds = (enterprises || []).map((e: any) => e.enterprise_financier_id).filter(Boolean);
        let courseCountMap: Record<string, number> = {};
        if (enterpriseIds.length > 0) {
          // Charger les courses enterprise (batch)
          const allCourses = await base44.asServiceRole.entities.CourseExterne.filter(
            { enterprise_id: { $in: enterpriseIds } },
            '-created_date',
            500
          );
          for (const c of allCourses || []) {
            if (c.enterprise_id) {
              courseCountMap[c.enterprise_id] = (courseCountMap[c.enterprise_id] || 0) + 1;
            }
          }
        }

        // ── Enrichir chaque entreprise avec nb_courses réel ──
        const enriched = (enterprises || []).map((e: any) => ({
          ...e,
          nb_courses: courseCountMap[e.enterprise_financier_id] || 0,
        }));

        return Response.json({ success: true, enterprises: enriched });
      }

      // ── Détail d'une entreprise ──
      case 'get_enterprise': {
        const { enterprise_id } = body;
        if (!enterprise_id) return Response.json({ error: 'enterprise_id requis' }, { status: 400 });

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: enterprise_id });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

        // Charger les admins (déjà activés)
        const admins = await base44.asServiceRole.entities.User.filter({ enterprise_id: enterprise.enterprise_financier_id });

        // Charger les admins en attente (invitation pas encore acceptée)
        const pendingAdmins = await base44.asServiceRole.entities.PendingEnterpriseAdmin.filter(
          { enterprise_id: enterprise.enterprise_financier_id, status: 'pending' },
          '-invited_at',
          50
        );

        // Fusionner les admins activés et en attente
        const allAdmins = [
          ...(admins || []).map((a: any) => ({
            id: a.id,
            email: a.email,
            full_name: a.full_name || '',
            silgapp_role: a.silgapp_role,
            status: 'activated',
          })),
          ...(pendingAdmins || []).map((p: any) => ({
            id: p.id,
            email: p.email,
            full_name: '',
            silgapp_role: 'admin_entreprise',
            status: 'pending',
          })),
        ];

        // Charger les livreurs
        const livreurs = await base44.asServiceRole.entities.Livreur.filter(
          { enterprise_id: enterprise.enterprise_financier_id },
          '-created_date',
          200
        );

        // Charger les courses
        const courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { enterprise_id: enterprise.enterprise_financier_id },
          '-created_date',
          100
        );

        // Charger le ledger
        const ledger = await base44.asServiceRole.entities.EnterpriseLedger.filter(
          { enterprise_financier_id: enterprise.enterprise_financier_id },
          '-created_date',
          50
        );

        return Response.json({ success: true, enterprise, admins: allAdmins, livreurs, courses, ledger });
      }

      // ── Retirer un admin d'une entreprise ──
      case 'remove_admin': {
        const { user_email } = body;
        if (!user_email) return Response.json({ error: 'user_email requis' }, { status: 400 });

        const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
        if (!users || users.length === 0) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const targetUser = users[0];
        if (targetUser.silgapp_role !== 'admin_entreprise') {
          return Response.json({ error: 'Cet utilisateur n\'est pas un Admin Entreprise' }, { status: 400 });
        }

        const oldEnterpriseId = targetUser.enterprise_id;

        await base44.asServiceRole.entities.User.update(targetUser.id, {
          enterprise_id: null,
          silgapp_role: null,
        });

        // Décrémenter le compteur d'admins
        if (oldEnterpriseId) {
          const entList = await base44.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: oldEnterpriseId });
          if (entList?.[0]) {
            await base44.asServiceRole.entities.Enterprise.update(entList[0].id, {
              nb_admins: Math.max(0, Number(entList[0].nb_admins || 0) - 1),
            });
          }
        }

        return Response.json({ success: true });
      }

      // ── Ajouter un livreur à une entreprise ──
      case 'add_livreur': {
        const { enterprise_id, nom, prenom, telephone, vehicule, ville, quartier } = body;
        if (!enterprise_id || !nom || !telephone) {
          return Response.json({ error: 'enterprise_id, nom et telephone requis' }, { status: 400 });
        }

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: enterprise_id });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

        const livreur = await base44.asServiceRole.entities.Livreur.create({
          nom,
          prenom: prenom || '',
          telephone,
          type_livreur: 'externe',
          reseau: 'externe',
          country_code: enterprise.country_code,
          ville: ville || '',
          quartier: quartier || '',
          vehicule: vehicule || 'moto',
          type_vehicule: vehicule || 'moto',
          enterprise_id: enterprise.enterprise_financier_id,
          validation: 'valide',
          valide_at: new Date().toISOString(),
          valide_par: user.email,
          actif: true,
          statut: 'hors_ligne',
        });

        // Incrémenter le compteur de livreurs
        await base44.asServiceRole.entities.Enterprise.update(enterprise.id, {
          nb_livreurs: Number(enterprise.nb_livreurs || 0) + 1,
        });

        return Response.json({ success: true, livreur });
      }

      // ── Activer/désactiver un livreur ──
      case 'toggle_livreur': {
        const { livreur_id, active } = body;
        if (!livreur_id) return Response.json({ error: 'livreur_id requis' }, { status: 400 });

        const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
        if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

        await base44.asServiceRole.entities.Livreur.update(livreur_id, {
          actif: active,
          statut: active ? 'disponible' : 'hors_ligne',
          admin_hors_ligne: !active,
        });

        return Response.json({ success: true, active });
      }

      default:
        return Response.json({ error: 'Action inconnue: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}