import React, { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ticket, CheckCircle2, X, Wallet, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import PhotoPicker from "@/components/livreur/PhotoPicker";

const NUMERO_DEPOT = "+226 66 92 51 90";

export default function PassZeroCommissionSection({ livreurId, countryCode }) {
  const [selectedPass, setSelectedPass] = useState(null);
  const [montantPaye, setMontantPaye] = useState("");
  const [preuveUrl, setPreuveUrl] = useState(null);
  const [preuveType, setPreuveType] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const requestIdRef = useRef(crypto.randomUUID());

  const { data: passOffers } = useQuery({
    queryKey: ["pass-offers", countryCode],
    queryFn: () =>
      base44.entities.PassOffer.filter({
        country_code: countryCode,
        actif: true,
      }),
    enabled: !!countryCode,
  });

  const { data: mesAchats } = useQuery({
    queryKey: ["pass-achats", livreurId],
    queryFn: () =>
      base44.entities.PassAchat.filter({
        livreur_id: livreurId,
      }),
    enabled: !!livreurId,
    refetchInterval: 10000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("soumettreAchatPass", {
        pass_offer_id: selectedPass.id,
        montant_paye: Number(montantPaye),
        preuve_url: preuveUrl,
        preuve_type: preuveType || "image",
        request_id: requestIdRef.current,
      });
      if (res?.data?.success === false) throw new Error(res.data.error);
      return res;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Demande envoyée");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  const achatsEnAttente = (mesAchats || []).filter((a) => a.statut === "en_attente");
  const achatsValides = (mesAchats || []).filter((a) => a.statut === "valide");

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="font-black text-slate-900">Demande envoyée</h3>
        <p className="text-sm text-slate-500">
          Votre achat de Pass est en attente de validation par un administrateur.
        </p>
        <Button
          className="w-full rounded-2xl"
          onClick={() => {
            setSubmitted(false);
            setSelectedPass(null);
            setMontantPaye("");
            setPreuveUrl(null);
            requestIdRef.current = crypto.randomUUID();
          }}
        >
          Retour
        </Button>
      </div>
    );
  }

  if (selectedPass) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-2xl"
            onClick={() => setSelectedPass(null)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h3 className="font-black text-slate-900">{selectedPass.nom}</h3>
            <p className="text-xs text-slate-500">Pass Zéro Commission</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-600 to-red-500 rounded-2xl p-5 text-white text-center shadow-lg">
          <Ticket className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-xs opacity-80 mb-1">Prix du Pass</p>
          <p className="text-3xl font-black">
            {selectedPass.prix?.toLocaleString()}
            <span className="text-sm font-normal ml-1">{selectedPass.devise || "FCFA"}</span>
          </p>
          <p className="text-xs opacity-90 mt-2">
            Durée : {selectedPass.duree_jours} jour{selectedPass.duree_jours > 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Numéro de dépôt</p>
            <p className="font-black text-slate-900 text-lg">{NUMERO_DEPOT}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2 shadow-sm">
          <label className="text-sm font-semibold text-slate-700">Montant payé</label>
          <Input
            type="number"
            placeholder="Ex: 500"
            value={montantPaye}
            onChange={(e) => setMontantPaye(e.target.value)}
            className="text-lg font-bold rounded-xl"
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 shadow-sm">
          <label className="text-sm font-semibold text-slate-700">Preuve de paiement</label>
          {preuveUrl ? (
            <div className="relative">
              <img src={preuveUrl} alt="Preuve" className="w-full rounded-xl max-h-64 object-cover" />
              <button
                onClick={() => setPreuveUrl(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <PhotoPicker
              label="Choisissez la source de la preuve"
              value={preuveUrl}
              allowPdf
              onChange={(url, metadata) => {
                setPreuveUrl(url);
                setPreuveType(metadata?.type || "image");
              }}
            />
          )}
        </div>

        <Button
          className="w-full h-14 text-base font-black rounded-2xl bg-red-600 hover:bg-red-700"
          disabled={Number(montantPaye) <= 0 || !preuveUrl || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending
            ? "Envoi..."
            : Number(montantPaye) <= 0
              ? "Entrez le montant"
              : !preuveUrl
                ? "Ajoutez la preuve"
                : "Envoyer ma demande"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    {achatsValides.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3">
          <p className="text-xs font-semibold text-green-800">
            ✅ {achatsValides.length} Pass actif{achatsValides.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {achatsEnAttente.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3">
          <p className="text-xs font-semibold text-orange-800">
            ⏳ {achatsEnAttente.length} achat{achatsEnAttente.length > 1 ? "s" : ""} en attente de validation
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-red-600" />
          <h3 className="font-black text-slate-900">🎫 Pass Zéro Commission</h3>
        </div>
        <p className="text-xs text-slate-500">
          Achetez un Pass et profitez de 0% de commission sur toutes vos courses pendant la durée du Pass.
        </p>

        {passOffers && passOffers.length > 0 ? (
          <div className="space-y-3">
            {passOffers
              .sort((a, b) => (a.ordre || 99) - (b.ordre || 99))
              .map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => {
                    setSelectedPass(offer);
                    setMontantPaye(String(offer.prix));
                  }}
                  className="w-full bg-gradient-to-br from-slate-50 to-red-50 border border-red-100 rounded-2xl p-4 text-left hover:border-red-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-slate-900">{offer.nom}</p>
                      {offer.description && (
                        <p className="text-xs text-slate-500 mt-1">{offer.description}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        Durée : {offer.duree_jours} jour{offer.duree_jours > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-red-600">
                        {offer.prix?.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400">{offer.devise || "FCFA"}</p>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Aucun Pass disponible pour le moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}