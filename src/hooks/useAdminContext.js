import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Hook qui détermine le contexte admin de l'utilisateur connecté.
 *et gère le pays sélectionné*.
 *
 * - Admin Global : role="admin" ET (pas de country_code OU admin_type="global")
 * - Admin Pays : role="admin" ET admin_type="pays" ET country_code renseigné
 *
 * Retourne :
 * - isGlobal : boolean
 * - isPays : boolean
 * - countryCode : string | null (ex: "BF", "CI") — null si global
 * - selectedCountry : string | null (pays sélectionné par l'admin global)
 * - setSelectedCountry: fonction pour changer le pays sélectionné
 * - user : object | null
 * - loading : boolean
 */
export function useAdminContext() {
  const [state, setState] = useState({ user: null, loading: true });
  const [selectedCountry, setSelectedCountryState] = useState(() => {
    return localStorage.getItem("silgapp_selected_country") || null;
  });

  useEffect(() => {
    base44.auth.me()
      .then(u => setState({ user: u, loading: false }))
      .catch(() => setState({ user: null, loading: false }));
  }, []);

  const setSelectedCountry = (code) => {
    setSelectedCountryState(code);
    if (code) {
      localStorage.setItem("silgapp_selected_country", code);
    } else {
      localStorage.removeItem("silgapp_selected_country");
    }
  };

  const { user, loading } = state;

  if (loading || !user) {
    return { isGlobal: false, isPays: false, countryCode: null, selectedCountry: null, setSelectedCountry, user, loading };
  }

  const adminType = user.admin_type || "global";
  const countryCode = user.country_code || null;

  const isPays = adminType === "pays" && !!countryCode;
  const isGlobal = !isPays;

  // Admin pays : selectedCountry = son propre pays (non modifiable)
  // Admin global : selectedCountry = choix dans le localStorage
  const effectiveSelected = isPays ? countryCode : selectedCountry;

  return { isGlobal, isPays, countryCode, selectedCountry: effectiveSelected, setSelectedCountry, user, loading };
}
