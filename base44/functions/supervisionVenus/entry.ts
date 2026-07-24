import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  calculerMetriquesTempsReel,
  verifierTousOutils,
  getStatutsOutils,
  verifierAlertesAutomatiques,
  detecterAnomalies,
  creerSauvegarde,
  restaurerSauvegarde,
  getMaintenanceMode,
  setMaintenanceMode,
  loggerAudit,
  checkPermission,
  getRoleLabel,
  ROLES_VENUS,
} from '../../shared/venusSupervisionEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    const userRole = body.role || user.role || 'admin_ia';

    switch (action) {
      case 'get_dashboard': {
        const [metrics, tools, alerts, anomalies, escalations, maintenance, auditRecent] = await Promise.all([
          calculerMetriquesTempsReel(base44),
          getStatutsOutils(base44),
          base44.asServiceRole.entities.VenusSupervisionAlert.filter({ statut: 'active' }, '-creee_date', 50),
          base44.asServiceRole.entities.VenusAnomaly.filter({ statut: 'active' }, '-creee_date', 30),
          base44.asServiceRole.entities.VenusEscalation.filter({ statut: 'en_attente' }, '-creee_date', 20),
          getMaintenanceMode(base44),
          base44.asServiceRole.entities.VenusAuditLog.list('-date_action', 20),
        ]);

        const toolsOk = tools.filter((t: any) => t.statut === 'operationnel').length;
        const toolsTotal = tools.length;

        return Response.json({
          metrics,
          tools: { items: tools, operationnels: toolsOk, total: toolsTotal, sante: Math.round((toolsOk / toolsTotal) * 100) },
          alerts,
          anomalies,
          escalations,
          maintenance,
          audit_recent: auditRecent,
          roles: ROLES_VENUS,
          user_info: { email: user.email, role: userRole, role_label: getRoleLabel(userRole) },
        });
      }

      case 'check_tools': {
        const results = await verifierTousOutils(base44);
        await loggerAudit(base44, {
          utilisateur: user.email,
          role: userRole,
          action: 'other',
          categorie: 'supervision',
          details: `Vérification des outils: ${results.filter(r => r.statut === 'operationnel').length}/${results.length} opérationnels`,
        });
        return Response.json({ tools: results });
      }

      case 'check_alerts': {
        const alertes = await verifierAlertesAutomatiques(base44);
        return Response.json({ alertes_creees: alertes.length, alertes });
      }

      case 'check_anomalies': {
        const anomalies = await detecterAnomalies(base44);
        return Response.json({ anomalies_creees: anomalies.length, anomalies });
      }

      case 'resolve_alert': {
        const { alert_id, resolution_note } = body;
        const alert = await base44.asServiceRole.entities.VenusSupervisionAlert.update(alert_id, {
          statut: 'résolue',
          resolue_par: user.email,
          resolue_at: new Date().toISOString(),
          resolution_note: resolution_note || null,
        });
        await loggerAudit(base44, {
          utilisateur: user.email,
          role: userRole,
          action: 'alert_resolve',
          categorie: 'supervision',
          entity_type: 'VenusSupervisionAlert',
          entity_id: alert_id,
          details: resolution_note || 'Alerte résolue',
        });
        return Response.json({ alert });
      }

      case 'assign_escalation': {
        const { escalation_id } = body;
        const esc = await base44.asServiceRole.entities.VenusEscalation.update(escalation_id, {
          statut: 'pris_en_charge',
          assigne_a: user.email,
          prise_en_charge_date: new Date().toISOString(),
        });
        await loggerAudit(base44, {
          utilisateur: user.email,
          role: userRole,
          action: 'escalation_handle',
          categorie: 'escalation',
          entity_type: 'VenusEscalation',
          entity_id: escalation_id,
          details: 'Escalade prise en charge',
        });
        return Response.json({ escalation: esc });
      }

      case 'resolve_escalation': {
        const { escalation_id, resolution, client_informe } = body;
        const esc = await base44.asServiceRole.entities.VenusEscalation.update(escalation_id, {
          statut: 'résolu',
          resolution,
          client_informe: client_informe || false,
          resolue_date: new Date().toISOString(),
        });
        await loggerAudit(base44, {
          utilisateur: user.email,
          role: userRole,
          action: 'escalation_handle',
          categorie: 'escalation',
          entity_type: 'VenusEscalation',
          entity_id: escalation_id,
          details: `Escalade résolue: ${resolution}`,
        });
        return Response.json({ escalation: esc });
      }

      case 'get_escalation_detail': {
        const { escalation_id } = body;
        const esc = await base44.asServiceRole.entities.VenusEscalation.get(escalation_id);
        if (!esc) return Response.json({ error: 'Escalade introuvable' }, { status: 404 });

        // Récupérer les messages de la conversation
        let messages = [];
        if (esc.conversation_id) {
          messages = await base44.asServiceRole.entities.Message.filter(
            { conversation_id: esc.conversation_id },
            'created_date',
            100
          );
        }

        return Response.json({
          escalation: esc,
          messages: messages.map((m: any) => ({
            role: m.sender_type,
            content: m.content || m.transcription || '',
            timestamp: m.created_date,
            type: m.message_type,
          })),
        });
      }

      case 'create_backup': {
        const { type } = body;
        const backup = await creerSauvegarde(base44, type, user.email, false);
        return Response.json({ backup });
      }

      case 'restore_backup': {
        const { backup_id } = body;
        const result = await restaurerSauvegarde(base44, backup_id, user.email);
        return Response.json({ result });
      }

      case 'list_backups': {
        const backups = await base44.asServiceRole.entities.VenusBackup.list('-date_creation', 50);
        return Response.json({ backups });
      }

      case 'toggle_maintenance': {
        const { active, message } = body;
        await setMaintenanceMode(base44, active, message || '', user.email);
        return Response.json({ active, message });
      }

      case 'get_audit_log': {
        const { limit, categorie, action: logAction } = body;
        let query: any = {};
        if (categorie) query.categorie = categorie;
        if (logAction) query.action = logAction;
        const logs = await base44.asServiceRole.entities.VenusAuditLog.filter(query, '-date_action', limit || 100);
        return Response.json({ logs });
      }

      case 'get_alerts': {
        const { statut, severite } = body;
        let query: any = {};
        if (statut) query.statut = statut;
        if (severite) query.severite = severite;
        const alerts = await base44.asServiceRole.entities.VenusSupervisionAlert.filter(query, '-creee_date', 100);
        return Response.json({ alerts });
      }

      case 'get_escalations': {
        const { statut } = body;
        let query: any = {};
        if (statut) query.statut = statut;
        const escalations = await base44.asServiceRole.entities.VenusEscalation.filter(query, '-creee_date', 100);
        return Response.json({ escalations });
      }

      case 'get_anomalies': {
        const { statut } = body;
        let query: any = {};
        if (statut) query.statut = statut;
        const anomalies = await base44.asServiceRole.entities.VenusAnomaly.filter(query, '-creee_date', 100);
        return Response.json({ anomalies });
      }

      case 'resolve_anomaly': {
        const { anomaly_id, resolution_note } = body;
        const anomaly = await base44.asServiceRole.entities.VenusAnomaly.update(anomaly_id, {
          statut: 'résolue',
          resolue_par: user.email,
          resolue_date: new Date().toISOString(),
          resolution_note: resolution_note || null,
        });
        await loggerAudit(base44, {
          utilisateur: user.email,
          role: userRole,
          action: 'alert_resolve',
          categorie: 'supervision',
          entity_type: 'VenusAnomaly',
          entity_id: anomaly_id,
          details: resolution_note || 'Anomalie résolue',
        });
        return Response.json({ anomaly });
      }

      default:
        return Response.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});