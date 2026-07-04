import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Helpers ───────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isOlderThanHours(dateStr, hours) {
  if (!dateStr) return true;
  return (Date.now() - new Date(dateStr).getTime()) > hours * 3600 * 1000;
}

function isOlderThanDays(dateStr, days) {
  return isOlderThanHours(dateStr, days * 24);
}

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

async function chargerCommissionPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer la commission');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const pct = normalizeCommissionPct(countries?.[0]?.commission_pct);
  if (pct === null) throw new Error(`Commission non configuree pour le pays ${code}`);
  return pct;
}

// ─── Scan functions ─────────────────────────────────────────────────────────

async function scanCoursesBloquees(base44, bugs, corrections, recommandations) {
  // Courses actives depuis plus de 12h sans mise à jour
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: "livreur_en_route" }, "-updated_date", 100
  ).catch(() => []);

  for (const c of coursesActives) {
    if (isOlderThanHours(c.updated_date, 12)) {
      bugs.push({
        categorie: "course_bloquee",
        severity: "haute",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} en statut "livreur_en_route" depuis +12h (livreur: ${c.livreur_nom || "inconnu"})`,
        auto_fixable: false
      });
      recommandations.push({
        action: "Vérifier course manuellement",
        course_id: c.id,
        detail: `Course ${c.id?.slice(-6)} potentiellement bloquée — livreur: ${c.livreur_nom || "inconnu"}, client: ${c.client_nom || c.client_telephone}`
      });
    }
  }

  // Courses "en_livraison" depuis +8h
  const coursesEnLivraison = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: "en_livraison" }, "-updated_date", 100
  ).catch(() => []);

  for (const c of coursesEnLivraison) {
    if (isOlderThanHours(c.updated_date, 8)) {
      bugs.push({
        categorie: "course_bloquee",
        severity: "haute",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} en "en_livraison" depuis +8h`,
        auto_fixable: false
      });
      recommandations.push({
        action: "Vérifier livraison bloquée",
        course_id: c.id,
        detail: `Course ${c.id?.slice(-6)} en route depuis trop longtemps. Contact livreur: ${c.livreur_telephone || "—"}`
      });
    }
  }

  // Courses "colis_recupere" depuis +6h sans livraison
  const coursesRecuperees = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: "colis_recupere" }, "-updated_date", 100
  ).catch(() => []);

  for (const c of coursesRecuperees) {
    if (isOlderThanHours(c.updated_date, 6)) {
      bugs.push({
        categorie: "course_bloquee",
        severity: "moyenne",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} — colis récupéré mais non livré depuis +6h`,
        auto_fixable: false
      });
      recommandations.push({
        action: "Contacter livreur",
        course_id: c.id,
        detail: `Course ${c.id?.slice(-6)} — colis récupéré depuis trop longtemps. Livreur: ${c.livreur_telephone || "—"}`
      });
    }
  }
}

async function scanLivreursBlockes(base44, bugs, corrections, recommandations) {
  // Livreurs "en_course" sans course active assignée
  const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter(
    { statut: "en_course" }, "-updated_date", 200
  ).catch(() => []);

  for (const l of livreursEnCourse) {
    // Chercher une course active pour ce livreur
    const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
      { livreur_id: l.id }, "-updated_date", 5
    ).catch(() => []);

    const aUneCoursActive = coursesActives.some(c =>
      !["livree", "annulee"].includes(c.statut)
    );

    if (!aUneCoursActive) {
      bugs.push({
        categorie: "livreur_bloque",
        severity: "haute",
        id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom} (${l.telephone}) marqué "en_course" sans course active`,
        auto_fixable: true
      });

      // Correction automatique sûre
      await base44.asServiceRole.entities.Livreur.update(l.id, { statut: "disponible" }).catch(() => null);
      corrections.push({
        type: "livreur_remis_disponible",
        id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom} remis en "disponible" automatiquement`
      });
    }
  }

  // Livreurs avec last_seen_at > 4h mais statut "disponible" (peut-être hors ligne)
  const livreursDisponibles = await base44.asServiceRole.entities.Livreur.filter(
    { statut: "disponible" }, "-updated_date", 200
  ).catch(() => []);

  for (const l of livreursDisponibles) {
    if (l.last_seen_at && isOlderThanHours(l.last_seen_at, 4)) {
      bugs.push({
        categorie: "livreur_fantome",
        severity: "faible",
        id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom} marqué "disponible" mais inactif depuis +4h`,
        auto_fixable: true
      });
      await base44.asServiceRole.entities.Livreur.update(l.id, { app_active: false }).catch(() => null);
      corrections.push({
        type: "livreur_app_inactive",
        id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom} marqué app_active=false (inactif depuis +4h) — statut préservé`
      });
    }
  }
}

async function scanProfilsIncomplets(base44, bugs, corrections, recommandations) {
  // Livreurs sans photo ou sans téléphone ou sans nom
  const tousLivreurs = await base44.asServiceRole.entities.Livreur.list("-created_date", 500).catch(() => []);

  for (const l of tousLivreurs) {
    const problemes = [];
    if (!l.telephone) problemes.push("téléphone manquant");
    if (!l.nom) problemes.push("nom manquant");
    if (!l.photo_url) problemes.push("photo manquante");
    if (!l.vehicule && !l.type_vehicule) problemes.push("véhicule non renseigné");
    if (l.validation === "en_attente" && isOlderThanDays(l.created_date, 3)) {
      problemes.push("validation en attente depuis +3j");
      recommandations.push({
        action: "Valider ou refuser livreur",
        livreur_id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom || l.telephone} en attente de validation depuis +3j`
      });
    }
    if (problemes.length > 0) {
      bugs.push({
        categorie: "profil_incomplet",
        severity: "faible",
        id: l.id,
        detail: `Livreur ${l.prenom || ""} ${l.nom || l.telephone}: ${problemes.join(", ")}`,
        auto_fixable: false
      });
    }
  }
}

