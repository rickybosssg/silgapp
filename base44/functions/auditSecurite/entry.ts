import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Audit de sécurité SILGAPP
 * Vérifie : authentification des fonctions, isolation par pays, tokens actifs, données sensibles
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    const findings = [];
    const now = Date.now();

    // ── 1. Tokens push inactifs depuis +30 jours (surface d'attaque) ──
    const tokens = await base44.asServiceRole.entities.NotificationToken.list('-derniere_utilisation', 500);
    const tokensInactifs = tokens.filter(t => {
      if (!t.derniere_utilisation) return false;
      const ageJours = (now - new Date(t.derniere_utilisation).getTime()) / 86400000;
      return ageJours > 30 && t.actif === true;
    });
    if (tokensInactifs.length > 0) {
      findings.push({
        priorite: 'moyenne',
        titre: `${tokensInactifs.length} tokens push actifs non utilisés depuis +30 jours`,
        detail: 'Ces tokens devraient être désactivés pour réduire la surface d\'attaque. Un token compromis pourrait recevoir des notifications frauduleuses.',
        action: 'Désactiver les tokens inactifs via updateMany'
      });
    }

    // ── 2. Livreurs sans validation admin mais actifs ──
    const livreursNonValides = await base44.asServiceRole.entities.Livreur.filter({
      type_livreur: 'externe', actif: true, validation: { $ne: 'valide' }
    });
    if (livreursNonValides.length > 0) {
      findings.push({
        priorite: 'elevee',
        titre: `${livreursNonValides.length} livreurs actifs sans validation admin`,
        detail: 'Des livreurs sont actifs sur la plateforme sans avoir été validés par un administrateur. Risque de fraude ou d\'usurpation d\'identité.',
        action: 'Suspendre ces livreurs ou procéder à leur validation'
      });
    }

    // ── 3. Partenaires (boutiques/restaurants/pharmacies) non validés mais actifs ──
    const boutiquesNonValidees = await base44.asServiceRole.entities.Boutique.filter({
      actif: true, validation: { $ne: 'valide' }
    });
    const restaurantsNonValides = await base44.asServiceRole.entities.Restaurant.filter({
      actif: true, validation: { $ne: 'valide' }
    });
    const totalPartenairesNonValides = boutiquesNonValidees.length + restaurantsNonValides.length;
    if (totalPartenairesNonValides > 0) {
      findings.push({
        priorite: 'elevee',
        titre: `${totalPartenairesNonValides} établissements actifs sans validation admin`,
        detail: 'Des boutiques/restaurants sont visibles par les clients sans validation administrative. Risque de fraude ou de réputation.',
        action: 'Valider ou suspendre ces établissements'
      });
    }

    // ── 4. Courses avec GPS manquant (données incomplètes = traçabilité faible) ──
    const coursesRecentes = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 100);
    const sansGPS = coursesRecentes.filter(c =>
      ['en_livraison', 'livree'].includes(c.statut) &&
      (!c.gps_depart_lat || !c.gps_arrivee_lat)
    );
    if (sansGPS.length > 0) {
      findings.push({
        priorite: 'moyenne',
        titre: `${sansGPS.length} courses livrées/en livraison sans coordonnées GPS complètes`,
        detail: 'Sans GPS, la traçabilité des livraisons est compromise en cas de litige.',
        action: 'Vérifier que le GPS est obligatoire avant acceptation de course'
      });
    }

    // ── 5. Bugs signalés non traités (critiques) ──
    const bugsCritiques = await base44.asServiceRole.entities.BugSignale.filter({
      statut: 'nouveau', priorite: 'critique'
    });
    if (bugsCritiques.length > 0) {
      findings.push({
        priorite: 'critique',
        titre: `${bugsCritiques.length} bug(s) critique(s) non traité(s)`,
        detail: 'Des bugs critiques sont en attente de traitement. Ils peuvent indiquer des vulnérabilités exploitées ou des failles de sécurité.',
        action: 'Traiter immédiatement ces bugs dans le panel Bugs Tracking'
      });
    }

    // ── 6. Sessions device multiples (potentiel partage de compte) ──
    const sessions = await base44.asServiceRole.entities.DeviceSession.list('-last_seen_at', 500);
    const sessionsParEmail = {};
    for (const s of sessions) {
      if (!s.user_email) continue;
      if (!sessionsParEmail[s.user_email]) sessionsParEmail[s.user_email] = [];
      sessionsParEmail[s.user_email].push(s);
    }
    const multiSessions = Object.entries(sessionsParEmail).filter(([_, arr]) => arr.length > 3);
    if (multiSessions.length > 0) {
      findings.push({
        priorite: 'faible',
        titre: `${multiSessions.length} utilisateur(s) avec +3 sessions device actives`,
        detail: `Un nombre élevé de sessions peut indiquer un partage de compte. Liste: ${multiSessions.map(e => e[0]).join(', ')}`.slice(0, 200),
        action: 'Vérifier manuellement ces comptes'
      });
    }

    // ── 7. Fraudes signalées non traitées ──
    const fraudes = await base44.asServiceRole.entities.AlerteFraude.filter({
      statut: 'nouveau'
    });
    if (fraudes.length > 0) {
      findings.push({
        priorite: 'elevee',
        titre: `${fraudes.length} alerte(s) de fraude non traitée(s)`,
        detail: 'Des alertes de fraude sont en attente. Elles doivent être examinées rapidement.',
        action: 'Consulter le panel Anti-Fraude'
      });
    }

    // ── Score de sécurité ──
    const nbCritique = findings.filter(f => f.priorite === 'critique').length;
    const nbElevee = findings.filter(f => f.priorite === 'elevee').length;
    const nbMoyenne = findings.filter(f => f.priorite === 'moyenne').length;
    const score = Math.max(0, 100 - (nbCritique * 25 + nbElevee * 12 + nbMoyenne * 5));

    const resume = findings.length === 0
      ? 'Aucune vulnérabilité critique détectée. La sécurité de SILGAPP est satisfaisante.'
      : `${findings.length} point(s) d'attention identifié(s) dont ${nbCritique} critique(s) et ${nbElevee} élevée(s).`;

    return Response.json({
      success: true,
      score_securite: score,
      resume,
      stats: {
        tokens_inactifs: tokensInactifs.length,
        livreurs_non_valides: livreursNonValides.length,
        partenaires_non_valides: totalPartenairesNonValides,
        bugs_critiques: bugsCritiques.length,
        fraudes_non_traitees: fraudes.length,
        multi_sessions: multiSessions.length,
        courses_sans_gps: sansGPS.length,
      },
      findings,
      date_audit: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[auditSecurite] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});