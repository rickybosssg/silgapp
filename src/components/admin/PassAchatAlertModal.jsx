import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ticket, Clock, CheckCircle2, X } from "lucide-react";

const STORAGE_KEY = "silgapp_pass_alert_dismissed_ids";

function getDismissedIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function addDismissedId(id) {
  try {
    const ids = getDismissedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      // Garder seulement les 50 derniers pour éviter une croissance infinie
      const trimmed = ids.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {}
}

export default function PassAchatAlertModal() {
  const navigate = useNavigate();
  const [pendingAchats, setPendingAchats] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchPending = async () => {
    try {
      const data = await base44.entities.PassAchat.filter({ statut: "en_attente" }, "-date_demande", 50);
      if (!Array.isArray(data)) return;
      // Filtrer les déjà acquittés par l'admin
      const dismissed = getDismissedIds();
      const visible = data.filter(a => !dismissed.includes(a.id));
      // Enrichir avec les infos livreur (nom, téléphone) non stockées sur PassAchat
      const enriched = await Promise.all(visible.map(async (a) => {
        if (!a.livreur_id) return a;
        try {
          const l = await base44.entities.Livreur.get(a.livreur_id);
          if (l) {
            return { ...a, _livreur_nom: `${l.prenom || ''} ${l.nom || ''}`.trim() || l.nom, _livreur_telephone: l.telephone };
          }
        } catch (_) {}
        return a;
      }));
      setPendingAchats(enriched);
      if (enriched.length > 0 && !showModal) {
        setShowModal(true);
      }
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchPending();
    // Subscription temps réel sur PassAchat
    const unsubscribe = base44.entities.PassAchat.subscribe((event) => {
      if (event.type === "create" || event.type === "update") {
        // Re-fetch pour détecter les nouveaux achats en attente
        setTimeout(() => fetchPending(), 500);
      }
    });
    // Polling de rattrapage (au cas où la subscription realtime manque un événement)
    const interval = setInterval(fetchPending, 30000);
    return () => { clearInterval(interval); unsubscribe?.(); };
  }, []);

  const handleVoir = () => {
    setShowModal(false);
    // Marquer tous les achats visibles comme acquittés
    for (const a of pendingAchats) {
      addDismissedId(a.id);
    }
    // Naviguer vers la page de gestion des Pass
    navigate("/admin/pass-zero-commission");
  };

  const handlePlusTard = () => {
    setShowModal(false);
    // Marquer comme acquittés pour ne pas réafficher indéfiniment
    for (const a of pendingAchats) {
      addDismissedId(a.id);
    }
  };

  // Ne rien afficher si pas de demandes ou si loading initial
  if (loading || pendingAchats.length === 0 || !showModal) return null;

  const count = pendingAchats.length;
  const first = pendingAchats[0];

  return (
    <Dialog open={showModal} onOpenChange={(o) => { if (!o) handlePlusTard(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Ticket className="w-6 h-6 text-primary" />
            {count === 1 ? "🎟️ NOUVEL ACHAT DE PASS" : `🎟️ ${count} achats de Pass attendent votre validation`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Notification de demande d'achat de Pass en attente de validation
          </DialogDescription>
        </DialogHeader>

        {count === 1 ? (
          <PassAchatDetail achat={first} />
        ) : (
          <div className="space-y-2">
            {pendingAchats.slice(0, 5).map((a) => (
              <PassAchatDetail key={a.id} achat={a} compact />
            ))}
            {count > 5 && (
              <p className="text-xs text-slate-500 text-center">
                + {count - 5} autre(s) demande(s)…
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" onClick={handlePlusTard} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Plus tard
          </Button>
          <Button onClick={handleVoir} className="flex-1 bg-primary text-white">
            {count === 1 ? (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Voir / Valider</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> Voir les demandes</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PassAchatDetail({ achat, compact }) {
  const livreurNom = achat._livreur_nom || achat.livreur_nom || "Livreur";
  const montant = Number(achat.montant_paye || 0).toLocaleString("fr-FR");
  const date = achat.date_demande
    ? new Date(achat.date_demande).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{livreurNom}</p>
          <p className="text-xs text-slate-500">{achat.pass_offer_nom} — {montant} FCFA</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium whitespace-nowrap">
          <Clock className="w-3 h-3" /> En attente
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-slate-500 font-medium">Livreur</p>
          <p className="font-semibold text-slate-900">{livreurNom}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Téléphone</p>
          <p className="font-semibold text-slate-900">{achat._livreur_telephone || achat.livreur_telephone || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Pass</p>
          <p className="font-semibold text-slate-900">{achat.pass_offer_nom}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Durée</p>
          <p className="font-semibold text-slate-900">{achat.duree_jours || "—"} jour(s)</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Montant</p>
          <p className="font-semibold text-slate-900">{montant} {achat.devise || "FCFA"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Date/heure</p>
          <p className="font-semibold text-slate-900 text-xs">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-amber-600 font-medium text-sm">
        <Clock className="w-4 h-4" /> En attente de validation
      </div>
    </div>
  );
}