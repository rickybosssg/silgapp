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

  const { data: enabled = false, isLoading } = useQuery({
    queryKey: ['city-dispatch-flag', country.code],
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
      const existing = await base44.entities.AppConfig.filter({
        cle: `CITY_DISPATCH_ENABLED:${country.code}`,
      });

      if (existing?.[0]?.id) {
        await base44.entities.AppConfig.update(existing[0].id, {
          valeur: checked ? 'true' : 'false',
        });
      } else {
        await base44.entities.AppConfig.create({
          cle: `CITY_DISPATCH_ENABLED:${country.code}`,
          valeur: checked ? 'true' : 'false',
          description: `Dispatch par ville ${checked ? 'activé' : 'désactivé'} pour ${country.nom}`,
        });
      }

      // Invalider le cache pour tous les composants qui dépendent de ce flag
      queryClient.invalidateQueries({ queryKey: ['city-dispatch-flag', country.code] });
      queryClient.invalidateQueries({ queryKey: ['city-dispatch-flags-all'] });
      queryClient.invalidateQueries({ queryKey: ['courses-externes-disponibles'] });
    } catch (err) {
      console.error('[CityDispatchToggle] Erreur:', err);
      window.alert(`Erreur lors du changement: ${err?.message || 'erreur inconnue'}`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-card">
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
            {enabled ? 'ON' : 'OFF'}
          </span>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading || toggling}
        />
      </div>
    </div>
  );
}