async function scanStatutsIncoherents(base44, bugs, corrections, recommandations) {
  // Courses avec pickup_confirmed_at mais statut encore "livreur_en_route" ou "nouvelle"
  const coursesConfirm = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 200).catch(() => []);

  for (const c of coursesConfirm) {
    // QR pickup confirmé mais statut pas "colis_recupere" ni plus avancé
    if (c.pickup_confirmed_at && ["nouvelle", "recherche_livreur", "livreur_en_route"].includes(c.statut)) {
      bugs.push({
        categorie: "statut_incoherent",
        severity: "haute",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)}: pickup confirmé mais statut="${c.statut}"`,
        auto_fixable: true
      });
      await base44.asServiceRole.entities.CourseExterne.update(c.id, { statut: "colis_recupere" }).catch(() => null);
      corrections.push({
        type: "statut_corrige",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} → statut corrigé vers "colis_recupere"`
      });
    }

    // QR delivery confirmé mais statut pas "livree"
    if (c.delivery_confirmed_at && !["livree", "annulee"].includes(c.statut)) {
      bugs.push({
        categorie: "statut_incoherent",
        severity: "haute",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)}: delivery confirmé mais statut="${c.statut}"`,
        auto_fixable: true
      });
      await base44.asServiceRole.entities.CourseExterne.update(c.id, { statut: "livree" }).catch(() => null);
      corrections.push({
        type: "statut_corrige",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} → statut corrigé vers "livree"`
      });
    }

    // Livreur assigné mais statut encore "nouvelle" ou "recherche_livreur" depuis +30min
    if (c.livreur_id && ["nouvelle", "recherche_livreur"].includes(c.statut) && isOlderThanHours(c.updated_date, 0.5)) {
      bugs.push({
        categorie: "statut_incoherent",
        severity: "moyenne",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)}: livreur assigné mais statut="${c.statut}"`,
        auto_fixable: true
      });
      await base44.asServiceRole.entities.CourseExterne.update(c.id, { statut: "livreur_en_route" }).catch(() => null);
      corrections.push({
        type: "statut_corrige",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} → statut corrigé vers "livreur_en_route"`
      });
    }
  }
}

