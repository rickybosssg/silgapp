import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Eye, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function PollingDebugPanel({ livreurId, livreurProfil }) {
  const [debug, setDebug] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDebug = async () => {
    setLoading(true);
    try {
      // 1. Appeler fonction backend
      const result = await base44.functions.invoke('getAllCoursesForLivreur', {
        livreur_id: livreurId,
        country_code: livreurProfil?.country_code || "BF",
      });

      const courses = result?.courses || [];
      const coursesEnDispatch = courses.filter(c => c.dispatch_status === "propose");
      
      // 2. Vérifier chaque course
      const details = [];
      for (const course of coursesEnDispatch) {
        const notifiedIds = course.dispatch_notified_ids ? JSON.parse(course.dispatch_notified_ids) : [];
        const isNotifie = notifiedIds.includes(livreurId);
        const isExpired = course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date();
        
        details.push({
          id: course.id,
          client: course.client_nom,
          notified: notifiedIds.length,
          isNotifie,
          isExpired,
          timeout: course.timeout_expires_at,
        });
      }

      setDebug({
        total: courses.length,
        enDispatch: coursesEnDispatch.length,
        pourMoi: details.filter(d => d.isNotifie && !d.isExpired).length,
        details,
      });
    } catch (err) {
      setDebug({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={runDebug}
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-60"
      >
        <Eye className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Vérification..." : "👁️ DEBUG POLLING"}
      </button>

      {debug && (
        <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-black text-sm">RÉSULTAT POLLING</p>
            <button onClick={() => setDebug(null)} className="text-slate-400 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800 rounded-lg p-2 text-center">
              <p className="text-slate-400 text-[10px]">Total</p>
              <p className="text-lg font-black">{debug.total}</p>
            </div>
            <div className="bg-blue-900/50 rounded-lg p-2 text-center border border-blue-700">
              <p className="text-blue-300 text-[10px]">Dispatch</p>
              <p className="text-lg font-black text-blue-100">{debug.enDispatch}</p>
            </div>
            <div className={`rounded-lg p-2 text-center border ${debug.pourMoi > 0 ? 'bg-green-900/50 border-green-700' : 'bg-slate-800'}`}>
              <p className="text-slate-400 text-[10px]">Pour moi</p>
              <p className={`text-lg font-black ${debug.pourMoi > 0 ? 'text-green-300' : ''}`}>{debug.pourMoi || 0}</p>
            </div>
          </div>

          {debug.error ? (
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="w-4 h-4" />
              <p>Erreur: {debug.error}</p>
            </div>
          ) : debug.details?.length > 0 ? (
            <div className="space-y-2">
              {debug.details.map(d => (
                <div key={d.id} className={`rounded-lg p-2 border ${d.isNotifie && !d.isExpired ? 'bg-green-900/30 border-green-700' : 'bg-slate-800 border-slate-700'}`}>
                  <p className="font-bold text-green-300">{d.client}</p>
                  <p className="text-[10px] text-slate-400">ID: {d.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {d.isNotifie ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Notifié
                      </span>
                    ) : (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Pas notifié
                      </span>
                    )}
                    {d.isExpired ? (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Expiré
                      </span>
                    ) : (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Actif
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Notifiés: {d.notified} | Timeout: {new Date(d.timeout).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3">
              <p className="text-amber-300 font-bold">⚠️ AUCUNE COURSE EN DISPATCH</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}