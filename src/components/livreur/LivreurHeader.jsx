import React, { useState, useEffect } from "react";
import { LogOut, Wifi, WifiOff, MapPin, MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";

function getGreeting(prenom) {
  const h = new Date().getHours();
  if (h < 12) return `Bonjour ${prenom} 👋`;
  if (h < 18) return `Bonne journée ${prenom} 🚚`;
  return `Bonsoir ${prenom} 🌙`;
}

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
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function LivreurHeader({ livreur, isEnLigne, onToggleLigne, onLogout, gpsActif, onActiverGps }) {
  const time = useClock();
  const online = useOnlineStatus();
  const prenom = livreur.prenom || livreur.nom.split(" ")[0];
  const nomComplet = livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom;

  const heureStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white shadow-2xl">
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/20 blur-2xl" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-primary/10 blur-xl" />

      <div className="relative p-5">
        {/* Top row: time + status icons */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">{heureStr}</p>
            <p className="text-xs text-white/50 capitalize">{dateStr}</p>
          </div>
          <div className="flex items-center gap-2">
            {online
              ? <Wifi className="w-4 h-4 text-green-400" />
              : <WifiOff className="w-4 h-4 text-red-400" />
            }
            <button
              onClick={onLogout}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-white/70" />
            </button>
          </div>
        </div>

        {/* Profile row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {livreur.photo_url ? (
              <img
                src={livreur.photo_url}
                alt={nomComplet}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg border-2 border-white/10">
                <span className="text-white font-bold text-xl">
                  {prenom.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Online dot */}
            <div className={cn(
              "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900",
              isEnLigne ? "bg-green-400" : "bg-gray-500"
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/60 font-medium">{getGreeting(prenom)}</p>
            <p className="text-lg font-bold truncate">{nomComplet}</p>
            <p className="text-xs text-white/40">{livreur.telephone}</p>
            {livreur.code_identification && (
              <p className="text-xs text-white/40">Code: {livreur.code_identification}</p>
            )}
          </div>

          {/* Actions GPS + Ligne */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Bouton En ligne / Hors ligne */}
            <button
              onClick={() => onToggleLigne(!isEnLigne)}
              className={cn(
                "px-4 py-2 rounded-2xl font-bold text-sm transition-all duration-300 shadow-lg",
                isEnLigne
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30"
                  : "bg-green-500 hover:bg-green-600 text-white shadow-green-500/30"
              )}
            >
              {isEnLigne ? "Hors ligne" : "En ligne"}
            </button>
            {/* Bouton GPS */}
            <button
              onClick={onActiverGps}
              className={cn(
                "px-3 py-1.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 justify-center",
                gpsActif
                  ? "bg-white/10 text-green-300 border border-green-400/40"
                  : "bg-white/10 text-white/50 border border-white/20 hover:bg-white/20"
              )}
            >
              {gpsActif
                ? <><MapPin className="w-3 h-3" /> GPS actif</>
                : <><MapPinOff className="w-3 h-3" /> Activer GPS</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}