import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UtensilsCrossed, Plus, Pencil, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EtablissementForm from "@/components/partenaire/EtablissementForm";

export default function GestionRestaurants() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(u => setUser(u)).catch(() => {}); }, []);

  const isAdminPays = user?.admin_type === "pays";
  const countryFilter = isAdminPays && user?.country_code ? { pays_code: user.country_code } : {};

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["admin-restaurants", user?.country_code],
    queryFn: () => base44.entities.Restaurant.filter(countryFilter, "-created_date", 200),
    enabled: !!user,
  });

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce restaurant ?")) return;
    await base44.entities.Restaurant.delete(id);
    queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
  };

  const toggleActif = async (r) => {
    await base44.entities.Restaurant.update(r.id, { actif: !r.actif });
    queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-black text-gray-900">Gestion des Restaurants</h1>
        </div>

        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="w-full bg-primary text-white rounded-2xl p-3 flex items-center justify-center gap-2 font-bold text-sm"
        >
          <Plus className="w-4 h-4" /> Ajouter un restaurant
        </button>

        {showForm && (
          <EtablissementForm
            type="restaurant"
            existing={editing}
            partenaireId={editing?.partenaire_id || user.id}
            userEmail={editing?.user_email || user.email}
            onSaved={() => { setShowForm(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] }); }}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}

        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

        {restaurants.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              {r.logo_url ? <img src={r.logo_url} alt="" className="w-full h-full object-cover" /> : <UtensilsCrossed className="w-6 h-6 text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{r.nom}</p>
              <p className="text-xs text-gray-500">{r.specialite || ""} {r.quartier ? `· ${r.quartier}` : ""} · {r.pays_code}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}>
                  {r.ouvert ? "Ouvert" : "Fermé"}
                </span>
                <button onClick={() => toggleActif(r)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.actif ? "text-blue-600 bg-blue-50" : "text-gray-400 bg-gray-100"}`}>
                  {r.actif ? "Actif" : "Inactif"}
                </button>
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => { setEditing(r); setShowForm(true); }} className="p-2 rounded-lg hover:bg-gray-50"><Pencil className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          </div>
        ))}

        {!isLoading && restaurants.length === 0 && !showForm && (
          <p className="text-center text-sm text-gray-400 py-8">Aucun restaurant</p>
        )}
      </div>
    </div>
  );
}