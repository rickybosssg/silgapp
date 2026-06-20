import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Search,
  TrendingUp, Clock, UserX, UserCheck, Play, Loader2, MapPin
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const NIVEAU_CONFIG = {
  faible: { color: "bg-blue-100 text-blue-700", icon: "🔵", label: "Faible" },
  moyen: { color: "bg-yellow-100 text-yellow-700", icon: "🟡", label: "Moyen" },
  eleve: { color: "bg-orange-100 text-orange-700", icon: "🟠", label: "Élevé" },
  critique: { color: "bg-red-100 text-red-700", icon: "🔴", label: "Critique" },
};

const STATUT_CONFIG = {
  nouveau: { color: "bg-red-100 text-red-700", label: "Nouveau" },
  en_cours: { color: "bg-blue-100 text-blue-700", label: "En cours" },
  confirme: { color: "bg-orange-100 text-orange-700", label: "Confirmé" },
  rejete: { color: "bg-green-100 text-green-700", label: "Rejeté" },
  bloque: { color: "bg-gray-100 text-gray-700", label: "Bloqué" },
};

const TYPE_CONFIG = {
  gps_spoof: "GPS truqué",
  course_trop_rapide: "Course trop rapide",
  prix_anormal: "Prix anormal",
  collusion: "Collusion",
  compte_double: "Compte double",
  annulations_abusives: "Annulations abusives",
  vitesse_impossible: "Vitesse impossible",
  positions_incoherentes: "Positions incohérentes",
};

