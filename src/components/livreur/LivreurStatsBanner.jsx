import React from "react";
import { TrendingUp, Package, CheckCircle, AlertCircle, Banknote } from "lucide-react";

export default function LivreurStatsBanner({ mesCourses, totalEncaisse, montantDüSilga, isExterne = false }) {
  const today = new Date().toDateString();
  const livreesToday = mesCourses.filter(c =>
    c.statut === "livree" && new Date(c.heure_livraison || c.updated_date).toDateString() === today
  );
  const coursesAujourdHui = mesCourses.filter(c =>
    new Date(c.created_date).toDateString() === today
  ).length;

  // Calculs financiers du jour — priorité aux champs sauvegardés, fallback calcul local
  const prixTotalToday = livreesToday.reduce((s, c) => {
    const prix = c.prix_final || 0;
    return s + prix;
  }, 0);
  const commissionToday = livreesToday.reduce((s, c) => {
    if (c.commission_silga > 0) return s + c.commission_silga;
    return s + Math.round((c.prix_final || 0) * 0.3);
  }, 0);
  const gainToday = livreesToday.reduce((s, c) => {
    if (c.montant_livreur > 0) return s + c.montant_livreur;
    return s + Math.round((c.prix_final || 0) * 0.7);
  }, 0);

  if (isExterne) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-1">
              <Package className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">{coursesAujourdHui}</p>
            <p className="text-[10px] text-gray-400 font-medium">Courses</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="w-7 h-7 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">{livreesToday.length}</p>
            <p className="text-[10px] text-gray-400 font-medium">Livrées</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-orange-700 leading-tight">
              {montantDüSilga > 0 ? `${montantDüSilga.toLocaleString()} FCFA` : "0 FCFA"}
            </p>
            <p className="text-[10px] text-gray-400 font-medium">💰 Commission Silga</p>
          </div>
        </div>
        {livreesToday.length > 0 && (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">Aujourd'hui</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold text-gray-900">{prixTotalToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-gray-400">Prix total</p>
              </div>
              <div>
                <p className="text-sm font-bold text-green-700">{gainToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-gray-400">Votre gain (70%)</p>
              </div>
              <div>
                <p className="text-sm font-bold text-orange-600">{commissionToday.toLocaleString()} FCFA</p>
                <p className="text-[10px] text-gray-400">Commission (30%)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const coursesLivrees = livreesToday.length;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-1.5">
          <Package className="w-4 h-4 text-blue-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesAujourdHui}</p>
        <p className="text-[10px] text-gray-400 font-medium">Courses</p>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesLivrees}</p>
        <p className="text-[10px] text-gray-400 font-medium">Livrées</p>
      </div>
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-1.5">
          <TrendingUp className="w-4 h-4 text-amber-500" />
        </div>
        <p className="text-sm font-bold text-gray-900 leading-tight">
          {totalEncaisse > 0 ? `${totalEncaisse.toLocaleString()} FCFA` : "0 FCFA"}
        </p>
        <p className="text-[10px] text-gray-400 font-medium">Encaissé</p>
      </div>
    </div>
  );
}