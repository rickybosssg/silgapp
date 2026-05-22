import { base44 } from '@/api/base44Client';

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const getAdminEmails = () => {
  const envEmails = import.meta.env.VITE_NATIVE_AUTH_ADMIN_EMAILS || '';
  const storedEmails = localStorage.getItem('silgapp_admin_emails') || '';
  return [...envEmails.split(','), ...storedEmails.split(','), 'admin@silga.bf']
    .map(normalizeEmail)
    .filter(Boolean);
};

const getLivreurName = (livreur, email) => {
  const fullName = `${livreur?.prenom || ''} ${livreur?.nom || ''}`.trim();
  return fullName || livreur?.nom || livreur?.user_email || email;
};

const findLivreurByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  try {
    const exactMatches = await base44.entities.Livreur.filter({ user_email: normalizedEmail });
    if (exactMatches?.[0]) return exactMatches[0];
  } catch (error) {
    console.warn('[NativeAccessResolver] Exact livreur lookup failed:', error?.message);
  }

  const livreurs = await base44.entities.Livreur.list('-created_date', 500);
  return livreurs.find((livreur) => normalizeEmail(livreur.user_email) === normalizedEmail) || null;
};

export const resolveNativeAuthorizedUser = async (firebaseUser) => {
  if (!firebaseUser?.email) {
    throw new Error('Compte Firebase sans email. Utilisez un email valide.');
  }

  const email = normalizeEmail(firebaseUser.email);
  const adminEmails = getAdminEmails();

  if (adminEmails.includes(email)) {
    return {
      id: firebaseUser.uid,
      firebase_uid: firebaseUser.uid,
      email,
      full_name: firebaseUser.displayName || email,
      name: firebaseUser.displayName || email,
      photo_url: firebaseUser.photoUrl,
      role: 'admin',
      auth_provider: 'firebase-native',
    };
  }

  const livreur = await findLivreurByEmail(email);
  if (!livreur) {
    const error = new Error('Compte non autorise. Contactez l administrateur.');
    error.code = 'user_not_registered';
    throw error;
  }

  if (livreur.actif === false || livreur.validation === 'refuse') {
    const error = new Error('Compte livreur desactive. Contactez l administrateur.');
    error.code = 'user_not_registered';
    throw error;
  }

  return {
    id: firebaseUser.uid,
    firebase_uid: firebaseUser.uid,
    email,
    full_name: getLivreurName(livreur, email),
    name: getLivreurName(livreur, email),
    photo_url: firebaseUser.photoUrl || livreur.photo_url,
    role: 'livreur',
    auth_provider: 'firebase-native',
    livreur_id: livreur.id,
    livreur,
  };
};
