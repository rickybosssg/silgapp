import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bug, CheckCircle, XCircle, Clock, Bell } from "lucide-react";

export default function DebugCoursesPanel({ livreurEmail, livreurId }) {
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runDebug = async () => {
    if (!livreurEmail || !livreurId) return;
    setLoading(true);
    setExpanded(true);
    
    try {
      // 1. Notifications non lues
      const notifs = await base44.entities.Notification.filter({
        destinataire_email: livreurEmail,
        type: "nouvelle_course",
        lue: false,
      });
      
      console.log('📬 Notifications:', notifs?.length);
      
      // 2. Courses correspondantes
      const courseIds = [...new Set(notifs?.map(n => n.course_id).filter(Boolean) || [])];
      const courses = [];
      
      for (const cid of courseIds.slice(0, 5)) {
        try {
          const res = await base44.functions.invoke("dispatchExterneAuto", {
            action: "check_course_pour_livreur",
            course_id: cid,
            livreur_id: livreurId,
          });
          const d = res?.data;
          if (d?.found && d?.course && !d?.expired) {
            courses.push(d.course);
          }
        } catch (err) {
          console.error('Error course', cid, err.message);
        }
      }
      
      setDebugData({
        notifCount: notifs?.length || 0,
        courseCount: courses.length,
        courses: courses,
        courseIds: courseIds,
      });
    } catch (err) {
      console.error('Debug error:', err.message);
      setDebugData({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={runDebug}
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-60"
      >
        <Bug className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Recherche..." : "🐛 DEBUG: Voir mes courses"}
      </button>

      {expanded && debugData && (
        <div className="rounded-2xl bg-slate-800 text-white p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-black text-sm">📊 RÉSULTAT DEBUG</p>
            <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          
          {debugData.error ? (
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="w-4 h-4" />
              <p>Erreur: {debugData.error}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-400" />
                <span>Notifications non lues: <strong className="text-white">{debugData.notifCount}</strong></span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Courses disponibles: <strong className="text-white">{debugData.courseCount}</strong></span>
              </div>
              
              {debugData.courses?.length > 0 && (
                <div className="bg-slate-700 rounded-xl p-3 space-y-2">
                  <p className="font-bold text-amber-400">Courses à afficher:</p>
                  {debugData.courses.map(c => (
                    <div key={c.id} className="bg-slate-600 rounded-lg p-2">
                      <p className="font-mono text-[10px] text-slate-300">ID: {c.id}</p>
                      <p><strong>{c.client_nom}</strong></p>
                      <p className="text-slate-300">{c.adresse_depart} → {c.adresse_arrivee}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-amber-300">Expire: {new Date(c.timeout_expires_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {debugData.courseCount === 0 && (
                <div className="bg-amber-900/50 border border-amber-700 rounded-xl p-3">
                  <p className="text-amber-300 font-bold">⚠️ AUCUNE COURSE DISPONIBLE</p>
                  <p className="text-amber-400/70 text-[10px] mt-1">
                    Les notifications existent mais les courses sont expirées ou déjà prises.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}