import React, { createContext, useContext, useMemo } from "react";
import { getLanguageForCountry, t as translate } from "@/lib/i18n";

const I18nContext = createContext({ lang: "fr", t: (s) => s, countryCode: null });

/**
 * I18nProvider — détecte la langue à partir du country_code.
 * GH → English, tout autre pays → Français.
 */
export function I18nProvider({ countryCode, children }) {
  const value = useMemo(() => {
    const lang = getLanguageForCountry(countryCode);
    return {
      lang,
      countryCode,
      t: (frenchString) => translate(frenchString, lang),
    };
  }, [countryCode]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook useI18n — retourne { lang, t, countryCode }
 */
export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Hook useT — raccourci pour obtenir juste la fonction t()
 */
export function useT() {
  const { t } = useContext(I18nContext);
  return t;
}

export default I18nContext;
