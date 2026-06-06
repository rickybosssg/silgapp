import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import ClientsExternesPanel from "@/components/admin/ClientsExternesPanel";

export default function ClientsExternesPage() {
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header avec retour */}
      <div className="flex items-center gap-3">
        <Link to="/admin/externe">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Panel Clients Externes</h1>
          <p className="text-sm text-muted-foreground">
            {effectiveCountry ? `Clients du pays : ${effectiveCountry}` : "Tous pays — Gérer les clients inscrits"}
          </p>
        </div>
      </div>

      {/* Panel principal — filtré par pays via useAdminContext interne */}
      <ClientsExternesPanel />
    </div>
  );
}