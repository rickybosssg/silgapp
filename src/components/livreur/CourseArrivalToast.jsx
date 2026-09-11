import React, { useState, useEffect, useRef } from "react";
import { MapPin, X, Eye } from "lucide-react";
import { getPrixAffichable } from "@/utils/getPrixAffichable";

const TOAST_DURATION_MS = 9000;

export default function CourseArrivalToast({ courseData, onSeeCourses, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!courseData) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, TOAST_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [courseData?.courseId, courseData?.count]);

  if (!visible || !courseData) return null;

  const { count, course } = courseData;
  const isMultiple = count > 1;

  const depart = course?.quartier_depart || course?.adresse_depart || "Départ";
  const arrivee = course?.quartier_arrivee || course?.adresse_arrivee || "Arrivée";
  const prix = course ? getPrixAffichable(course) : 0;
  const devise = course?.devise || "FCFA";

  const handleSee = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    onSeeCourses?.();
  };

  const handleClose = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    onDismiss?.();
  };

  return (
    <div className="fixed bottom-4 left-3 right-3 z-40 mx-auto max-w-sm animate-in slide-in-from-bottom duration-300">
      <div className="rounded-2xl bg-white shadow-2xl border-2 border-primary overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-red-600 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg"></span>
            <p className="text-white font-black text-sm leading-tight">
              {isMultiple ? `${count} NOUVELLES COURSES` : "NOUVELLE COURSE DISPONIBLE"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="text-white/80 active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isMultiple && course && (
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-bold text-slate-400">Départ</p>
                <p className="font-semibold text-slate-800 truncate">{depart}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-bold text-slate-400">Arrivée</p>
                <p className="font-semibold text-slate-800 truncate">{arrivee}</p>
              </div>
            </div>
            {prix > 0 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Prix</span>
                <span className="text-lg font-black text-success">{prix.toLocaleString()} <span className="text-xs">{devise}</span></span>
              </div>
            )}
          </div>
        )}

        {isMultiple && (
          <div className="px-4 py-3">
            <p className="text-xs text-slate-600">{count} nouvelles courses disponibles dans le fil.</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSee}
          className="w-full h-12 bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Eye className="w-4 h-4" />
          {isMultiple ? "Voir les courses" : "Voir la course"}
        </button>
      </div>
    </div>
  );
}