import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, MessageCircle, Phone, ExternalLink, X } from "lucide-react";
import {
  pubMatchMoment, pubEstValide, pubCibleUser,
  peutAfficherPub, marquerPubAffichee, MOMENTS,
} from "@/lib/publiciteUtils";

async function trackAction(pubId, userType, userId, action) {
  try {
    await base44.entities.PubliciteVue.create({
      publicite_id: pubId,
      user_type: userType,
      user_id: userId || "anonymous",
      action,
      vue_at: new Date().toISOString(),
    });
    const field =
      action === "clic" ? "nb_clics"
      : action === "vue_video" ? "nb_vues_video"
      : action === "fermeture" ? "nb_fermetures"
      : "nb_affichages";
    const pub = await base44.entities.Publicite.filter({ id: pubId });
    if (pub?.[0]) {
      await base44.entities.Publicite.update(pubId, { [field]: (pub[0][field] || 0) + 1 });
    }
  } catch (_) {}
}

async function getUserCountry(userType, userId) {
  try {
    if (userType === "client") {
      const clients = await base44.entities.ClientExterne.filter({ id: userId });
      return clients?.[0]?.country_code || null;
    } else if (userType === "livreur") {
      const livreurs = await base44.entities.Livreur.filter({ id: userId });
      return livreurs?.[0]?.country_code || null;
    }
  } catch (_) {}
  return null;
}

/**
 * Composant unifié pour afficher une publicité plein écran à différents moments.
 *
 * Props :
 * - moment : "ouverture_app" | "recherche_livreur" | "apres_assignation" | "apres_livraison"
 * - cible : "clients" | "livreurs" | ...
 * - userId, userType
 * - courseId : ID de la course (pour anti-répétition par course)
 * - courseEnAttente : boolean — si false, ne pas afficher (pour recherche_livreur)
 * - onClose : callback optionnel appelé quand la pub est fermée
 * - autoCloseSignal : si fourni et true, ferme automatiquement la pub (ex: livreur assigné)
 */
