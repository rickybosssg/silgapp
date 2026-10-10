import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import HistoriqueCoursesClient from "@/components/client/HistoriqueCoursesClient";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

function uniqById(items) {
  const map = new Map();
  for (const item of items || []) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

export default function ClientRefaireCourse() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clientProfil, setClientProfil] = useState(null);

  useEffect(() => {
    let mounted = true;
    base44.auth.me()
      .then(async (u) => {
        if (!mounted) return;
        setUser(u || null);
        if (!u?.email) return;
        const clients = await base44.entities.ClientExterne.filter({ user_email: u.email }, "-created_date", 1).catch(() => []);
        if (mounted) setClientProfil(clients?.[0] || null);
      })
      .catch(() => null);
    return () => { mounted = false; };
  }, []);

  const clientEmail = normalizeEmail(user?.email || clientProfil?.user_email);
  const clientId = clientProfil?.id || null;

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["client-refaire-courses", user?.id, clientId, clientEmail],
    enabled: !!user?.id || !!clientEmail || !!clientId,
    queryFn: async () => {
      const requests = [];
      if (clientEmail) {
        requests.push(base44.entities.CourseExterne.filter({ client_user_email: clientEmail }, "-updated_date", 80).catch(() => []));
      }
      if (user?.id) {
        requests.push(base44.entities.CourseExterne.filter({ created_by_id: user.id }, "-updated_date", 80).catch(() => []));
      }
      if (clientId) {
        requests.push(base44.entities.CourseExterne.filter({ destinataire_client_id: clientId }, "-updated_date", 80).catch(() => []));
        requests.push(base44.entities.CourseExterne.filter({ expediteur_client_id: clientId }, "-updated_date", 80).catch(() => []));
      }

      const results = await Promise.all(requests);
      return uniqById(results.flat())
        .filter((course) => {
          if (course.statut !== "livree") return false;
          const byEmail = clientEmail && normalizeEmail(course.client_user_email) === clientEmail;
          const byCreator = user?.id && course.created_by_id === user.id;
          const byDest = clientId && course.destinataire_client_id === clientId;
          const byExp = clientId && course.expediteur_client_id === clientId;
          return byEmail || byCreator || byDest || byExp;
        })
        .sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0));
    },
    staleTime: 10000,
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="sticky top-0 z-20 pt-2 pb-1 bg-gray-50">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 w-full bg-white border border-gray-200 shadow-md rounded-2xl px-5 h-14 text-base font-bold text-gray-800 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-primary flex-shrink-0" />
            <span>Retour au dashboard</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
              <RotateCcw className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">Refaire une course</h1>
              <p className="text-sm text-gray-500">Choisissez une ancienne course livrée à relancer.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm font-semibold text-gray-500">Chargement de l'historique...</div>
        ) : (
          <HistoriqueCoursesClient
            courses={courses}
            fraisAnnulation={[]}
            clientProfil={clientProfil}
            onSelectCourse={() => {}}
          />
        )}
      </div>
    </div>
  );
}