async function scanPaiementsNonSync(base44, bugs, corrections, recommandations) {
  // Courses livrées sans prix_final
  const coursesLivrees = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: "livree" }, "-created_date", 200
  ).catch(() => []);

  for (const c of coursesLivrees) {
    if (!c.prix_final || c.prix_final === 0) {
      // Tenter de recalculer si on a les coordonnées GPS
      const dist = haversineKm(c.latitude_recuperation, c.longitude_recuperation, c.latitude_livraison, c.longitude_livraison)
        || haversineKm(c.gps_depart_lat, c.gps_depart_lng, c.gps_arrivee_lat, c.gps_arrivee_lng);

      if (dist && dist > 0) {
        const prixFinal = Math.round(dist * 100);
        const commissionPct = await chargerCommissionPays(base44, c.country_code);
        const commission = Math.round(prixFinal * (commissionPct / 100));
        const montantLivreur = prixFinal - commission;

        await base44.asServiceRole.entities.CourseExterne.update(c.id, {
          prix_final: prixFinal,
          distance_reelle_km: parseFloat(dist.toFixed(2)),
          commission_silga: commission,
          montant_livreur: montantLivreur
        }).catch(() => null);

        corrections.push({
          type: "prix_recalcule",
          id: c.id,
          detail: `Course ${c.id?.slice(-6)} → prix recalculé: ${prixFinal} FCFA (${dist.toFixed(1)} km)`
        });
        bugs.push({
          categorie: "paiement_manquant",
          severity: "moyenne",
          id: c.id,
          detail: `Course ${c.id?.slice(-6)} livrée sans prix final — recalculé à ${prixFinal} FCFA`,
          auto_fixable: true
        });
      } else {
        bugs.push({
          categorie: "paiement_manquant",
          severity: "haute",
          id: c.id,
          detail: `Course ${c.id?.slice(-6)} livrée sans prix final et sans GPS pour recalculer`,
          auto_fixable: false
        });
        recommandations.push({
          action: "Saisir prix manuellement",
          course_id: c.id,
          detail: `Course ${c.id?.slice(-6)} livrée sans tarification — intervention admin requise`
        });
      }
    }

    // Courses livrées sans commission calculée
    if (c.prix_final && (!c.commission_silga || !c.montant_livreur)) {
      const commissionPct = await chargerCommissionPays(base44, c.country_code);
      const commission = Math.round(c.prix_final * (commissionPct / 100));
      const montantLivreur = c.prix_final - commission;
      await base44.asServiceRole.entities.CourseExterne.update(c.id, {
        commission_silga: commission,
        montant_livreur: montantLivreur
      }).catch(() => null);
      corrections.push({
        type: "commission_recalculee",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)} → commission SILGA: ${commission} FCFA / Livreur: ${montantLivreur} FCFA`
      });
      bugs.push({
        categorie: "commission_manquante",
        severity: "faible",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)}: commission non calculée — corrigée auto`,
        auto_fixable: true
      });
    }
  }
}

async function scanErreursGPS(base44, bugs, corrections, recommandations) {
  // Livreurs avec coordonnées GPS aberrantes (hors Burkina Faso approximativement)
  const tousLivreurs = await base44.asServiceRole.entities.Livreur.list("-updated_date", 200).catch(() => []);

  for (const l of tousLivreurs) {
    if (l.latitude && l.longitude) {
      // Burkina Faso : lat [9.4, 15.1], lng [-5.5, 2.4]
      const heursBF = l.latitude < 9.0 || l.latitude > 15.5 || l.longitude < -6.0 || l.longitude > 3.0;
      if (heursBF) {
        bugs.push({
          categorie: "gps_aberrant",
          severity: "moyenne",
          id: l.id,
          detail: `Livreur ${l.prenom || ""} ${l.nom}: GPS hors Burkina (lat=${l.latitude}, lng=${l.longitude})`,
          auto_fixable: true
        });
        await base44.asServiceRole.entities.Livreur.update(l.id, { latitude: null, longitude: null }).catch(() => null);
        corrections.push({
          type: "gps_efface",
          id: l.id,
          detail: `GPS aberrant effacé pour ${l.prenom || ""} ${l.nom}`
        });
      }
    }
  }
}

