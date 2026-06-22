import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import VenusRapportsPanel from "@/components/admin/VenusRapportsPanel";

export default function VenusRapportsPage() {
  return (
    <div className="px-4 py-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <h1 className="text-xl font-black text-foreground">Rapports VENUS</h1>
      </div>
      <VenusRapportsPanel />
    </div>
  );
}
