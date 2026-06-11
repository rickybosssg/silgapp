import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bug, CheckCircle, XCircle, AlertTriangle, Eye, Layers, Zap } from "lucide-react";

export default function AuditLivreurPanel({ livreurId, livreurEmail, livreurProfil }) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    const logs = [];
    
    try {
      // 1. Vérifier profil livreur
      logs.push({ type: 'info', msg: 'Vérification profil...' });
      if (!livreurProfil) {
        logs.push({ type: 'error', msg: '❌ Profil livreur absent' });
      } else {
        logs.push({ type: 'success', msg: `✅ Profil: ${livreurProfil.nom} (${livreurProfil.statut})` });
        logs.push({ type: 'info', msg: `   Country: ${livreurProfil.country_code || 'NON DÉFINI'}` });
        logs.push({ type: 'info', msg: `   ID: ${livreurId}` });
      }

      // 2. Récupérer courses avec list()
      logs.push({ type: 'info', msg: 'Récupération courses...' });
      const allCourses = await base44.entities.CourseExterne.list('-created_date', 100);
      logs.push({ type: 'info', msg: `   Total courses: ${allCourses.length}` });

      // 3. Filtrer courses en dispatch
      const coursesEnDispatch = allCourses.filter(c => 
        c.dispatch_status === "propose" && c.statut === "recherche_livreur"
      );
      logs.push({ type: 'info', msg: `   En dispatch: ${coursesEnDispatch.length}` });

      // 4. Vérifier chaque course
      const coursesPourMoi = [];
      const coursesAutres = [];
      
      for (const course of coursesEnDispatch) {
        const notifiedIds = course.dispatch_notified_ids ? JSON.parse(course.dispatch_notified_ids) : [];
        const isNotifie = notifiedIds.includes(livreurId);
        const isExpired = course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date();
        
        if (isNotifie && !isExpired) {
          coursesPourMoi.push(course);
          logs.push({ 
            type: 'success', 
            msg: `✅ COURSE POUR MOI: ${course.client_nom} (expire: ${new Date(course.timeout_expires_at).toLocaleTimeString()})` 
          });
        } else {
          coursesAutres.push({ course, reason: isExpired ? 'EXPIRÉE' : 'PAS NOTIFIÉ' });
        }
      }

      // 5. Vérifier courseEnAttente logic
      logs.push({ type: 'info', msg: '---' });
      logs.push({ type: 'info', msg: `Courses pour moi: ${coursesPourMoi.length}` });
      
      if (coursesPourMoi.length > 0) {
        logs.push({ type: 'success', msg: '🚨 DEVRAIT AFFICHER MODAL!' });
      } else {
        logs.push({ type: 'warning', msg: '⚠️ Aucune course à afficher' });
      }

      // 6. Vérifier courses expirées
      const expiredCount = coursesAutres.filter(c => c.reason === 'EXPIRÉE').length;
      if (expiredCount > 0) {
        logs.push({ type: 'warning', msg: `⚠️ ${expiredCount} course(s) expirée(s)` });
      }

      setAudit({ logs, coursesPourMoi, coursesAutres, total: allCourses.length, enDispatch: coursesEnDispatch.length });
    } catch (err) {
      logs.push({ type: 'error', msg: `❌ Erreur: ${err.message}` });
      setAudit({ logs, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={runAudit}
        disabled={loading}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-60"
      >
        <Bug className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Audit en cours..." : "🔍 AUDIT COMPLET"}
      </button>

      {audit && (
        <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              RAPPORT D'AUDIT
            </p>
            <button onClick={() => setAudit(null)} className="text-slate-400 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-slate-800 rounded-lg p-2 text-center">
              <p className="text-slate-400 text-[10px]">Total</p>
              <p className="text-lg font-black">{audit.total}</p>
            </div>
            <div className="bg-blue-900/50 rounded-lg p-2 text-center border border-blue-700">
              <p className="text-blue-300 text-[10px]">Dispatch</p>
              <p className="text-lg font-black text-blue-100">{audit.enDispatch}</p>
            </div>
            <div className={`rounded-lg p-2 text-center border ${audit.coursesPourMoi?.length > 0 ? 'bg-green-900/50 border-green-700' : 'bg-slate-800'}`}>
              <p className="text-slate-400 text-[10px]">Pour moi</p>
              <p className={`text-lg font-black ${audit.coursesPourMoi?.length > 0 ? 'text-green-300' : ''}`}>{audit.coursesPourMoi?.length || 0}</p>
            </div>
          </div>

          {/* Logs */}
          <div className="bg-black/50 rounded-lg p-2 space-y-1 max-h-64 overflow-y-auto">
            {audit.logs.map((log, i) => (
              <div key={i} className={`flex items-start gap-2 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'warning' ? 'text-amber-400' :
                log.type === 'success' ? 'text-green-400' : 'text-slate-300'
              }`}>
                {log.type === 'error' && <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {log.type === 'warning' && <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {log.type === 'success' && <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {log.type === 'info' && <Eye className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                <span className="break-all">{log.msg}</span>
              </div>
            ))}
          </div>

          {/* Courses pour moi */}
          {audit.coursesPourMoi?.length > 0 && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 space-y-2">
              <p className="font-bold text-green-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                COURSES À AFFICHER ({audit.coursesPourMoi.length})
              </p>
              {audit.coursesPourMoi.map(c => (
                <div key={c.id} className="bg-green-900/50 rounded p-2">
                  <p className="font-bold text-green-200">{c.client_nom}</p>
                  <p className="text-xs text-green-400/70">{c.adresse_depart} → {c.adresse_arrivee}</p>
                  <p className="text-[10px] text-amber-400 mt-1">
                    Expire: {new Date(c.timeout_expires_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}