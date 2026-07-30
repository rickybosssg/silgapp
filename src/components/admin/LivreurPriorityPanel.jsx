import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Star, Search, Loader2, X, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LivreurPriorityPanel({ countryCode = "BF" }) {
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    loadLivreurs();
  }, [countryCode]);

  const loadLivreurs = async () => {
    setLoading(true);
    try {
      const res = await base44.entities.Livreur.filter(
        { type_livreur: "externe", country_code: countryCode, validation: "valide" },
        "-priorite_dispatch",
        200
      );
      setLivreurs(res || []);
    } catch (err) {
      toast.error("Erreur chargement livreurs: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return livreurs;
    const s = search.toLowerCase();
    return livreurs.filter(l =>
      `${l.prenom || ""} ${l.nom || ""}`.toLowerCase().includes(s) ||
      (l.telephone || "").includes(s)
    );
  }, [livreurs, search]);

  const priorityList = filtered.filter(l => (l.priorite_dispatch || 0) > 0);
  const normalList = filtered.filter(l => !l.priorite_dispatch || l.priorite_dispatch === 0);

  const setPriority = async (livreurId, value) => {
    setUpdating(livreurId);
    try {
      await base44.entities.Livreur.update(livreurId, { priorite_dispatch: value });
      setLivreurs(prev => prev.map(l => l.id === livreurId ? { ...l, priorite_dispatch: value } : l));
      if (value > 0) {
        toast.success(`${livreurs.find(l => l.id === livreurId)?.nom} est maintenant prioritaire (niveau ${value})`);
      }
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-4 h-4 text-amber-500" />
        <p className="font-black text-sm text-amber-700">LIVREURS PRIORITAIRES</p>
      </div>

      <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <Star className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-700">
          Les livreurs prioritaires sont <strong>toujours notifiés en premier</strong> lors d'une nouvelle course,
          peu importe leur distance ou la fraîcheur de leur GPS. Plus le niveau est élevé, plus le livreur passe devant.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un livreur par nom ou téléphone..."
          className="pl-9 h-10"
        />
      </div>

      {priorityList.length > 0 && (
        <div>
          <p className="text-xs font-bold text-amber-700 mb-2">
            ⭐ {priorityList.length} livreur(s) prioritaire(s)
          </p>
          <div className="space-y-2">
            {priorityList.map(l => (
              <LivreurPriorityRow
                key={l.id}
                livreur={l}
                updating={updating === l.id}
                onSetPriority={setPriority}
              />
            ))}
          </div>
        </div>
      )}

      {priorityList.length > 0 && normalList.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <p className="text-xs font-bold text-muted-foreground mb-2">
            Autres livreurs ({normalList.length})
          </p>
        </div>
      )}

      <div className="space-y-2">
        {normalList.slice(0, 30).map(l => (
          <LivreurPriorityRow
            key={l.id}
            livreur={l}
            updating={updating === l.id}
            onSetPriority={setPriority}
          />
        ))}
      </div>

      {normalList.length > 30 && (
        <p className="text-xs text-center text-muted-foreground">
          Affichage des 30 premiers — affinez votre recherche pour voir les autres
        </p>
      )}
    </div>
  );
}

function LivreurPriorityRow({ livreur, updating, onSetPriority }) {
  const priority = livreur.priorite_dispatch || 0;
  const nomComplet = `${livreur.prenom || ""} ${livreur.nom || ""}`.trim();

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      priority > 0
        ? "border-amber-300 bg-amber-50"
        : "border-gray-200 bg-white"
    }`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${priority > 0 ? "text-amber-900" : "text-foreground"}`}>
          {nomComplet}
        </p>
        <p className="text-xs text-muted-foreground">
          {livreur.telephone} · {livreur.statut === "disponible" ? "🟢 Disponible" : livreur.statut === "en_course" ? "🔴 En course" : "⚫ Hors ligne"}
        </p>
      </div>

      {updating ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : priority > 0 ? (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onSetPriority(livreur.id, Math.max(1, priority - 1))}
          >
            −
          </Button>
          <div className="flex items-center gap-1 px-2 py-1 bg-amber-200 rounded-lg">
            <Star className="w-3 h-3 text-amber-600 fill-amber-600" />
            <span className="text-sm font-black text-amber-900">{priority}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onSetPriority(livreur.id, priority + 1)}
          >
            +
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 ml-1 text-red-500 hover:text-red-700"
            onClick={() => onSetPriority(livreur.id, 0)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
          onClick={() => onSetPriority(livreur.id, 1)}
        >
          <Star className="w-3.5 h-3.5" />
          Prioritaire
        </Button>
      )}
    </div>
  );
}