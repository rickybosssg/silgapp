import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  findEligibleHabitClients,
  sendHabitReminders,
  checkHabitConversions,
} from '../../shared/habitReminderEngine.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run';

    // ── Action : audit (analyse sans rien créer) ──
    if (action === 'audit') {
      const eligible = await findEligibleHabitClients(base44, true);
      return Response.json({
        action: 'audit',
        eligible_count: eligible.length,
        details: eligible.map(e => ({
          client_id: e.client.id,
          segment: e.segment,
          delivered_count: e.deliveredCount,
          habit_type: e.habit.type,
          habit_occurrences: e.habit.occurrences,
          habit_ratio: Number(e.habit.ratio.toFixed(2)),
          is_control: e.isControl,
          has_fcm: !!e.token?.token,
        })),
      });
    }

    // ── Action : run (envoyer ou simuler) ──
    if (action === 'run') {
      const eligible = await findEligibleHabitClients(base44);

      // Vérifier la config
      const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
      const configMap: Record<string, string> = {};
      for (const c of configs) {
        if (c.cle) configMap[c.cle] = c.valeur;
      }
      const enabled = configMap['HABIT_REMINDER_ENABLED'] === 'true';
      const dryRun = configMap['HABIT_REMINDER_DRY_RUN'] !== 'false';

      if (!enabled) {
        return Response.json({
          action: 'run',
          status: 'disabled',
          message: 'HABIT_REMINDER_ENABLED is not true. No reminders sent.',
          eligible_count: eligible.length,
        });
      }

      const result = await sendHabitReminders(base44, eligible, dryRun);
      return Response.json({
        action: 'run',
        dry_run: dryRun,
        eligible_count: eligible.length,
        ...result,
      });
    }

    // ── Action : check_conversions ──
    if (action === 'check_conversions') {
      const converted = await checkHabitConversions(base44);
      return Response.json({
        action: 'check_conversions',
        converted,
      });
    }

    // ── Action : stats (indicateurs admin) ──
    if (action === 'stats') {
      const now = Date.now();
      const thirtyDaysAgo = new Date(now - 30 * 86400000);

      // Courses livrées 30 derniers jours
      const courses30: any[] = [];
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.CourseExterne.filter(
          { statut: 'livree' }, '-created_date', 500, skip
        );
        if (!batch || batch.length === 0) break;
        courses30.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
        if (skip > 5000) break;
      }

      const coursesIn30 = courses30.filter(c => {
        const d = c.created_date ? new Date(c.created_date).getTime() : 0;
        return d >= thirtyDaysAgo.getTime();
      });

      const activeClients30 = new Set<string>();
      for (const c of coursesIn30) {
        const key = c.client_phone_normalized || c.client_telephone || c.client_user_email || '';
        if (key) activeClients30.add(key);
      }

      // Segmentation par nombre total de courses livrées
      const totalClientMap = new Map<string, number>();
      for (const c of courses30) {
        const key = c.client_phone_normalized || c.client_telephone || c.client_user_email || '';
        if (!key) continue;
        totalClientMap.set(key, (totalClientMap.get(key) || 0) + 1);
      }

      let nouveau = 0, dev = 0, regulier = 0, tresRegulier = 0;
      for (const [, count] of totalClientMap) {
        if (count <= 1) nouveau++;
        else if (count <= 4) dev++;
        else if (count <= 9) regulier++;
        else tresRegulier++;
      }

      // Rappels d'habitude
      const allReminders = await base44.asServiceRole.entities.HabitReminder.list();
      const sentReminders = allReminders.filter((r: any) => r.status === 'sent');
      const convertedReminders = allReminders.filter((r: any) => r.status === 'converted');
      const controlReminders = allReminders.filter((r: any) => r.is_control_group);
      const conversionRate = sentReminders.length > 0
        ? (convertedReminders.length / sentReminders.length) * 100
        : 0;

      // Conversion groupe contrôle (clients qui ont commandé sans rappel)
      const controlConverted = controlReminders.filter((r: any) => r.status === 'converted');

      return Response.json({
        action: 'stats',
        clients_actifs_30j: activeClients30.size,
        courses_livrees_30j: coursesIn30.length,
        courses_par_client_actif: activeClients30.size > 0
          ? Number((coursesIn30.length / activeClients30.size).toFixed(2))
          : 0,
        segments: {
          nouveau,
          en_developpement: dev,
          regulier,
          tres_regulier: tresRegulier,
        },
        rappels: {
          total: allReminders.length,
          envoyes: sentReminders.length,
          controles: controlReminders.length,
          convertis: convertedReminders.length,
          controles_convertis: controlConverted.length,
          taux_conversion: Number(conversionRate.toFixed(1)),
        },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}