import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vérifie l'encours d'un livreur après chaque course terminée.
 * - Accumule la commission dans l'encours
 * - Alerte à 80% du seuil
 * - Bloque automatiquement à 100% du seuil
 * 
 * Déclenché par automation entity sur CourseExterne (statut → livree).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Récupérer la course depuis l'événement entity automation
    let courseId, course;
    if (body.event?.entity_id) {
      courseId = body.event.entity_id;
      course = body.data || null;
    } else if (body.course_id) {
      courseId = body.course_id;
      course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    }

    // Action manuelle admin : déblocage ou ajustement
    if (body.action === 'debloquer') {
      return await handleDeblocage(base44, body);
    }
    if (body.action === 'ajuster_encours') {
      return await handleAjustement(base44, body);
    }
    if (body.action === 'get_livreurs_bloques') {
      return await handleGetBloques(base44, body);
    }

    // ── Mode automatique : vérification après course livrée ──
    if (!course || !courseId) {
      return Response.json({ success: false, error: 'Aucune course fournie' }, { status: 400 });
    }

    // Ne traiter que les courses livrées
    if (course.statut !== 'livree') {
      return Response.json({ success: true, skipped: true, reason: 'statut_non_livree' });
    }

    if (course.encours_comptabilise_at) {
      return Response.json({
        success: true,
        skipped: true,
        reason: 'course_deja_comptabilisee',
        encours_comptabilise_at: course.encours_comptabilise_at,
      });
    }

    // Vérifier qu'un livreur est assigné
    if (!course.livreur_id) {
      return Response.json({ success: true, skipped: true, reason: 'pas_de_livreur' });
    }

    const livreurId = course.livreur_id;
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
    if (!livreur) {
      return Response.json({ success: false, error: 'Livreur introuvable' }, { status: 404 });
    }

    // Si déjà bloqué, ne rien faire (pas accumuler)
    if (livreur.bloque_encours) {
      return Response.json({ success: true, skipped: true, reason: 'deja_bloque' });
    }

    // Récupérer le seuil du pays
    const countryCode = course.country_code || livreur.country_code;
    if (!countryCode) {
      return Response.json({ success: false, error: 'Code pays manquant' }, { status: 400 });
    }

    const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
    const seuil = countries?.[0]?.seuil_encours_max || 5000;
    const devise = countries?.[0]?.devise || 'FCFA';

    // Calculer la commission de cette course
    let commission = 0;
    if (course.commission_silga && course.commission_silga > 0) {
      commission = course.commission_silga;
    } else if (course.prix_final && course.prix_final > 0) {
      const pct = Number(countries?.[0]?.commission_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return Response.json({
          success: false,
          error: `Commission pays non configuree pour ${countryCode}`,
          blocked_reason: 'missing_country_commission_pct',
        }, { status: 400 });
      }
      commission = Math.round(course.prix_final * (pct / 100));
    }

    if (commission <= 0) {
      return Response.json({ success: true, skipped: true, reason: 'commission_nulle' });
    }

    // Accumuler l'encours
    const encoursAvant = livreur.encours || 0;
    const nouvelEncours = encoursAvant + commission;

    // Pourcentage du seuil atteint
    const pourcentage = Math.round((nouvelEncours / seuil) * 100);

    console.log(`[ENCOURS] Livreur ${livreurId} (${livreur.nom}): ${encoursAvant} → ${nouvelEncours} (${pourcentage}% du seuil ${seuil} ${devise})`);

    const now = new Date().toISOString();

    // ── BLOCAGE : ≥ 100% du seuil ──
    if (nouvelEncours >= seuil) {
      await base44.asServiceRole.entities.Livreur.update(livreurId, {
        encours: nouvelEncours,
        bloque_encours: true,
        encours_bloque_at: now,
        statut: 'hors_ligne',
        admin_hors_ligne: true,
        admin_statut_log: 'Blocage automatique — plafond d\'encours atteint',
      });

      // Historique
      await base44.asServiceRole.entities.HistoriqueEncours.create({
        type_action: 'blocage_auto',
        livreur_id: livreurId,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
        livreur_telephone: livreur.telephone || '',
        pays_code: countryCode,
        course_id: courseId,
        encours_avant: encoursAvant,
        encours_apres: nouvelEncours,
        seuil_applicable: seuil,
        pourcentage_atteint: pourcentage,
        action_par: 'systeme',
        date_action: now,
      });
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        encours_comptabilise_at: now,
        encours_comptabilise_montant: commission,
      });

      // Notification push au livreur
      if (livreur.user_email) {
        await base44.asServiceRole.entities.Notification.create({
          titre: '🚫 Compte bloqué — Plafond d\'encours atteint',
          message: `Votre plafond d'encours SILGAPP a été atteint (${nouvelEncours.toLocaleString()} ${devise}). Veuillez effectuer votre dépôt auprès de SILGAPP afin de réactiver votre compte.`,
          type: 'generic',
          destinataire_email: livreur.user_email,
          lue: false,
        });
        try {
          await base44.functions.invoke('envoiNotificationPush', {
            destinataire_email: livreur.user_email,
            livreur_id: livreurId,
            titre: '🚫 Compte bloqué',
            message: `Plafond d'encours atteint (${nouvelEncours.toLocaleString()} ${devise}). Contactez SILGAPP pour régulariser.`,
            type: 'generic',
          });
        } catch (_) {}
      }

      // Notification aux admins
      await notifierAdmins(base44, countryCode,
        `🚫 Blocage encours — ${livreur.nom}`,
        `${livreur.nom} (${livreur.telephone}) bloqué automatiquement. Encours: ${nouvelEncours.toLocaleString()} ${devise} (${pourcentage}% du seuil).`
      );

      console.log(`[ENCOURS] BLOCAGE : Livreur ${livreurId} — ${nouvelEncours} ${devise}`);
      return Response.json({
        success: true,
        bloque: true,
        encours: nouvelEncours,
        pourcentage,
        seuil,
        devise,
      });
    }

    // ── ALERTE 80% ──
    if (pourcentage >= 80 && pourcentage < 100) {
      // Ne pas spammer : envoyer l'alerte max 1x par heure
      const derniereAlerte = livreur.encours_alerte_at ? new Date(livreur.encours_alerte_at) : null;
      const maintenant = new Date();
      const uneHeure = 60 * 60 * 1000;

      if (!derniereAlerte || (maintenant.getTime() - derniereAlerte.getTime()) > uneHeure) {
        if (livreur.user_email) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '⚠️ Alerte encours — Approche du plafond',
            message: `Attention, vous approchez du plafond d'encours autorisé (${pourcentage}% — ${nouvelEncours.toLocaleString()} / ${seuil.toLocaleString()} ${devise}). Veuillez effectuer votre dépôt auprès de SILGAPP afin d'éviter le blocage automatique de votre compte.`,
            type: 'generic',
            destinataire_email: livreur.user_email,
            lue: false,
          });
          try {
            await base44.functions.invoke('envoiNotificationPush', {
              destinataire_email: livreur.user_email,
              livreur_id: livreurId,
              titre: '⚠️ Alerte encours',
              message: `Vous êtes à ${pourcentage}% du plafond (${nouvelEncours.toLocaleString()} ${devise}). Pensez à régulariser.`,
              type: 'generic',
            });
          } catch (_) {}
        }
        await base44.asServiceRole.entities.Livreur.update(livreurId, {
          encours_alerte_at: now,
        });
        console.log(`[ENCOURS] ALERTE 80% : Livreur ${livreurId} — ${pourcentage}%`);
      }
    }

    // Mettre à jour l'encours
    await base44.asServiceRole.entities.Livreur.update(livreurId, {
      encours: nouvelEncours,
    });
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      encours_comptabilise_at: now,
      encours_comptabilise_montant: commission,
    });

    return Response.json({
      success: true,
      bloque: false,
      alerte: pourcentage >= 80,
      encours: nouvelEncours,
      pourcentage,
      seuil,
      devise,
    });
  } catch (error) {
    console.error('[ENCOURS] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Déblocage admin ───
async function handleDeblocage(base44, body) {
  const { livreur_id, reset_complet, reduction, commentaire } = body;
  if (!livreur_id) return Response.json({ error: 'livreur_id requis' }, { status: 400 });

  const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
  if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

  // Vérifier admin
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  const encoursAvant = livreur.encours || 0;
  let nouvelEncours;
  const now = new Date().toISOString();

  if (reset_complet || reset_complet === undefined) {
    nouvelEncours = 0;
  } else if (reduction && reduction > 0) {
    nouvelEncours = Math.max(0, encoursAvant - reduction);
  } else {
    nouvelEncours = 0;
  }

  const countryCode = livreur.country_code;
  const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
  const seuil = countries?.[0]?.seuil_encours_max || 5000;
  const pourcentageApres = seuil > 0 ? Math.round((nouvelEncours / seuil) * 100) : 0;
  const encoreBloque = seuil > 0 && nouvelEncours >= seuil;

  await base44.asServiceRole.entities.Livreur.update(livreur_id, {
    encours: nouvelEncours,
    bloque_encours: encoreBloque,
    encours_bloque_at: encoreBloque ? (livreur.encours_bloque_at || now) : null,
    admin_hors_ligne: encoreBloque,
    admin_statut_log: encoreBloque ? 'Encours réduit mais plafond toujours atteint' : 'Déblocage encours par administrateur',
    statut: 'hors_ligne', // Le livreur doit se reconnecter
  });

  // Historique
  const typeAction = reset_complet === false && reduction > 0 ? 'reduction_encours' : 'deblocage_admin';
  await base44.asServiceRole.entities.HistoriqueEncours.create({
    type_action: typeAction,
    livreur_id,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
    livreur_telephone: livreur.telephone || '',
    pays_code: countryCode,
    encours_avant: encoursAvant,
    encours_apres: nouvelEncours,
    seuil_applicable: seuil,
    pourcentage_atteint: pourcentageApres,
    action_par: user.email,
    commentaire: commentaire || '',
    date_action: now,
  });

  // Notifier le livreur
  if (livreur.user_email) {
    const devise = countries?.[0]?.devise || 'FCFA';
    await base44.asServiceRole.entities.Notification.create({
      titre: encoreBloque ? '⚠️ Encours réduit' : '✅ Compte réactivé',
      message: encoreBloque
        ? `Votre encours a été réduit mais reste au-dessus du plafond (${nouvelEncours.toLocaleString()} / ${seuil.toLocaleString()} ${devise}). Votre compte reste bloqué jusqu'à régularisation.`
        : (reset_complet === false
          ? `Votre encours a été réduit de ${reduction.toLocaleString()} ${devise}. Nouvel encours : ${nouvelEncours.toLocaleString()} ${devise}. Vous pouvez reprendre les courses.`
          : `Votre encours a été remis à zéro. Vous pouvez reprendre les courses.`),
      type: 'generic',
      destinataire_email: livreur.user_email,
      lue: false,
    });
  }

  console.log(`[ENCOURS] DÉBLOCAGE: Livreur ${livreur_id} par ${user.email} — ${encoursAvant} → ${nouvelEncours} (bloque=${encoreBloque})`);
  return Response.json({ success: true, encours_avant: encoursAvant, encours_apres: nouvelEncours, debloque: !encoreBloque, bloque_encours: encoreBloque });
}

// ─── Ajustement manuel de l'encours ───
async function handleAjustement(base44, body) {
  const { livreur_id, nouvel_encours, commentaire } = body;
  if (!livreur_id || nouvel_encours === undefined) {
    return Response.json({ error: 'livreur_id et nouvel_encours requis' }, { status: 400 });
  }

  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
  if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

  const encoursAvant = livreur.encours || 0;
  const countryCode = livreur.country_code;
  const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
  const seuil = countries?.[0]?.seuil_encours_max || 5000;
  const now = new Date().toISOString();

  const seraBloque = seuil > 0 && nouvel_encours >= seuil;

  await base44.asServiceRole.entities.Livreur.update(livreur_id, {
    encours: nouvel_encours,
    bloque_encours: seraBloque,
    encours_bloque_at: seraBloque ? (livreur.encours_bloque_at || now) : null,
    admin_hors_ligne: seraBloque,
    ...(seraBloque ? { statut: 'hors_ligne' } : {}),
  });

  await base44.asServiceRole.entities.HistoriqueEncours.create({
    type_action: 'reduction_encours',
    livreur_id,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
    livreur_telephone: livreur.telephone || '',
    pays_code: countryCode,
    encours_avant: encoursAvant,
    encours_apres: nouvel_encours,
    seuil_applicable: seuil,
    pourcentage_atteint: seuil > 0 ? Math.round((nouvel_encours / seuil) * 100) : 0,
    action_par: user.email,
    commentaire: commentaire || 'Ajustement manuel',
    date_action: now,
  });

  return Response.json({ success: true });
}

// ─── Liste des livreurs bloqués ───
async function handleGetBloques(base44, body) {
  const { country_code } = body || {};
  const user = await base44.auth.me().catch(() => null);
  const adminCountry = user?.admin_type === 'pays' ? user.country_code : null;
  const effectiveCountry = country_code || adminCountry;
  if (!effectiveCountry) {
    return Response.json({
      success: false,
      error: 'country_code requis pour consulter les livreurs bloqués',
      blocked_reason: 'missing_country_code',
    }, { status: 400 });
  }

  if (adminCountry && country_code && String(country_code).toUpperCase() !== String(adminCountry).toUpperCase()) {
    return Response.json({
      success: false,
      error: 'country_mismatch',
      blocked_reason: 'country_mismatch',
    }, { status: 403 });
  }

  const filter = { bloque_encours: true, type_livreur: 'externe', country_code: effectiveCountry };
  const bloques = await base44.asServiceRole.entities.Livreur.filter(filter);

  // Enrichir avec les seuils pays
  const paysCodes = [...new Set(bloques.map(l => l.country_code).filter(Boolean))];
  const seuilsParPays = {};
  for (const code of paysCodes) {
    const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
    seuilsParPays[code] = {
      seuil: countries?.[0]?.seuil_encours_max || 5000,
      devise: countries?.[0]?.devise || 'FCFA',
    };
  }

  const enriched = bloques.map(l => ({
    id: l.id,
    nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
    telephone: l.telephone,
    country_code: l.country_code,
    encours: l.encours || 0,
    seuil: seuilsParPays[l.country_code]?.seuil || 5000,
    devise: seuilsParPays[l.country_code]?.devise || 'FCFA',
    bloque_at: l.encours_bloque_at,
    pourcentage: seuilsParPays[l.country_code]
      ? Math.round(((l.encours || 0) / (seuilsParPays[l.country_code].seuil || 1)) * 100)
      : 0,
  }));

  return Response.json({ success: true, bloques: enriched });
}

// ─── Notification aux admins ───
async function notifierAdmins(base44, countryCode, titre, message) {
  try {
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    for (const admin of admins) {
      if (!admin.email) continue;
      await base44.asServiceRole.entities.Notification.create({
        titre, message, type: 'generic',
        destinataire_email: admin.email, lue: false,
      });
      try {
        await base44.functions.invoke('envoiNotificationPush', {
          destinataire_email: admin.email,
          titre, message, type: 'generic',
        });
      } catch (_) {}
    }
  } catch (err) {
    console.error('[ENCOURS] Erreur notif admin:', err.message);
  }
}
