import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { PAYS_SILGAPP } from "./CountrySelector";

/** Affiche des statistiques groupées par pays */
export default function StatsPays({ courses = [], livreurs = [], clients = [] }) {
  const statsByCountry = useMemo(() => {
    const groups = {};

    // Grouper les courses par country_code
    courses.forEach(c => {
      const code = c.country_code || "BF";
      if (!groups[code]) groups[code] = { courses: [], livreurs: new Set(), clients: new Set() };
      groups[code].courses.push(c);
    });

    livreurs.forEach(l => {
      const code = l.country_code || "BF";
      if (!groups[code]) groups[code] = { courses: [], livreurs: new Set(), clients: new Set() };
      groups[code].livreurs.add(l.id);
    });

    clients.forEach(c => {
      const code = c.country_code || "BF";
      if (!groups[code]) groups[code] = { courses: [], livreurs: new Set(), clients: new Set() };
      groups[code].clients.add(c.id);
    });

    return Object.entries(groups).map(([code, data]) => {
      const pays = PAYS_SILGAPP.find(p => p.code === code) || { code, nom: code, emoji_flag: "🌍", devise: "FCFA" };
      const livrees = data.courses.filter(c => c.statut === "livree");
      const ca = livrees.reduce((s, c) => s + (c.prix_final || 0), 0);
      const commission = livrees.reduce((s, c) => s + (c.commission_silga || 0), 0);
      return {
        ...pays,
        total_courses: data.courses.length,
        livrees: livrees.length,
        annulees: data.courses.filter(c => c.statut === "annulee").length,
        en_cours: data.courses.filter(c => !["livree", "annulee"].includes(c.statut)).length,
        ca,
        commission,
        nb_livreurs: data.livreurs.size,
        nb_clients: data.clients.size,
      };
    }).sort((a, b) => b.total_courses - a.total_courses);
  }, [courses, livreurs, clients]);

  if (statsByCountry.length <= 1) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-foreground">Statistiques par pays</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {statsByCountry.length} pays actifs
        </span>
      </div>
      <div className="space-y-3">
        {statsByCountry.map(p => (
          <div key={p.code} className="border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{p.emoji_flag}</span>
              <span className="font-semibold text-sm">{p.nom}</span>
              <span className="text-xs text-muted-foreground ml-auto">{p.total_courses} courses</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              <div className="bg-blue-50 rounded p-2 text-center">
                <p className="font-bold text-blue-700">{p.en_cours}</p>
                <p className="text-blue-500 text-[10px]">En cours</p>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <p className="font-bold text-green-700">{p.livrees}</p>
                <p className="text-green-500 text-[10px]">Livrées</p>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <p className="font-bold text-red-700">{p.annulees}</p>
                <p className="text-red-500 text-[10px]">Annulées</p>
              </div>
              <div className="bg-indigo-50 rounded p-2 text-center">
                <p className="font-bold text-indigo-700">{p.ca.toLocaleString()}</p>
                <p className="text-indigo-500 text-[10px]">CA {p.devise}</p>
              </div>
              <div className="bg-orange-50 rounded p-2 text-center">
                <p className="font-bold text-orange-700">{p.nb_livreurs}</p>
                <p className="text-orange-500 text-[10px]">Livreurs</p>
              </div>
              <div className="bg-purple-50 rounded p-2 text-center">
                <p className="font-bold text-purple-700">{p.nb_clients}</p>
                <p className="text-purple-500 text-[10px]">Clients</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}