import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Test automatique après création de compte
 * Vérifie : notifications, GPS, sync, présence temps réel
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { user_type = "client" } = payload;

    const results = {
      notifications: false,
      gps: false,
      synchronisation: false,
      presence_temps_reel: false,
      fallback_gps: false,
    };

    const now = new Date().toISOString();

    // 1. Test Notifications
    try {
      await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
        user_email: user.email,
        titre: "✅ Test Notification",
        message: "Votre système de notification fonctionne correctement."
      });
      results.notifications = true;
    } catch (e) {
      console.error('[testAuto] Notifications:', e.message);
    }

    // 2. Test GPS - récupérer la dernière position
    try {
      if (user_type === "client") {
        const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
        if (clients && clients.length > 0) {
          const client = clients[0];
          results.gps = !!(client.latitude && client.longitude);
          results.fallback_gps = results.gps; // Dernière position connue
        }
      } else if (user_type === "livreur") {
        const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
        if (livreurs && livreurs.length > 0) {
          const livreur = livreurs[0];
          results.gps = !!(livreur.latitude && livreur.longitude);
          results.fallback_gps = results.gps;
        }
      }
    } catch (e) {
      console.error('[testAuto] GPS:', e.message);
    }

    // 3. Test Synchronisation - créer une session test
    try {
      const session = await base44.asServiceRole.entities.DeviceSession.create({
        user_email: user.email,
        user_type: user_type,
        device_id: `test_${Date.now()}`,
        platform: "web",
        gps_actif: results.gps,
        derniere_sync_date: now,
        last_seen_at: now,
        app_active: true,
        session_actif: true,
      });
      results.synchronisation = !!session.id;
      
      // Nettoyer la session test
      await base44.asServiceRole.entities.DeviceSession.delete(session.id);
    } catch (e) {
      console.error('[testAuto] Synchronisation:', e.message);
    }

    // 4. Test Présence Temps Réel - vérifier DeviceSession
    try {
      const sessions = await base44.asServiceRole.entities.DeviceSession.filter({
        user_email: user.email,
        session_actif: true
      });
      results.presence_temps_reel = sessions && sessions.length > 0;
    } catch (e) {
      console.error('[testAuto] Présence:', e.message);
    }

    // 5. Score global
    const score = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    const pourcentage = Math.round((score / total) * 100);

    return Response.json({
      success: true,
      tests: results,
      score: `${score}/${total}`,
      pourcentage: `${pourcentage}%`,
      statut: pourcentage === 100 ? "✅ Configuration complète" : "⚠️ Configuration partielle",
    });
  } catch (error) {
    console.error('[testAuto] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});