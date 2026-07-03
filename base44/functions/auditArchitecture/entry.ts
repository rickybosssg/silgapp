import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    // ── Inventaire des entités et leurs volumes ──
    const entityNames = [
      'CourseExterne', 'Livreur', 'ClientExterne', 'Boutique', 'Restaurant', 'Pharmacie',
      'CommandeBoutique', 'CommandeRestaurant', 'Message', 'Conversation', 'Notification',
      'NotificationToken', 'AppInstall', 'User', 'PaiementPartenaire', 'CodePromo', 'PrimePromo',
      'NeoAnalyse', 'NeoRecommendation', 'BugSignale', 'AppConfig', 'CommissionConfig',
      'Country', 'TicketSupport', 'AlerteFraude', 'Publicite', 'VenusInteraction'
    ];

    const entityStats = [];
    for (const name of entityNames) {
      try {
        const items = await base44.asServiceRole.entities[name].list('-created_date', 1);
        entityStats.push({ entity: name, accessible: true, sample_count: items?.length || 0 });
      } catch (e) {
        entityStats.push({ entity: name, accessible: false, error: e.message?.slice(0, 100) });
      }
    }

    // ── Catalogue des fonctions backend connues (inventaire statique) ──
    const knownFunctions = [
      'annulerCourseExterne', 'annulerCoursePrixManuel', 'appliquerConfigTousPays', 'apprendreQuartiers',
      'calculPrixCourseExterne', 'changerStatutCommande', 'checkSMSBurkinaFaso', 'checkTwilioStatus',
      'clientSync', 'correctionAgressive', 'correctionCoursesBloquees', 'correctionEnCourse', 'correctionFallbacks',
      'createLivreur', 'creerCommandePartenaire', 'creerLivraisonPharmacie', 'deleteLivreur',
      'demarrerConversationPharmacie', 'detecterZonesChaudes', 'diagnosticFirebasePush', 'diagnosticLivraison',
      'diagnosticPushTokens', 'diagnosticSandboxWhatsApp', 'diagnosticTwilio', 'dispatchExterneAuto', 'dispatchMoteur',
      'enregistrerPaiementPartenaire', 'enregistrerTokenPush', 'envoiNotificationPush', 'envoyerAlerteWhatsApp',
      'envoyerMessage', 'envoyerRapportGooglePlay', 'fermerCoursesExpirees', 'findLivreurByCode',
      'forceClientGPSSync', 'genererCodesLivreurs', 'genererRapportGooglePlay', 'gererDemoAccess',
      'gestionPauseCourse', 'gestionPresenceLivreurs', 'gestionSessionClient', 'gestionSessionLivreur',
      'getAllCoursesForLivreur', 'getComptabiliteData', 'getComptabilitePartenaire', 'getDemoStats',
      'getDownloadStats', 'getDownloadStatsPublic', 'getLivreurs', 'getNotificationStats', 'getStatsGlobales',
      'getSuiviCourse', 'heartbeatAuto', 'initClientAuto', 'initLivreurAuto', 'integrationSync',
      'lancerDispatchProgramme', 'libererLivreurCourseLivree', 'loggerErreur', 'maintenanceNuit',
      'marquerToutesNotificationsLues', 'migrerClientVersLivreur', 'nativeLivreur', 'neoAnalyse',
      'nettoyerCourseAnnulee', 'nettoyerCoursesFantomes', 'notifierDemandesLivreurs', 'notifyClientSync',
      'paiementLivreur', 'reactiverTokensLivreurs', 'reparationPrix', 'resetAlerteWhatsApp',
      'resyncLivreurStatut', 'retroCorrigerCourses', 'sendCourseWhatsApp', 'sendPushCampagne',
      'servirDemoPage', 'syncClientGPS', 'syncCommandeFromCourse', 'syncLivreurGPS', 'syncLivreursLocaux',
      'syncStatutLivreurOnCourse', 'testAuto', 'testSMS', 'trackAppInstall', 'trackDownload',
      'trackDownloadPublic', 'triggerSyncLivreursLocaux', 'updateLivreur', 'updateLivreurPhoto',
      'validateCourseRoles', 'validateQRCode', 'validerPaiementPartenaire', 'validerPrimePromo',
      'venusAnalytics', 'verifierConversationAutorisee', 'verifierEncoursLivreur', 'verifierFraude',
      'verifierOptInWhatsApp', 'auditArchitecture', 'auditerNotifications'
    ];

    // ── Détection de fonctions potentiellement redondantes (préfixes communs) ──
    const prefixGroups = {};
    for (const fn of knownFunctions) {
      const prefix = fn.split(/(?=[A-Z])/).slice(0, 2).join('').toLowerCase();
      if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
      prefixGroups[prefix].push(fn);
    }
    const potentialDuplicates = Object.entries(prefixGroups)
      .filter(([_, fns]) => fns.length > 1)
      .map(([prefix, fns]) => ({ prefix, functions: fns }));

    // ── Catégorisation fonctionnelle ──
    const categories = {
      dispatch: knownFunctions.filter(f => f.includes('dispatch') || f.includes('Dispatch')),
      sync: knownFunctions.filter(f => f.includes('sync') || f.includes('Sync')),
      diagnostic: knownFunctions.filter(f => f.includes('diagnostic') || f.includes('Diagnostic')),
      correction: knownFunctions.filter(f => f.includes('correction') || f.includes('Correction') || f.includes('nettoyer') || f.includes('Nettoyer')),
      notification: knownFunctions.filter(f => f.includes('notif') || f.includes('Notif') || f.includes('push') || f.includes('Push')),
      session: knownFunctions.filter(f => f.includes('session') || f.includes('Session') || f.includes('heartbeat') || f.includes('gestionPresence')),
      gps: knownFunctions.filter(f => f.includes('gps') || f.includes('GPS') || f.includes('Localisation')),
      paiement: knownFunctions.filter(f => f.includes('paiement') || f.includes('Paiement') || f.includes('comptabilite') || f.includes('Comptabilite')),
      test: knownFunctions.filter(f => f.startsWith('test') || f.includes('Sandbox')),
    };

    // ── Recommandations architecturales automatiques ──
    const recommandations = [];

    if (categories.diagnostic.length > 5) {
      recommandations.push({
        priorite: 'moyenne',
        titre: 'Centraliser les fonctions de diagnostic',
        detail: `${categories.diagnostic.length} fonctions de diagnostic détectées. Envisager de les regrouper en une seule fonction paramétrée par type de diagnostic.`,
        fonctions: categories.diagnostic,
      });
    }

    if (categories.correction.length > 5) {
      recommandations.push({
        priorite: 'elevee',
        titre: 'Consolider les fonctions de correction/nettoyage',
        detail: `${categories.correction.length} fonctions de correction et nettoyage. Risque de logique fragmentée et de maintenance difficile. Regrouper en un module de maintenance unifié.`,
        fonctions: categories.correction,
      });
    }

    if (categories.sync.length > 8) {
      recommandations.push({
        priorite: 'moyenne',
        titre: 'Unifier les fonctions de synchronisation',
        detail: `${categories.sync.length} fonctions de sync. Envisager un pattern unifié de synchronisation avec paramètre d'entité cible.`,
        fonctions: categories.sync,
      });
    }

    const totalFunctions = knownFunctions.length;
    const totalEntities = entityNames.length;

    return Response.json({
      date_audit: new Date().toISOString(),
      resume: `Architecture SILGAPP: ${totalFunctions} fonctions backend, ${totalEntities} entités. ${recommandations.length} recommandation(s) architecturale(s) générée(s).`,
      stats: {
        total_fonctions: totalFunctions,
        total_entites: totalEntities,
        entites_accessibles: entityStats.filter(e => e.accessible).length,
        entites_inaccessibles: entityStats.filter(e => !e.accessible).length,
      },
      entity_inventory: entityStats,
      categories_fonctionnelles: categories,
      potentiels_doublons: potentialDuplicates,
      recommandations,
      lance_par: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});