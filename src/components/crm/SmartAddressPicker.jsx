import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Star, Clock, ChevronDown, MapPin, X } from "lucide-react";
import SmartAddressInput from "@/components/location/SmartAddressInput";

/**
 * SmartAddressPicker — carnet d'adresses intelligent par client.
 *
 * Affiche sous le champ d'adresse:
 *   ⭐ Favoris (chips ambre, toujours visibles)
 *   🕒 Récentes (chips gris, 3 max)
 *   +N (bouton pour ouvrir l'historique complet)
 *
 * L'historique complet permet de marquer/démarquer des favoris.
 * La saisie d'une nouvelle adresse se fait via l'AdminAddressAutocomplete intégré.
 *
 * Props:
 * - client: objet ClientExterne détecté (ou null)
 * - role: "depart" | "arrivee"
 * - countryCode, value, onChange, onSelect, placeholder, iconColor, inputClassName
 * - children: bouton "Localiser" positionné par le parent
 */
export default function SmartAddressPicker({
  client,
  role,
  countryCode,
  value,
  onChange,
  onSelect,
  placeholder,
  iconColor = "text-emerald-500",
  inputClassName = "",
  children,
}) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef(null);

  const addressRole = role === "depart" ? "pickup" : "delivery";

  // Charger les adresses du client pour ce rôle
  useEffect(() => {
    if (!client?.id) {
      setAddresses([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1. Récupérer les adresses enregistrées dans le carnet d'adresses
        let data = await base44.entities.ClientAddress.filter(
          { client_id: client.id, role: addressRole }, "-nb_utilisations", 50
        );

        // 2. Si aucune adresse enregistrée, fallback : récupérer depuis l'historique des courses
        if ((!data || data.length === 0) && client.telephone_normalized) {
          const phoneField = role === "depart" ? "client_phone_normalized" : "client_phone_normalized";
          const courses = await base44.entities.CourseExterne.filter(
            { [phoneField]: client.telephone_normalized },
            "-created_date", 20
          );
          const addressMap = new Map();
          for (const c of courses || []) {
            // Pour "depart": utiliser adresse_depart; pour "arrivee": adresse_arrivee
            const addrText = role === "depart" ? c.adresse_depart : c.adresse_arrivee;
            if (!addrText || addrText === "—") continue;
            if (addressMap.has(addrText)) continue; // éviter doublons
            addressMap.set(addrText, {
              id: `course_${c.id}_${role}`,
              adresse: addrText,
              quartier: role === "depart" ? c.quartier_depart : c.quartier_arrivee,
              latitude: role === "depart" ? c.gps_depart_lat : c.gps_arrivee_lat,
              longitude: role === "depart" ? c.gps_depart_lng : c.gps_arrivee_lng,
              nb_utilisations: 1,
              derniere_utilisation: c.created_date,
              is_favorite: false,
            });
          }
          data = Array.from(addressMap.values());
        }

        if (cancelled) return;
        const sorted = (data || []).sort((a, b) => {
          if (a.is_favorite && !b.is_favorite) return -1;
          if (!a.is_favorite && b.is_favorite) return 1;
          const ba = b.nb_utilisations || 0;
          const aa = a.nb_utilisations || 0;
          if (ba !== aa) return ba - aa;
          return new Date(b.derniere_utilisation || 0).getTime() - new Date(a.derniere_utilisation || 0).getTime();
        });
        setAddresses(sorted);
      } catch {
        if (!cancelled) setAddresses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client?.id, addressRole, client?.telephone_normalized, role]);

  // Fermer le panneau d'historique au clic extérieur
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleToggleFavorite = async (e, addressId, currentFavorite) => {
    e.stopPropagation();
    try {
      await base44.entities.ClientAddress.update(addressId, { is_favorite: !currentFavorite });
      setAddresses((prev) =>
        prev.map((a) => (a.id === addressId ? { ...a, is_favorite: !currentFavorite } : a))
      );
    } catch (err) {
      console.error("[SmartAddressPicker] Erreur favori:", err);
    }
  };

  const handleSelectAddress = (addr) => {
    setShowHistory(false);
    onChange?.(addr.adresse);
    if (onSelect) {
      onSelect({
        latitude: addr.latitude,
        longitude: addr.longitude,
        quartier: addr.quartier,
        label: addr.adresse,
      });
    }
  };

  const favorites = useMemo(() => addresses.filter((a) => a.is_favorite), [addresses]);
  const recents = useMemo(() => addresses.filter((a) => !a.is_favorite), [addresses]);
  const visibleRecents = recents.slice(0, 3);
  const hiddenCount = recents.length - visibleRecents.length;

  const hasClient = !!client?.id;
  const showChips = hasClient && !loading && addresses.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      {/* Champ de recherche principal (autocomplétion quartiers + géocodage) */}
      <SmartAddressInput
        value={value}
        onChange={onChange}
        onSelect={onSelect}
        countryCode={countryCode}
        placeholder={placeholder}
        inputClassName={inputClassName}
        iconClassName={iconColor}
        enableAddLieu={true}
      >
        {children}
      </SmartAddressInput>

      {/* Chips d'adresses du client (favoris + récentes) */}
      {showChips && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {favorites.map((addr) => (
            <button
              key={addr.id}
              type="button"
              onClick={() => handleSelectAddress(addr)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 transition-all active:scale-95"
            >
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="truncate max-w-[110px]">{addr.adresse}</span>
            </button>
          ))}
          {visibleRecents.map((addr) => (
            <button
              key={addr.id}
              type="button"
              onClick={() => handleSelectAddress(addr)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
            >
              <Clock className="w-3 h-3" />
              <span className="truncate max-w-[110px]">{addr.adresse}</span>
            </button>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100 transition-all ${
                showHistory ? "ring-1 ring-indigo-300" : ""
              }`}
            >
              +{hiddenCount}
              <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* Pas d'adresses enregistrées pour ce client */}
      {hasClient && !loading && addresses.length === 0 && (
        <p className="mt-1 text-[10px] text-gray-400 italic">
          Aucune adresse enregistrée pour ce client — saisie manuelle ci-dessus
        </p>
      )}

      {/* Historique complet (dropdown) */}
      {showHistory && addresses.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-lg">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-500">
              Carnet d'adresses — {addresses.length} adresse(s)
            </p>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          {favorites.length > 0 && (
            <div>
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Favoris
              </p>
              {favorites.map((addr) => (
                <AddressItem
                  key={addr.id}
                  addr={addr}
                  onSelect={handleSelectAddress}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          )}
          {recents.length > 0 && (
            <div>
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <Clock className="w-3 h-3" /> Toutes les adresses
              </p>
              {recents.map((addr) => (
                <AddressItem
                  key={addr.id}
                  addr={addr}
                  onSelect={handleSelectAddress}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddressItem({ addr, onSelect, onToggleFavorite }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(addr)}
      className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
    >
      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-700 truncate">{addr.adresse}</p>
        {addr.quartier && <p className="text-[10px] text-gray-400">{addr.quartier}</p>}
      </div>
      <span className="text-[10px] text-gray-400 shrink-0">{addr.nb_utilisations || 1}×</span>
      <button
        type="button"
        onClick={(e) => onToggleFavorite(e, addr.id, addr.is_favorite)}
        className="p-1 rounded hover:bg-gray-100 shrink-0"
      >
        <Star
          className={`w-3.5 h-3.5 ${addr.is_favorite ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      </button>
    </button>
  );
}