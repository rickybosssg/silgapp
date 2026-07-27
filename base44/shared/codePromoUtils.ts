/**
 * Utilitaires partagés pour la gestion des codes promo ambassadeurs.
 * Utilisé par : initClientAuto, initLivreurAuto, genererCodesPromoManquants
 */

/**
 * Génère un code promo lisible et unique.
 * Format: NOMXXXX (4 lettres du nom + 4 chiffres aléatoires)
 */
export function generatePromoCode(nom: string): string {
  const nomPart = (nom || 'USER')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .substring(0, 4)
    .padEnd(4, 'X');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${nomPart}${random}`;
}

/**
 * Assure qu'un utilisateur a un code promo. Crée le code s'il n'en a pas.
 * @param base44 - client base44.asServiceRole
 * @param params - infos du propriétaire
 * @returns le code promo existant ou nouvellement créé
 */
export async function ensureCodePromo(
  base44: any,
  params: {
    proprietaire_type: 'client' | 'livreur' | 'partenaire';
    proprietaire_id: string;
    proprietaire_nom: string;
    proprietaire_email?: string;
    country_code: string;
  }
): Promise<{ code: string; created: boolean; code_promo_id?: string }> {
  const { proprietaire_type, proprietaire_id, proprietaire_nom, proprietaire_email, country_code } = params;

  // Champ de filtrage selon le type
  const filterField =
    proprietaire_type === 'client'
      ? 'proprietaire_client_id'
      : proprietaire_type === 'livreur'
        ? 'proprietaire_livreur_id'
        : 'proprietaire_partenaire_id';

  // Vérifier si un code existe déjà pour cet utilisateur
  const existing = await base44.entities.CodePromo.filter({ [filterField]: proprietaire_id });
  if (existing && existing.length > 0) {
    return { code: existing[0].code, created: false, code_promo_id: existing[0].id };
  }

  // Générer un code unique (vérifier les doublons)
  let code = generatePromoCode(proprietaire_nom);
  let attempts = 0;
  while (attempts < 10) {
    const dup = await base44.entities.CodePromo.filter({ code });
    if (!dup || dup.length === 0) break;
    code = generatePromoCode(proprietaire_nom);
    attempts++;
  }

  // Créer le code promo
  const codePromo = await base44.entities.CodePromo.create({
    code,
    proprietaire_nom,
    proprietaire_email: proprietaire_email || '',
    [filterField]: proprietaire_id,
    proprietaire_type,
    country_code,
    actif: true,
    nb_inscrits: 0,
    nb_premieres_courses: 0,
    total_primes_generees: 0,
  });

  return { code: codePromo.code, created: true, code_promo_id: codePromo.id };
}