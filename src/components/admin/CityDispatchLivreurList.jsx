import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Bike, Package, AlertCircle, MapPin, Clock, Navigation } from 'lucide-react';

const STATUS_CONFIG = {
  located: { label: 'Localisé', color: 'bg-green-100 text-green-800 border-green-300', icon: MapPin },
  stale: { label: 'Localisation à actualiser', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock },
  out_of_zone: { label: 'Hors zone', color: 'bg-gray-100 text-gray-600 border-gray-300', icon: Navigation },
  other_city: { label: 'Autre ville', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: MapPin },
};

export default function CityDispatchLivreurList({ livreurs = [], classifications = {} }) {
  const sorted = useMemo(() => {
    return [...livreurs].sort((a, b) => {
      const sa = classifications[a.id]?.displayStatus || 'unknown';
      const sb = classifications[b.id]?.displayStatus || 'unknown';
      const order = { located: 0, stale: 1, other_city: 2, out_of_zone: 3, unknown: 4 };
      return (order[sa] ?? 5) - (order[sb] ?? 5);
    });
  }, [livreurs, classifications]);

  if (livreurs.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">
        Aucun livreur à afficher.
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {sorted.map(livreur => {
          const cls = classifications[livreur.id] || {};
          const displayStatus = cls.displayStatus || 'unknown';
          const cfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.out_of_zone;
          const Icon = cfg.icon;
          const StatutIcon = livreur.statut === 'disponible' ? Bike :
            livreur.statut === 'en_course' ? Package : AlertCircle;
          const statutColor = livreur.statut === 'disponible' ? 'text-green-600' :
            livreur.statut === 'en_course' ? 'text-orange-600' : 'text-gray-400';

          return (
            <div key={livreur.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border hover:bg-muted/50">
              <StatutIcon className={`w-4 h-4 flex-shrink-0 ${statutColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {livreur.prenom} {livreur.nom}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${cfg.color}`}>
                    <Icon className="w-3 h-3" />
                    {cls.displayLabel || cfg.label}
                  </span>
                  {livreur.ville && (
                    <span className="truncate">Profil: {livreur.ville}</span>
                  )}
                  {cls.gpsAgeMin != null && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />GPS: {Math.round(cls.gpsAgeMin)}min
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}