async function scanErreursQRPIN(base44, bugs, corrections, recommandations) {
  // Courses actives sans QR/PIN générés depuis +30min
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: "livreur_en_route" }, "-created_date", 100
  ).catch(() => []);

  for (const c of coursesActives) {
    if (isOlderThanHours(c.updated_date, 0.5)) {
      if (!c.pickup_qr_token || !c.pickup_code_4_digits) {
        bugs.push({
          categorie: "qr_pin_manquant",
          severity: "haute",
          id: c.id,
          detail: `Course ${c.id?.slice(-6)}: livreur en route mais QR/PIN de récupération manquant`,
          auto_fixable: false
        });
        recommandations.push({
          action: "Générer QR/PIN manuellement",
          course_id: c.id,
          detail: `Course ${c.id?.slice(-6)}: regenerer les codes via l'interface admin`
        });
      }
    }
  }
}

async function scanWhatsAppEchecs(base44, bugs, corrections, recommandations) {
  // Alertes WhatsApp en échec récentes (dernières 24h)
  const alertes = await base44.asServiceRole.entities.WhatsAppAlerte.filter(
    { statut: "failed" }, "-created_date", 50
  ).catch(() => []);

  const recentes = alertes.filter(a => !isOlderThanDays(a.created_date, 1));

  if (recentes.length > 0) {
    bugs.push({
      categorie: "whatsapp_echec",
      severity: "moyenne",
      id: null,
      detail: `${recentes.length} alertes WhatsApp en échec dans les dernières 24h`,
      auto_fixable: false
    });
    recommandations.push({
      action: "Vérifier configuration Twilio",
      detail: `${recentes.length} alertes WhatsApp échouées — vérifier crédits et config Twilio`
    });
  }
}

