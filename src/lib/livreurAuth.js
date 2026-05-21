const STORAGE_KEY = "silga_livreur_session";

export function getLivreurSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLivreurSession(livreur) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(livreur));
}

export function clearLivreurSession() {
  localStorage.removeItem(STORAGE_KEY);
}