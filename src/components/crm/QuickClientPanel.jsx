import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, MapPin, Zap, RotateCcw, ArrowRight, Loader2 } from "lucide-react";

const TEMPLATES = [
  { key: "colis", label: "Colis", icon: "📦", type_course: "expedier", type_colis: "petit_colis" },
  { key: "document", label: "Document", icon: "📄", type_course: "expedier", type_colis: "document" },
  { key: "pharmacie", label: "Pharmacie", icon: "💊", type_course: "expedier", type_colis: "autre", notes: "Livraison pharmacie" },
  { key: "restaurant", label: "Restaurant", icon: "🍽️", type_course: "expedier", type_colis: "nourriture" },
  { key: "deplacement", label: "Déplacement", icon: "👤", type_course: "deplacement", type_colis: "autre" },
];

const TYPE_COLOIS_LABELS = {
  petit_colis: "Petit colis", moyen_colis: "Moyen colis", gros_colis: "Gros colis",
  document: "Document", nourriture: "Nourriture", autre: "Autre",
};

const TYPE_COURSE_LABELS = {
  expedier: "Expédition", recevoir: "Réception", deplacement: "Déplacement",
};

function extractFavoriteAddresses(courses) {
  if (!courses || courses.length === 0) return { lastDeparture: null, lastArrival: null, topAddresses: [] };

  const last = courses[0];
  const lastDeparture = last.adresse_depart && last.adresse_depart !== "—" ? {
    adresse: last.adresse_depart, quartier: last.quartier_depart,
    lat: last.gps_depart_lat, lng: last.gps_depart_lng,
  } : null;

  const lastArrival = last.adresse_arrivee && last.adresse_arrivee !== "—" ? {
    adresse: last.adresse_arrivee, quartier: last.quartier_arrivee,
    lat: last.gps_arrivee_lat, lng: last.gps_arrivee_lng,
  } : null;

  const addressMap = {};
  courses.forEach(c => {
    [
      { adresse: c.adresse_depart, quartier: c.quartier_depart, lat: c.gps_depart_lat, lng: c.gps_depart_lng },
      { adresse: c.adresse_arrivee, quartier: c.quartier_arrivee, lat: c.gps_arrivee_lat, lng: c.gps_arrivee_lng },
    ].forEach(a => {
      if (a.adresse && a.adresse !== "—" && a.adresse.length > 3) {
        if (!addressMap[a.adresse]) addressMap[a.adresse] = { ...a, count: 0 };
        addressMap[a.adresse].count++;
      }
    });
  });

  const topAddresses = Object.values(addressMap).sort((a, b) => b.count - a.count).slice(0, 5);
  return { lastDeparture, lastArrival, topAddresses };
}

export default function QuickClientPanel({ client, onFillCourse, onFillAddress, onFillTemplate }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  const phone = client?.telephone_normalized;

  useEffect(() => {
    if (!phone || phone.length < 8) { setCourses([]); return; }
    let cancelled = false;
    setLoading(true);
    base44.entities.CourseExterne.filter({ client_phone_normalized: phone }, "-created_date", 5)
      .then(results => { if (!cancelled) setCourses(results || []); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [phone]);

  const favoriteAddresses = useMemo(() => extractFavoriteAddresses(courses), [courses]);

  const todayCount = courses.filter(c => {
    try { return new Date(c.created_date).toDateString() === new Date().toDateString(); }
    catch { return false; }
  }).length;

  return (
    <div className="mt-3 space-y-3">
      {/* Appel répété */}
      {todayCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 border border-orange-200">
          <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-orange-700">
            {todayCount} course{todayCount > 1 ? "s" : ""} créée{todayCount > 1 ? "s" : ""} aujourd'hui
          </span>
        </div>
      )}

      {/* Modèles rapides — toujours affichés */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" /> Modèles rapides
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => onFillTemplate?.(t)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[11px] font-semibold text-gray-700 transition-all active:scale-95"
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Historique des courses */}
      {client && phone && (
        <>
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-[11px] text-gray-400">Recherche de l'historique...</span>
            </div>
          ) : courses.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <RotateCcw className="w-3 h-3 text-blue-500" /> Refaire une course
              </p>
              <div className="space-y-1.5">
                {courses.map(course => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => onFillCourse?.(course)}
                    className="w-full flex items-center gap-2 p-2 rounded-xl bg-blue-50/50 hover:bg-blue-100 border border-blue-100 transition-all text-left active:scale-[0.98] group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
                        <span className="truncate">{course.adresse_depart || "—"}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{course.adresse_arrivee || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-gray-400">
                          {TYPE_COURSE_LABELS[course.type_course] || course.type_course}
                        </span>
                        <span className="text-[9px] text-gray-300">•</span>
                        <span className="text-[9px] text-gray-400">
                          {TYPE_COLOIS_LABELS[course.type_colis] || course.type_colis}
                        </span>
                        {course.prix_final > 0 && (
                          <>
                            <span className="text-[9px] text-gray-300">•</span>
                            <span className="text-[9px] font-semibold text-gray-500">
                              {course.prix_final.toLocaleString()} FCFA
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <RotateCcw className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Adresses favorites */}
          {(favoriteAddresses.lastDeparture || favoriteAddresses.topAddresses.length > 0) && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-500" /> Adresses fréquentes
              </p>
              <div className="space-y-1">
                {favoriteAddresses.lastDeparture && (
                  <AddressChip
                    label="Dernier départ"
                    addr={favoriteAddresses.lastDeparture}
                    onFillDepart={() => onFillAddress?.("depart", favoriteAddresses.lastDeparture)}
                    onFillArrivee={() => onFillAddress?.("arrivee", favoriteAddresses.lastDeparture)}
                  />
                )}
                {favoriteAddresses.lastArrival && (
                  <AddressChip
                    label="Dernière arrivée"
                    addr={favoriteAddresses.lastArrival}
                    onFillDepart={() => onFillAddress?.("depart", favoriteAddresses.lastArrival)}
                    onFillArrivee={() => onFillAddress?.("arrivee", favoriteAddresses.lastArrival)}
                  />
                )}
                {favoriteAddresses.topAddresses
                  .filter(a => a.adresse !== favoriteAddresses.lastDeparture?.adresse && a.adresse !== favoriteAddresses.lastArrival?.adresse)
                  .slice(0, 3)
                  .map((addr, i) => (
                    <AddressChip
                      key={i}
                      label={`${addr.count}x utilisé`}
                      addr={addr}
                      onFillDepart={() => onFillAddress?.("depart", addr)}
                      onFillArrivee={() => onFillAddress?.("arrivee", addr)}
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AddressChip({ label, addr, onFillDepart, onFillArrivee }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
      <MapPin className="w-3 h-3 text-emerald-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-emerald-600 font-semibold">{label}</p>
        <p className="text-[11px] text-gray-700 truncate">{addr.adresse}</p>
      </div>
      <button
        type="button"
        onClick={onFillDepart}
        className="px-2 py-1 rounded-md bg-emerald-500 text-white text-[9px] font-bold hover:bg-emerald-600 transition-all active:scale-95"
      >
        ← Départ
      </button>
      <button
        type="button"
        onClick={onFillArrivee}
        className="px-2 py-1 rounded-md bg-rose-500 text-white text-[9px] font-bold hover:bg-rose-600 transition-all active:scale-95"
      >
        Arrivée →
      </button>
    </div>
  );
}