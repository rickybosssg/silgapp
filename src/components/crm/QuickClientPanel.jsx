import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Zap, Clock } from "lucide-react";

const TEMPLATES = [
  { key: "colis", label: "Colis", icon: "📦", type_course: "expedier", type_colis: "petit_colis" },
  { key: "document", label: "Document", icon: "📄", type_course: "expedier", type_colis: "document" },
  { key: "pharmacie", label: "Pharmacie", icon: "💊", type_course: "expedier", type_colis: "autre", notes: "Livraison pharmacie" },
  { key: "restaurant", label: "Restaurant", icon: "🍽️", type_course: "expedier", type_colis: "nourriture" },
  { key: "deplacement", label: "Déplacement", icon: "👤", type_course: "deplacement", type_colis: "autre" },
];

export default function QuickClientPanel({ client, onFillTemplate }) {
  const [todayCount, setTodayCount] = useState(0);
  const phone = client?.telephone_normalized;

  useEffect(() => {
    if (!phone || phone.length < 8) {
      setTodayCount(0);
      return;
    }
    let cancelled = false;
    base44.entities.CourseExterne
      .filter({ client_phone_normalized: phone }, "-created_date", 5)
      .then((results) => {
        if (cancelled) return;
        const count = (results || []).filter((c) => {
          try {
            return new Date(c.created_date).toDateString() === new Date().toDateString();
          } catch {
            return false;
          }
        }).length;
        setTodayCount(count);
      })
      .catch(() => {
        if (!cancelled) setTodayCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return (
    <div className="mt-3 space-y-3">
      {/* Badge: courses du jour */}
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
          {TEMPLATES.map((t) => (
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
    </div>
  );
}