import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import DispatchMap from '@/components/carte/DispatchMap';
import { Users, Bike, Package, AlertCircle, MapPin, Activity, TrendingUp, Clock } from 'lucide-react';

/**
 * CityDispatchMap — Carte interactive Super Admin pour le dispatch par ville.
 *
 * Les livreurs sont déjà filtrés par GPS par le parent (CityDispatchAdmin).
 * Cette carte reçoit les données pré-filtrées et les affiche.
 * Les compteurs sont calculés à partir des données reçues + classifications.
 */
export default function CityDispatchMap({ livreurs = [], courses = [], country, selectedCity, classifications = {} }) {
  // Position initiale de la carte
  const position = useMemo(() => {
    if (country?.latitude_centre && country?.longitude_centre) {
      return { latitude: country.latitude_centre, longitude: country.longitude_centre, zoom: 11 };
    }
    const firstWithGps = livreurs.find(l => l.latitude && l.longitude);
    if (firstWithGps) {
      return { latitude: firstWithGps.latitude, longitude: firstWithGps.longitude, zoom: 12 };
    }
    return { latitude: 12.3714, longitude: -1.5197, zoom: 6 };
  }, [country, livreurs]);

  // Compteurs basés sur les classifications GPS
  const totalLivreurs = livreurs.length;
  const located = livreurs.filter(l => classifications[l.id]?.displayStatus === 'located').length;
  const stale = livreurs.filter(l => classifications[l.id]?.displayStatus === 'stale').length;
  const disponible = livreurs.filter(l => l.statut === 'disponible').length;
  const enCourse = livreurs.filter(l => l.statut === 'en_course').length;
  const horsLigne = livreurs.filter(l => l.statut === 'hors_ligne').length;
  const coursesEnAttente = courses.filter(c =>
    c.statut === 'recherche_livreur' && (c.dispatch_status === 'disponible_push' || c.dispatch_status === 'propose')
  ).length;
  const coursesEnLivraison = courses.filter(c =>
    ['livreur_en_route', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison'].includes(c.statut)
  ).length;

  const coursesForMap = courses.filter(c => c.gps_depart_lat && c.gps_depart_lng && !c.livreur_id);

  const miniStats = [
    { label: 'Livreurs', value: totalLivreurs, icon: Users, color: 'text-blue-600' },
    { label: 'Localisés', value: located, icon: MapPin, color: 'text-green-600' },
    { label: 'À actualiser', value: stale, icon: Clock, color: 'text-amber-600' },
    { label: 'Dispo', value: disponible, icon: Bike, color: 'text-green-600' },
    { label: 'Mission', value: enCourse, icon: Package, color: 'text-orange-600' },
    { label: 'Hors ligne', value: horsLigne, icon: AlertCircle, color: 'text-gray-500' },
    { label: 'En attente', value: coursesEnAttente, icon: Activity, color: 'text-red-600' },
    { label: 'En livraison', value: coursesEnLivraison, icon: TrendingUp, color: 'text-indigo-600' },
  ];

  return (
    <div className="space-y-3">
      {/* Mini stats */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
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
          livreurs={livreurs}
          courses={coursesForMap}
          showClients={false}
          showPartenaires={false}
          showHeatmap={false}
        />
      </Card>
    </div>
  );
}