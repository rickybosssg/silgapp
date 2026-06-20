import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, Phone, MapPin, TrendingUp, Banknote, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function formatMontant(v) {
  return `${(v || 0).toLocaleString('fr-FR')} FCFA`;
}

export default function ComptabiliteLivreurDetail({ livreurId, livreurNom, onClose, onPaid }) {
  const [paiementLoading, setPaiementLoading] = useState(false);

  const { data: livreur } = useQuery({
    queryKey: ["compta-livreur-detail", livreurId],
    queryFn: () => base44.entities.Livreur.get(livreurId),
    enabled: !!livreurId,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["compta-livreur-courses", livreurId],
    queryFn: () => base44.entities.CourseExterne.filter(
      { livreur_id: livreurId, statut: "livree" },
      "-heure_livraison", 100
    ),
    enabled: !!livreurId,
  });

  const { data: historiqueEncours = [] } = useQuery({
    queryKey: ["compta-livreur-encours", livreurId],
    queryFn: () => base44.entities.HistoriqueEncours.filter(
      { livreur_id: livreurId },
      "-date_action", 20
    ),
    enabled: !!livreurId,
  });

  const handlePayer = async () => {
    setPaiementLoading(true);
    try {
      await base44.functions.invoke("paiementLivreur", { livreur_id: livreurId });
      toast.success(`${livreurNom || "Livreur"} marqué comme payé `);
      onPaid?.();
    } catch (e) {
      toast.error("Erreur lors du paiement");
    } finally {
      setPaiementLoading(false);
    }
  };

  const l = livreur || {};
  const coursesNonPayees = courses.filter(c => c.statut_paiement_livreur !== 'paye');
  const dusNonPayes = coursesNonPayees.reduce((s, c) => s + (c.montant_livreur || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-lg font-black text-gray-900">{livreurNom || "Livreur"}</p>
            <p className="text-xs text-gray-500">{l.telephone}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 p-4">
          {[
            { icon: <TrendingUp className="w-4 h-4" />, label: "Encours", val: formatMontant(l.encours || 0), color: l.bloque_encours ? "text-red-600" : "text-amber-600" },
            { icon: <Banknote className="w-4 h-4" />, label: "Dû SILGAPP", val: formatMontant(l.montant_du_silga || 0), color: "text-blue-600" },
            { icon: <MapPin className="w-4 h-4" />, label: "Pays", val: l.country_code || "—", color: "text-gray-600" },
          ].map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
              <div className={`flex justify-center mb-1 ${item.color}`}>{item.icon}</div>
              <p className="text-xs font-bold text-gray-900">{item.val}</p>
              <p className="text-[10px] text-gray-400">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Statut */}
        <div className="px-4 pb-2 flex items-center gap-2">
          {l.bloque_encours && <Badge className="bg-red-100 text-red-700"> Bloqué encours</Badge>}
          {dusNonPayes > 0 && <Badge className="bg-amber-100 text-amber-700"> {formatMontant(dusNonPayes)} non payé</Badge>}
          {dusNonPayes === 0 && courses.length > 0 && <Badge className="bg-green-100 text-green-700"> À jour</Badge>}
        </div>

        {/* Actions */}
        <div className="px-4 pb-2 flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={`tel:${l.telephone}`}>
              <Phone className="w-3.5 h-3.5" /> Appeler
            </a>
          </Button>
          {dusNonPayes > 0 && (
            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={handlePayer} disabled={paiementLoading}>
              <CheckCircle className="w-3.5 h-3.5" />
              {paiementLoading ? "..." : "Marquer comme payé"}
            </Button>
          )}
        </div>

        {/* Courses récentes */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Dernières courses ({courses.length})
          </p>
          {courses.slice(0, 20).map(c => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-xs">
              <div>
                <p className="font-semibold text-gray-800 truncate max-w-[200px]">
                  {c.adresse_depart} → {c.adresse_arrivee}
                </p>
                <p className="text-gray-400">
                  {c.heure_livraison ? format(new Date(c.heure_livraison), 'dd/MM HH:mm', { locale: fr }) : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{formatMontant(c.prix_final || 0)}</p>
                <span className={c.statut_paiement_livreur === 'paye' ? "text-green-600" : "text-amber-600"}>
                  {c.statut_paiement_livreur === 'paye' ? 'Payé' : 'Non payé'}
                </span>
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <p className="text-center text-gray-400 py-4">Aucune course</p>
          )}
        </div>

        {/* Historique encours */}
        {historiqueEncours.length > 0 && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Historique encours
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {historiqueEncours.slice(0, 10).map(h => (
                <div key={h.id} className="flex items-center justify-between text-[10px] text-gray-600">
                  <span>{h.type_action === 'blocage_auto' ? ' Blocage auto' : h.type_action === 'deblocage_admin' ? ' Déblocage' : ' Modif'}</span>
                  <span>{h.date_action ? format(new Date(h.date_action), 'dd/MM HH:mm', { locale: fr }) : '—'}</span>
                  <span className="font-semibold">{formatMontant(h.encours_apres || h.encours_avant || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}