import React from "react";

const VENUS_PHOTO = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/d94a7633c_file_000000002d847243ae50bc345d34c7fa.png";

const messages = [
  "Je te trouve une course dans un instant...",
  "Je cherche une course proche de ta zone...",
  "Reste prêt, une mission arrive bientôt ! ",
];

export default function EmptyStateAttente() {
  const msg = messages[Math.floor(Date.now() / 30000) % messages.length];

  return (
    <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-white/10 shadow-2xl relative">
      {/* Halo décoratif */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/8 rounded-full blur-2xl pointer-events-none" />

      <div className="p-6 relative">
        {/* En-tête */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-xs font-bold text-green-400 uppercase tracking-widest">Recherche active</p>
        </div>

        {/* VENUS + bulle */}
        <div className="flex items-end gap-4 mb-5">
          {/* Photo VENUS avec halo flottant */}
          <div className="relative flex-shrink-0">
            {/* Halo pulsant */}
            <div className="absolute inset-0 rounded-2xl bg-blue-400/20 animate-pulse blur-sm" />
            <div
              className="relative w-20 h-24 rounded-2xl overflow-hidden border-2 border-blue-400/40 shadow-xl shadow-blue-500/20"
              style={{ animation: "venusFloat 3s ease-in-out infinite" }}
            >
              <img
                src={VENUS_PHOTO}
                alt="VENUS - Assistante SILGAPP"
                className="w-full h-full object-cover object-top"
              />
            </div>
            {/* Badge VENUS */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
              VENUS
            </div>
          </div>

          {/* Bulle de dialogue */}
          <div className="flex-1 relative">
            {/* Pointe de la bulle */}
            <div className="absolute -left-2.5 bottom-4 w-0 h-0"
              style={{
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderRight: "10px solid rgba(255,255,255,0.08)"
              }}
            />
            <div className="bg-white/8 border border-white/12 rounded-2xl rounded-bl-sm p-3.5 shadow-inner">
              <p className="text-sm font-medium text-white/90 leading-snug italic">
                "{msg}"
              </p>
              <div className="flex items-center gap-1 mt-2">
                {[0, 0.3, 0.6].map((delay, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-green-400/70"
                    style={{ animation: `typingDot 1.2s ${delay}s ease-in-out infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Infos de recherche */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 font-medium"> Rayon actuel</span>
            <span className="text-sm font-black text-green-400">3 km</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/35">
            <span>3 km</span>
            <span>→ 5 km → 8 km</span>
          </div>
          <p className="text-[11px] text-white/40 pt-1">
             Extension automatique • Alertes sonores + vibrations
          </p>
        </div>
      </div>

      <style>{`
        @keyframes venusFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes typingDot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}