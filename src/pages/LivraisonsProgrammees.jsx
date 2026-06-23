import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CalendarClock, Copy, Loader2, Package, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatDateTime(value) {
  if (!value) return "Date non definie";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Date non definie";
  }
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function copyCoursePayload(course) {
  const blocked = new Set([
    "id",
    "created_date",
    "updated_date",
    "created_by",
    "updated_by",
    "livreur_id",
    "livreur_nom",
    "livreur_photo_url",
    "livreur_telephone",
    "timeout_expires_at",
    "heure_sollicitation",
  ]);
  const payload = Object.fromEntries(Object.entries(course || {}).filter(([key]) => !blocked.has(key) && !key.startsWith("_")));
  const nextDate = new Date(course?.date_souhaitee || Date.now());
  nextDate.setDate(nextDate.getDate() + 1);
  return {
    ...payload,
    statut: "programmee",
    dispatch_status: "en_attente",
    dispatch_wave: 0,
    date_souhaitee: nextDate.toISOString(),
  };
}

export default function LivraisonsProgrammees() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clientProfil, setClientProfil] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    base44.auth.me()
      .then(user => {
        if (!user?.email) return null;
        return base44.entities.ClientExterne.filter({ user_email: user.email }, "-created_date", 1);
      })
      .then(rows => {
        if (mounted) setClientProfil(rows?.[0] || null);
      })
      .catch(() => {
        if (mounted) setClientProfil(null);
      })
      .finally(() => {
        if (mounted) setLoadingProfile(false);
      });
    return () => { mounted = false; };
  }, []);

  const { data: coursesRaw = [], isLoading } = useQuery({
    queryKey: ["livraisons-programmees-client", clientProfil?.id, clientProfil?.country_code],
    queryFn: () => base44.entities.CourseExterne.filter({ statut: "programmee" }, "-date_souhaitee", 100),
    enabled: !!clientProfil?.id,
    refetchInterval: 15000,
  });

  const courses = useMemo(() => {
    if (!clientProfil?.id) return [];
    return (coursesRaw || []).filter(course => {
      const sameClient = course.created_by_id === clientProfil.id ||
        course.expediteur_client_id === clientProfil.id ||
        course.destinataire_client_id === clientProfil.id ||
        course.client_telephone === clientProfil.telephone;
      const sameCountry = !clientProfil.country_code || !course.country_code || course.country_code === clientProfil.country_code;
      return sameClient && sameCountry;
    });
  }, [coursesRaw, clientProfil]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["livraisons-programmees-client"] });

  const updateDate = async (course) => {
    const current = toDatetimeLocal(course.date_souhaitee);
    const input = window.prompt("Nouvelle date et heure (format YYYY-MM-DDTHH:mm)", current);
    if (!input) return;
    const next = new Date(input);
    if (Number.isNaN(next.getTime())) {
      setMessage("Date invalide. Modification annulee.");
      return;
    }
    setActionId(course.id);
    try {
      await base44.entities.CourseExterne.update(course.id, { date_souhaitee: next.toISOString() });
      setMessage("Livraison programmee modifiee.");
      refresh();
    } catch (err) {
      setMessage(`Modification impossible: ${err?.message || "erreur inconnue"}`);
    } finally {
      setActionId(null);
    }
  };

  const cancelCourse = async (course) => {
    if (!window.confirm("Annuler cette livraison programmee ?")) return;
    setActionId(course.id);
    try {
      await base44.entities.CourseExterne.update(course.id, {
        statut: "annulee",
        motif_annulation: "Annulee par le client avant activation",
      });
      setMessage("Livraison programmee annulee.");
      refresh();
    } catch (err) {
      setMessage(`Annulation impossible: ${err?.message || "erreur inconnue"}`);
    } finally {
      setActionId(null);
    }
  };

  const duplicateCourse = async (course) => {
    setActionId(course.id);
    try {
      await base44.entities.CourseExterne.create(copyCoursePayload(course));
      setMessage("Livraison programmee dupliquee au lendemain.");
      refresh();
    } catch (err) {
      setMessage(`Duplication impossible: ${err?.message || "erreur inconnue"}`);
    } finally {
      setActionId(null);
    }
  };

  if (loadingProfile || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-black text-gray-900">Livraisons programmees</h1>
          <p className="text-xs text-gray-500">Voir, modifier, annuler ou dupliquer</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {message && (
          <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm font-semibold text-blue-800">
            {message}
          </div>
        )}

        {courses.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center">
            <CalendarClock className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <h2 className="font-black text-gray-900">Aucune livraison programmee</h2>
            <p className="text-sm text-gray-500 mt-1">Les courses reservees pour plus tard apparaitront ici.</p>
            <Button className="mt-4" onClick={() => navigate("/client/course/expedier")}>Programmer une course</Button>
          </div>
        ) : (
          courses.map(course => (
            <div key={course.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 truncate">{formatDateTime(course.date_souhaitee)}</p>
                  <p className="text-xs text-gray-500 truncate">{course.adresse_depart || "Depart"} vers {course.adresse_arrivee || "Arrivee"}</p>
                  <p className="text-[11px] text-gray-400 mt-1">#{String(course.id || "").slice(-6)} - {course.type_course || "course"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => updateDate(course)} disabled={actionId === course.id} className="text-xs">
                  <Pencil className="w-3 h-3 mr-1" /> Modifier
                </Button>
                <Button variant="outline" size="sm" onClick={() => duplicateCourse(course)} disabled={actionId === course.id} className="text-xs">
                  <Copy className="w-3 h-3 mr-1" /> Dupliquer
                </Button>
                <Button variant="outline" size="sm" onClick={() => cancelCourse(course)} disabled={actionId === course.id} className="text-xs text-red-600 border-red-200">
                  {actionId === course.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />} Annuler
                </Button>
              </div>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => navigate("/client/course/expedier")}
          className="w-full h-12 rounded-2xl bg-primary text-white font-black flex items-center justify-center gap-2"
        >
          <Package className="w-5 h-5" /> Nouvelle livraison programmee
        </button>
      </div>
    </div>
  );
}
