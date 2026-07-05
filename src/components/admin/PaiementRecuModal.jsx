import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wallet, X } from "lucide-react";
import { Link } from "react-router-dom";

export default function PaiementRecuModal() {
  const [dismissed, setDismissed] = useState(false);

  const { data: paiements = [] } = useQuery({
    queryKey: ["paiements-silgapp-modal"],
    queryFn: () => base44.entities.PaiementSilgapp.filter({ statut: "en_attente" }, "-date_envoi", 10),
    initialData: [],
    refetchInterval: 15000,
  });

  const hasNew = paiements.length > 0;

  // Reset dismissed when new payments arrive
  useEffect(() => {
    if (hasNew) setDismissed(false);
  }, [paiements.length]);

  if (!hasNew || dismissed) return null;

  const total = paiements.reduce((s, p) => s + (p.montant_paye || 0), 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 text-white relative">
          <button onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition">
            <X className="w-4 h-4" />
          </button>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Wallet className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-center">Nouveau paiement reçu !</h2>
          <p className="text-center text-sm text-white/80 mt-1">
            {paiements.length} preuve{paiements.length > 1 ? "s" : ""} de dépôt en attente
          </p>
          <p className="text-center text-2xl font-black mt-2">{total.toLocaleString()} F</p>
        </div>

        {/* List */}
        <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
          {paiements.slice(0, 5).map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                {(p.user_nom || "?").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.user_nom}</p>
                <p className="text-xs text-gray-400">{p.user_type}</p>
              </div>
              <p className="text-sm font-bold text-green-600">{(p.montant_paye || 0).toLocaleString()} F</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-4 border-t">
          <Link to="/admin/paiements" onClick={() => setDismissed(true)}>
            <button className="w-full h-12 rounded-xl bg-primary text-white font-bold text-sm active:scale-95 transition">
              Traiter les paiements
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}