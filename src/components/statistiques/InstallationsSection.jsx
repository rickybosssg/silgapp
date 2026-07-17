import React from "react";
import { Smartphone, Apple, Monitor } from "lucide-react";
import { motion } from "framer-motion";

export default function InstallationsSection({ installations, evolution, activeUsers = 0 }) {
  const cards = [
    {
      label: "Android",
      value: installations?.android || 0,
      icon: Smartphone,
      gradient: "from-green-500 to-emerald-600",
      bg: "bg-green-50",
      border: "border-green-100",
    },
    {
      label: "iPhone / iOS",
      value: installations?.ios || 0,
      icon: Apple,
      gradient: "from-gray-700 to-gray-900",
      bg: "bg-gray-50",
      border: "border-gray-200",
    },
    {
      label: "Web",
      value: installations?.web || 0,
      icon: Monitor,
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
  ];

  const total = installations?.total || 0;
  const engagementRate = total > 0 ? Math.round((activeUsers / total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Installations de l'application</h3>
            <p className="text-xs text-gray-500">{total} installation{total > 1 ? "s" : ""} unique{total > 1 ? "s" : ""} au total</p>
          </div>
        </div>
        {activeUsers > 0 && (
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs font-bold text-violet-700">{activeUsers}</span>
            <span className="text-xs text-violet-500">actifs · {engagementRate}%</span>
          </div>
        )}
      </div>

      {/* Barre Installés vs Actifs */}
      {activeUsers > 0 && total > 0 && (
        <div className="mb-4 bg-gray-50 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-gray-600">Installés: <span className="text-gray-900">{total.toLocaleString()}</span></span>
            <span className="font-semibold text-violet-600">Actifs: {activeUsers.toLocaleString()}</span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden flex">
            <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-700" style={{ width: `${engagementRate}%` }} />
            <div className="h-full bg-gray-300 transition-all duration-700" style={{ width: `${100 - engagementRate}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Taux d'engagement : {engagementRate}% des appareils installés sont actifs</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c, i) => {
          const pct = total > 0 ? Math.round((c.value / total) * 100) : 0;
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative overflow-hidden rounded-2xl ${c.bg} ${c.border} border p-4`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-bold text-gray-500">{pct}%</span>
              </div>
              <p className="text-3xl font-black text-gray-900 leading-none">{c.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{c.label}</p>
              {/* Barre de progression */}
              <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${c.gradient} rounded-full transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}