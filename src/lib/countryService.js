// ═══════════════════════════════════════════════════════════════════════════
// COUNTRY SERVICE — Source unique frontend pour les infos pays
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️  Aucun composant ne doit décider localement que le pays par défaut est "BF".
//     Tous les fallbacks de pays doivent passer par resolveCountryCode() ou
//     requireCountryCode() pour les décisions métier critiques.
//
// Ce service centralise :
//   - resolveCountryCode(context) : résolution hiérarchique (entity > profil > session > backend)
//   - requireCountryCode(context) : idem mais retourne { status: "COUNTRY_REQUIRED" } si null
//   - resolveDialCode(countryCode) : indicatif téléphonique depuis Country
//   - getDefaultCountryCode() : pays par défaut (contexte > localStorage > backend)
//   - getCountryConfig(code) : config complète d'un pays (depuis Country)
//   - getActiveCountries() : liste des pays actifs (depuis Country)
//   - getCountryLabel(code) : libellé affichable
//   - getCountryDial(code) : indicatif téléphonique
//   - getCountryCurrency(code) : monnaie + symbole
//   - getCountryCommissionPct(code) : % commission
//
// Hiérarchie de résolution (resolveCountryCode) :
//   1. context.entity?.country_code  — pays explicitement associé à l'objet métier
//   2. context.userProfile?.country_code — pays du profil/compte concerné
//   3. getDefaultCountryCodeSync()  — pays actif de la session (localStorage)
//   4. await getDefaultCountryCode() — backend Country
//   5. null — aucune source disponible
//
// Le backend (entity Country) reste l'autorité absolue.
// Cache en mémoire (TTL 5 min) + localStorage (24h) pour le hors-ligne.
// ═══════════════════════════════════════════════════════════════════════════

import { base44 } from "@/api/base44Client";

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_KEY = "silgapp_country_config";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min en mémoire
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24h en localStorage

let _countriesCache = null;
let _countriesCacheExpires = 0;
let _loadPromise = null;

// ── Pays par défaut persisté (localStorage) ───────────────────────────────────
const DEFAULT_COUNTRY_KEY = "silgapp_default_country";

/**
 * Récupère le pays par défaut du contexte.
 *
 * Ordre de résolution :
 *   1. Pays du profil utilisateur (admin_type=pays → country_code)
 *   2. Pays sélectionné par l'admin global (localStorage)
 *   3. Premier pays actif du backend (Country)
 *   4. null si aucune source disponible (l'app doit demander le pays)
 *
 * @returns {Promise<string|null>} code pays ISO 2 lettres, ou null
 */
export async function getDefaultCountryCode() {
  // 1. Pays du profil utilisateur
  try {
    const user = await base44.auth.me();
    if (user?.country_code) return user.country_code;
    if (user?.admin_type === "pays" && user?.country_code) return user.country_code;
  } catch (_) {}

  // 2. Pays sélectionné par l'admin global (localStorage)
  try {
    const stored = localStorage.getItem(DEFAULT_COUNTRY_KEY);
    if (stored) return stored;
  } catch (_) {}

  // 3. Premier pays actif du backend
  const countries = await getActiveCountries();
  if (countries && countries.length > 0) {
    const first = countries.find(c => c.actif) || countries[0];
    if (first?.code) {
      try { localStorage.setItem(DEFAULT_COUNTRY_KEY, first.code); } catch (_) {}
      return first.code;
    }
  }

  // 4. Aucune source disponible — l'app doit demander le pays
  return null;
}

/**
 * Version synchrone : utilise le cache/localStorage uniquement.
 * À utiliser dans les composants qui ne peuvent pas être async (initial state).
 *
 * @returns {string|null}
 */
export function getDefaultCountryCodeSync() {
  try {
    const stored = localStorage.getItem(DEFAULT_COUNTRY_KEY);
    if (stored) return stored;
  } catch (_) {}
  // Pas de fallback "BF" — retourne null si aucun pays n'est configuré
  return null;
}

/**
 * Définit le pays par défaut (admin global sélectionne un pays).
 */
export function setDefaultCountryCode(code) {
  try {
    if (code) {
      localStorage.setItem(DEFAULT_COUNTRY_KEY, code);
    } else {
      localStorage.removeItem(DEFAULT_COUNTRY_KEY);
    }
  } catch (_) {}
}

/**
 * Récupère tous les pays actifs depuis le backend.
 * Cache en mémoire (5 min) + localStorage (24h) pour le hors-ligne.
 *
 * @returns {Promise<Array>} liste des configs pays
 */
export async function getActiveCountries() {
  // Cache en mémoire
  if (_countriesCache && Date.now() < _countriesCacheExpires) {
    return _countriesCache;
  }

  // Cache localStorage (24h)
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.saved_at && (Date.now() - parsed.saved_at) < LS_TTL_MS && parsed?.countries?.length) {
        _countriesCache = parsed.countries;
        _countriesCacheExpires = Date.now() + CACHE_TTL_MS;
        return _countriesCache;
      }
    }
  } catch (_) {}

  // Backend
  if (!_loadPromise) {
    _loadPromise = (async () => {
      try {
        const countries = await base44.entities.Country.filter({ actif: true }, "ordre", 100);
        _countriesCache = countries || [];
        _countriesCacheExpires = Date.now() + CACHE_TTL_MS;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ countries: _countriesCache, saved_at: Date.now() }));
        } catch (_) {}
      } catch (e) {
        // Backend indisponible — garder le cache existant s'il y en a un
        if (!_countriesCache) _countriesCache = [];
      } finally {
        _loadPromise = null;
      }
      return _countriesCache;
    })();
  }
  return _loadPromise;
}

