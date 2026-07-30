import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AdminCourseWindowsProvider } from "@/context/AdminCourseWindowsContext";
import AdminCourseForm from "./AdminCourseForm";

/**
 * Accès direct au formulaire de création de course administrative.
 * Accessible via /admin/creer-course — ne nécessite pas la sélection du réseau.
 * L'employé doit juste être connecté en tant qu'admin.
 */
export default function AdminCourseStandalone() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="h-9 w-9 p-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-bold text-gray-900">Création de course</h1>
          <p className="text-xs text-gray-500">Formulaire administratif SILGAPP</p>
        </div>
      </div>
      <AdminCourseWindowsProvider>
        <AdminCourseForm />
      </AdminCourseWindowsProvider>
    </div>
  );
}