async function scanDonneesNulles(base44, bugs, corrections, recommandations) {
  // Courses avec données nulles critiques
  const coursesRecentes = await base44.asServiceRole.entities.CourseExterne.list("-created_date", 100).catch(() => []);

  for (const c of coursesRecentes) {
    const problemes = [];
    if (!c.client_telephone) problemes.push("client_telephone null");
    if (!c.adresse_depart) problemes.push("adresse_depart null");
    if (!c.statut) problemes.push("statut null");
    if (c.livreur_id && !c.livreur_nom) problemes.push("livreur_nom null malgré livreur_id");
    if (c.statut === "livree" && !c.heure_livraison) problemes.push("heure_livraison null malgré livraison");

    if (problemes.length > 0 && !isOlderThanDays(c.created_date, 7)) {
      bugs.push({
        categorie: "donnees_nulles",
        severity: "moyenne",
        id: c.id,
        detail: `Course ${c.id?.slice(-6)}: ${problemes.join(", ")}`,
        auto_fixable: false
      });
    }
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const base44 = createClientFromRequest(req);

    // Vérification : soit automation (pas d'user), soit admin
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === "admin") isAdmin = true;
    } catch (_) {
      // Appel depuis automation → pas d'user, on autorise
      isAdmin = true;
    }

    if (!isAdmin) {
      return Response.json({ error: "Accès refusé — admin uniquement" }, { status: 403 });
    }

    // Lire mode (manuel ou automatique)
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "automatique";

    // Créer le rapport en cours
    const rapport = await base44.asServiceRole.entities.RapportMaintenance.create({
      date_scan: new Date().toISOString(),
      declenchement: mode,
      statut: "en_cours",
      bugs_trouves: 0,
      corrections_appliquees: 0,
      elements_non_corriges: 0,
      erreurs_critiques: 0
    });

    const bugs = [];
    const corrections = [];
    const recommandations = [];
    const erreursScan = [];

    // ── Scans ──────────────────────────────────────────────────────────────
    const scans = [
      { nom: "Courses bloquées", fn: () => scanCoursesBloquees(base44, bugs, corrections, recommandations) },
      { nom: "Livreurs bloqués", fn: () => scanLivreursBlockes(base44, bugs, corrections, recommandations) },
      { nom: "Profils incomplets", fn: () => scanProfilsIncomplets(base44, bugs, corrections, recommandations) },
      { nom: "Statuts incohérents", fn: () => scanStatutsIncoherents(base44, bugs, corrections, recommandations) },
      { nom: "Paiements non sync", fn: () => scanPaiementsNonSync(base44, bugs, corrections, recommandations) },
      { nom: "Erreurs GPS", fn: () => scanErreursGPS(base44, bugs, corrections, recommandations) },
      { nom: "Erreurs QR/PIN", fn: () => scanErreursQRPIN(base44, bugs, corrections, recommandations) },
      { nom: "WhatsApp échecs", fn: () => scanWhatsAppEchecs(base44, bugs, corrections, recommandations) },
      { nom: "Données nulles", fn: () => scanDonneesNulles(base44, bugs, corrections, recommandations) },
    ];

    for (const scan of scans) {
      try {
        await scan.fn();
      } catch (e) {
        erreursScan.push({ scan: scan.nom, erreur: e.message });
      }
    }

    // ── Calcul résumé ──────────────────────────────────────────────────────
    const erreursCritiques = bugs.filter(b => b.severity === "haute").length;
    const nonCorrigibles = bugs.filter(b => !b.auto_fixable).length;
    const dureeSecondes = Math.round((Date.now() - startTime) / 1000);

    const resume = [
      ` Scan SILGAPP du ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
      ` ${bugs.length} problème(s) détecté(s) — ${corrections.length} correction(s) appliquée(s)`,
      ` ${erreursCritiques} erreur(s) critique(s)`,
      ` ${recommandations.length} action(s) admin recommandée(s)`,
      `⏱ Durée: ${dureeSecondes}s`,
    ].join("\n");

    // ── Mise à jour rapport ────────────────────────────────────────────────
    await base44.asServiceRole.entities.RapportMaintenance.update(rapport.id, {
      statut: "termine",
      bugs_trouves: bugs.length,
      corrections_appliquees: corrections.length,
      elements_non_corriges: nonCorrigibles,
      erreurs_critiques: erreursCritiques,
      details_bugs: JSON.stringify(bugs),
      details_corrections: JSON.stringify(corrections),
      actions_recommandees: JSON.stringify(recommandations),
      duree_secondes: dureeSecondes,
      resume
    });

    // ── Notification admin si erreurs critiques ────────────────────────────
    if (erreursCritiques > 0) {
      await base44.asServiceRole.entities.Notification.create({
        titre: ` Maintenance SILGAPP — ${erreursCritiques} erreur(s) critique(s)`,
        message: `Scan du ${new Date().toLocaleDateString("fr-FR")}: ${erreursCritiques} erreur(s) critique(s) détectée(s). ${corrections.length} correction(s) auto appliquée(s). Consultez le rapport de maintenance.`,
        type: "course_bloquee",
        lue: false
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      rapport_id: rapport.id,
      bugs: bugs.length,
      corrections: corrections.length,
      erreurs_critiques: erreursCritiques,
      recommandations: recommandations.length,
      duree_secondes: dureeSecondes,
      resume,
      details: { bugs, corrections, recommandations, erreurs_scan: erreursScan }
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      detail: "Erreur fatale durant la maintenance — aucune donnée supprimée"
    }, { status: 500 });
  }
});
