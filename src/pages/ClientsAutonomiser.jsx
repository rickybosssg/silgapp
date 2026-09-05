import React from "react";
import ClientsAutonomiserPanel from "@/components/admin/ClientsAutonomiserPanel";

/**
 * ClientsAutonomiser — Phase 5 Étape 2
 *
 * Page admin : "Clients à autonomiser"
 * Affiche les clients dépendants de l'admin et leur statut d'autonomisation.
 */
export default function ClientsAutonomiser() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Clients à autonomiser</h1>
        <p className="text-sm text-gray-500 mt-1">
          Identifier les clients dépendants de l'admin et suivre leur autonomisation.
        </p>
      </div>
      <ClientsAutonomiserPanel />
    </div>
  );
}