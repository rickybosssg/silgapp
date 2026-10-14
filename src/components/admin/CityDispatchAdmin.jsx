import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Users, Package, Bike, TrendingUp, Activity, Clock, AlertCircle, Building2 } from 'lucide-react';
import CityDispatchMap from './CityDispatchMap';
import { cityNamesPattern, normalizeCityName, operationalCityAliases } from '../../../base44/shared/cityNames.js';
import OperationalCityManager from './OperationalCityManager';


const ACTIVE_COURSE_STATUSES = ['nouvelle', 'en_attente', 'client_contacte', 'recherche_livreur', 'livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'arrivee'];

export default function CityDispatchAdmin() {
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  // ── Charger tous les pays actifs ──
  const { data: countries = [], isLoading: countriesLoading, isError: countriesError } = useQuery({
    queryKey: ['countries-active'],
    queryFn: async () => {
      const list = await base44.entities.Country.filter({ actif: true }, 'ordre', 50);
      return list || [];
    },
    staleTime: 60000,
  });

  // ── Charger les villes pour le pays sélectionné ──
  const { data: cities = [], isFetching: citiesLoading, isError: citiesError } = useQuery({
    queryKey: ['cities-for-country', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return [];
      return await base44.entities.OperationalCity.filter({ country_code: selectedCountry }, 'nom_affichage', 100);
    },
    enabled: !!selectedCountry,
    staleTime: 30000,
  });

  const selectedCityRecord = cities.find(c => normalizeCityName(c.nom) === normalizeCityName(selectedCity));
  const selectedCityAliases = selectedCityRecord ? operationalCityAliases(selectedCityRecord) : selectedCity ? [selectedCity] : [];
  const selectedCityPattern = selectedCityAliases.length ? cityNamesPattern(selectedCityAliases) : null;

  // ── Charger les livreurs et courses pour la carte ──
  const { data: mapData = { livreurs: [], courses: [] }, isLoading: mapLoading, isError: mapError } = useQuery({
    queryKey: ['city-dispatch-map-data', selectedCountry, selectedCity],
    queryFn: async () => {
      if (!selectedCountry) return { livreurs: [], courses: [] };
      const cityRegex = selectedCity ? { $regex: selectedCityPattern, $options: 'i' } : null;
      const livreurFilter = { country_code: selectedCountry };
      const courseFilter = { country_code: selectedCountry, statut: { $in: ACTIVE_COURSE_STATUSES } };
      if (cityRegex) {
        livreurFilter.ville = cityRegex;
        courseFilter.ville_depart = cityRegex;
      }
      const [livreurs, courses] = await Promise.all([
        base44.entities.Livreur.filter(livreurFilter, '-last_seen_at', 200),
        base44.entities.CourseExterne.filter(courseFilter, '-created_date', 200),
      ]);
      return { livreurs: livreurs || [], courses: courses || [] };
    },
    enabled: !!selectedCountry,
    refetchInterval: 20000,
    staleTime: 0,
  });

  // ── Statistiques par ville ──
  const { data: cityStats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['city-stats', selectedCountry, selectedCity],
    queryFn: async () => {
      if (!selectedCountry || !selectedCity) return null;
      const cityRegex = { $regex: selectedCityPattern, $options: 'i' };
      const [livreurs, coursesAll] = await Promise.all([
        base44.entities.Livreur.filter(
          { country_code: selectedCountry, ville: cityRegex },
          '-last_seen_at', 500
        ),
        base44.entities.CourseExterne.filter(
          { country_code: selectedCountry, ville_depart: cityRegex },
          '-created_date', 500
        ),
      ]);
      const livreursList = livreurs || [];
      const coursesList = coursesAll || [];
      const disponible = livreursList.filter(l => l.statut === 'disponible').length;
      const horsLigne = livreursList.filter(l => l.statut === 'hors_ligne').length;
      const enCourse = livreursList.filter(l => l.statut === 'en_course').length;
      const gpsRecent = livreursList.filter(l => {
        if (!l.derniere_position_date) return false;
        const age = Date.now() - new Date(l.derniere_position_date).getTime();
        return age >= 0 && age < 600000;
      }).length;
      const coursesNouvelles = coursesList.filter(c => c.statut === 'nouvelle' || c.statut === 'recherche_livreur').length;
      const coursesEnRecherche = coursesList.filter(c => c.dispatch_status === 'disponible_push').length;
      const coursesEnLivraison = coursesList.filter(c => ['livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison', 'arrivee'].includes(c.statut)).length;
      const coursesTerminees = coursesList.filter(c => c.statut === 'livree').length;
      const coursesEnAttente = coursesList.filter(c => c.statut === 'en_attente').length;
      const missionIds = new Set();
      for (const c of coursesList) { if (c.eco_mission_id) missionIds.add(c.eco_mission_id); }
      return {
        totalLivreurs: livreursList.length, disponible, horsLigne, enCourse, gpsRecent,
        coursesNouvelles, coursesEnRecherche, coursesEnLivraison, coursesTerminees,
        coursesEnAttente, ecoMissions: missionIds.size,
      };
    },
    enabled: !!selectedCountry && !!selectedCity,
    refetchInterval: 15000,
    staleTime: 0,
  });

  // ── Feature flag status pour le pays sélectionné ──
  const { data: cityFlagEnabled = false, isLoading: flagLoading, isError: flagError } = useQuery({
    queryKey: ['city-dispatch-enabled', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return false;
      const cities = await base44.entities.OperationalCity.filter({ country_code: selectedCountry, actif: true }, undefined, 1);
      return cities.length > 0;
    },
    enabled: !!selectedCountry,
    staleTime: 15000,
  });

  const selectedCountryObj = useMemo(() => countries.find(c => c.code === selectedCountry), [countries, selectedCountry]);

  const stats = [
    { label: 'Total livreurs', value: cityStats?.totalLivreurs ?? 0, icon: Users, color: 'text-blue-600' },
    { label: 'Disponibles', value: cityStats?.disponible ?? 0, icon: Bike, color: 'text-green-600' },
    { label: 'Hors ligne', value: cityStats?.horsLigne ?? 0, icon: AlertCircle, color: 'text-gray-500' },
    { label: 'En mission', value: cityStats?.enCourse ?? 0, icon: Package, color: 'text-orange-600' },
    { label: 'GPS récent (<10min)', value: cityStats?.gpsRecent ?? 0, icon: MapPin, color: 'text-teal-600' },
    { label: 'Courses nouvelles', value: cityStats?.coursesNouvelles ?? 0, icon: Clock, color: 'text-blue-500' },
    { label: 'En recherche livreur', value: cityStats?.coursesEnRecherche ?? 0, icon: Activity, color: 'text-purple-600' },
    { label: 'En livraison', value: cityStats?.coursesEnLivraison ?? 0, icon: Bike, color: 'text-indigo-600' },
    { label: 'Terminées', value: cityStats?.coursesTerminees ?? 0, icon: TrendingUp, color: 'text-green-700' },
    { label: 'En attente', value: cityStats?.coursesEnAttente ?? 0, icon: Clock, color: 'text-amber-600' },
    { label: 'Missions Éco', value: cityStats?.ecoMissions ?? 0, icon: Package, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4 p-4 min-w-0">
      {(countriesError || citiesError || mapError || statsError) && <p role="alert" className="text-red-600">Données indisponibles. Veuillez actualiser.</p>}
      {countriesLoading && <p>Chargement des pays...</p>}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-foreground">🏙️ Dispatch par Ville</h2>
        {selectedCountry && (
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${cityFlagEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
            Filtrage ville : {flagError ? 'Indisponible' : flagLoading ? 'Chargement...' : cityFlagEnabled ? 'ACTIF' : 'Inactif'}
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
        <OperationalCityManager countries={countries} countryCode={selectedCountry} />
      </Card>

      {/* Section 2 : Sélecteurs pays + ville */}
      <div className="flex gap-2 flex-wrap">
        <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setSelectedCity(''); }}>
          <SelectTrigger className="w-full sm:w-[200px] bg-white text-black">
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

        <Select value={selectedCity} onValueChange={setSelectedCity} disabled={!selectedCountry || cities.length === 0}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={citiesLoading ? "Chargement..." : "Sélectionner une ville"} />
          </SelectTrigger>
          <SelectContent>
            {cities.map(city => (
              <SelectItem key={city.id} value={city.nom}>{city.nom_affichage}</SelectItem>
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
        mapError ? <p role="alert">Carte indisponible</p> : mapLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Chargement de la carte...</Card>
        ) : (
          <CityDispatchMap
            livreurs={mapData.livreurs}
            courses={mapData.courses}
            country={selectedCountryObj}
            selectedCity={selectedCity}
          cityAliases={selectedCityAliases}
          />
        )
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Sélectionnez un pays pour voir la carte interactive.
        </Card>
      )}

      {/* Section 4 : Statistiques détaillées par ville */}
      {selectedCity && <p className="text-xs text-muted-foreground">Statistiques : 500 derniers enregistrements maximum. Carte : 200 enregistrements actifs maximum.</p>}
      {!selectedCity ? (
        selectedCountry ? (
          <Card className="p-4 text-center text-muted-foreground text-sm">
            {citiesLoading ? 'Chargement des villes...' : cities.length === 0
              ? "Aucune ville trouvée. Les villes sont détectées automatiquement quand les livreurs envoient leur GPS."
              : "Sélectionnez une ville pour voir les statistiques détaillées."}
          </Card>
        ) : null
      ) : statsError ? <p role="alert">Statistiques indisponibles</p> : statsLoading ? (
        <Card className="p-8 text-center text-muted-foreground">Chargement des statistiques...</Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.map((stat, i) => {
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
      )}
    </div>
  );
}
