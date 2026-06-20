import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";

export default function StatsPays({ courses = [], livreurs = [], clients = [] }) {
  const { data: pays = [] } = useQuery({
    queryKey: ["pays-actifs"],
    queryFn: () => base44.entities.Country.filter({ actif: true }, "ordre"),
    initialData: [],
    staleTime: 60000,
  });

  const statsByPays = useMemo(() => {
    return pays.map((p) => {
      const c = courses.filter((x) => (x.country_code || "BF") === p.code);
      const livrees = c.filter((x) => x.statut === "livree");
      const enCours = c.filter((x) => !["livree", "annulee"].includes(x.statut));
      const ca = livrees.reduce((s, x) => s + (x.prix_final || 0), 0);
      const lvrs = livreurs.filter((x) => (x.country_code || "BF") === p.code);
      const cls = clients.filter((x) => (x.country_code || "BF") === p.code);
      return { pays: p, total: c.length, livrees: livrees.length, enCours: enCours.length, ca, livreurs: lvrs.length, clients: cls.length };
    }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
  }, [pays, courses, livreurs, clients]);

  if (statsByPays.length <= 1) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">Statistiques par pays</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {statsByPays.map(({ pays: p, total, livrees, enCours, ca, livreurs: lv, clients: cl }) => (
          <Card key={p.code} className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">{p.emoji_flag}</span>
              <div>
                <p className="font-semibold text-sm text-foreground">{p.nom}</p>
                <p className="text-xs text-muted-foreground">{p.ville_principale}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="bg-muted rounded px-2 py-1">
                <p className="font-bold text-foreground">{total}</p>
                <p className="text-muted-foreground">Courses</p>
              </div>
              <div className="bg-emerald-50 rounded px-2 py-1">
                <p className="font-bold text-emerald-700">{livrees}</p>
                <p className="text-emerald-600">Livrées</p>
              </div>
              <div className="bg-blue-50 rounded px-2 py-1">
                <p className="font-bold text-blue-700">{enCours}</p>
                <p className="text-blue-600">En cours</p>
              </div>
              <div className="bg-indigo-50 rounded px-2 py-1">
                <p className="font-bold text-indigo-700">{ca.toLocaleString()}</p>
                <p className="text-indigo-600">{p.devise}</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground pt-1 border-t">
              <span> {lv} livreurs</span>
              <span> {cl} clients</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}