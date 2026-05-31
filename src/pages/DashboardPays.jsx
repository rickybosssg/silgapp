import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Globe, MapPin, Package, Truck, Clock,
  CheckCircle2, XCircle, TrendingUp, Users, ShieldCheck, RefreshCw
} from "lucide-react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { PAYS_SILGAPP } from "@/components/international/CountrySelector.jsx";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import StatCard from "@/components/dashboard/StatCard";
import StatDetailModal from "@/components/dashboard/StatDetailModal";
import CoursesEnTraitement from "@/components/dashboard/CoursesEnTraitement";
import CoursesTerminees from "@/components/dashboard/CoursesTerminees";
import LivreursEnLigne from "@/components/dashboard/LivreursEnLigne";
import ClientsEnLigne from "@/components/dashboard/ClientsEnLigne";
import CourseDetailDialog from "@/components/courses/CourseDetailDialog";
import BatterieAlertesPanel from "@/components/admin/BatterieAlertesPanel";
import DispatchMonitor from "@/components/dispatch/DispatchMonitor";

export default function DashboardPays() {
  const { code: codeParam } = useParams();
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const navigate = useNavigate();
  const paysActifs = usePaysActifs();

  // L'admin pays est restreint à son propre country_code
  // L'admin global utilise selectedCountry (depuis localStorage ou URL)
  const effectiveCode = isPays ? adminCountryCode : (codeParam || selectedCountry || "BF");

  const paysInfo = PAYS_SILGAPP.find(p => p.code === effectiveCode) || { code: effectiveCode, nom: effectiveCode, emoji_flag: "🌍", devise: "FCFA" };

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [statModal, setStatModal] = useState(null);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-pays", effectiveCode],
    queryFn: () => base44.entities.CourseExterne.filter({ country_code: effectiveCode }, "-created_date"),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-pays", effectiveCode],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe", country_code: effectiveCode }),
    initialData: [],
    refetchInterval: 5000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-pays", effectiveCode],
    queryFn: () => base44.entities.ClientExterne.filter({ country_code: effectiveCode }),
    initialData: [],
    refetchInterval: 10000,
  });

  const todayCourses = useMemo(
    () => courses.filter(c => isToday(new Date(c.created_date)) || !["livree", "annulee"].includes(c.statut)),
    [courses]
  );

  const coursesEnTraitement = useMemo(
    () => todayCourses.filter(c => !["livree", "annulee"].includes(c.statut)),
    [todayCourses]
  );

  const coursesTerminees = useMemo(
    () => courses.filter(c =>
      ["livree", "annulee"].includes(c.statut) &&
      isToday(new Date(c.heure_livraison || c.updated_date || c.created_date))
    ),
    [courses]
  );

  const livreursEnLigne = useMemo(
    () => livreurs.filter(l => l.statut !== "hors_ligne" && l.validation === "valide" && l.actif !== false),
    [livreurs]
  );

  const clientsEnLigne = useMemo(
    () => clients.filter(c => c.actif !== false && c.latitude && c.longitude),
    [clients]
  );

  const stats = useMemo(() => {
    const todayAll = courses.filter(c => isToday(new Date(c.created_date)));
    const livrees = coursesTerminees.filter(c => c.statut === "livree");
    const annulees = coursesTerminees.filter(c => c.statut === "annulee");
    const ca = livrees.reduce((s, c) => s + (c.prix_final || 0), 0);
    const dispoLivreurs = livreursEnLigne.filter(l => l.statut === "disponible").length;
    return {
      total: todayAll.length,
      livrees: livrees.length,
      annulees: annulees.length,
      enCours: coursesEnTraitement.length,
      ca,
      dispoLivreurs,
      totalClients: clients.length,
      totalLivreurs: livreurs.length,
    };
  }, [courses, coursesEnTraitement, coursesTerminees, livreursEnLigne, clients, livreurs]);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 lg:space-y-5 max-w-7xl mx-auto">
      {/* Header avec sélecteur de pays */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          {isGlobal && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/admin/global")}>
              <ArrowLeft className="w-4 h-4" />
              Global
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-2xl">{paysInfo.emoji_flag}</span>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {paysInfo.nom}
                <Badge className="ml-2 bg-primary/10 text-primary text-xs">{effectiveCode}</Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPays && paysActifs.length > 1 && (
            <div className="flex items-center gap-1.5">
              <CountrySelector
                value={effectiveCode}
                onChange={(code) => {
                  setSelectedCountry(code);
                  navigate(`/admin/pays/${code}`);
                }}
                className="h-9 text-xs"
              />
            </div>
          )}
          <Link to={`/admin/pays/${effectiveCode}/carte`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Carte</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Alertes & dispatch */}
      <BatterieAlertesPanel currentUser={null} />
      <DispatchMonitor />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard title="Clients" value={stats.totalClients} icon={Users} iconBg="bg-purple-500" onClick={() => setStatModal({ type: "clients", data: clients })} />
        <StatCard title="Livreurs" value={stats.totalLivreurs} icon={Truck} iconBg="bg-blue-500" onClick={() => setStatModal({ type: "livreurs_dispo", data: livreurs })} />
        <StatCard title="Total auj." value={stats.total} icon={Package} iconBg="bg-accent" />
        <StatCard title="En cours" value={stats.enCours} icon={Clock} iconBg="bg-blue-500" onClick={() => setStatModal({ type: "en_traitement", data: coursesEnTraitement })} />
        <StatCard title="Livrées" value={stats.livrees} icon={CheckCircle2} iconBg="bg-emerald-500" onClick={() => setStatModal({ type: "livrees", data: coursesTerminees.filter(c => c.statut === "livree") })} />
        <StatCard title="Annulées" value={stats.annulees} icon={XCircle} iconBg="bg-red-500" onClick={() => setStatModal({ type: "annulees", data: coursesTerminees.filter(c => c.statut === "annulee") })} />
        <StatCard title="CA" value={`${stats.ca.toLocaleString()}`} icon={TrendingUp} iconBg="bg-indigo-500" trendLabel={paysInfo.devise} onClick={() => setStatModal({ type: "ca", data: coursesTerminees.filter(c => c.statut === "livree") })} />
        <StatCard title="Dispo" value={stats.dispoLivreurs} icon={Truck} iconBg="bg-accent" onClick={() => setStatModal({ type: "livreurs_dispo", data: livreursEnLigne.filter(l => l.statut === "disponible") })} />
      </div>

      {/* Clients en ligne */}
      <ClientsEnLigne clients={clientsEnLigne} />

      {/* Livreurs en ligne */}
      <LivreursEnLigne livreurs={livreursEnLigne} />

      {/* Courses en traitement */}
      <CoursesEnTraitement
        courses={coursesEnTraitement}
        onView={setSelectedCourse}
        isExterne={true}
      />

      {/* Historique du jour */}
      <CoursesTerminees
        courses={coursesTerminees}
        onView={setSelectedCourse}
      />

      {/* Dialogs */}
      <CourseDetailDialog
        course={selectedCourse}
        open={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
      <StatDetailModal
        open={!!statModal}
        onClose={() => setStatModal(null)}
        type={statModal?.type}
        data={statModal?.data}
      />
    </div>
  );
}