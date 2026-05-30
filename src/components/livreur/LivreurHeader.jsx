import React, { useState, useEffect } from "react";
import { LogOut, Wifi, WifiOff, MapPin, MapPinOff, Power, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function LivreurHeader({
  livreur,
  isEnLigne,
  isUpdatingStatut,
  gpsActif,
  onToggleLigne,
  onActiverGps,
  onLogout,
}) {
  const time = useClock();
  const online = useOnlineStatus();

  const prenom = livreur.prenom || livreur.nom.split(" ")[0];
  const nomComplet = livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom;
  const heureStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const statutCourse = livreur.statut;
  const isON = isEnLigne;
  const isLibre = statutCourse === "disponible";
  const isEnCourse = statutCourse === "en_course";

  return (
    <div className={cn(
      "rounded-3xl text-white overflow-hidden relative",
      "shadow-2xl",
      isON
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
        : "bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800"
    )}>
      {/* Halo de fond ON */}
      {isON && (
        <div className="absolute top-0 right-0 w-40 h-40 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
      )}
      {isEnCourse && (
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* Barre colorée du statut en haut */}
      <div className={cn(
        "h-1 w-full",
        isON && isLibre ? "bg-gradient-to-r from-green-400 via-emerald-400 to-green-400" :
        isEnCourse ? "bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400" :
        "bg-gray-700"
      )} />

      <div className="p-5">
        {/* Barre top : heure + déconnexion */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-3xl font-black tracking-tight tabular-nums">{heureStr}</p>
            <p className="text-xs text-white/40 capitalize mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              online ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            )}>
              {online
                ? <><Wifi className="w-3 h-3" /><span>Réseau</span></>
                : <><WifiOff className="w-3 h-3" /><span>Hors réseau</span></>
              }
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-9 h-9 rounded-2xl bg-white/8 hover:bg-white/15 flex items-center justify-center active:bg-white/25 transition-all border border-white/10"
            >
              <LogOut className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Ligne profil */}
        <div className="flex items-start gap-4">

          {/* Avatar avec halo */}
          <div className="relative flex-shrink-0">
            {/* Halo animé si ON */}
            {isON && (
              <div className="absolute -inset-1.5 rounded-2xl bg-green-400/20 animate-pulse" />
            )}
            {livreur.photo_url ? (
              <img
                src={livreur.photo_url}
                alt={nomComplet}
                className="relative w-16 h-16 rounded-2xl object-cover border-2 border-white/25 shadow-xl"
              />
            ) : (
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/50 flex items-center justify-center border-2 border-white/15 shadow-xl">
                <span className="text-white font-black text-2xl">{prenom.charAt(0).toUpperCase()}</span>
              </div>
            )}
            {/* Point présence app — toujours vert car app ouverte */}
            <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full border-2 border-slate-900 bg-green-400 flex items-center justify-center shadow-lg shadow-green-400/40">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>

          {/* Infos livreur */}
          <div className="flex-1 min-w-0">
            {/* Nom complet — jamais tronqué */}
            <p className="text-base font-bold leading-tight break-words whitespace-normal">{nomComplet}</p>
            {livreur.note_moyenne > 0 && (
              <p className="text-xs text-yellow-300/90 mt-0.5">
                ⭐ {livreur.note_moyenne.toFixed(1)}
                <span className="text-white/30 ml-1">({livreur.nombre_avis || 0} avis)</span>
              </p>
            )}

            {/* Zone */}
            {(livreur.quartier || (livreur.latitude && livreur.longitude)) && (
              <p className="text-xs text-white/50 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 flex-shrink-0 text-white/40" />
                {livreur.quartier || `${livreur.latitude?.toFixed(3)}, ${livreur.longitude?.toFixed(3)}`}
              </p>
            )}

            {/* Badges statuts */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {/* Badge ON/OFF */}
              <span className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide",
                isON
                  ? "bg-green-500/20 text-green-300 border border-green-400/30 shadow-sm shadow-green-500/20"
                  : "bg-red-500/15 text-red-300 border border-red-400/25"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isON ? "bg-green-400" : "bg-red-400")} />
                {isON ? "ON" : "OFF"}
              </span>

              {/* Badge Libre / En course */}
              {isON && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide",
                  isLibre
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-sm shadow-emerald-500/20"
                    : isEnCourse
                      ? "bg-blue-500/20 text-blue-300 border border-blue-400/30 shadow-sm shadow-blue-500/20"
                      : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                    isLibre ? "bg-emerald-400" : isEnCourse ? "bg-blue-400" : "bg-gray-500"
                  )} />
                  {isLibre ? "Libre" : isEnCourse ? "En course" : "—"}
                </span>
              )}

              {/* Badge App ouverte */}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-sky-500/15 text-sky-300 border border-sky-400/25">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
                📱 App ouverte
              </span>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Bouton ON/OFF */}
            <button
              type="button"
              onClick={onToggleLigne}
              disabled={isUpdatingStatut}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-2xl font-bold text-xs shadow-lg transition-all whitespace-nowrap",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                isON
                  ? "bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30"
                  : "bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-green-500/30"
              )}
            >
              <Power className="w-3.5 h-3.5 flex-shrink-0" />
              {isUpdatingStatut ? "..." : isON ? "Désactiver" : "Activer"}
            </button>

            {/* Bouton GPS */}
            <button
              type="button"
              onClick={onActiverGps}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-all whitespace-nowrap",
                "active:scale-95",
                gpsActif
                  ? "bg-gradient-to-br from-blue-500/25 to-indigo-500/25 text-blue-300 border-blue-400/40 shadow-sm shadow-blue-500/20"
                  : "bg-white/8 text-white/50 border-white/15 hover:bg-white/15"
              )}
            >
              {gpsActif
                ? <><Navigation className="w-3.5 h-3.5 flex-shrink-0" /> GPS actif</>
                : <><MapPinOff className="w-3.5 h-3.5 flex-shrink-0" /> GPS off</>
              }
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}