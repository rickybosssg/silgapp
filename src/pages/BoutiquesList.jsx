import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Store, MapPin, ArrowLeft, Loader2, Search } from "lucide-react";

export default function BoutiquesList() {
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.email) {
        base44.entities.ClientExterne.filter({ user_email: u.email })
          .then(c => setClientProfil(c?.[0] || null))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: boutiques = [], isLoading } = useQuery({
    queryKey: ["boutiques", clientProfil?.country_code],
    queryFn: () => base44.entities.Boutique.filter({ pays_code: clientProfil.country_code, actif: true }, "-created_date", 100),
    enabled: !!clientProfil?.country_code,
  });

  const categories = useMemo(() => {
    const cats = [...new Set((boutiques || []).map(b => b.categorie).filter(Boolean))];
    return cats.sort();
  }, [boutiques]);

  const filteredBoutiques = useMemo(() => {
    return (boutiques || []).filter(b => {
      if (openOnly && !b.ouvert) return false;
      if (selectedCategory !== "all" && b.categorie !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (b.nom?.toLowerCase().includes(q) ||
                b.categorie?.toLowerCase().includes(q) ||
                b.quartier?.toLowerCase().includes(q) ||
                b.ville?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [boutiques, searchQuery, openOnly, selectedCategory]);

  if (!clientProfil) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/80 hover:text-white p-1"><ArrowLeft className="w-6 h-6" /></button>
          <div><h1 className="text-lg font-black">Boutiques</h1><p className="text-white/70 text-xs">Commandez chez nos boutiques partenaires</p></div>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher une boutique..."
              className="w-full h-11 rounded-xl border border-gray-200 pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setOpenOnly(!openOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${openOnly ? "bg-green-500 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
            >
              Ouverts uniquement
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedCategory === cat ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{filteredBoutiques.length} boutique(s) trouvée(s)</p>
        </div>

        {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
        {!isLoading && filteredBoutiques.length === 0 && <div className="text-center py-12"><Store className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-500">Aucune boutique trouvée</p></div>}
        {filteredBoutiques.map(b => (
          <button key={b.id} onClick={() => navigate("/client/boutiques/" + b.id)} className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all text-left">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {b.logo_url ? <img src={b.logo_url} alt={b.nom} className="w-full h-full object-cover" /> : <Store className="w-8 h-8 text-blue-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{b.nom}</p>
              <p className="text-xs text-gray-500 truncate">{b.categorie || b.description || ""}</p>
              <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-1"><MapPin className="w-3 h-3" /> {b.quartier || b.ville || ""}</span>
            </div>
            <span className={"text-[10px] font-bold px-2 py-1 rounded-full " + (b.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50")}>{b.ouvert ? "Ouvert" : "Fermé"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}