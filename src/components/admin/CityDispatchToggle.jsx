import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';

/**
 * CityDispatchToggle — Interrupteur ON/OFF par pays pour le dispatch par ville.
 *
 * Lit l'état réel depuis AppConfig (CITY_DISPATCH_ENABLED:<CODE>).
 * Demande confirmation avant chaque changement.
 * Actualise immédiatement l'interface après modification.
 *
 * Sécurité : la page entière est derrière AuthGate (admin uniquement).
 */
export default function CityDispatchToggle({ country }) {
  const queryClient = useQueryClient();
  const [toggling, setToggling] = useState(false);

  const { data: enabled = false, isLoading, isError } = useQuery({
    queryKey: ['city-dispatch-enabled', country.code],
    queryFn: async () => {
      const configs = await base44.entities.AppConfig.filter({
        cle: `CITY_DISPATCH_ENABLED:${country.code}`,
      });
      return configs?.[0]?.valeur === 'true';
    },
    staleTime: 15000,
  });

  const handleToggle = async (checked) => {
    const action = checked ? 'ACTIVER' : 'DÉSACTIVER';
    const confirmMsg = `${action} le dispatch par ville pour ${country.nom} (${country.code}) ?\n\n` +
      (checked
        ? 'Les livreurs ne recevront que les courses de leur ville opérationnelle.\nLe filtrage backend, frontend et Éco seront activés.'
        : 'Retour au dispatch historique par pays.\nAucun filtrage géographique supplémentaire.');

    if (!window.confirm(confirmMsg)) return;

    setToggling(true);
    try {
      const raw = await base44.functions.invoke('setCityDispatchConfig', {
        country_code: country.code, enabled: checked, expected_enabled: enabled,
      });
      const result = raw?.data ?? raw;
      if (!result?.success || result.enabled !== checked) throw new Error(result?.error || 'Enregistrement non confirme');

      // Invalider le cache pour tous les composants qui dépendent de ce flag
      queryClient.invalidateQueries({ queryKey: ['city-dispatch-flag', country.code] });
      queryClient.invalidateQueries({ queryKey: ['city-dispatch-flags-all'] });
      queryClient.invalidateQueries({ queryKey: ['courses-externes-disponibles'] });
      queryClient.invalidateQueries({ queryKey: ['eco-missions-disponibles'] });
    } catch (err) {
      console.error('[CityDispatchToggle] Erreur:', err);
      window.alert(`Erreur lors du changement: ${err?.message || 'erreur inconnue'}`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl flex-shrink-0">{country.emoji_flag}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{country.nom}</p>
          <p className="text-xs text-muted-foreground">{country.code}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isLoading || toggling ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <span className={`text-xs font-medium ${enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
            {isError ? 'Indisponible' : enabled ? 'ON' : 'OFF'}
          </span>
        )}
        <Switch
          aria-label={`Dispatch par ville ${country.nom}`}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading || isError || toggling}
        />
      </div>
    </div>
  );
}
