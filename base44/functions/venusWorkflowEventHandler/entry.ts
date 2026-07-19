import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  seedWorkflows,
  lancerWorkflow,
  repondreWorkflow,
  getExecutionActive,
  getWorkflowByCode,
} from '../../shared/venusWorkflowEngine.ts';
import { INTENTION_TO_WORKFLOW } from '../../shared/venusWorkflowDefinitions.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = body.action;

    // ── Actions admin uniquement ──
    if (['seed', 'simulate_start', 'simulate_respond'].includes(action)) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin uniquement' }, { status: 403 });
      }
    }

    // ── SEED : Initialiser les 12 workflows ──
    if (action === 'seed') {
      const result = await seedWorkflows(base44);
      return Response.json(result);
    }

    // ── SIMULATE_START : Démarrer une simulation ──
    if (action === 'simulate_start') {
      const { workflow_code, telephone, profileName, countryCode } = body;
      const tarifs = { nom: 'Burkina Faso', prix_km: 300, minimum: 1000, devise: 'FCFA' };
      const result = await lancerWorkflow(base44, workflow_code, {
        telephone: telephone || '+22670000099',
        profileName: profileName || 'Admin Test',
        countryCode: countryCode || 'BF',
        tarifs,
        conversation_id: `sim_${Date.now()}`,
        is_simulation: true,
      });
      return Response.json({
        reponse: result.reponse,
        execution_id: result.execution?.id,
      });
    }

    // ── SIMULATE_RESPOND : Répondre à une simulation ──
    if (action === 'simulate_respond') {
      const { execution_id, message } = body;
      const tarifs = { nom: 'Burkina Faso', prix_km: 300, minimum: 1000, devise: 'FCFA' };
      const result = await repondreWorkflow(base44, execution_id, message, {
        telephone: '+22670000099',
        profileName: 'Admin Test',
        countryCode: 'BF',
        tarifs,
        conversation_id: `sim_${Date.now()}`,
        is_simulation: true,
      });
      return Response.json(result);
    }

    // ── CHECK_EVENTS : Vérifier les exécutions en attente d'événement ──
    // Appelé par l'automation programmée
    if (action === 'check_events') {
      const pending = await base44.asServiceRole.entities.VenusWorkflowExecution.filter(
        { statut: 'en_attente_evenement' }, '-date_derniere_action', 50
      );
      let resumed = 0;
      for (const exec of pending) {
        try {
          const wf = await getWorkflowByCode(base44, exec.workflow_code);
          if (!wf) continue;
          const etapes = wf.etapes;
          const etape = etapes.find(e => e.id === exec.etape_actuelle);
          if (!etape || etape.type !== 'attente_evenement') continue;

          // Vérifier si l'événement s'est produit
          let donnees = {};
          try { donnees = JSON.parse(exec.donnees || '{}'); } catch {}
          const courseId = exec.course_id || donnees._course_id;
          if (!courseId) continue;

          const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
          if (!course) continue;

          const STATUT_MAP = {
            livreur_accepte: ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
            livreur_arrive: ['arrive_prise_en_charge', 'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
            colis_recupere: ['colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee', 'livree'],
            arrivee_proche: ['arrivee', 'livlee'],
            colis_livre: ['livree'],
            paiement_confirme: ['livree'],
          };
          const validStatuts = STATUT_MAP[etape.evenement];
          if (validStatuts && validStatuts.includes(course.statut)) {
            // L'événement s'est produit → reprendre le workflow
            const result = await repondreWorkflow(base44, exec.id, '', {
              telephone: exec.client_telephone,
              profileName: exec.client_nom,
              countryCode: exec.country_code,
              tarifs: { prix_km: 300, minimum: 1000, devise: 'FCFA' },
              conversation_id: exec.conversation_id,
            });
            // Envoyer la réponse au client via WhatsApp si non simulation
            if (result.reponse && !exec.is_simulation) {
              try {
                base44.asServiceRole.functions.invoke('envoyerWhatsAppAdmin', {
                  telephone: exec.client_telephone,
                  message: result.reponse,
                }).catch(() => {});
              } catch {}
            }
            resumed++;
          }
        } catch (e) {
          console.error(`[WorkflowEventHandler] Erreur check exec ${exec.id}:`, e.message);
        }
      }
      return Response.json({ checked: pending.length, resumed });
    }

    // ── LAUNCH_FROM_INTENTION : Lancer un workflow depuis une intention VENUS ──
    if (action === 'launch_from_intention') {
      const { intention, telephone, profileName, countryCode, conversation_id } = body;
      const workflowCode = INTENTION_TO_WORKFLOW[intention] || intention;
      if (!workflowCode) {
        return Response.json({ launched: false, message: 'Aucun workflow pour cette intention' });
      }
      const tarifs = { prix_km: 300, minimum: 1000, devise: 'FCFA', nom: countryCode };
      const result = await lancerWorkflow(base44, workflowCode, {
        telephone, profileName, countryCode, tarifs, conversation_id,
      });
      return Response.json({ launched: true, reponse: result.reponse, execution_id: result.execution?.id });
    }

    return Response.json({ error: 'Action inconnue: ' + action }, { status: 400 });
  } catch (error) {
    console.error('[WorkflowEventHandler] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});