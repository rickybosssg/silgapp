import React, { useState, useEffect } from "react";
import { LogOut, Wifi, WifiOff, MapPin, MapPinOff, Power } from "lucide-react";
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

  return (
    <div className="rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white shadow-2xl overflow-hidden">
      <div className="p-5">
        {/* Top row */}
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
              type="button"
              onClick={onLogout}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/30"
            >
              <LogOut className="w-3.5 h-3.5 text-white/70" />
            </button>
          </div>
        </div>

        {/* Profile row */}
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {livreur.photo_url ? (
              <img
                src={livreur.photo_url}
                alt={nomComplet}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-white/20"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center border-2 border-white/10">
                <span className="text-white font-bold text-xl">{prenom.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className={cn(
              "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-gray-900",
              isEnLigne ? "bg-green-400" : "bg-gray-500"
            )} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50">
              {new Date().getHours() < 12 ? "Bonjour" : new Date().getHours() < 18 ? "Bonne journée" : "Bonsoir"} 👋
            </p>
            <p className="text-base font-bold truncate">{prenom}</p>
            {livreur.note_moyenne > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-yellow-300 text-xs">{"⭐"}</span>
                <span className="text-xs text-white/70 font-semibold">{livreur.note_moyenne.toFixed(1)}</span>
                <span className="text-xs text-white/40">({livreur.nombre_avis || 0} avis)</span>
              </div>
            )}
            <p className="text-xs text-white/40">{livreur.telephone}</p>
          </div>

          {/* Boutons action */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Bouton statut */}
            <button
              type="button"
              onClick={onToggleLigne}
              disabled={isUpdatingStatut}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs shadow-md transition-all",
                "active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
                isEnLigne
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <Power className="w-3.5 h-3.5" />
              {isUpdatingStatut ? "..." : isEnLigne ? "Passer hors ligne" : "Passer en ligne"}
            </button>

            {/* Bouton GPS */}
            <button
              type="button"
              onClick={onActiverGps}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                "active:scale-95",
                gpsActif
                  ? "bg-green-500/20 text-green-300 border-green-400/40"
                  : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20"
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