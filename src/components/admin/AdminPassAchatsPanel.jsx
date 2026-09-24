import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Ticket, CheckCircle2, XCircle, Clock, Ban, Image as ImageIcon, User, Phone } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const FILTRES = [
  { id: "en_attente", label: "En attente" },
  { id: "valide", label: "Validés" },
  { id: "tous", label: "Tous" },
];

export default function AdminPassAchatsPanel({ countryCode }) {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("en_attente");
  const [showProof, setShowProof] = useState(null);
  const [annulationTarget, setAnnulationTarget] = useState(null);
  const [motifAnnulation, setMotifAnnulation] = useState("");

  const { data: achats } = useQuery({
    queryKey: ["pass-achats-admin", countryCode, filtre],
    queryFn: () => {
      const filter = {};
      if (countryCode) filter.country_code = countryCode;
      if (filtre !== "tous") filter.statut = filtre;
      return base44.entities.PassAchat.filter(filter, "-date_demande", 200);
    },
  });

  // ── Résoudre les noms/téléphones des livreurs pour chaque achat ──
  // Utilise livreur_id (identifiant stable stocké dans PassAchat).
  // La validation backend (validerAchatPass) utilise le même livreur_id.
  const livreurIds = useMemo(() => {
    const ids = (achats || []).map((a) => a.livreur_id).filter(Boolean);
    return [...new Set(ids)];
  }, [achats]);

  const { data: livreursData, isLoading: livreursLoading } = useQuery({
    queryKey: ["livreurs-by-ids", livreurIds],
    queryFn: async () => {
      if (!livreurIds.length) return {};
      const results = {};
      await Promise.all(
        livreurIds.map(async (id) => {
          try {
            const livreur = await base44.entities.Livreur.get(id);
            if (livreur) results[id] = livreur;
          } catch (e) {
            console.error("[AdminPassAchatsPanel] Erreur chargement livreur", id, e?.message || e);
          }
        })
      );
      return results;
    },
    enabled: livreurIds.length > 0,
  });

  const validerMutation = useMutation({
    mutationFn: ({ achat_id, action }) =>
      base44.functions.invoke("validerAchatPass", { achat_id, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pass-achats-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pass-achats"] });
      toast.success("Action effectuée");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  const annulerMutation = useMutation({
    mutationFn: ({ achat_id, motif_annulation }) =>
      base44.functions.invoke("validerAchatPass", { achat_id, action: "annuler", motif_annulation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pass-achats-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pass-achats"] });
      setAnnulationTarget(null);
      setMotifAnnulation("");
      toast.success("Pass annulé immédiatement");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Ticket className="w-5 h-5 text-primary" />
        <h2 className="font-black text-lg">Achats Pass — Validation</h2>
      </div>

      <div className="flex gap-2">
        {FILTRES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filtre === f.id
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {(achats || []).map((achat) => (
          <div
            key={achat.id}
            className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-slate-900">{achat.pass_offer_nom}</p>
                <p className="text-xs text-slate-500">
                  {achat.country_code} • {achat.montant_paye?.toLocaleString()} {achat.devise || "FCFA"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {achat.statut === "en_attente" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" /> En attente
                  </span>
                )}
                {achat.statut === "valide" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Validé
                  </span>
                )}
                {achat.statut === "refuse" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Refusé
                  </span>
                )}
                {achat.statut === "annule" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700 font-medium flex items-center gap-1">
                    <Ban className="w-3 h-3" /> Annulé
                  </span>
                )}
              </div>
            </div>

            {(() => {
              const livreur = livreursData?.[achat.livreur_id];
              const nomComplet = livreur
                ? `${livreur.prenom || ""} ${livreur.nom || ""}`.trim()
                : null;
              const livreurIntrouvable = !livreursLoading && !livreur;
              return (
                <div className={`rounded-xl p-3 mb-2 border ${livreurIntrouvable ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className={`font-semibold text-sm ${livreurIntrouvable ? "text-red-700" : "text-slate-800"}`}>
                      {livreursLoading ? "Chargement..." : (nomComplet || "⚠️ Livreur introuvable")}
                    </p>
                  </div>
                  {livreur?.telephone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-600">{livreur.telephone}</p>
                    </div>
                  )}
                  {achat.livreur_user_email && (
                    <p className="text-xs text-slate-400 mt-1 truncate">{achat.livreur_user_email}</p>
                  )}
                </div>
              );
            })()}

            {achat.date_demande && (
              <p className="text-xs text-slate-400 mb-2">
                Demande : {format(new Date(achat.date_demande), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
              </p>
            )}

            {achat.preuve_url && (
              <button
                onClick={() => setShowProof(showProof === achat.id ? null : achat.id)}
                className="flex items-center gap-2 text-xs text-primary font-medium mb-2"
              >
                <ImageIcon className="w-4 h-4" />
                Voir la preuve
              </button>
            )}
            {showProof === achat.id && achat.preuve_url && (
              <img
                src={achat.preuve_url}
                alt="Preuve"
                className="w-full rounded-xl max-h-48 object-cover mb-2"
              />
            )}

            {achat.statut === "en_attente" && (() => {
              const livreur = livreursData?.[achat.livreur_id];
              const livreurBloqueValidation = !livreursLoading && !livreur;
              return (
                <div className="flex gap-2 mt-2">
                  {livreurBloqueValidation && (
                    <p className="text-xs text-red-600 w-full mb-1 text-center">
                      ⚠️ Validation bloquée — profil livreur introuvable
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={validerMutation.isPending || livreurBloqueValidation || livreursLoading}
                    onClick={() =>
                      validerMutation.mutate({ achat_id: achat.id, action: "valider" })
                    }
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200"
                    disabled={validerMutation.isPending || livreursLoading}
                    onClick={() =>
                      validerMutation.mutate({ achat_id: achat.id, action: "refuser" })
                    }
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Refuser
                  </Button>
                </div>
              );
            })()}

            {achat.statut === "valide" && achat.expiration_at && (
              <p className="text-xs text-green-600">
                Expire le {format(new Date(achat.expiration_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
              </p>
            )}

            {achat.statut === "annule" && (
              <div className="bg-gray-50 rounded-xl p-3 mt-2 border border-gray-200 space-y-1">
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Annulé le :</span>{" "}
                  {achat.annule_at && format(new Date(achat.annule_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
                </p>
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Par :</span> {achat.annule_par || "—"}
                </p>
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Motif :</span> {achat.motif_annulation || "—"}
                </p>
                {achat.expiration_at && (
                  <p className="text-xs text-gray-400">
                    <span className="font-semibold">Expiration originale :</span>{" "}
                    {format(new Date(achat.expiration_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
                  </p>
                )}
              </div>
            )}

            {achat.statut === "valide" && achat.expiration_at && new Date(achat.expiration_at) > new Date() && (
              <Button
                size="sm"
                variant="destructive"
                className="w-full mt-2"
                disabled={annulerMutation.isPending}
                onClick={() => {
                  setAnnulationTarget(achat);
                  setMotifAnnulation("");
                }}
              >
                <Ban className="w-4 h-4 mr-1" /> Annuler le Pass
              </Button>
            )}
          </div>
        ))}
        {(!achats || achats.length === 0) && (
          <p className="text-center text-sm text-slate-400 py-8">
            Aucun achat.
          </p>
        )}
      </div>

      {annulationTarget && (() => {
        const livreur = livreursData?.[annulationTarget.livreur_id];
        const nomComplet = livreur
          ? `${livreur.prenom || ""} ${livreur.nom || ""}`.trim()
          : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-slate-900">Confirmer l'annulation du Pass ?</h3>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Pass :</span> {annulationTarget.pass_offer_nom}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Livreur :</span> {nomComplet || "Livreur introuvable"}
                </p>
                {livreur?.telephone && (
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Téléphone :</span> {livreur.telephone}
                  </p>
                )}
                {annulationTarget.expiration_at && (
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Expiration originale :</span>{" "}
                    {format(new Date(annulationTarget.expiration_at), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}
                  </p>
                )}
              </div>
              <p className="text-sm text-slate-600">
                L'annulation prendra effet <strong>immédiatement</strong> pour les nouvelles courses.
                Les courses déjà acceptées à 0% ne seront pas affectées.
              </p>
              <div>
                <label className="text-sm font-medium text-slate-700">Motif d'annulation *</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm resize-none focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
                  rows={3}
                  placeholder="Erreur de validation, preuve incorrecte, problème opérationnel..."
                  value={motifAnnulation}
                  onChange={(e) => setMotifAnnulation(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={!motifAnnulation.trim() || annulerMutation.isPending}
                  onClick={() =>
                    annulerMutation.mutate({
                      achat_id: annulationTarget.id,
                      motif_annulation: motifAnnulation.trim(),
                    })
                  }
                >
                  {annulerMutation.isPending ? "Annulation..." : "Confirmer l'annulation"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setAnnulationTarget(null);
                    setMotifAnnulation("");
                  }}
                >
                  Retour
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}