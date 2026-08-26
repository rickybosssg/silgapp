import { secrets } from "base44:runtime";

/**
 * getCartoConfig — Retourne les URLs CARTO basemaps avec la clé API injectée.
 *
 * Les secrets Base44 ne sont PAS exposés côté navigateur (import.meta.env).
 * Cette fonction bridge permet au frontend de récupérer l'URL authentifiée.
 *
 * La clé CARTO basemaps est publique par design (utilisée côté navigateur).
 */
export default async function (req: Request): Promise<Response> {
  try {
    const cartoApiKey = secrets.get("VITE_CARTO_API_KEY") || "";
    const keyParam = cartoApiKey ? `?key=${cartoApiKey}` : "";

    return Response.json({
      voyager_url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${keyParam}`,
      light_url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${keyParam}`,
      has_key: !!cartoApiKey,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}