import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, Plus, Pencil, Trash2, Loader2, ArrowLeft, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EtablissementForm from "@/components/partenaire/EtablissementForm";
import PartenaireDetailDialog from "@/components/admin/PartenaireDetailDialog";

export default function GestionBoutiques() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(u => setUser(u)).catch(() => {}); }, []);

  const isAdminPays = user?.admin_type === "pays";
  const countryFilter = isAdminPays && user?.country_code ? { pays_code: user.country_code } : {};

  const { data: boutiques = [], isLoading } = useQuery({
    queryKey: ["admin-boutiques", user?.country_code],
    queryFn: () => base44.entities.Boutique.filter(countryFilter, "-created_date", 200),
    enabled: !!user,
  });

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette boutique ?")) return;
    await base44.entities.Boutique.delete(id);
    queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] });
  };

  const toggleActif = async (b) => {
    await base44.entities.Boutique.update(b.id, { actif: !b.actif });
    queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] });
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
          <h1 className="text-xl font-black text-gray-900">Gestion des Boutiques</h1>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="w-full bg-primary text-white rounded-2xl p-3 flex items-center justify-center gap-2 font-bold text-sm"
        >
          <Plus className="w-4 h-4" /> Ajouter une boutique
        </button>

        {showForm && (
          <EtablissementForm
            type="boutique"
            existing={editing}
            partenaireId={editing?.partenaire_id || user.id}
            userEmail={editing?.user_email || user.email}
            isAdmin={true}
            onSaved={() => { setShowForm(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] }); }}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}

        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

        {boutiques.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              {b.logo_url ? <img src={b.logo_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-6 h-6 text-blue-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{b.nom}</p>
              <p className="text-xs text-gray-500">{b.quartier || ""} {b.ville ? `· ${b.ville}` : ""} · {b.pays_code}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {valBadge(b.validation)}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}>
                  {b.ouvert ? "Ouvert" : "Fermé"}
                </span>
                <button onClick={() => toggleActif(b)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.actif ? "text-blue-600 bg-blue-50" : "text-gray-400 bg-gray-100"}`}>
                  {b.actif ? "Actif" : "Inactif"}
                </button>
                {b.commission_pct != null && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-purple-600 bg-purple-50">{b.commission_pct}%</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => setDetailItem(b)} className="p-2 rounded-lg hover:bg-purple-50"><Eye className="w-4 h-4 text-purple-500" /></button>
              <button onClick={() => { setEditing(b); setShowForm(true); }} className="p-2 rounded-lg hover:bg-gray-50"><Pencil className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => handleDelete(b.id)} className="p-2 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          </div>
        ))}

        {!isLoading && boutiques.length === 0 && !showForm && (
          <p className="text-center text-sm text-gray-400 py-8">Aucune boutique</p>
        )}
      </div>

      <PartenaireDetailDialog
        open={!!detailItem}
        etablissement={detailItem}
        type="boutique"
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}