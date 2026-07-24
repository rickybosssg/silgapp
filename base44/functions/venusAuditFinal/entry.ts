/**
 * venusAuditFinal — Backend function for VENUS final certification audit
 *
 * Actions:
 *  - run_audit: executes a complete audit and stores the result
 *  - get_latest: returns the latest certification report
 *  - get_history: returns audit history
 *  - get_training_mode: returns current training mode status
 *  - set_training_mode: enables/disables training mode
 *  - get_features: returns the feature list
 *  - get_roadmap: returns the roadmap
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  executerAuditComplet,
  getTrainingMode,
  setTrainingMode,
  FONCTIONNALITES,
  ROADMAP,
} from '../../shared/venusAuditEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case 'run_audit': {
        const audit = await executerAuditComplet(base44);
        const report = await base44.asServiceRole.entities.VenusCertificationReport.create({
          type_audit: 'complet',
          score_global: audit.scores_detailles.global,
          score_architecture: audit.scores_detailles.architecture,
          score_integrations: audit.scores_detailles.integrations,
          score_fonctionnel: audit.scores_detailles.fonctionnel,
          score_securite: audit.scores_detailles.securite,
          score_performance: audit.scores_detailles.performance,
          score_qualite: audit.scores_detailles.qualite,
          score_readiness: audit.scores_detailles.readiness,
          niveau_maturite: audit.niveau_maturite,
          resume: audit.resume,
          modules_audite: JSON.stringify(audit.modules),
          integrations_audite: JSON.stringify(audit.integrations),
          tests_fonctionnels: JSON.stringify(audit.tests_fonctionnels),
          checks_securite: JSON.stringify(audit.checks_securite),
          metriques_performance: JSON.stringify(audit.performance),
          evaluation_qualite: JSON.stringify(audit.qualite),
          readiness_checklist: JSON.stringify(audit.readiness),
          recommandations: JSON.stringify(audit.recommandations),
          risques: JSON.stringify(audit.risques),
          fonctionnalites: JSON.stringify(audit.fonctionnalites),
          statut: 'termine',
          declenche_par: user.email || 'admin',
          date_audit: audit.date,
          date_fin: new Date().toISOString(),
        });
        return Response.json({ success: true, report, audit });
      }

      case 'get_latest': {
        const reports = await base44.asServiceRole.entities.VenusCertificationReport.filter(
          { type_audit: 'complet', statut: 'termine' }, '-date_audit', 1
        );
        if (reports.length === 0) return Response.json({ success: true, report: null });
        const report = reports[0];
        const parsed = {
          ...report,
          modules_audite: typeof report.modules_audite === 'string' ? JSON.parse(report.modules_audite) : report.modules_audite,
          integrations_audite: typeof report.integrations_audite === 'string' ? JSON.parse(report.integrations_audite) : report.integrations_audite,
          tests_fonctionnels: typeof report.tests_fonctionnels === 'string' ? JSON.parse(report.tests_fonctionnels) : report.tests_fonctionnels,
          checks_securite: typeof report.checks_securite === 'string' ? JSON.parse(report.checks_securite) : report.checks_securite,
          metriques_performance: typeof report.metriques_performance === 'string' ? JSON.parse(report.metriques_performance) : report.metriques_performance,
          evaluation_qualite: typeof report.evaluation_qualite === 'string' ? JSON.parse(report.evaluation_qualite) : report.evaluation_qualite,
          readiness_checklist: typeof report.readiness_checklist === 'string' ? JSON.parse(report.readiness_checklist) : report.readiness_checklist,
          recommandations: typeof report.recommandations === 'string' ? JSON.parse(report.recommandations) : report.recommandations,
          risques: typeof report.risques === 'string' ? JSON.parse(report.risques) : report.risques,
          fonctionnalites: typeof report.fonctionnalites === 'string' ? JSON.parse(report.fonctionnalites) : report.fonctionnalites,
        };
        return Response.json({ success: true, report: parsed });
      }

      case 'get_history': {
        const reports = await base44.asServiceRole.entities.VenusCertificationReport.filter(
          { type_audit: 'complet', statut: 'termine' }, '-date_audit', 20
        );
        return Response.json({ success: true, reports });
      }

      case 'get_training_mode': {
        const enabled = await getTrainingMode(base44);
        return Response.json({ success: true, enabled });
      }

      case 'set_training_mode': {
        const { enabled } = params;
        const result = await setTrainingMode(base44, enabled, user.email || 'admin');
        return Response.json({ success: true, enabled: result });
      }

      case 'get_features': {
        return Response.json({ success: true, features: FONCTIONNALITES });
      }

      case 'get_roadmap': {
        return Response.json({ success: true, roadmap: ROADMAP });
      }

      default:
        return Response.json({ success: false, error: 'Action non reconnue' });
    }
  } catch (error) {
    console.error('[venusAuditFinal] Error:', error.message);
    return Response.json({ success: false, error: error.message });
  }
});