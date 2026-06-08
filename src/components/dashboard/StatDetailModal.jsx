import React from "react";
import { X, MapPin, Clock, Wifi, WifiOff, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";

function timeAgo(dt) {
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch { return null; }
}

function isAppOuverte(entity) {
  if (!entity.app_active) return false;
  if (!entity.last_seen_at) return false;
  return (Date.now() - new Date(entity.last_seen_at).getTime()) < 3 * 60 * 1000;
}

function statutBadge(statut) {
  const map = {
    nouvelle: { label: "Nouvelle", className: "bg-gray-100 text-gray-700" },
    recherche_livreur: { label: "Recherche livreur", className: "bg-yellow-100 text-yellow-700" },
    livreur_en_route: { label: "Livreur en route", className: "bg-blue-100 text-blue-700" },
    colis_recupere: { label: "Colis récupéré", className: "bg-indigo-100 text-indigo-700" },
    en_livraison: { label: "En livraison", className: "bg-purple-100 text-purple-700" },
    livree: { label: "Livrée ✓", className: "bg-green-100 text-green-700" },
    annulee: { label: "Annulée", className: "bg-red-100 text-red-700" },
  };
  const s = map[statut] || { label: statut, className: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>{s.label}</span>;
}

// ── Vues par type ────────────────────────────────────────────────────────────

function ClientsList({ clients }) {
  if (!clients.length) return <p className="text-center text-muted-foreground py-8">Aucun client</p>;
  return (
    <div className="space-y-2">
      {clients.map(c => {
        const appOuverte = isAppOuverte(c);
        const zone = c.quartier || (c.latitude ? "Ouagadougou" : "Zone inconnue");
        const lastGps = timeAgo(c.derniere_position_date || c.last_seen_at || c.updated_date);
        const dateInscription = c.created_date ? format(new Date(c.created_date), "d MMM yyyy", { locale: fr }) : null;
        return (
          <div key={c.id} className="border rounded-xl p-3 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.prenom} {c.nom}</p>
                {c.telephone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {c.telephone}
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" /> {zone}
                </p>
                {lastGps && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> Dernier GPS : {lastGps}
                  </p>
                )}
                {dateInscription && (
                  <p className="text-xs text-muted-foreground mt-0.5">📅 Inscrit le {dateInscription}</p>
                )}
              </div>
              <span className={`text-xs font-semibold flex items-center gap-1 flex-shrink-0 ${appOuverte ? "text-green-600" : "text-gray-400"}`}>
                {appOuverte ? <><Wifi className="w-3 h-3" /> App ouverte</> : <><WifiOff className="w-3 h-3" /> App fermée</>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LivreursList({ livreurs }) {
  if (!livreurs.length) return <p className="text-center text-muted-foreground py-8">Aucun livreur</p>;
  return (
    <div className="space-y-2">
      {livreurs.map(l => {
        const appOuverte = isAppOuverte(l);
        const zone = l.quartier || (l.latitude ? "Ouagadougou" : "Zone inconnue");
        const lastGps = timeAgo(l.derniere_position_date || l.last_seen_at || l.updated_date);
        const isON = l.statut === "disponible" || l.statut === "en_course";
        return (
          <div key={l.id} className="border rounded-xl p-3 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{l.prenom} {l.nom}</p>
                {l.telephone && (
                  <a href={`tel:${l.telephone}`} className="text-xs text-primary flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {l.telephone}
                  </a>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" /> {zone}
                </p>
                {lastGps && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> Dernier GPS : {lastGps}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-xs font-bold ${isON ? "text-green-600" : "text-gray-400"}`}>
                  {isON ? "🟢 ON" : "⚪ OFF"}
                </span>
                {l.statut === "disponible" && <span className="text-xs text-emerald-600">Libre</span>}
                {l.statut === "en_course" && <span className="text-xs text-blue-600">En course</span>}
                <span className={`text-xs ${appOuverte ? "text-green-500" : "text-gray-400"}`}>
                  {appOuverte ? "App ouverte" : "App fermée"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CoursesList({ courses }) {
  if (!courses.length) return <p className="text-center text-muted-foreground py-8">Aucune course</p>;
  return (
    <div className="space-y-2">
      {courses.map(c => (
        <div key={c.id} className="border rounded-xl p-3 bg-card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{c.client_nom || c.expediteur_nom || "Client"}</p>
                {statutBadge(c.statut)}
              </div>
              {c.livreur_nom && (
                <p className="text-xs text-muted-foreground mt-0.5">🚴 {c.livreur_nom}</p>
              )}
              {c.adresse_depart && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  📍 {c.adresse_depart} → {c.adresse_arrivee || "?"}
                </p>
              )}
              {c.remarque_livreur && (
                <p className="text-xs text-red-500 mt-0.5">⚠️ {c.remarque_livreur}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                🕒 {c.created_date ? format(new Date(c.created_date), "HH:mm", { locale: fr }) : "—"}
              </p>
            </div>
            {(c.prix_final || c.prix_estimate) > 0 && (
              <p className="text-sm font-bold text-emerald-600 flex-shrink-0">
                {(c.prix_final || c.prix_estimate || 0).toLocaleString()} F
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CADetail({ courses }) {
  const total = courses.length;
  const montantTotal = courses.reduce((s, c) => s + (c.prix_final || 0), 0);
  const commission = courses.reduce((s, c) => s + (c.commission_silga || Math.round((c.prix_final || 0) * 0.3)), 0);
  const gainLivreurs = courses.reduce((s, c) => s + (c.montant_livreur || Math.round((c.prix_final || 0) * 0.7)), 0);

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Courses livrées", val: total, color: "text-foreground" },
          { label: "Montant total", val: `${montantTotal.toLocaleString()} F`, color: "text-emerald-600" },
          { label: "Commission SILGAPP (30%)", val: `${commission.toLocaleString()} F`, color: "text-indigo-600" },
          { label: "Gain livreurs (70%)", val: `${gainLivreurs.toLocaleString()} F`, color: "text-blue-600" },
        ].map(item => (
          <div key={item.label} className="border rounded-xl p-3 bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.val}</p>
          </div>
        ))}
      </div>
      {/* Transactions */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Détail des transactions</p>
      <CoursesList courses={courses} />
    </div>
  );
}

// ── Modal principal ──────────────────────────────────────────────────────────

export default function StatDetailModal({ open, onClose, type, data }) {
  if (!open) return null;

  const titles = {
    clients: `Total clients (${data?.length || 0})`,
    livreurs_dispo: `Livreurs disponibles (${data?.length || 0})`,
    en_traitement: `En traitement (${data?.length || 0})`,
    livrees: `Courses livrées (${data?.length || 0})`,
    annulees: `Courses annulées (${data?.length || 0})`,
    ca: `CA du jour`,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shadow-sm flex-shrink-0">
        <h2 className="text-base font-bold text-foreground">{titles[type] || "Détails"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {type === "clients" && <ClientsList clients={data || []} />}
        {type === "livreurs_dispo" && <LivreursList livreurs={data || []} />}
        {type === "en_traitement" && <CoursesList courses={data || []} />}
        {type === "livrees" && <CoursesList courses={data || []} />}
        {type === "annulees" && <CoursesList courses={data || []} />}
        {type === "ca" && <CADetail courses={data || []} />}
      </div>
    </div>
  );
}