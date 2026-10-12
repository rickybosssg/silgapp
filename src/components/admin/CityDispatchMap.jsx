import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import DispatchMap from '@/components/carte/DispatchMap';
import { Users, Bike, Package, AlertCircle, MapPin, Activity, Clock, TrendingUp } from 'lucide-react';

/**
 * CityDispatchMap — Carte interactive Super Admin pour le dispatch par ville.
 *
 * Réutilise DispatchMap avec les livreurs et courses filtrés par ville.
 * Affiche les compteurs par ville en overlay.
 */
export default function CityDispatchMap({ livreurs = [], courses = [], country, selectedCity }) {
  // Filtrer par ville si sélectionnée
  const cityRegex = selectedCity ? new RegExp(selectedCity, 'i') : null;

  const filteredLivreurs = useMemo(() => {
    if (!cityRegex) return livreurs;
    return livreurs.filter(l => l.ville && cityRegex.test(l.ville));
  }, [livreurs, cityRegex]);

  const filteredCourses = useMemo(() => {
    if (!cityRegex) return courses;
    return courses.filter(c => c.ville_depart && cityRegex.test(c.ville_depart));
  }, [courses, cityRegex]);

  // Position initiale de la carte
  const position = useMemo(() => {
    if (country?.latitude_centre && country?.longitude_centre) {
      return { latitude: country.latitude_centre, longitude: country.longitude_centre, zoom: 11 };
    }
    // Fallback : utiliser le premier livreur avec GPS
    const firstWithGps = filteredLivreurs.find(l => l.latitude && l.longitude);
    if (firstWithGps) {
      return { latitude: firstWithGps.latitude, longitude: firstWithGps.longitude, zoom: 12 };
    }
    return { latitude: 12.3714, longitude: -1.5197, zoom: 6 }; // Ouaga fallback
  }, [country, filteredLivreurs]);

  // Compteurs
  const totalLivreurs = filteredLivreurs.length;
  const disponible = filteredLivreurs.filter(l => l.statut === 'disponible').length;
  const enCourse = filteredLivreurs.filter(l => l.statut === 'en_course').length;
  const horsLigne = filteredLivreurs.filter(l => l.statut === 'hors_ligne').length;
  const gpsRecent = filteredLivreurs.filter(l => {
    if (!l.derniere_position_date) return false;
    return (Date.now() - new Date(l.derniere_position_date).getTime()) / 60000 < 10;
  }).length;
  const coursesEnAttente = filteredCourses.filter(c =>
    c.statut === 'recherche_livreur' && (c.dispatch_status === 'disponible_push' || c.dispatch_status === 'propose')
  ).length;
  const coursesEnLivraison = filteredCourses.filter(c =>
    ['livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison'].includes(c.statut)
  ).length;

  // Courses avec GPS pour affichage sur la carte
  const coursesForMap = filteredCourses.filter(c => c.gps_depart_lat && c.gps_depart_lng && !c.livreur_id);

  const miniStats = [
    { label: 'Livreurs', value: totalLivreurs, icon: Users, color: 'text-blue-600' },
    { label: 'Dispo', value: disponible, icon: Bike, color: 'text-green-600' },
    { label: 'Mission', value: enCourse, icon: Package, color: 'text-orange-600' },
    { label: 'Hors ligne', value: horsLigne, icon: AlertCircle, color: 'text-gray-500' },
    { label: 'GPS<10min', value: gpsRecent, icon: MapPin, color: 'text-teal-600' },
    { label: 'En attente', value: coursesEnAttente, icon: Activity, color: 'text-red-600' },
    { label: 'En livraison', value: coursesEnLivraison, icon: TrendingUp, color: 'text-indigo-600' },
  ];

  return (
    <div className="space-y-3">
      {/* Mini stats */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
        {miniStats.map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i} className="p-2 flex flex-col items-center text-center">
              <Icon className={`w-4 h-4 mb-0.5 ${s.color}`} />
              <span className="text-lg font-bold text-foreground">{s.value}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{s.label}</span>
            </Card>
          );
        })}
      </div>

      {/* Carte */}
      <Card className="overflow-hidden" style={{ height: '60vh', minHeight: 400 }}>
        <DispatchMap
          position={position}
          livreurs={filteredLivreurs}
          courses={coursesForMap}
          showClients={false}
          showPartenaires={false}
          showHeatmap={false}
        />
      </Card>
    </div>
  );
}