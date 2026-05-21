import React from "react";
import { TrendingUp, Package, CheckCircle } from "lucide-react";

export default function LivreurStatsBanner({ mesCourses, totalEncaisse }) {
  const today = new Date().toDateString();
  const coursesAujourdHui = mesCourses.filter(c =>
    new Date(c.created_date || c.updated_date).toDateString() === today
  ).length;
  const coursesLivrees = mesCourses.filter(c =>
    c.statut === "livree" && new Date(c.heure_livraison || c.updated_date).toDateString() === today
  ).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Courses du jour */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-1.5">
          <Package className="w-4 h-4 text-blue-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesAujourdHui}</p>
        <p className="text-[10px] text-gray-400 font-medium">Courses</p>
      </div>

      {/* Livrées */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-1.5">
          <CheckCircle className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-xl font-bold text-gray-900">{coursesLivrees}</p>
        <p className="text-[10px] text-gray-400 font-medium">Livrées</p>
      </div>

      {/* Total FCFA */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-1.5">
          <TrendingUp className="w-4 h-4 text-amber-500" />
        </div>
        <p className="text-base font-bold text-gray-900 leading-tight">
          {totalEncaisse > 0 ? `${(totalEncaisse / 1000).toFixed(1)}k` : "0"}
        </p>
        <p className="text-[10px] text-gray-400 font-medium">FCFA</p>
      </div>
    </div>
  );
}