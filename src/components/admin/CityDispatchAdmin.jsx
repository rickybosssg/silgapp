import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Users, Package, Bike, TrendingUp, Activity, Clock, AlertCircle, Globe, Building2 } from 'lucide-react';
import CityDispatchToggle from './CityDispatchToggle';
import CityDispatchMap from './CityDispatchMap';
import CityDispatchLivreurList from './CityDispatchLivreurList';
import OperationalCityManager from './OperationalCityManager';
import { normalizeCityName, classifyLivreurGPS } from '@/lib/gpsCityResolver';

const ACTIVE_COURSE_STATUSES = ['recherche_livreur', 'livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'arrivee'];

export default function CityDispatchAdmin() {
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  // ── Charger tous les pays actifs ──
  const { data: countries = [] } = useQuery({
    queryKey: ['countries-active'],
    queryFn: async () => {
      const list = await base44.entities.Country.filter({ actif: true }, 'ordre', 50);
      return list || [];
    },
    staleTime: 60000,
  });

  // ── Villes opérationnelles configurées pour le pays (toutes, même inactives) ──
  const { data: operationalCities = [] } = useQuery({
    queryKey: ['operational-cities-admin', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return [];
      const list = await base44.entities.OperationalCity.filter(
        { country_code: selectedCountry }, 'nom_affichage', 100
      );
      return list || [];
    },
    enabled: !!selectedCountry,
    staleTime: 30000,
  });

  // ── Tous les livreurs du pays (pas de filtre ville) ──
  const { data: allLivreurs = [], isLoading: livreursLoading } = useQuery({
    queryKey: ['all-livreurs-country', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return [];
      const list = await base44.entities.Livreur.filter(
        { country_code: selectedCountry }, '-last_seen_at', 500
      );
      return list || [];
    },
    enabled: !!selectedCountry,
    refetchInterval: 20000,
    staleTime: 0,
  });

  // ── Quartiers du pays (référentiel GPS pour résolution ville) ──
  const { data: quartiers = [] } = useQuery({
    queryKey: ['quartiers-country-admin', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return [];
      const list = await base44.entities.Quartier.filter(
        { country_code: selectedCountry, actif: true }, 'nom', 500
      );
      return (list || []).filter(q => q.latitude && q.longitude);
    },
    enabled: !!selectedCountry,
    staleTime: 600000,
  });

  // ── Courses actives du pays (filtrées par ville_depart si ville sélectionnée) ──
  const { data: courses = [] } = useQuery({
    queryKey: ['city-courses-admin', selectedCountry, selectedCity],
    queryFn: async () => {
      if (!selectedCountry) return [];
      const filter = { country_code: selectedCountry, statut: { $in: ACTIVE_COURSE_STATUSES } };
      if (selectedCity) filter.ville_depart = { $regex: selectedCity, $options: 'i' };
      const list = await base44.entities.CourseExterne.filter(filter, '-created_date', 200);
      return list || [];
    },
    enabled: !!selectedCountry,
    refetchInterval: 20000,
    staleTime: 0,
  });

  // ── Classifier chaque livreur par GPS ──
  const classifications = useMemo(() => {
    const map = {};
    const selectedCityNorm = normalizeCityName(selectedCity);
    for (const l of allLivreurs) {
      const cls = classifyLivreurGPS(l, quartiers);
      if (selectedCityNorm) {
        if (cls.gpsStatus === 'located' && cls.resolvedCity === selectedCityNorm) {
          cls.displayStatus = 'located';
          cls.displayLabel = 'Localisé';
        } else if (cls.gpsStatus === 'located') {
          cls.displayStatus = 'other_city';
          cls.displayLabel = `Localisé à ${cls.resolvedCity}`;
        } else if (cls.gpsStatus === 'out_of_zone') {
          cls.displayStatus = 'out_of_zone';
          cls.displayLabel = 'Hors zone';
        } else if (cls.gpsStatus === 'stale' && cls.resolvedProfileCity === selectedCityNorm) {
          cls.displayStatus = 'stale';
          cls.displayLabel = 'Localisation à actualiser';
        } else {
          cls.displayStatus = 'other_city';
          cls.displayLabel = 'Localisation à actualiser';
        }
      } else {
        if (cls.gpsStatus === 'located') {
          cls.displayStatus = 'located';
          cls.displayLabel = `Localisé à ${cls.resolvedCity}`;
        } else if (cls.gpsStatus === 'out_of_zone') {
          cls.displayStatus = 'out_of_zone';
          cls.displayLabel = 'Hors zone';
        } else {
          cls.displayStatus = 'stale';
          cls.displayLabel = 'Localisation à actualiser';
        }
      }
      map[l.id] = cls;
    }
    return map;
  }, [allLivreurs, quartiers, selectedCity]);

  // ── Livreurs filtrés pour affichage (carte + liste) ──
  const filteredLivreurs = useMemo(() => {
    if (!selectedCity) return allLivreurs;
    return allLivreurs.filter(l => {
      const cls = classifications[l.id];
      return cls?.displayStatus === 'located' || cls?.displayStatus === 'stale';
    });
  }, [allLivreurs, classifications, selectedCity]);

  // ── Statistiques ──
  const stats = useMemo(() => {
    const located = filteredLivreurs.filter(l => classifications[l.id]?.displayStatus === 'located');
    const stale = filteredLivreurs.filter(l => classifications[l.id]?.displayStatus === 'stale');
    return {
      totalInscrits: allLivreurs.length,
      localises: located.length,
      aActualiser: stale.length,
      dispo: located.filter(l => l.statut === 'disponible').length,
      enCourse: located.filter(l => l.statut === 'en_course').length,
      horsLigne: located.filter(l => l.statut === 'hors_ligne').length,
      coursesEnRecherche: courses.filter(c => c.dispatch_status === 'disponible_push').length,
      coursesEnLivraison: courses.filter(c => ['livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'arrivee'].includes(c.statut)).length,
    };
  }, [filteredLivreurs, classifications, allLivreurs, courses]);

  // ── Feature flag status pour le pays sélectionné ──
  const { data: cityFlagEnabled = false } = useQuery({
    queryKey: ['city-dispatch-flag', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return false;
      const configs = await base44.entities.AppConfig.filter({ cle: `CITY_DISPATCH_ENABLED:${selectedCountry}` });
      return configs?.[0]?.valeur === 'true';
    },
    enabled: !!selectedCountry,
    staleTime: 15000,
  });

  const selectedCountryObj = useMemo(() => countries.find(c => c.code === selectedCountry), [countries, selectedCountry]);

  const statsCards = selectedCity ? [
    { label: 'Inscrits (pays)', value: stats.totalInscrits, icon: Users, color: 'text-blue-600' },
    { label: 'Localisés (GPS)', value: stats.localises, icon: MapPin, color: 'text-green-600' },
    { label: 'À actualiser', value: stats.aActualiser, icon: AlertCircle, color: 'text-amber-600' },
    { label: 'Disponibles', value: stats.dispo, icon: Bike, color: 'text-green-600' },
    { label: 'En mission', value: stats.enCourse, icon: Package, color: 'text-orange-600' },
    { label: 'Hors ligne', value: stats.horsLigne, icon: AlertCircle, color: 'text-gray-500' },
    { label: 'Courses en recherche', value: stats.coursesEnRecherche, icon: Activity, color: 'text-purple-600' },
    { label: 'Courses en livraison', value: stats.coursesEnLivraison, icon: TrendingUp, color: 'text-indigo-600' },
  ] : [
    { label: 'Total livreurs', value: stats.totalInscrits, icon: Users, color: 'text-blue-600' },
    { label: 'GPS récent (<10min)', value: stats.localises, icon: MapPin, color: 'text-teal-600' },
    { label: 'À actualiser', value: stats.aActualiser, icon: AlertCircle, color: 'text-amber-600' },
    { label: 'Courses en recherche', value: stats.coursesEnRecherche, icon: Activity, color: 'text-purple-600' },
    { label: 'Courses en livraison', value: stats.coursesEnLivraison, icon: TrendingUp, color: 'text-indigo-600' },
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-foreground">🏙️ Dispatch par Ville</h2>
        {selectedCountry && (
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${cityFlagEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
            Filtrage ville : {cityFlagEnabled ? 'ACTIF' : 'Inactif'}
          </span>
        )}
      </div>

      {/* Section 1 : Villes opérationnelles (activation individuelle) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Villes opérationnelles</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Activez les villes une par une. Une zone activée réserve ses courses aux livreurs de cette zone.
          Saaba est rattachée à Ouagadougou. OFF par défaut.
        </p>
        <OperationalCityManager countries={countries} />
      </Card>

      {/* Section 1b : Interrupteurs par pays (secours global) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Secours global par pays</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Désactivez d'urgence le filtrage par ville pour un pays entier. Les activations individuelles priment.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {countries.map(c => (
            <CityDispatchToggle key={c.code} country={c} />
          ))}
        </div>
      </Card>

      {/* Section 2 : Sélecteurs pays + ville */}
      <div className="flex gap-2 flex-wrap">
        <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setSelectedCity(''); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Sélectionner un pays" />
          </SelectTrigger>
          <SelectContent>
            {countries.map(c => (
              <SelectItem key={c.code} value={c.code}>
                {c.emoji_flag} {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCity} onValueChange={setSelectedCity} disabled={!selectedCountry || operationalCities.length === 0}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={operationalCities.length === 0 ? "Aucune ville configurée" : "Sélectionner une ville"} />
          </SelectTrigger>
          <SelectContent>
            {operationalCities.map(c => (
              <SelectItem key={c.id} value={c.nom}>
                {c.nom_affichage} {c.actif ? '✅' : '⚪'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedCity && (
          <Button variant="outline" size="sm" onClick={() => setSelectedCity('')}>
            Vue globale
          </Button>
        )}
      </div>

      {/* Section 3 : Carte interactive */}
      {selectedCountry ? (
        livreursLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Chargement de la carte...</Card>
        ) : (
          <CityDispatchMap
            livreurs={filteredLivreurs}
            courses={courses}
            country={selectedCountryObj}
            selectedCity={selectedCity}
            classifications={classifications}
          />
        )
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Sélectionnez un pays pour voir la carte interactive.
        </Card>
      )}

      {/* Section 4 : Statistiques détaillées */}
      {selectedCountry ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <Card key={i} className="p-3 flex flex-col items-center text-center">
                <Icon className={`w-5 h-5 mb-1 ${stat.color}`} />
                <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Section 5 : Liste des livreurs par localisation GPS */}
      {selectedCountry ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Livreurs {selectedCity ? `— ${selectedCity}` : '— Vue globale'}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Positionnement par dernier GPS fiable (récent &lt; 10min, précision &lt; 100m). La ville de profil est affichée à titre informatif.
          </p>
          <CityDispatchLivreurList
            livreurs={filteredLivreurs}
            classifications={classifications}
          />
        </div>
      ) : null}
    </div>
  );
}