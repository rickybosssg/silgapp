import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { readCityPolicySummary } from '../../../base44/shared/cityPolicySummary.js';

export default function CityDispatchToggle({ country }) {
  const {data: policy, isLoading, isError} = useQuery({
    queryKey: ['city-dispatch-summary', country.code],
    queryFn: () => readCityPolicySummary(base44.entities, country.code),
    staleTime: 10000, refetchInterval: 30000,
  });
  return (
    <div className="px-4 py-3 rounded-lg border bg-card space-y-2">
      <div className="flex justify-between gap-3">
        <span className="font-semibold text-sm">{country.emoji_flag} {country.nom}</span>
        <span className="text-sm">{isError ? 'Indisponible' : isLoading ? 'Chargement' : policy?.enabled ? 'ON' : 'OFF'}</span>
      </div>
      {policy && <p className="text-xs text-muted-foreground">{policy.activeCities.length} ville(s) active(s). Activation individuelle dans la gestion des villes.</p>}
      {!!policy?.conflicts.length && <p role="alert" className="text-xs text-red-700 dark:text-red-300">
        Conflit avec le réglage pays historique ({policy.countryFlag === null ? 'invalide' : policy.countryFlag ? 'ON' : 'OFF'}).
        La règle appliquée repose sur les villes opérationnelles ; aucun réglage enregistré n'a été changé.
      </p>}
    </div>
  );
}