export default function AntiFraudePanel() {
  const queryClient = useQueryClient();
  const [filtreStatut, setFiltreStatut] = useState("nouveau");
  const [filtreType, setFiltreType] = useState("all");
  const [analyseLoading, setAnalyseLoading] = useState(false);

  const { data: alertes = [], isLoading } = useQuery({
    queryKey: ["alertes-fraude", filtreStatut, filtreType],
    queryFn: () => {
      const q = {};
      if (filtreStatut !== "all") q.statut = filtreStatut;
      if (filtreType !== "all") q.type_fraude = filtreType;
      return base44.entities.AlerteFraude.filter(q, "-date_detection", 100);
    },
    initialData: [],
    refetchInterval: 30000,
  });

  const lancerAnalyse = async (mode) => {
    setAnalyseLoading(true);
    try {
      const res = await base44.functions.invoke("verifierFraude", { mode });
      toast.success(res?.data?.results?.resume || "Analyse terminée");
      queryClient.invalidateQueries({ queryKey: ["alertes-fraude"] });
    } catch (e) {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setAnalyseLoading(false);
    }
  };

  const traiterAlerte = async (alerteId, statut, action) => {
    try {
      await base44.entities.AlerteFraude.update(alerteId, {
        statut,
        traite_par: "admin",
        traite_at: new Date().toISOString(),
        action_prise: action,
      });
      toast.success(`Alerte ${statut === 'confirme' ? 'confirmée' : 'rejetée'}`);
      queryClient.invalidateQueries({ queryKey: ["alertes-fraude"] });
    } catch (e) {
      toast.error("Erreur lors du traitement");
    }
  };

  const bloquerLivreur = async (alerte) => {
    try {
      await base44.entities.Livreur.update(alerte.livreur_id, {
        bloque_encours: true,
        statut: "hors_ligne",
        encours_bloque_at: new Date().toISOString(),
      });
      await base44.entities.AlerteFraude.update(alerte.id, {
        statut: "bloque",
        traite_par: "admin",
        traite_at: new Date().toISOString(),
        action_prise: `Livreur bloqué pour fraude: ${alerte.type_fraude}`,
      });
      toast.success("Livreur bloqué");
      queryClient.invalidateQueries({ queryKey: ["alertes-fraude"] });
    } catch (e) {
      toast.error("Erreur lors du blocage");
    }
  };

  const stats = {
    total: alertes.length,
    nouveaux: alertes.filter(a => a.statut === 'nouveau').length,
    critiques: alertes.filter(a => a.niveau === 'critique').length,
    confirmes: alertes.filter(a => a.statut === 'confirme' || a.statut === 'bloque').length,
  };

  if (isLoading) {
    return <div className="p-6"><div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-gray-200 rounded" /><div className="h-64 bg-gray-100 rounded-xl" /></div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-red-500" /> Anti-Fraude
          </h1>
          <p className="text-sm text-gray-500 mt-1">Détection automatique des comportements suspects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => lancerAnalyse('rapide')} disabled={analyseLoading}
            className="gap-1.5">
            {analyseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Analyse 24h
          </Button>
          <Button size="sm" onClick={() => lancerAnalyse('complet')} disabled={analyseLoading}
            className="gap-1.5 bg-red-600 hover:bg-red-700">
            {analyseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Analyse complète
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Alertes totales</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-red-600">{stats.nouveaux}</p>
          <p className="text-xs text-gray-500">Nouvelles</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-orange-600">{stats.critiques}</p>
          <p className="text-xs text-gray-500">Critiques</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center">
          <p className="text-2xl font-black text-green-600">{stats.confirmes}</p>
          <p className="text-xs text-gray-500">Confirmées</p>
        </CardContent></Card>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3">
        <Select value={filtreStatut} onValueChange={setFiltreStatut}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="nouveau">🔴 Nouveau</SelectItem>
            <SelectItem value="en_cours">🔵 En cours</SelectItem>
            <SelectItem value="confirme">🟠 Confirmé</SelectItem>
            <SelectItem value="rejete">🟢 Rejeté</SelectItem>
            <SelectItem value="bloque">⚫ Bloqué</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtreType} onValueChange={setFiltreType}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Liste alertes */}
      <div className="space-y-3">
        {alertes.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-gray-700">Aucune alerte détectée</p>
              <p className="text-sm text-gray-500 mt-1">Lancez une analyse pour vérifier les courses récentes</p>
            </CardContent>
          </Card>
        ) : (
          alertes.map(alerte => {
            const nivCfg = NIVEAU_CONFIG[alerte.niveau] || NIVEAU_CONFIG.moyen;
            const statCfg = STATUT_CONFIG[alerte.statut] || STATUT_CONFIG.nouveau;
            
            let detailsParsed = {};
            try { detailsParsed = JSON.parse(alerte.details || '{}'); } catch {}

            return (
              <Card key={alerte.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Info principale */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={nivCfg.color}>{nivCfg.icon} {nivCfg.label}</Badge>
                        <Badge className={statCfg.color}>{statCfg.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_CONFIG[alerte.type_fraude] || alerte.type_fraude}
                        </Badge>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {alerte.date_detection ? format(new Date(alerte.date_detection), 'dd/MM HH:mm', { locale: fr }) : '—'}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-gray-900">{alerte.description}</p>

                      {/* Détails techniques */}
                      {detailsParsed.vitesse_kmh && (
                        <p className="text-xs text-gray-500">
                          Vitesse: {detailsParsed.vitesse_kmh} km/h • Distance: {detailsParsed.distance_km} km • Durée: {detailsParsed.duree_min} min
                        </p>
                      )}
                      {detailsParsed.prix_par_km && (
                        <p className="text-xs text-gray-500">
                          {detailsParsed.prix_par_km} FCFA/km • {detailsParsed.prix_final} FCFA pour {detailsParsed.distance_km} km
                        </p>
                      )}
                      {detailsParsed.nb_courses && (
                        <p className="text-xs text-gray-500">
                          {detailsParsed.nb_courses} courses • {detailsParsed.prix_par_km_moyen} FCFA/km moyen
                        </p>
                      )}
                      {detailsParsed.nb_annulations && (
                        <p className="text-xs text-gray-500">
                          {detailsParsed.nb_annulations} annulations • Motif principal: {detailsParsed.motif_principal}
                        </p>
                      )}
                      {detailsParsed.vitesse_deplacement_kmh && (
                        <p className="text-xs text-gray-500">
                          Déplacement: {detailsParsed.vitesse_deplacement_kmh} km/h sur {detailsParsed.distance_km} km en {detailsParsed.intervalle_min} min
                        </p>
                      )}

                      {/* Livreur */}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {alerte.livreur_nom && <span>👤 {alerte.livreur_nom}</span>}
                        {alerte.livreur_telephone && <span>📱 {alerte.livreur_telephone}</span>}
                        {alerte.country_code && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {alerte.country_code}</span>}
                      </div>

                      {alerte.traite_par && (
                        <p className="text-[10px] text-gray-400">
                          Traité par {alerte.traite_par} le {alerte.traite_at ? format(new Date(alerte.traite_at), 'dd/MM HH:mm', { locale: fr }) : '—'}
                          {alerte.action_prise && ` • ${alerte.action_prise}`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {(alerte.statut === 'nouveau' || alerte.statut === 'en_cours') && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" className="gap-1 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => traiterAlerte(alerte.id, 'rejete', 'Faux positif')}>
                          <XCircle className="w-3.5 h-3.5" /> Rejeter
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                          onClick={() => traiterAlerte(alerte.id, 'confirme', 'Fraude confirmée')}>
                          <CheckCircle className="w-3.5 h-3.5" /> Confirmer
                        </Button>
                        {alerte.niveau === 'critique' && alerte.livreur_id && (
                          <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700"
                            onClick={() => bloquerLivreur(alerte)}>
                            <UserX className="w-3.5 h-3.5" /> Bloquer
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}