/**
 * Récupère la config complète d'un pays.
 *
 * @param {string} code - code pays ISO 2 lettres
 * @returns {Promise<object|null>} config pays ou null si introuvable
 */
export async function getCountryConfig(code) {
  if (!code) return null;
  const countries = await getActiveCountries();
  return countries.find(c => c.code === code) || null;
}

/**
 * Récupère le libellé affichable d'un pays.
 *
 * @param {string} code - code pays ISO 2 lettres
 * @returns {Promise<string>} nom du pays ou le code lui-même
 */
export async function getCountryLabel(code) {
  const config = await getCountryConfig(code);
  return config?.nom || config?.nom_local || code || "—";
}

/**
 * Récupère l'indicatif téléphonique d'un pays.
 *
 * @param {string} code - code pays ISO 2 lettres
 * @returns {Promise<string>} indicatif (ex: "+226") ou ""
 */
export async function getCountryDial(code) {
  const config = await getCountryConfig(code);
  return config?.indicatif || "";
}

/**
 * Récupère la monnaie d'un pays.
 *
 * @param {string} code - code pays ISO 2 lettres
 * @returns {Promise<{code: string, symbole: string}>} devise
 */
export async function getCountryCurrency(code) {
  const config = await getCountryConfig(code);
  return {
    code: config?.devise || "XOF",
    symbole: config?.devise_symbole || "FCFA",
  };
}

/**
 * Récupère le % de commission d'un pays.
 *
 * @param {string} code - code pays ISO 2 lettres
 * @returns {Promise<number|null>} % commission ou null si non configuré
 */
export async function getCountryCommissionPct(code) {
  const config = await getCountryConfig(code);
  const pct = Number(config?.commission_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

/**
 * Hook React : charge les pays actifs au montage.
 * Usage : const countries = useActiveCountries();
 */
import { useState, useEffect } from "react";

export function useActiveCountries() {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getActiveCountries()
      .then(c => { if (mounted) { setCountries(c || []); setLoading(false); } })
      .catch(() => { if (mounted) { setCountries([]); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  return { countries, loading };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVEUR HIÉRARCHIQUE — Source unique pour toute décision métier
// ═══════════════════════════════════════════════════════════════════════════
//
// Hiérarchie :
//   1. context.entity?.country_code    — pays de l'objet métier (course, livreur, client…)
//   2. context.userProfile?.country_code — pays du profil/compte concerné
//   3. getDefaultCountryCodeSync()      — pays actif de la session (localStorage)
//   4. await getDefaultCountryCode()   — backend Country
//   5. null — aucune source disponible
//
// ⚠️ Aucun fallback silencieux vers "BF". Le backend Country reste l'autorité.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Résout le code pays depuis un contexte hiérarchique.
 *
 * @param {object} [context] - contexte de résolution
 * @param {object} [context.entity] - objet métier (course, livreur, client…) avec country_code
 * @param {object} [context.userProfile] - profil utilisateur avec country_code
 * @returns {Promise<string|null>} code pays ISO 2 lettres, ou null si introuvable
 */
export async function resolveCountryCode(context = {}) {
  // 1. Pays de l'objet métier
  const entityCC = context.entity?.country_code;
  if (entityCC) return entityCC;

  // 2. Pays du profil utilisateur
  const profileCC = context.userProfile?.country_code;
  if (profileCC) return profileCC;

  // 3. Pays actif de la session (sync — localStorage)
  const sessionCC = getDefaultCountryCodeSync();
  if (sessionCC) return sessionCC;

  // 4. Backend Country (async)
  const backendCC = await getDefaultCountryCode();
  if (backendCC) return backendCC;

  // 5. Aucune source disponible
  return null;
}

/**
 * Résout le code pays pour une opération métier CRITIQUE.
 *
 * Si aucun pays ne peut être résolu, retourne un objet d'erreur explicite
 * au lieu de supposer un pays par défaut.
 *
 * @param {object} [context] - contexte de résolution (voir resolveCountryCode)
 * @returns {Promise<string|{status: 'COUNTRY_REQUIRED', message: string}>}
 *   - string : code pays résolu
 *   - { status: 'COUNTRY_REQUIRED' } : aucun pays trouvé, l'opération doit s'arrêter
 */
export async function requireCountryCode(context = {}) {
  const code = await resolveCountryCode(context);
  if (code) return code;
  return {
    status: 'COUNTRY_REQUIRED',
    message: "Impossible de déterminer le pays. Aucun country_code sur l'objet, le profil utilisateur, la session ou le backend.",
  };
}

/**
 * Résout l'indicatif téléphonique d'un pays depuis le backend Country.
 *
 * @param {string} countryCode - code pays ISO 2 lettres
 * @returns {Promise<string>} indicatif (ex: "+226") ou "" si introuvable
 */
export async function resolveDialCode(countryCode) {
  if (!countryCode) return '';
  const config = await getCountryConfig(countryCode);
  return config?.indicatif || '';
}