import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  verifierTousOutils,
  verifierAlertesAutomatiques,
  detecterAnomalies,
  creerSauvegarde,
} from '../../shared/venusSupervisionEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const task = body.task || 'health_check';

    const results: any = { task, timestamp: new Date().toISOString() };

    switch (task) {
      case 'health_check': {
        // 1. Vérifier tous les outils
        const tools = await verifierTousOutils(base44);
        results.tools = tools;

        // 2. Vérifier les alertes automatiques
        const alertes = await verifierAlertesAutomatiques(base44);
        results.alertes_creees = alertes.length;

        // 3. Détecter les anomalies
        const anomalies = await detecterAnomalies(base44);
        results.anomalies_creees = anomalies.length;

        results.success = true;
        break;
      }

      case 'auto_backup': {
        // Sauvegarde automatique quotidienne
        const types = ['knowledge_base', 'scenarios', 'workflows', 'long_term_memory'];
        const backups: any[] = [];
        for (const type of types) {
          try {
            const backup = await creerSauvegarde(base44, type, 'auto', true);
            backups.push({ type, success: true, records: backup.nb_records });
          } catch (e) {
            backups.push({ type, success: false, error: e.message });
          }
        }
        results.backups = backups;
        results.success = true;
        break;
      }

      default:
        results.error = `Tâche inconnue: ${task}`;
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});