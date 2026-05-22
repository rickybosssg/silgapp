const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCLPFmHSb_keRMwGGnGlJV3hWzmlyN6rxw';
const SESSION_KEY = 'silgapp_firebase_session';

const isValid = (value) => value && value !== 'null' && value !== 'undefined';

const toUser = (account, session = {}) => ({
  uid: account.localId || account.uid || session.localId,
  email: account.email || session.email,
  displayName: account.displayName || session.displayName || account.email || session.email,
  photoUrl: account.photoUrl || session.photoUrl || null,
  emailVerified: !!account.emailVerified,
});

const saveSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const readSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
};

const firebaseRequest = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Firebase Auth');
  }

  return data;
};

const authUrl = (method) => `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${FIREBASE_API_KEY}`;

const refreshSession = async (session) => {
  if (!isValid(session?.refreshToken)) return null;

  const data = await firebaseRequest(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });

  const nextSession = {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token || session.refreshToken,
    localId: data.user_id || session.localId,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  saveSession(nextSession);
  return nextSession;
};

const lookupUser = async (session) => {
  const data = await firebaseRequest(authUrl('lookup'), { idToken: session.idToken });
  return data.users?.[0] ? toUser(data.users[0], session) : null;
};

export const FirebaseRestAuth = {
  async getCurrentUser() {
    let session = readSession();
    if (!session?.idToken) return { user: null };

    if (!session.expiresAt || session.expiresAt < Date.now() + 60000) {
      session = await refreshSession(session);
    }

    if (!session?.idToken) return { user: null };
    return { user: await lookupUser(session) };
  },

  async signInWithEmailAndPassword({ email, password }) {
    const data = await firebaseRequest(authUrl('signInWithPassword'), {
      email,
      password,
      returnSecureToken: true,
    });
    const session = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      localId: data.localId,
      email: data.email,
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
    };
    saveSession(session);
    return { user: toUser(data, session) };
  },

  async createUserWithEmailAndPassword({ email, password }) {
    const data = await firebaseRequest(authUrl('signUp'), {
      email,
      password,
      returnSecureToken: true,
    });
    const session = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      localId: data.localId,
      email: data.email,
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
    };
    saveSession(session);
    return { user: toUser(data, session) };
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
  },
};
