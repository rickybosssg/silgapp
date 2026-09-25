import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// manageDriverInvitation — Gestion des invitations livreurs Enterprise
//
// PARCOURS OFFICIEL V1 :
//   1. Admin entreprise crée une invitation → token + URL
//   2. Candidat ouvre /inscription-livreur?token=TOKEN
//   3. Backend vérifie le token → retourne branding agence
//   4. Candidat remplit le formulaire (nom, prénom, téléphone, EMAIL)
//   5. Backend crée Livreur (enterprise_id du token) + invite User (Base44 auth)
//   6. Candidat accepte l'email → se connecte → activateEnterpriseDriver
//   7. Admin entreprise valide le livreur → actif=true
//
// SÉCURITÉ :
//   - enterprise_id résolu UNIQUEMENT depuis le token vérifié côté backend
//   - Email normalisé (trim + lowercase)
//   - Vérification email existant : public → REFUS, autre agence → REFUS
//   - Cohérence User.enterprise_id = Livreur.enterprise_id garantie
// ═══════════════════════════════════════════════════════════════════════════

const INVITATION_EXPIRY_DAYS = 7;

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    switch (action) {

      // ═══════════════════════════════════════════════════════════════════
      // 1. CRÉER UNE INVITATION (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'create_invitation': {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise') {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }
        if (!user.enterprise_id) {
          return Response.json({ error: 'Aucune entreprise rattachée à ce compte' }, { status: 403 });
        }

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
          enterprise_financier_id: user.enterprise_id,
        });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });
        if (!enterprise.actif || enterprise.statut !== 'actif') {
          return Response.json({ error: 'Entreprise suspendue' }, { status: 403 });
        }

        const token = generateToken();
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const invitation = await base44.asServiceRole.entities.EnterpriseDriverInvitation.create({
          enterprise_id: enterprise.enterprise_financier_id,
          enterprise_name: enterprise.nom,
          token,
          status: 'pending',
          expires_at: expiresAt,
          created_by: user.email,
          created_at: now,
          country_code: enterprise.country_code,
        });

        const inscriptionUrl = `https://silga-dispatch-go.base44.app/inscription-livreur?token=${token}`;

        return Response.json({ success: true, invitation, url: inscriptionUrl });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 2. VÉRIFIER UNE INVITATION (Public — retourne branding agence)
      // ═══════════════════════════════════════════════════════════════════
      case 'verify_invitation': {
        const { token } = body;
        if (!token) return Response.json({ error: 'Token requis' }, { status: 400 });

        const invitations = await base44.asServiceRole.entities.EnterpriseDriverInvitation.filter({
          token,
          status: 'pending',
        });
        const invitation = invitations?.[0];
        if (!invitation) {
          return Response.json({ error: 'Invitation invalide, déjà utilisée ou révoquée' }, { status: 404 });
        }

        // CAS 7: Check expiry
        if (new Date(invitation.expires_at) < new Date()) {
          await base44.asServiceRole.entities.EnterpriseDriverInvitation.update(invitation.id, {
            status: 'expired',
          });
          return Response.json({ error: 'Invitation expirée' }, { status: 410 });
        }

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
          enterprise_financier_id: invitation.enterprise_id,
        });
        const enterprise = enterprises?.[0];
        if (!enterprise || !enterprise.actif) {
          return Response.json({ error: 'Entreprise introuvable ou suspendue' }, { status: 404 });
        }

        return Response.json({
          success: true,
          enterprise: {
            nom: enterprise.nom || '',
            nom_commercial: enterprise.nom_commercial || enterprise.nom || '',
            logo_url: enterprise.logo_url || '',
            couleur_primaire: enterprise.couleur_primaire || '#007AFF',
            country_code: invitation.country_code,
          },
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 3. ACCEPTER UNE INVITATION (Public — crée Livreur + invite User)
      // ═══════════════════════════════════════════════════════════════════
      case 'accept_invitation': {
        const { token, nom, prenom, telephone, email, vehicule, ville, quartier } = body;
        if (!token || !nom || !telephone || !email) {
          return Response.json({ error: 'Token, nom, téléphone et email sont obligatoires' }, { status: 400 });
        }

        const normalizedEmail = normalizeEmail(email);

        // CAS 8/9: Verify token
        const invitations = await base44.asServiceRole.entities.EnterpriseDriverInvitation.filter({
          token,
          status: 'pending',
        });
        const invitation = invitations?.[0];
        if (!invitation) {
          return Response.json({ error: 'Invitation invalide, déjà utilisée ou révoquée' }, { status: 404 });
        }

        // CAS 7: Check expiry
        if (new Date(invitation.expires_at) < new Date()) {
          await base44.asServiceRole.entities.EnterpriseDriverInvitation.update(invitation.id, {
            status: 'expired',
          });
          return Response.json({ error: 'Invitation expirée' }, { status: 410 });
        }

        const inviteEntId = normalizeEnterpriseId(invitation.enterprise_id);

        // ── CAS 2/3/4: Check if User already exists ──
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
        const existingUser = existingUsers?.[0];

        if (existingUser) {
          const userEntId = normalizeEnterpriseId(existingUser.enterprise_id);

          // CAS 2: Public user
          if (userEntId === null) {
            return Response.json({
              error: 'Cette adresse e-mail appartient déjà à un compte livreur SILGAPP. Contactez SILGAPP pour rejoindre une agence.',
            }, { status: 409 });
          }

          // CAS 3: Different enterprise
          if (userEntId !== inviteEntId) {
            return Response.json({
              error: 'Ce compte appartient déjà à une autre agence. Contactez SILGAPP pour un transfert.',
            }, { status: 409 });
          }

          // CAS 4: Same enterprise — check if Livreur already exists
          const existingLivreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: normalizedEmail });
          if (existingLivreurs?.length > 0) {
            return Response.json({
              success: true,
              idempotent: true,
              message: 'Ce livreur est déjà enregistré pour cette agence.',
            });
          }

          // Create Livreur (User already exists with correct enterprise_id)
          const livreur = await base44.asServiceRole.entities.Livreur.create({
            nom,
            prenom: prenom || '',
            telephone,
            user_email: normalizedEmail,
            country_code: invitation.country_code,
            type_livreur: 'externe',
            reseau: 'externe',
            enterprise_id: invitation.enterprise_id,
            validation: 'en_attente',
            actif: false,
            statut: 'hors_ligne',
            vehicule: vehicule || 'moto',
            type_vehicule: vehicule || 'moto',
            ville: ville || '',
            quartier: quartier || '',
            montant_du_silga: 0,
            encours: 0,
            credit_surplus: 0,
            statut_paiement: 'paye',
            courses_du_jour: 0,
            note_moyenne: 0,
            nombre_avis: 0,
            bloque_encours: false,
          });

          await base44.asServiceRole.entities.EnterpriseDriverInvitation.update(invitation.id, {
            status: 'used',
            used_at: new Date().toISOString(),
            used_by_user_email: normalizedEmail,
          });

          return Response.json({
            success: true,
            livreur,
            message: 'Inscription réussie. Votre demande est en attente de validation par l\'agence.',
          });
        }

        // ── CAS 1: New email — check if Livreur already exists with this email ──
        const existingLivreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: normalizedEmail });
        if (existingLivreurs?.length > 0) {
          const livreurEntId = normalizeEnterpriseId(existingLivreurs[0].enterprise_id);

          // CAS 2: Public livreur (no enterprise_id)
          if (livreurEntId === null) {
            return Response.json({
              error: 'Cette adresse e-mail appartient déjà à un compte livreur SILGAPP. Contactez SILGAPP pour rejoindre une agence.',
            }, { status: 409 });
          }

          // CAS 3: Different enterprise
          if (livreurEntId !== inviteEntId) {
            return Response.json({
              error: 'Ce compte appartient déjà à une autre agence. Contactez SILGAPP pour un transfert.',
            }, { status: 409 });
          }

          // CAS 4: Same enterprise — idempotent
          return Response.json({
            success: true,
            idempotent: true,
            message: 'Ce livreur est déjà enregistré pour cette agence.',
          });
        }

        // ── CAS 1: New email — create Livreur + invite User ──
        const livreur = await base44.asServiceRole.entities.Livreur.create({
          nom,
          prenom: prenom || '',
          telephone,
          user_email: normalizedEmail,
          country_code: invitation.country_code,
          type_livreur: 'externe',
          reseau: 'externe',
          enterprise_id: invitation.enterprise_id,
          validation: 'en_attente',
          actif: false,
          statut: 'hors_ligne',
          vehicule: vehicule || 'moto',
          type_vehicule: vehicule || 'moto',
          ville: ville || '',
          quartier: quartier || '',
          montant_du_silga: 0,
          encours: 0,
          credit_surplus: 0,
          statut_paiement: 'paye',
          courses_du_jour: 0,
          note_moyenne: 0,
          nombre_avis: 0,
          bloque_encours: false,
        });

        // Invite User via Base44 auth (User created asynchronously after acceptance)
        try {
          await base44.users.inviteUser(normalizedEmail, 'user');
        } catch (inviteErr: any) {
          if (!String(inviteErr?.message || '').includes('already')) {
            console.error('[manageDriverInvitation] inviteUser error:', inviteErr?.message);
          }
          // Non-blocking: Livreur is created, admin can resend invitation later
        }

        // Mark invitation as used
        await base44.asServiceRole.entities.EnterpriseDriverInvitation.update(invitation.id, {
          status: 'used',
          used_at: new Date().toISOString(),
          used_by_user_email: normalizedEmail,
        });

        return Response.json({
          success: true,
          livreur,
          message: 'Inscription réussie. Vérifiez votre email pour activer votre compte.',
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 4. LISTER LES INVITATIONS (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'list_invitations': {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const invitations = await base44.asServiceRole.entities.EnterpriseDriverInvitation.filter(
          { enterprise_id: user.enterprise_id },
          '-created_at', 100
        );
        return Response.json({ success: true, invitations });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 5. LISTER LES LIVREURS EN ATTENTE (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'list_pending_drivers': {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const livreurs = await base44.asServiceRole.entities.Livreur.filter(
          { enterprise_id: user.enterprise_id, validation: 'en_attente' },
          '-created_date', 100
        );
        return Response.json({ success: true, livreurs });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 6. VALIDER UN LIVREUR (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'validate_driver': {
        const { livreur_id } = body;
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
        if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

        // CAS 6: Admin B can't validate candidate A
        const livreurEntId = normalizeEnterpriseId(livreur.enterprise_id);
        const adminEntId = normalizeEnterpriseId(user.enterprise_id);
        if (livreurEntId !== adminEntId) {
          return Response.json({ error: 'Ce livreur n\'appartient pas à votre agence' }, { status: 403 });
        }

        // CAS 17: Check User/Livreur coherence
        if (livreur.user_email) {
          const users = await base44.asServiceRole.entities.User.filter({ email: livreur.user_email });
          const livreurUser = users?.[0];
          if (livreurUser) {
            const userEntId = normalizeEnterpriseId(livreurUser.enterprise_id);
            if (userEntId !== livreurEntId) {
              return Response.json({
                error: 'Incohérence détectée : User.enterprise_id != Livreur.enterprise_id. Validation refusée. Contactez le support.',
              }, { status: 409 });
            }
          }
        }

        await base44.asServiceRole.entities.Livreur.update(livreur_id, {
          validation: 'valide',
          actif: true,
          valide_at: new Date().toISOString(),
          valide_par: user.email,
        });

        return Response.json({ success: true, message: 'Livreur validé' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 7. REFUSER UN LIVREUR (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'refuse_driver': {
        const { livreur_id, motif } = body;
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
        if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

        const livreurEntId = normalizeEnterpriseId(livreur.enterprise_id);
        const adminEntId = normalizeEnterpriseId(user.enterprise_id);
        if (livreurEntId !== adminEntId) {
          return Response.json({ error: 'Ce livreur n\'appartient pas à votre agence' }, { status: 403 });
        }

        await base44.asServiceRole.entities.Livreur.update(livreur_id, {
          validation: 'refuse',
          actif: false,
          refuse_at: new Date().toISOString(),
          refuse_par: user.email,
          motif_refus: motif || 'Refusé par l\'agence',
        });

        return Response.json({ success: true, message: 'Livreur refusé' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 8. RÉVOQUER UNE INVITATION (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'revoke_invitation': {
        const { invitation_id } = body;
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const invitation = await base44.asServiceRole.entities.EnterpriseDriverInvitation.get(invitation_id).catch(() => null);
        if (!invitation) return Response.json({ error: 'Invitation introuvable' }, { status: 404 });

        if (normalizeEnterpriseId(invitation.enterprise_id) !== normalizeEnterpriseId(user.enterprise_id)) {
          return Response.json({ error: 'Cette invitation n\'appartient pas à votre agence' }, { status: 403 });
        }

        await base44.asServiceRole.entities.EnterpriseDriverInvitation.update(invitation_id, {
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: user.email,
        });

        return Response.json({ success: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // 9. METTRE À JOUR LE BRANDING (Admin Entreprise)
      // ═══════════════════════════════════════════════════════════════════
      case 'update_branding': {
        const { nom_commercial, whatsapp, logo_url, couleur_primaire, telephone, adresse } = body;
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
        if (user.silgapp_role !== 'admin_entreprise' || !user.enterprise_id) {
          return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
        }

        const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
          enterprise_financier_id: user.enterprise_id,
        });
        const enterprise = enterprises?.[0];
        if (!enterprise) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 });

        const updateData: any = {};
        if (nom_commercial !== undefined) updateData.nom_commercial = nom_commercial;
        if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
        if (logo_url !== undefined) updateData.logo_url = logo_url;
        if (couleur_primaire !== undefined) updateData.couleur_primaire = couleur_primaire;
        if (telephone !== undefined) updateData.telephone = telephone;
        if (adresse !== undefined) updateData.adresse = adresse;

        const updated = await base44.asServiceRole.entities.Enterprise.update(enterprise.id, updateData);
        return Response.json({ success: true, enterprise: updated });
      }

      default:
        return Response.json({ error: 'Action inconnue: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}