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
      "rounded-3xl text-white overflow-hidden relative",
      "shadow-2xl",
      isON
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
        : "bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800"
    )}>
      {/* Halos decoratifs */}
      {isON && <div className="absolute top-0 right-0 w-48 h-48 bg-green-500/8 rounded-full blur-3xl pointer-events-none" />}
      {isEnCourse && <div className="absolute top-0 left-0 w-48 h-48 bg-blue-500/8 rounded-full blur-3xl pointer-events-none" />}

      {/* Barre de statut coloree */}
      <div className={cn(
        "h-0.5 w-full",
        isON && isLibre ? "bg-gradient-to-r from-green-400 via-emerald-300 to-green-400" :
        isEnCourse ? "bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-400" :
        "bg-white/10"
      )} />

      <div className="p-4">

        {/* Ligne 1 : Heure + reseau + deconnexion */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-black tracking-tight tabular-nums leading-none">{heureStr}</p>
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
        <div className="flex items-center gap-3 mb-4">

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {isON && <div className="absolute -inset-1 rounded-xl bg-green-400/20 animate-pulse" />}
            {livreur.photo_url ? (
              <img
                src={livreur.photo_url}
                alt={nomComplet}
                className="relative w-14 h-14 rounded-xl object-cover border-2 border-white/20 shadow-lg"
              />
            ) : (
              <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-primary/50 flex items-center justify-center border-2 border-white/15 shadow-lg">
                <span className="text-white font-black text-xl">{prenom.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 bg-green-400 shadow shadow-green-400/50" />
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
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={onToggleLigne}
              disabled={isUpdatingStatut || (!isON && isBlockedByEncours)}
              className={cn(
                "flex items-center justify-center gap-1.5 w-24 h-8 rounded-xl font-bold text-[11px] shadow-md transition-all",
                "active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                isBlockedByEncours && !isON
                  ? "bg-gradient-to-br from-red-700 to-red-800 text-white shadow-red-500/25"
                  : isON
                  ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/25"
                  : "bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-green-500/25"
              )}
            >
              <Power className="w-3 h-3 flex-shrink-0" />
              {isUpdatingStatut ? "..." : isBlockedByEncours && !isON ? "Bloque" : isON ? "Désactiver" : "Activer"}
            </button>

            <button
              type="button"
              onClick={onActiverGps}
              className={cn(
                "flex items-center justify-center gap-1.5 w-24 h-8 rounded-xl text-[11px] font-semibold border transition-all",
                "active:scale-95",
                gpsActif
                  ? "bg-blue-500/20 text-blue-300 border-blue-400/30 shadow-sm shadow-blue-500/15"
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

        {/* Ligne 3 : Badges statut horizontaux */}
        <div className="flex items-center gap-1.5 mb-3">
          {/* Badge ON/OFF */}
          <span className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide flex-1 justify-center",
            isON
              ? "bg-green-500/18 text-green-300 border border-green-400/25"
              : "bg-red-500/15 text-red-300 border border-red-400/20"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isON ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            {isON ? "ON" : "OFF"}
          </span>

          {/* Badge Libre / En course / Hors ligne */}
          <span className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide flex-1 justify-center",
            isLibre
              ? "bg-emerald-500/18 text-emerald-300 border border-emerald-400/25"
              : isEnCourse
                ? "bg-blue-500/18 text-blue-300 border border-blue-400/25"
                : "bg-white/8 text-white/75 border border-white/20"
          )}>
            {isLibre ? "Libre" : isEnCourse ? "En course" : "En pause"}
          </span>

          {/* Badge App ouverte */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide flex-1 justify-center bg-sky-500/15 text-sky-300 border border-sky-400/20">
            <Smartphone className="w-3 h-3 flex-shrink-0" /> App ouverte
          </span>
        </div>

        {/* Ligne 4 : Compteurs clients + courses */}
        <div className="grid grid-cols-2 gap-2">
          {/* Clients en ligne */}
          <div className="bg-white/6 border border-white/10 rounded-2xl px-3 py-2.5 flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <Users className="w-5 h-5 text-white/80" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-slate-900" style={{ animation: "pulse-live 2s ease-in-out infinite" }} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black tabular-nums leading-none text-white">
                {clientsEnLigne ?? "-"}
              </p>
              <p className="text-[10px] text-white/75 leading-tight mt-0.5">
                {clientsEnLigne === 1 ? "client en ligne" : "clients en ligne"}
              </p>
            </div>
          </div>

          {/* Courses en attente */}
          <div className="bg-white/6 border border-white/10 rounded-2xl px-3 py-2.5 flex items-center gap-2">
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
                {coursesEnAttente === 1 ? "course en attente" : "courses en attente"}
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
