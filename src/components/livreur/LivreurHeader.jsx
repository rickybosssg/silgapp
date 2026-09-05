import React, { useState, useEffect } from "react";
import { LogOut, Wifi, WifiOff, MapPin, MapPinOff, Power, Navigation, Star, Smartphone, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

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

function useLiveCounters(countryCode) {
  const [clientsEnLigne, setClientsEnLigne] = useState(null);
  const [coursesEnAttente, setCoursesEnAttente] = useState(null);

  const fetch = async () => {
    try {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // Clients en ligne
      const filter = { app_active: true, actif: true };
      if (countryCode) filter.country_code = countryCode;
      const clients = await base44.entities.ClientExterne.filter(filter);
      const actifs = (clients || []).filter(c => c.last_seen_at && c.last_seen_at >= cutoff);
      setClientsEnLigne(actifs.length);

      // Courses en attente
      const filterCourse = { statut: "nouvelle" };
      if (countryCode) filterCourse.country_code = countryCode;
      const courses = await base44.entities.CourseExterne.filter(filterCourse);
      setCoursesEnAttente((courses || []).length);
    } catch (_) {}
  };

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [countryCode]);

  return { clientsEnLigne, coursesEnAttente };
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
  const { clientsEnLigne, coursesEnAttente } = useLiveCounters(livreur?.country_code);

  const prenom = livreur.prenom || livreur.nom.split(" ")[0];
  const nomComplet = livreur.prenom ? `${livreur.prenom} ${livreur.nom}` : livreur.nom;
  const heureStr = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const statutCourse = livreur.statut;
  const isON = isEnLigne;
  const isLibre = statutCourse === "disponible";
  const isEnCourse = statutCourse === "en_course";
  const isBlockedByEncours = !!livreur?.bloque_encours;

  return (
    <div className={cn(
      "rounded-[2rem] text-white overflow-hidden relative border",
      "shadow-[0_18px_45px_rgba(0,122,255,0.24)] ring-1 ring-white/10",
      isON
        ? "bg-primary border-white/20 silgapp-relief-surface"
        : "bg-muted border-border"
    )}>
      {/* Barre de statut coloree */}
      <div className={cn(
        "h-0.5 w-full",
        isON && isLibre ? "bg-emerald-300" :
        isEnCourse ? "bg-sky-200" :
        "bg-white/10"
      )} />

      <div className="p-3.5">

        {/* Ligne 1 : Heure + reseau + deconnexion */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-3xl font-black tracking-tight tabular-nums leading-none">{heureStr}</p>
            <p className="text-[11px] text-white/75 capitalize mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold",
              online ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            )}>
              {online
                ? <><Wifi className="w-2.5 h-2.5" /><span>Réseau</span></>
                : <><WifiOff className="w-2.5 h-2.5" /><span>Hors réseau</span></>
              }
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-8 h-8 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center active:bg-white/25 transition-all border border-white/10"
            >
              <LogOut className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </div>

        {/* Ligne 2 : Avatar + infos + boutons */}
        <div className="flex items-center gap-3 mb-3">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {isON && <div className="absolute -inset-1 rounded-xl bg-green-400/20 animate-pulse" />}
            {livreur.photo_url ? (
              <img
                src={livreur.photo_url}
                alt={nomComplet}
                className="relative w-14 h-14 rounded-2xl object-cover border-2 border-white/25 shadow-lg"
              />
            ) : (
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-blue-700 flex items-center justify-center border-2 border-white/20 shadow-lg">
                <span className="text-white font-black text-xl">{prenom.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 bg-emerald-400 shadow shadow-emerald-400/50" />
          </div>

          {/* Nom + Note + Zone */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight truncate">{nomComplet}</p>
            {livreur.note_moyenne > 0 && (
              <p className="text-[11px] text-yellow-300/80 mt-0.5">
                <Star className="inline w-3 h-3 mr-1 fill-yellow-300 text-yellow-300" />{livreur.note_moyenne.toFixed(1)}
                <span className="text-white/75 ml-1">({livreur.nombre_avis || 0})</span>
              </p>
            )}
            {(livreur.quartier || (livreur.latitude && livreur.longitude)) && (
              <p className="text-[10px] text-white/80 flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{livreur.quartier || `${livreur.latitude?.toFixed(3)}, ${livreur.longitude?.toFixed(3)}`}</span>
              </p>
            )}
          </div>

          {/* Boutons action uniformises */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onToggleLigne}
              disabled={isUpdatingStatut || (!isON && isBlockedByEncours)}
              className={cn(
                "flex items-center justify-center gap-1.5 w-28 h-10 rounded-2xl font-black text-[12px] shadow-lg transition-all",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                isBlockedByEncours && !isON
                  ? "bg-red-700 text-white shadow-red-500/25"
                  : isON
                  ? "bg-red-500 text-white shadow-red-500/25"
                  : "bg-emerald-500 text-white shadow-emerald-500/25"
              )}
            >
              <Power className="w-3 h-3 flex-shrink-0" />
              {isUpdatingStatut ? "..." : isBlockedByEncours && !isON ? "Bloque" : isON ? "Désactiver" : "Activer"}
            </button>

            <button
              type="button"
              onClick={onActiverGps}
              className={cn(
                "flex items-center justify-center gap-1.5 w-28 h-10 rounded-2xl text-[12px] font-bold border transition-all",
                "active:scale-95",
                gpsActif
                  ? "bg-sky-400/20 text-sky-200 border-sky-300/30 shadow-sm shadow-sky-500/15"
                  : "bg-white/8 text-white/75 border-white/20 hover:bg-white/15"
              )}
            >
              {gpsActif
                ? <><Navigation className="w-3 h-3 flex-shrink-0" /> GPS actif</>
                : <><MapPinOff className="w-3 h-3 flex-shrink-0" /> GPS off</>
              }
            </button>
          </div>
        </div>

        {/* Ligne 3 : Compteurs clients + courses */}
        <div className="grid grid-cols-2 gap-2">
          {/* Clients en ligne */}
          <div className="bg-white/10 border border-white/10 rounded-2xl px-3 py-2.5 flex items-center gap-2 backdrop-blur-sm">
            <div className="relative flex-shrink-0">
              <Users className="w-5 h-5 text-white/80" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-slate-900" style={{ animation: "pulse-live 2s ease-in-out infinite" }} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black tabular-nums leading-none text-white">
                {clientsEnLigne ?? "-"}
              </p>
              <p className="text-[10px] text-white/75 leading-tight mt-0.5">
                {clientsEnLigne === 1 ? "client actif" : "clients actifs"}
              </p>
              <p className="text-[8px] text-white/50 leading-tight mt-0.5">5 dernières min</p>
            </div>
          </div>

          {/* Courses en attente */}
          <div className="bg-white/10 border border-white/10 rounded-2xl px-3 py-2.5 flex items-center gap-2 backdrop-blur-sm">
            <div className="relative flex-shrink-0">
              <Package className="w-5 h-5 text-white/80" />
              {coursesEnAttente > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-slate-900" style={{ animation: "pulse-live 2s ease-in-out infinite" }} />
              )}
            </div>
            <div className="min-w-0">
              <p className={cn(
                "text-base font-black tabular-nums leading-none",
                coursesEnAttente > 0 ? "text-amber-300" : "text-white"
              )}>
                {coursesEnAttente ?? "-"}
              </p>
              <p className="text-[10px] text-white/75 leading-tight mt-0.5">
                {coursesEnAttente === 1 ? "nouvelle course" : "nouvelles courses"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}