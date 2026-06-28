import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X, Save, CheckCircle, XCircle, PauseCircle, MapPin, Phone, Mail, Wallet, Store, UtensilsCrossed, Pill, Calendar, Percent, User } from "lucide-react";

const PAYS_NOMS = {
  BF: "Burkina Faso", CI: "Côte d'Ivoire", TG: "Togo", BJ: "Bénin", SN: "Sénégal",
  ML: "Mali", GN: "Guinée", NE: "Niger", GH: "Ghana",
};

const VALIDATION_LABELS = {
  en_attente: { label: "En attente", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  valide: { label: "Validé", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
  refuse: { label: "Refusé", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  suspendu: { label: "Suspendu", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
};

export default function PartenaireDetailDialog({ open, etablissement, type, onClose }) {
  const queryClient = useQueryClient();
  const [commission, setCommission] = useState("");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const entityName = type === "restaurant" ? "Restaurant" : type === "pharmacie" ? "Pharmacie" : "Boutique";
  const typeIcon = type === "restaurant" ? UtensilsCrossed : type === "pharmacie" ? Pill : Store;
  const typeLabel = type === "restaurant" ? "Restaurant" : type === "pharmacie" ? "Pharmacie" : "Boutique";
  const Icon = typeIcon;

  useEffect(() => {
    if (etablissement) {
      setCommission(etablissement.commission_pct != null ? String(etablissement.commission_pct) : "");
      setMotif(etablissement.motif_refus || "");
    }
  }, [etablissement]);

  if (!open || !etablissement) return null;

  const valInfo = VALIDATION_LABELS[etablissement.validation] || VALIDATION_LABELS.en_attente;

  const handleSaveCommission = async () => {
    setSaving(true);
    try {
      const val = commission.trim() ? parseFloat(commission) : null;
      await base44.entities[entityName].update(etablissement.id, { commission_pct: val });
      queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] });
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      queryClient.invalidateQueries({ queryKey: ["partenaires-en-attente"] });
    } catch (err) {}
    setSaving(false);
  };

  const handleValidation = async (action) => {
    setActionLoading(action);
    try {
      const updates = { valide_par: null, valide_at: new Date().toISOString() };
      // Récupérer l'utilisateur courant pour valide_par
      try {
        const me = await base44.auth.me();
        if (me?.email) updates.valide_par = me.email;
      } catch (_) {}

      if (action === "valider") {
        updates.validation = "valide";
        updates.actif = true;
        updates.motif_refus = "";
      } else if (action === "refuser") {
        updates.validation = "refuse";
        updates.actif = false;
        updates.motif_refus = motif || "Non précisé";
      } else if (action === "suspendre") {
        updates.validation = "suspendu";
        updates.actif = false;
        updates.motif_refus = motif || "Suspendu par l'admin";
      } else if (action === "reactiver") {
        updates.validation = "valide";
        updates.actif = true;
        updates.motif_refus = "";
      }

      await base44.entities[entityName].update(etablissement.id, updates);
      queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] });
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      queryClient.invalidateQueries({ queryKey: ["partenaires-en-attente"] });
      queryClient.invalidateQueries({ queryKey: ["ma-boutique"] });
      queryClient.invalidateQueries({ queryKey: ["mon-restaurant"] });
      queryClient.invalidateQueries({ queryKey: ["ma-pharmacie"] });
    } catch (err) {}
    setActionLoading(null);
  };

  const InfoRow = ({ icon: I, label, value }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <I className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 font-medium break-words">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {etablissement.logo_url
                ? <img src={etablissement.logo_url} alt="" className="w-full h-full object-cover" />
                : <Icon className="w-5 h-5 text-white" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white truncate">{etablissement.nom}</h2>
              <p className="text-xs text-white/60">{typeLabel} · {PAYS_NOMS[etablissement.pays_code] || etablissement.pays_code}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Statut de validation */}
          <div className={`rounded-2xl border ${valInfo.border} ${valInfo.bg} p-4 flex items-center justify-between`}>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Statut</p>
              <p className={`text-lg font-black ${valInfo.color}`}>{valInfo.label}</p>
            </div>
            {etablissement.valide_at && (
              <p className="text-[10px] text-gray-400 text-right">
                {new Date(etablissement.valide_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                {etablissement.valide_par ? <><br />par {etablissement.valide_par}</> : null}
              </p>
            )}
          </div>

          {/* Informations */}
          <section>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Informations
            </h3>
            <div className="divide-y divide-gray-50">
              <InfoRow icon={Mail} label="Propriétaire (email)" value={etablissement.user_email} />
              <InfoRow icon={Phone} label="Téléphone" value={etablissement.telephone} />
              <InfoRow icon={Wallet} label="Mobile Money (dépôt)" value={etablissement.telephone_depot} />
              <InfoRow icon={MapPin} label="Adresse" value={`${etablissement.adresse || ""} ${etablissement.quartier || ""} ${etablissement.ville || ""}`.trim()} />
              <InfoRow icon={MapPin} label="GPS" value={etablissement.latitude && etablissement.longitude ? `${etablissement.latitude.toFixed(5)}, ${etablissement.longitude.toFixed(5)}` : "—"} />
              <InfoRow icon={Calendar} label="Horaires" value={etablissement.horaires} />
              {type === "restaurant" && <InfoRow icon={UtensilsCrossed} label="Spécialité" value={etablissement.specialite} />}
              {type === "boutique" && <InfoRow icon={Store} label="Catégorie" value={etablissement.categorie} />}
              <InfoRow icon={Calendar} label="Créé le" value={new Date(etablissement.created_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} />
            </div>
            {etablissement.description && (
              <div className="mt-3 rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Description</p>
                <p className="text-sm text-gray-700">{etablissement.description}</p>
              </div>
            )}
          </section>

          {/* Commission */}
          <section>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Percent className="w-3.5 h-3.5" /> Commission SILGAPP
            </h3>
            <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                  placeholder="Défaut (ex: 10)"
                  className="flex-1 h-11 rounded-xl border border-gray-200 px-3 text-sm font-bold focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                />
                <span className="text-lg font-bold text-gray-400">%</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 15, 20].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setCommission(String(pct))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${commission === String(pct) ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  onClick={() => setCommission("")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${!commission ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  Défaut
                </button>
              </div>
              <p className="text-[11px] text-gray-400">Ce taux est appliqué automatiquement sur chaque commande. Laisser vide pour utiliser la commission par défaut du pays.</p>
              <button
                onClick={handleSaveCommission}
                disabled={saving}
                className="w-full h-11 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer le taux
              </button>
            </div>
          </section>

          {/* Actions de validation */}
          <section>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Validation du partenaire</h3>
            {etablissement.validation === "en_attente" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleValidation("valider")}
                  disabled={!!actionLoading}
                  className="h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading === "valider" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Valider
                </button>
                <button
                  onClick={() => handleValidation("refuser")}
                  disabled={!!actionLoading}
                  className="h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {actionLoading === "refuser" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Refuser
                </button>
              </div>
            )}
            {etablissement.validation === "valide" && (
              <button
                onClick={() => handleValidation("suspendre")}
                disabled={!!actionLoading}
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading === "suspendre" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />} Suspendre ce partenaire
              </button>
            )}
            {(etablissement.validation === "refuse" || etablissement.validation === "suspendu") && (
              <button
                onClick={() => handleValidation("reactiver")}
                disabled={!!actionLoading}
                className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading === "reactiver" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Réactiver / Valider
              </button>
            )}
            {(etablissement.validation === "refuse" || etablissement.validation === "suspendu") && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-600">Motif {etablissement.validation === "refuse" ? "de refus" : "de suspension"}</label>
                <textarea
                  value={motif}
                  onChange={e => setMotif(e.target.value)}
                  placeholder="Indiquez le motif..."
                  rows={2}
                  className="w-full mt-1 rounded-xl border border-gray-200 p-2.5 text-sm focus:ring-2 focus:ring-red-100 focus:border-red-300 outline-none"
                />
              </div>
            )}
            {etablissement.motif_refus && (etablissement.validation === "valide") && (
              <p className="text-[11px] text-gray-400 mt-2">Ancien motif: {etablissement.motif_refus}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}