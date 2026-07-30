import React, { useState } from "react";
import LivreurPriorityPanel from "@/components/admin/LivreurPriorityPanel";
import { useAdminContext } from "@/hooks/useAdminContext";
import { Crown } from "lucide-react";

export default function LivreursPrioritaires() {
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry || "BF";

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Crown className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground">Livreurs Prioritaires</h1>
          <p className="text-xs text-muted-foreground">Pays: {effectiveCountry}</p>
        </div>
      </div>

      <LivreurPriorityPanel countryCode={effectiveCountry} />
    </div>
  );
}