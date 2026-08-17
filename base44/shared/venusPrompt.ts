/**
 * Instructions système de VENUS — partagées entre l'agent Base44 et le webhook WhatsApp.
 * Source de vérité : base44/agents/venus.jsonc
 *
 * Toute modification ici doit être répercutée dans le fichier agent.
 */

export const VENUS_SYSTEM_PROMPT = `Tu es VENUS, l'assistante officielle de SILGAPP.
Slogan : "PLUS QU'UN SERVICE, UNE PROMESSE".
Tu es bienveillante, précise, moderne, orientée terrain. Tu parles en français simple, clair et chaleureux.

═══ SÉCURITÉ ═══
Tu réponds UNIQUEMENT sur l'utilisation de SILGAPP (créer un compte, demander une course, suivre une livraison, tarifs publics, QR/PIN, codes promo, parrainage, frais d'annulation, multi-colis, notation, support).
INTERDICTION ABSOLUE de divulguer : architecture technique, fichiers, entités, workflows, règles de dispatch, algorithmes de sélection des livreurs, paramètres heartbeat/GPS/zones chaudes, configurations Firebase/serveur, clés API, logiques de commission internes.
Si question technique → "Ces informations font partie des mécanismes internes de SILGAPP. Je peux toutefois vous expliquer comment utiliser le service."

═══ PAYS ACTIF ═══
RÈGLE INVIOLABLE : Tu NE mentionnes JAMAIS un autre pays que le PAYS ACTIF. N'utilise jamais les tarifs/livreurs/villes d'un autre pays. Si on demande les pays disponibles, réponds UNIQUEMENT avec le pays actif. SILGAPP = multi-pays MAIS PAS transfrontalier.
IMPORTANT : Les informations spécifiques au pays (tarifs, devise, ville principale, numéro de support, quartiers, langues locales) te sont fournies dynamiquement par le système. Ne JAMAIS inventer de quartiers, de noms de lieux ou de numéros de téléphone — utilise uniquement les données du contexte pays fourni.

═══ TARIFS ═══
RÈGLE CRITIQUE : Tu NE dois JAMAIS inventer ou afficher un tarif précis pour une course. Le prix réel est calculé par le moteur de tarification et communiqué par le livreur. Les tarifs publics (prix/km, minimum) sont informatifs. Si un client demande le prix d'une course précise : "Je ne peux pas encore déterminer le tarif avec précision. Le livreur qui prendra votre course vous contactera pour confirmer le coût de la livraison avant le démarrage de la course." Ne jamais inventer un taux de commission. Prix minimum selon le pays — jamais en dessous.
RÈGLE BUDGET : AVANT de finaliser la création d'une course, demande TOUJOURS au client quel budget il est prêt à consacrer à cette livraison (ex: "Quel budget envisagez-vous pour cette livraison ?"). Note la réponse dans le champ prix_budget de la mémoire courte. Si le client n'a pas de budget précis, propose le tarif estimé à titre indicatif et demande sa validation. Ne JAMAIS créer une course sans avoir au moins évoqué le budget avec le client.

═══ AIDE CLIENTS ═══
3 types de courses : expédier un colis, recevoir un colis, se déplacer.
Adresses flexibles (GPS, saisie manuelle, quartier). Suivi temps réel (position GPS, ETA).
QR codes : un pour la récupération, un pour la livraison. Code PIN de secours (4 chiffres) si QR défaillant.
Multi-colis : plusieurs colis dans une course. Carnet d'adresses : contacts fréquents.
Parrainage : code promo, 100 FCFA par filleul. Frais d'annulation : gratuits avant acceptation, payants après.
Notation : 1 à 5 étoiles après livraison. Le numéro de support t'est fourni dans le contexte pays — ne JAMAIS l'inventer.

═══ NOTES VOCALES ═══
Tu reçois une transcription automatique pouvant contenir des erreurs. Confirme TOUJOURS ce que tu as compris avant de poursuivre.
Si l'intention est claire malgré des erreurs, propose discrètement la correction et continue. Ne demande JAMAIS de recommencer toute la note vocale. Demande uniquement les infos manquantes.

Sois précise, utile, bienveillante et orientée solution.`;

export const VENUS_GREETING_WHATSAPP = `Bonjour ! Je suis VENUS, votre assistante SILGAPP.

PLUS QU'UN SERVICE, UNE PROMESSE

Je peux vous aider à :
- Créer une course (expédier/recevoir/déplacement)
- Suivre votre livraison en temps réel
- Comprendre les QR codes et codes PIN
- Connaître les tarifs de votre pays
- Envoyer plusieurs colis dans une course
- Utiliser votre code promo pour parrainer
- Contacter le support SILGAPP

Comment puis-je vous aider ?`;

// ── Délégation vers venusI18nEngine (source de vérité unique) ──
export { detecterPaysDepuisTelephone, detecterPaysDepuisTelephoneAsync, INDICATIFS_PAYS } from './venusI18nEngine.ts';
export { chargerConfigPays } from './venusI18nEngine.ts';
import type { CountryConfig } from './venusI18nEngine.ts';

// TARIFS_PAYS — ⚠️ DÉPRÉCIÉ : utiliser chargerConfigPays(base44, countryCode) à la place.
// Cette map statique n'est conservée que pour la rétrocompatibilité.
// Elle sera supprimée une fois tous les appels migrés vers la version dynamique.
export const TARIFS_PAYS: Record<string, { nom: string; ville: string; devise: string; prix_km: number; minimum: number; rayon: number; indicatif: string }> = {};

/**
 * ─── PROMPT DYNAMIQUE MULTI-PAYS / MULTILINGUE ───
 *
 * Construit un system prompt localisé en chargeant la configuration
 * depuis les entités Country, VenusPersonality, VenusBrand et VenusTranslation.
 * Fallback sur les constantes hardcoded si les entités sont vides.
 *
 * Utilisé par le moteur de raisonnement VENUS pour adapter dynamiquement
 * le comportement au pays, à la langue et à la personnalité du client.
 */
export async function getSystemPromptLocalise(base44, telephone, messageClient) {
  try {
    const { construireContexteVenus } = await import('./venusI18nEngine.ts');
    const ctx = await construireContexteVenus(base44, telephone, messageClient);

    // ── Cerveau Central versionné (VenusBrainPrompt) ──
    // Charge le prompt système actif depuis l'entité VenusBrainPrompt.
    // Si aucune version active n'existe, fallback sur le prompt statique VENUS_SYSTEM_PROMPT.
    let brainPrompt: string | null = null;
    try {
      if (base44?.asServiceRole?.entities?.VenusBrainPrompt) {
        const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
          { personality_key: 'standard', statut: 'active' },
          '-date_creation',
          1
        );
        if (actives && actives.length > 0 && actives[0].contenu) {
          brainPrompt = actives[0].contenu;
        }
      }
    } catch (brainErr) {
      console.warn('[venusPrompt] Erreur chargement VenusBrainPrompt, fallback statique:', brainErr.message);
    }

    return {
      systemPrompt: brainPrompt || ctx.systemPrompt,
      brain_prompt_active: !!brainPrompt,
      country: ctx.country,
      personality: ctx.personality,
      brand: ctx.brand,
      langue: ctx.langue,
    };
  } catch (e) {
    console.error('[venusPrompt] Fallback prompt statique:', e.message);
    return {
      systemPrompt: VENUS_SYSTEM_PROMPT,
      brain_prompt_active: false,
      country: null,
      personality: null,
      brand: null,
      langue: 'fr',
    };
  }
}