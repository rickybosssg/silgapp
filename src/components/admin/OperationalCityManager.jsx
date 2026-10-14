import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Plus, Search, Building2, CheckCircle2, XCircle, AlertCircle, ListTree } from 'lucide-react';
import { normalizeCityName, resolveOperationalName } from '../../../base44/shared/cityNames.js';
import { toast } from 'sonner';

export default function OperationalCityManager({ countries, countryCode }) {
  const [selectedCountry, setSelectedCountry] = useState(countryCode || '');
  const [pendingToggle, setPendingToggle] = useState(null);
  useEffect(() => { if (countryCode) setSelectedCountry(countryCode); }, [countryCode]);
  const [searchCity, setSearchCity] = useState('');
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newCityDisplay, setNewCityDisplay] = useState('');
  const [newCityDesc, setNewCityDesc] = useState('');
  const [activating, setActivating] = useState(false);
  const queryClient = useQueryClient();
  const refreshPolicy = () => {
    for (const queryKey of [['operational-zone-policy'], ['city-dispatch-enabled'], ['op-cities'], ['courses-externes-disponibles'], ['eco-missions-disponibles']]) queryClient.invalidateQueries({ queryKey });
  };

  // ── Charger les villes opérationnelles du pays ──
  const { data: opCities = [], refetch, isPending: citiesLoading, isError: citiesError } = useQuery({
    queryKey: ['op-cities', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return [];
      const res = await base44.functions.invoke('manageOperationalCity', {
        action: 'list',
        country_code: selectedCountry,
      });
      const data = res?.data ?? res;
      if (!data?.success || !Array.isArray(data.cities)) throw new Error(data?.error || 'Lecture des villes indisponible');
      return data.cities;
    },
    enabled: !!selectedCountry,
    staleTime: 10000,
  });

  // ── Charger l'audit des quartiers ──
  const { data: audit } = useQuery({
    queryKey: ['quartiers-audit', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return null;
      const res = await base44.functions.invoke('manageOperationalCity', {
        action: 'audit_quartiers',
        country_code: selectedCountry,
      });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error(data?.error || 'Lecture des quartiers indisponible');
      return data;
    },
    enabled: !!selectedCountry,
    staleTime: 30000,
  });

  // ── Charger les quartiers groupés par ville ──
  const { data: quartiersData } = useQuery({
    queryKey: ['quartiers-grouped', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return null;
      const res = await base44.functions.invoke('manageOperationalCity', {
        action: 'list_quartiers',
        country_code: selectedCountry,
      });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error(data?.error || 'Lecture des quartiers indisponible');
      return data;
    },
    enabled: !!selectedCountry,
    staleTime: 30000,
  });

  // ── Filtrer les villes par recherche ──
  const filteredCities = opCities.filter(c =>
    !searchCity ||
    c.nom_affichage?.toLowerCase().includes(searchCity.toLowerCase()) ||
    c.nom?.toLowerCase().includes(searchCity.toLowerCase())
  );

  // ── Activer une ville ──
  const handleActivate = async () => {
    if (!selectedCountry || !newCityName.trim()) {
      toast.error('Pays et nom de ville requis');
      return;
    }
    setActivating(true);
    try {
      const res = await base44.functions.invoke('manageOperationalCity', {
        action: 'activate',
        country_code: selectedCountry,
        city_name: newCityName.trim(),
        city_display_name: newCityDisplay.trim() || newCityName.trim(),
        description: newCityDesc.trim(),
      });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error(data?.error || 'Modification non confirmee');
      if (data.success) {
        toast.success(`Ville "${newCityDisplay || newCityName}" activée`);
        setShowActivateDialog(false);
        setNewCityName('');
        setNewCityDisplay('');
        setNewCityDesc('');
        refetch();
        refreshPolicy();
        queryClient.invalidateQueries({ queryKey: ['op-cities', selectedCountry] });
      } else {
        toast.error('Erreur lors de l\'activation');
      }
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setActivating(false);
    }
  };

  // ── Désactiver une ville ──
  const handleToggle = async (city) => {
    if (activating) return;
    setActivating(true);
    try {
      const res = await base44.functions.invoke('manageOperationalCity', {
        action: city.actif ? 'deactivate' : 'activate',
        country_code: city.country_code,
        city_name: city.nom,
        expected_active: city.actif,
      });
      if (res?.data?.success || res?.success) {
        toast.success(city.actif ? `Ville "${city.nom_affichage}" désactivée` : `Ville "${city.nom_affichage}" activée`);
        refetch();
        refreshPolicy();
        queryClient.invalidateQueries({ queryKey: ['op-cities', selectedCountry] });
      }
      setPendingToggle(null);
    } catch (e) {
      toast.error(e.message || 'Erreur');
    } finally {
      setActivating(false);
    }
  };

  // ── Quartiers rattachés à une ville opérationnelle ──
  const getQuartiersForCity = (cityNom) => {
    if (!quartiersData?.grouped) return [];
    const normalized = normalizeCityName(cityNom);
    return Object.entries(quartiersData.grouped)
      .filter(([key]) => normalizeCityName(key) === normalized)
      .flatMap(([, quartiers]) => quartiers);
  };

  return (
    <div className="space-y-4">
      <Select value={selectedCountry} onValueChange={value => { setSelectedCountry(value); setSearchCity(''); }}>
        <SelectTrigger aria-label="Pays des zones operationnelles" className="w-full sm:w-64 bg-white text-black"><SelectValue placeholder="Selectionner un pays" /></SelectTrigger>
        <SelectContent>{countries.map(c => <SelectItem key={c.code} value={c.code}>{c.emoji_flag} {c.nom}</SelectItem>)}</SelectContent>
      </Select>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Villes opérationnelles</h3>
        </div>
        {selectedCountry && (
          <Button size="sm" onClick={() => setShowActivateDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Activer une ville
          </Button>
        )}
      </div>

      {!selectedCountry ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          Sélectionnez un pays pour gérer les villes opérationnelles.
        </Card>
      ) : (
        <>
          {/* Recherche */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une ville..."
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Stats audit */}
          {audit && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Card className="p-2 text-center">
                <div className="font-bold text-lg">{audit.total ?? 0}</div>
                <div className="text-muted-foreground">Quartiers total</div>
              </Card>
              <Card className="p-2 text-center">
                <div className="font-bold text-lg text-green-600">{audit.with_op_city ?? 0}</div>
                <div className="text-muted-foreground">Rattachés</div>
              </Card>
              <Card className="p-2 text-center">
                <div className="font-bold text-lg text-amber-600">{audit.without_op_city ?? 0}</div>
                <div className="text-muted-foreground">Non rattachés</div>
              </Card>
              <Card className="p-2 text-center">
                <div className="font-bold text-lg text-blue-600">{audit.with_gps ?? 0}</div>
                <div className="text-muted-foreground">Avec GPS</div>
              </Card>
            </div>
          )}

          {/* Liste des villes opérationnelles */}
          {citiesError ? <p role="alert" className="text-red-600">Lecture des villes indisponible. <button onClick={() => refetch()}>Reessayer</button></p> : citiesLoading ? <p role="status">Chargement des villes...</p> : filteredCities.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              {searchCity ? 'Aucune ville trouvée.' : 'Aucune ville opérationnelle configurée. Cliquez sur "Activer une ville" pour commencer.'}
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredCities.map(city => {
                const quartiers = getQuartiersForCity(city.nom);
                return (
                  <Card key={city.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{city.nom_affichage}</span>
                          <Badge variant={city.actif ? 'default' : 'secondary'} className="text-xs">
                            {city.actif ? (
                              <><CheckCircle2 className="w-3 h-3 mr-1" /> Activée</>
                            ) : (
                              <><XCircle className="w-3 h-3 mr-1" /> Désactivée</>
                            )}
                          </Badge>
                          {quartiers.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <ListTree className="w-3 h-3 mr-1" />
                              {quartiers.length} quartier{quartiers.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        {city.description && (
                          <p className="text-xs text-muted-foreground mt-1">{city.description}</p>
                        )}
                        {quartiers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {quartiers.slice(0, 8).map(q => (
                              <Badge key={q.id} variant="outline" className="text-xs text-muted-foreground">
                                <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                {q.nom}
                              </Badge>
                            ))}
                            {quartiers.length > 8 && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                +{quartiers.length - 8}
                              </Badge>
                            )}
                          </div>
                        )}
                        {city.active_par && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Activée par {city.active_par} le {city.date_activation ? new Date(city.date_activation).toLocaleDateString('fr-FR') : '—'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={city.actif}
                          disabled={activating || citiesError}
                          aria-label={`${city.actif ? "Desactiver" : "Activer"} ${city.nom_affichage}`}
                          onCheckedChange={() => setPendingToggle(city)}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!pendingToggle} onOpenChange={open => { if (!open && !activating) setPendingToggle(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{pendingToggle?.actif ? 'Desactiver' : 'Activer'} {pendingToggle?.nom_affichage} ?</DialogTitle></DialogHeader>
          <p>Confirmer ce changement pour {pendingToggle?.country_code}.</p>
          <DialogFooter><Button variant="outline" disabled={activating} onClick={() => setPendingToggle(null)}>Annuler</Button><Button disabled={activating} onClick={() => handleToggle(pendingToggle)}>Confirmer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: Activer une ville */}
      <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activer une ville opérationnelle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Une ville opérationnelle SILGAPP n'est pas nécessairement une commune administrative.
              Ex: Saaba peut être rattachée à la zone de Ouagadougou.
            </div>
            <div>
              <label className="text-xs font-medium">Pays</label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="mt-1">
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
            </div>
            <div>
              <label className="text-xs font-medium">Nom de la ville opérationnelle</label>
              <Input
                placeholder="Ex: Ouagadougou"
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Nom d'affichage (optionnel)</label>
              <Input
                placeholder="Ex: Ouagadougou et périphérie"
                value={newCityDisplay}
                onChange={(e) => setNewCityDisplay(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Description (optionnel)</label>
              <Input
                placeholder="Ex: Inclut Ouagadougou, Saaba et zones périphériques"
                value={newCityDesc}
                onChange={(e) => setNewCityDesc(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-sm">Zone : {resolveOperationalName(newCityName, opCities, quartiersData?.quartiers || []) || "Non renseignee"}. {getQuartiersForCity(resolveOperationalName(newCityName, opCities, quartiersData?.quartiers || [])).length} quartiers rattaches.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivateDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleActivate} disabled={activating || !newCityName.trim()}>
              {activating ? 'Activation...' : 'Activer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
