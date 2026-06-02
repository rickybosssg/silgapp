import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Phone, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";

// Enregistre une action pub (affichage, clic, vue_video) sans bloquer le rendu
async function trackAction(pubId, userType, userId, action) {
  try {
    await base44.entities.PubliciteVue.create({
      publicite_id: pubId,
      user_type: userType,
      user_id: userId || "anonymous",
      action,
      vue_at: new Date().toISOString(),
    });
    // Incrémenter le compteur sur la pub
    const field = action === "clic" ? "nb_clics" : action === "vue_video" ? "nb_vues_video" : "nb_affichages";
    const pub = await base44.entities.Publicite.filter({ id: pubId });
    if (pub?.[0]) {
      await base44.entities.Publicite.update(pubId, { [field]: (pub[0][field] || 0) + 1 });
    }
  } catch (_) {}
}

export default function PubliciteCarousel({ cible = "clients", userId = null, userType = "client" }) {
  const [pubs, setPubs] = useState([]);
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const trackedAffichages = useRef(new Set());
  const intervalRef = useRef(null);

  const fetchPubs = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const all = await base44.entities.Publicite.filter({ actif: true, format: "carrousel" });
      const userCountry = userId ? await getUserCountry(userType, userId) : null;
      const filtered = (all || []).filter(p => {
        // Vérifier ciblage
        const cibles = ["tous", cible];
        if (!cibles.includes(p.cible)) return false;
        // Vérifier pays
        if (p.pays_cibles && p.pays_cibles !== "tous") {
          try {
            const paysList = JSON.parse(p.pays_cibles);
            if (!Array.isArray(paysList) || (userCountry && !paysList.includes(userCountry))) {
              return false;
            }
          } catch (e) {
            // Si JSON invalide, on considère "tous"
          }
        }
        // Vérifier dates
        if (p.date_debut && p.date_debut > now) return false;
        if (p.date_fin && p.date_fin < now) return false;
        return true;
      }).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
      setPubs(filtered);
    } catch (_) {}
    setLoaded(true);
  }, [cible, userId, userType]);

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

  useEffect(() => {
    fetchPubs();
  }, [fetchPubs]);

  // Défilement automatique toutes les 5s
  useEffect(() => {
    if (pubs.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % pubs.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [pubs.length]);

  // Tracker l'affichage à chaque changement de slide
  useEffect(() => {
    if (!pubs[current]) return;
    const pubId = pubs[current].id;
    if (!trackedAffichages.current.has(pubId)) {
      trackedAffichages.current.add(pubId);
      trackAction(pubId, userType, userId, "affichage");
    }
  }, [current, pubs, userType, userId]);

  const goTo = (idx) => {
    clearInterval(intervalRef.current);
    setCurrent(idx);
  };

  const handleClic = (pub) => {
    trackAction(pub.id, userType, userId, "clic");
    if (pub.lien_whatsapp) {
      const msg = encodeURIComponent(`Bonjour, j'ai vu votre publicité sur SILGAPP : ${pub.titre}`);
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
  };

  if (!loaded || pubs.length === 0) return null;

  const pub = pubs[current];

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      {/* Slide */}
      <div
        className="relative cursor-pointer select-none"
        style={{ background: pub.couleur_fond || "#1a1a2e", minHeight: 120 }}
        onClick={() => handleClic(pub)}
      >
        {/* Média */}
        {pub.media_url && pub.type_media === "image" && (
          <img
            src={pub.media_url}
            alt={pub.titre}
            className="w-full h-40 object-cover"
            loading="lazy"
          />
        )}
        {pub.media_url && pub.type_media === "video" && (
          <video
            src={pub.media_url}
            className="w-full h-40 object-cover"
            autoPlay
            muted
            playsInline
            loop
            onEnded={() => trackAction(pub.id, userType, userId, "vue_video")}
          />
        )}

        {/* Overlay texte */}
        <div className={`${pub.media_url ? "absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" : "p-4"} flex flex-col justify-end`}>
          <div className={`${pub.media_url ? "p-4" : ""} space-y-1`}>
            {pub.annonceur_nom && (
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ color: pub.couleur_texte || "#fff", background: "rgba(255,255,255,0.15)" }}
              >
                {pub.annonceur_nom}
              </span>
            )}
            <p className="font-black text-base leading-tight" style={{ color: pub.couleur_texte || "#fff" }}>
              {pub.titre}
            </p>
            {pub.description && (
              <p className="text-xs opacity-80 line-clamp-2" style={{ color: pub.couleur_texte || "#fff" }}>
                {pub.description}
              </p>
            )}

            {/* CTA */}
            {(pub.lien_whatsapp || pub.lien_telephone || pub.lien_url) && (
              <div className="flex items-center gap-2 mt-2">
                {pub.lien_whatsapp && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-green-500 text-white px-2.5 py-1 rounded-full">
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </span>
                )}
                {pub.lien_telephone && !pub.lien_whatsapp && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-500 text-white px-2.5 py-1 rounded-full">
                    <Phone className="w-3 h-3" /> Appeler
                  </span>
                )}
                {pub.lien_url && !pub.lien_whatsapp && !pub.lien_telephone && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-primary text-white px-2.5 py-1 rounded-full">
                    <ExternalLink className="w-3 h-3" /> Voir plus
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Badge "Pub" */}
        <span className="absolute top-2 right-2 text-[9px] font-bold bg-black/40 text-white/70 px-1.5 py-0.5 rounded">
          Pub
        </span>
      </div>

      {/* Contrôles navigation (si > 1 pub) */}
      {pubs.length > 1 && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); goTo((current - 1 + pubs.length) % pubs.length); }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
            onClick={(e) => { e.stopPropagation(); goTo((current + 1) % pubs.length); }}
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>

          {/* Indicateurs */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {pubs.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}