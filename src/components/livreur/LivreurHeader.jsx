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

  const statutCourse = livreur.statut;
  const isON = isEnLigne;
  const isLibre = statutCourse === "disponible";
  const isEnCourse = statutCourse === "en_course";

  return (
    <div className="rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white shadow-2xl overflow-hidden">
      <div className="p-5">

        {/* Barre top : heure + déconnexion */}
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

        {/* Ligne profil + boutons */}
        <div className="flex items-start gap-4">

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
            {/* Point : Application ouverte (vert) / fermée (gris) — toujours vert car composant affiché = app ouverte */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900 bg-green-400" />
          </div>

          {/* Infos livreur */}
          <div className="flex-1 min-w-0">
            {/* Ligne 1 : Nom + note */}
            <p className="text-base font-bold truncate leading-tight">{nomComplet}</p>
            {livreur.note_moyenne > 0 && (
              <p className="text-xs text-yellow-300 mt-0.5">
                ⭐ {livreur.note_moyenne.toFixed(1)}
                <span className="text-white/40 ml-1">({livreur.nombre_avis || 0} avis)</span>
              </p>
            )}

            {/* Ligne 2 : Zone + téléphone */}
            <div className="mt-1.5 space-y-0.5">
              {(livreur.quartier || (livreur.latitude && livreur.longitude)) && (
                <p className="text-xs text-white/60 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {livreur.quartier || `${livreur.latitude?.toFixed(3)}, ${livreur.longitude?.toFixed(3)}`}
                </p>
              )}
              {livreur.telephone && (
                <p className="text-xs text-white/50">📞 {livreur.telephone}</p>
              )}
            </div>

            {/* Ligne 3 : Badges statuts */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {/* Badge ON/OFF */}
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                isON ? "bg-green-500/20 text-green-300 border border-green-500/40" : "bg-red-500/20 text-red-300 border border-red-500/40"
              )}>
                {isON ? "🟢 ON" : "🔴 OFF"}
              </span>

              {/* Badge Libre / En course */}
              {isON && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                  isLibre
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : isEnCourse
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/40"
                )}>
                  {isLibre ? "🟢 Libre" : isEnCourse ? "🔵 En course" : "⚫ Hors ligne"}
                </span>
              )}

              {/* Badge Application ouverte/fermée */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-white/5 text-white/50 border border-white/10">
                🟢 App ouverte
              </span>
            </div>
          </div>

          {/* Boutons d'action — colonne droite */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Bouton ON/OFF */}
            <button
              type="button"
              onClick={onToggleLigne}
              disabled={isUpdatingStatut}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs shadow-md transition-all whitespace-nowrap",
                "active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
                isON
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <Power className="w-3.5 h-3.5 flex-shrink-0" />
              {isUpdatingStatut ? "..." : isON ? "🔴 Désactiver (OFF)" : "Passer ON"}
            </button>

            {/* Bouton GPS */}
            <button
              type="button"
              onClick={onActiverGps}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap",
                "active:scale-95",
                gpsActif
                  ? "bg-blue-500/20 text-blue-300 border-blue-400/40"
                  : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20"
              )}
            >
              {gpsActif
                ? <><MapPin className="w-3.5 h-3.5 flex-shrink-0" /> GPS actif</>
                : <><MapPinOff className="w-3.5 h-3.5 flex-shrink-0" /> GPS off</>
              }
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}