export default function PubliciteFullscreen({
  moment = MOMENTS.OUVERTURE_APP,
  cible = "clients",
  userId = null,
  userType = "client",
  courseId = null,
  courseEnAttente = true,
  onClose = null,
  autoCloseSignal = false,
}) {
  const [pub, setPub] = useState(null);
  const [visible, setVisible] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const loadedRef = useRef(false);
  const trackedRef = useRef(false);

  // ── Chargement de la pub ──
  useEffect(() => {
    if (loadedRef.current) return;
    // Pour les moments liés à une course, on exige courseEnAttente=true
    if (moment !== MOMENTS.OUVERTURE_APP && !courseEnAttente) return;

    loadedRef.current = true;
    const load = async () => {
      try {
        const now = new Date().toISOString();
        const all = await base44.entities.Publicite.filter({ actif: true, format: "plein_ecran" });
        const userCountry = userId ? await getUserCountry(userType, userId) : null;
        const filtered = (all || []).filter(p => {
          if (!pubEstValide(p, now)) return false;
          if (!pubCibleUser(p, cible, userCountry)) return false;
          if (!pubMatchMoment(p, moment)) return false;
          if (!peutAfficherPub(p, courseId)) return false;
          return true;
        }).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

        // Sélection aléatoire si plusieurs pubs éligibles
        if (filtered.length > 0) {
          const selected = filtered[Math.floor(Math.random() * filtered.length)];
          setPub(selected);
          setVisible(true);
          // Countdown si la pub n'est pas fermable immédiatement
          if (!selected.fermable_immediatement && selected.type_media !== "video") {
            setCountdown(selected.duree_min_affichage || 5);
          }
          trackAction(selected.id, userType, userId, "affichage");
          marquerPubAffichee(selected, courseId);
          trackedRef.current = true;
        }
      } catch (_) {}
    };
    // Délai différent selon le moment
    const delay = moment === MOMENTS.OUVERTURE_APP ? 2000 : 500;
    const t = setTimeout(load, delay);
    return () => clearTimeout(t);
  }, [moment, cible, userId, userType, courseId, courseEnAttente]);

  // ── Fermeture automatique quand le signal change (ex: livreur assigné) ──
  useEffect(() => {
    if (autoCloseSignal && visible) {
      handleClose(true);
    }
  }, [autoCloseSignal, visible]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => {
      if (c <= 1) { clearInterval(t); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const canClose = pub
    ? (pub.fermable_immediatement || (pub.type_media === "video" ? videoEnded : countdown === 0))
    : false;

  function handleClose(auto = false) {
    if (!auto && !canClose) return;
    if (pub && trackedRef.current) {
      trackAction(pub.id, userType, userId, "fermeture");
    }
    setVisible(false);
    if (onClose) onClose();
  }

  function handleClic() {
    if (!pub) return;
    trackAction(pub.id, userType, userId, "clic");
    if (pub.lien_whatsapp) {
      const msg = encodeURIComponent(`Bonjour, j'ai vu votre annonce sur SILGAPP : ${pub.titre}`);
      const phone = pub.lien_whatsapp.replace(/\D/g, "");
      const a = document.createElement("a");
      a.href = `whatsapp://send?phone=${phone}&text=${msg}`;
      a.click();
      setTimeout(() => { if (document.hasFocus()) window.open(`https://wa.me/${phone}?text=${msg}`, "_blank"); }, 500);
    } else if (pub.lien_telephone) {
      window.location.href = `tel:${pub.lien_telephone}`;
    } else if (pub.lien_url) {
      window.open(pub.lien_url, "_blank");
    }
  }

  if (!visible || !pub) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: pub.couleur_fond || "#0f0f1a" }}>
      {/* Bouton fermeture (toujours visible, mais désactivé si !canClose et !fermable_immediatement) */}
      {pub.fermable_immediatement && (
        <button
          onClick={() => handleClose(false)}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Vidéo ou Image */}
      {pub.media_url && pub.type_media === "image" && (
        <div className="flex-1 relative overflow-hidden">
          <img
            src={pub.media_url}
            alt={pub.titre}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>
      )}

      {pub.media_url && pub.type_media === "video" && (
        <div className="flex-1 relative overflow-hidden bg-black">
          <video
            src={pub.media_url}
            className="absolute inset-0 w-full h-full object-contain"
            autoPlay
            playsInline
            onEnded={() => setVideoEnded(true)}
          />
          {!videoEnded && !pub.fermable_immediatement && (
            <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
              Regardez jusqu'à la fin
            </div>
          )}
        </div>
      )}

      {/* Texte seul */}
      {(!pub.media_url || pub.type_media === "texte") && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="text-6xl mb-6">📢</div>
          <h2 className="text-3xl font-black mb-4" style={{ color: pub.couleur_texte || "#fff" }}>
            {pub.titre}
          </h2>
          {pub.description && (
            <p className="text-lg opacity-80 leading-relaxed max-w-sm" style={{ color: pub.couleur_texte || "#fff" }}>
              {pub.description}
            </p>
          )}
        </div>
      )}

      {/* Panel bas */}
      <div className="bg-black/60 backdrop-blur-md p-5 space-y-4">
        {pub.annonceur_nom && (
          <p className="text-center text-xs text-white/50 uppercase tracking-widest">
            Message de {pub.annonceur_nom}
          </p>
        )}

        <div className="text-center">
          <h2 className="text-xl font-black text-white">{pub.titre}</h2>
          {pub.description && pub.type_media !== "texte" && (
            <p className="text-sm text-white/70 mt-1 line-clamp-2">{pub.description}</p>
          )}
        </div>

        {/* Boutons action */}
        {(pub.lien_whatsapp || pub.lien_telephone || pub.lien_url) && (
          <button
            onClick={handleClic}
            className="w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{
              background: pub.lien_whatsapp ? "#25D366" : pub.lien_telephone ? "#3B82F6" : "hsl(var(--primary))",
              color: "#fff"
            }}
          >
            {pub.lien_whatsapp && <><MessageCircle className="w-5 h-5" /> Contacter sur WhatsApp</>}
            {pub.lien_telephone && !pub.lien_whatsapp && <><Phone className="w-5 h-5" /> Appeler maintenant</>}
            {pub.lien_url && !pub.lien_whatsapp && !pub.lien_telephone && <><ExternalLink className="w-5 h-5" /> En savoir plus</>}
          </button>
        )}

        {/* Bouton fermer */}
        <button
          onClick={() => handleClose(false)}
          disabled={!canClose}
          className={`w-full py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all ${
            canClose
              ? "bg-white text-gray-900 active:scale-[0.98] shadow-lg"
              : "bg-white/20 text-white/40 cursor-not-allowed"
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          {canClose
            ? "✅ Compris, continuer"
            : pub.type_media === "video"
            ? "⏳ Regardez la vidéo..."
            : `⏳ ${countdown}s...`}
        </button>
      </div>
    </div>
  );
}