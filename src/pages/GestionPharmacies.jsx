import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill, Plus, Pencil, Trash2, Loader2, ArrowLeft, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EtablissementForm from "@/components/partenaire/EtablissementForm";
import PartenaireDetailDialog from "@/components/admin/PartenaireDetailDialog";

export default function GestionPharmacies() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(u => setUser(u)).catch(() => {}); }, []);

  const isAdminPays = user?.admin_type === "pays";
  const countryFilter = isAdminPays && user?.country_code ? { pays_code: user.country_code } : {};

  const { data: pharmacies = [], isLoading } = useQuery({
    queryKey: ["admin-pharmacies", user?.country_code],
    queryFn: () => base44.entities.Pharmacie.filter(countryFilter, "-created_date", 200),
    enabled: !!user,
  });

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette pharmacie ?")) return;
    await base44.entities.Pharmacie.delete(id);
    queryClient.invalidateQueries({ queryKey: ["admin-pharmacies"] });
  };

  const toggleActif = async (p) => {
    await base44.entities.Pharmacie.update(p.id, { actif: !p.actif });
    queryClient.invalidateQueries({ queryKey: ["admin-pharmacies"] });
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  const valBadge = (v) => {
    if (v === "en_attente") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-600 bg-amber-50">En attente</span>;
    if (v === "refuse") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 bg-red-50">Refusé</span>;
    if (v === "suspendu") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-orange-600 bg-orange-50">Suspendu</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-black text-gray-900">Gestion des Pharmacies</h1>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="w-full bg-gray-800 text-white rounded-2xl p-3 flex items-center justify-center gap-2 font-bold text-sm"
        >
          <Plus className="w-4 h-4" /> Ajouter une pharmacie
        </button>

        {showForm && (
          <EtablissementForm
            type="pharmacie"
            existing={editing}
            partenaireId={editing?.partenaire_id || user.id}
            userEmail={editing?.user_email || user.email}
            isAdmin={true}
            onSaved={() => { setShowForm(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["admin-pharmacies"] }); }}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}

        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

        {pharmacies.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {p.logo_url ? <img src={p.logo_url} alt="" className="w-full h-full object-cover" /> : <Pill className="w-6 h-6 text-gray-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{p.nom}</p>
              <p className="text-xs text-gray-500">{p.quartier || ""} {p.ville ? `· ${p.ville}` : ""} · {p.pays_code}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {valBadge(p.validation)}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}>
                  {p.ouvert ? "Ouvert" : "Fermé"}
                </span>
                <button onClick={() => toggleActif(p)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.actif ? "text-gray-700 bg-gray-100" : "text-gray-400 bg-gray-50"}`}>
                  {p.actif ? "Actif" : "Inactif"}
                </button>
                {p.commission_pct != null && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-purple-600 bg-purple-50">{p.commission_pct}%</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => setDetailItem(p)} className="p-2 rounded-lg hover:bg-purple-50"><Eye className="w-4 h-4 text-purple-500" /></button>
              <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-2 rounded-lg hover:bg-gray-50"><Pencil className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          </div>
        ))}

        {!isLoading && pharmacies.length === 0 && !showForm && (
          <p className="text-center text-sm text-gray-400 py-8">Aucune pharmacie</p>
        )}
      </div>

      <PartenaireDetailDialog
        open={!!detailItem}
        etablissement={detailItem}
        type="pharmacie"
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}