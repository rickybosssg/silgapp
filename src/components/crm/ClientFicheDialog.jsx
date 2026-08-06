import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Star, Phone, MapPin, Package, Calendar, TrendingUp, Truck, Clock } from "lucide-react";

const STATUT_COLORS = {
  actif: "bg-green-100 text-green-700 border-green-300",
  inactif: "bg-red-100 text-red-700 border-red-300",
  vip: "bg-amber-100 text-amber-700 border-amber-300",
  nouveau: "bg-yellow-100 text-yellow-700 border-yellow-300",
};

const STATUT_LABELS = {
  actif: "Actif",
  inactif: "Inactif",
  vip: "VIP",
  nouveau: "Nouveau",
};

const TYPE_COLIS_LABELS = {
  petit_colis: "Petit colis",
  moyen_colis: "Moyen colis",
  gros_colis: "Gros colis",
  document: "Document",
  nourriture: "Nourriture",
  autre: "Autre",
};

export default function ClientFicheDialog({ open, onClose, client: initialClient }) {
  const [client, setClient] = useState(initialClient);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialClient) setClient(initialClient);
  }, [initialClient]);

  useEffect(() => {
    if (!open || !client?.id) return;
    const loadCourses = async () => {
      setLoading(true);
      try {
        const results = await base44.entities.CourseExterne.list("-created_date", 50);
        const mine = (results || []).filter(c =>
          c.client_telephone === client.telephone ||
          c.expediteur_telephone === client.telephone ||
          c.destinataire_telephone === client.telephone
        );
        setCourses(mine);
      } catch (e) {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    loadCourses();
  }, [open, client]);

  if (!client) return null;

  const fullName = `${client.prenom || ""} ${client.nom || ""}`.trim() || client.telephone || "Client";
  const statut = client.statut_crm || "nouveau";
  let quartiers = [];
  try { quartiers = JSON.parse(client.quartiers_utilises || "[]"); } catch {}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                {fullName.charAt(0).toUpperCase()}
              </div>
              {fullName}
            </DialogTitle>
            <Badge className={STATUT_COLORS[statut] || STATUT_COLORS.nouveau}>
              {statut === "vip" && <Star className="w-3 h-3 mr-1" />}
              {STATUT_LABELS[statut] || statut}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Infos de base */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">{client.telephone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">{client.quartier || client.ville || "—"}</span>
            </div>
          </div>

          {/* Stats CRM */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
              <Package className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-800">{client.nb_courses_total || 0}</p>
              <p className="text-[9px] text-gray-500 uppercase font-semibold">Courses</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
              <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-800">{client.nb_courses_admin || 0}</p>
              <p className="text-[9px] text-gray-500 uppercase font-semibold">Admin</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
              <span className="text-base font-bold text-amber-600 block">FCFA</span>
              <p className="text-sm font-bold text-gray-800 leading-tight">{(client.montant_total_depense || 0).toLocaleString()}</p>
              <p className="text-[9px] text-gray-500 uppercase font-semibold">Dépensé</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
              <Clock className="w-4 h-4 text-purple-500 mx-auto mb-1" />
              <p className="text-[10px] font-bold text-gray-800 leading-tight">
                {client.derniere_course_date ? new Date(client.derniere_course_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
              </p>
              <p className="text-[9px] text-gray-500 uppercase font-semibold">Dernière</p>
            </div>
          </div>

          {/* Quartiers préférés */}
          {quartiers.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Quartiers les plus utilisés
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quartiers.slice(0, 5).map((q, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] bg-white">
                    {q.quartier} ({q.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Type de colis fréquent */}
          {client.type_colis_frequent && (
            <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">Colis fréquent:</span>
              <span className="font-semibold text-gray-800">{TYPE_COLIS_LABELS[client.type_colis_frequent] || client.type_colis_frequent}</span>
            </div>
          )}

          {/* Notes admin */}
          {client.notes_admin && (
            <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-200">
              <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-wide mb-1">Notes admin</p>
              <p className="text-sm text-gray-700">{client.notes_admin}</p>
            </div>
          )}

          {/* Historique des courses */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Historique des courses ({courses.length})
            </p>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">Chargement...</p>
            ) : courses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune course trouvée</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {courses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-700 truncate">
                        {c.adresse_depart || "—"} → {c.adresse_arrivee || "—"}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(c.created_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        {c.livreur_nom && ` • ${c.livreur_nom}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(c.prix_final || c.prix_estimate) && (
                        <span className="text-[10px] font-bold text-green-600">
                          {(c.prix_final || c.prix_estimate).toLocaleString()} F
                        </span>
                      )}
                      <Badge variant="outline" className={`text-[9px] ${
                        c.statut === "livree" ? "bg-green-50 text-green-700 border-green-200" :
                        c.statut === "annulee" ? "bg-red-50 text-red-700 border-red-200" :
                        "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {c.statut}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}