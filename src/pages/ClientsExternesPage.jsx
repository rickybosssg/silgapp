import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import ClientsExternesPanel from "@/components/admin/ClientsExternesPanel";

export default function ClientsExternesPage() {
  const { isGlobal, isPays } = useAdminContext();

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
            Gérer les clients inscrits et migrer vers livreurs
          </p>
        </div>
      </div>

      {/* Panel principal */}
      <ClientsExternesPanel />
    </div>
  );
}