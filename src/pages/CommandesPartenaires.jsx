import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";
import CommandesPartenairesAdmin from "@/components/admin/CommandesPartenairesAdmin";

export default function CommandesPartenaires() {
  const [selectedCountry, setSelectedCountry] = useState("all");

  const { data: countries = [] } = useQuery({
    queryKey: ["compta-countries"],
    queryFn: () => base44.entities.Country.filter({ actif: true }),
    initialData: [],
  });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900"> Commandes Partenaires</h1>
          <p className="text-sm text-gray-500 mt-1">Boutiques & Restaurants — suivi en temps réel</p>
        </div>
        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            <SelectValue placeholder="Pays" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all"> Tous les pays</SelectItem>
            {countries.map(c => (
              <SelectItem key={c.code} value={c.code}>{c.emoji_flag || ""} {c.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CommandesPartenairesAdmin countryCode={selectedCountry !== "all" ? selectedCountry : null} />
    </div>
  );
}
