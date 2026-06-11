import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bug, CheckCircle, XCircle, Clock, Bell, Truck } from "lucide-react";

export default function DebugCoursesPanel({ livreurEmail, livreurId }) {
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const runDebug = async () => {
    if (!livreurEmail || !livreurId) return;
    setLoading(true);
    setExpanded(true);
    
    try {
      // 1. Récupérer TOUTES les courses en dispatch_status="propose"
      const allCourses = await base44.entities.CourseExterne.filter({
        dispatch_status: "propose",
        statut: "recherche_livreur",
      });
      
      // 2. Filtrer celles où le livreur est notifié
      const proposees = [];
      for (const course of allCourses || []) {
        try {
          const notifiedIds = course.dispatch_notified_ids ? JSON.parse(course.dispatch_notified_ids) : [];
          const isNotifie = notifiedIds.includes(livreurId);
          const isExpired = course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date();
          
          if (isNotifie && !isExpired) {
            proposees.push(course);
          }
        } catch (err) {
          console.error('Error course', course.id, err.message);
        }
      }
      
      setDebugData({
        totalCoursesPropose: allCourses?.length || 0,
        courseCount: proposees.length,
        courses: proposees,
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
                <Truck className="w-4 h-4 text-blue-400" />
                <span>Courses en dispatch: <strong className="text-white">{debugData.totalCoursesPropose}</strong></span>
              </div>
              
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Courses pour moi: <strong className="text-white">{debugData.courseCount}</strong></span>
              </div>
              
              {debugData.courses?.length > 0 && (
                <div className="bg-slate-700 rounded-xl p-3 space-y-2">
                  <p className="font-bold text-green-400">✅ Courses pour VOUS ({debugData.courses.length}):</p>
                  {debugData.courses.map(c => (
                    <div key={c.id} className="bg-slate-600 rounded-lg p-2 border border-green-500">
                      <p className="font-mono text-[10px] text-slate-300">ID: {c.id}</p>
                      <p><strong className="text-green-300">{c.client_nom}</strong></p>
                      <p className="text-slate-300">{c.adresse_depart} → {c.adresse_arrivee}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-amber-300">Expire: {new Date(c.timeout_expires_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {debugData.notNotified?.length > 0 && (
                <div className="bg-slate-700 rounded-xl p-3 space-y-2">
                  <p className="font-bold text-red-400">❌ Courses PAS pour vous ({debugData.notNotified.length}):</p>
                  {debugData.notNotified.slice(0, 5).map(c => (
                    <div key={c.id} className="bg-slate-600/50 rounded-lg p-2 border border-red-900">
                      <p className="font-mono text-[10px] text-slate-400">ID: {c.id}</p>
                      <p className="text-slate-300">{c.client}</p>
                      <p className="text-xs text-red-400 mt-1">Raison: {c.reason}</p>
                    </div>
                  ))}
                  {debugData.notNotified.length > 5 && (
                    <p className="text-xs text-slate-400 text-center">... et {debugData.notNotified.length - 5} autres</p>
                  )}
                </div>
              )}
              
              {debugData.courseCount === 0 && (
                <div className="bg-amber-900/50 border border-amber-700 rounded-xl p-3">
                  <p className="text-amber-300 font-bold">⚠️ AUCUNE COURSE DISPONIBLE</p>
                  <p className="text-amber-400/70 text-[10px] mt-1">
                    Aucune course en dispatch_status="propose" pour votre ID.
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