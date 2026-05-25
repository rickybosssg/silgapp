import React from "react";

export default function EmptyStateAttente() {
  return (
    <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 shadow-sm">
      <div className="p-8 text-center space-y-4">
        {/* Illustration animée */}
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 rounded-full bg-green-100 animate-ping opacity-40" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-200">
            <span className="text-4xl">📡</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xl font-bold text-gray-800">En veille active</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Les courses proches apparaîtront ici<br />
            Actualisation automatique 🚀
          </p>
        </div>

        {/* Dots animation */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {[0, 0.3, 0.6].map((delay, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-green-400"
              style={{ animation: `bounce 1.2s ${delay}s infinite` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}