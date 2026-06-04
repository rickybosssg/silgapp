const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Valeurs corrompues à ignorer dans localStorage
const CORRUPT_VALUES = ['null', 'undefined', '', 'NaN'];

const isValidValue = (v) => v && !CORRUPT_VALUES.includes(String(v).trim());

export const BASE44_SERVER_URL = 'https://app.base44.com';
export const BASE44_APP_ID = '6a0ec08f3af5e1d1284254c1';
export const APP_PUBLIC_URL =
	import.meta.env.VITE_BASE44_APP_PUBLIC_URL ||
	import.meta.env.VITE_BASE44_APP_BASE_URL ||
	'https://silga-dispatch-go.base44.app';

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam && isValidValue(searchParam)) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue && isValidValue(defaultValue)) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue && isValidValue(storedValue)) {
		return storedValue;
	}
	return null;
}

// Détecte Capacitor (APK Android/iOS) pour adapter les URLs
// IMPORTANT: ne pas se baser sur localhost — le preview web tourne aussi sur localhost
const detectCapacitor = () => {
	try {
		if (typeof window === 'undefined') return false;
		// Seul indicateur fiable : Capacitor.isNativePlatform()
		if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
		return false;
	} catch (e) {
		return false;
	}
};

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}

	const isCapacitor = detectCapacitor();

	// Sur Capacitor, capturer le token depuis l'URL si présent (retour du login OAuth)
	// Le SDK Base44 renvoie le token via ?access_token=... après authentification
	if (isCapacitor && typeof window !== 'undefined') {
		const urlParams = new URLSearchParams(window.location.search);
		const tokenFromUrl = urlParams.get('access_token');
		if (tokenFromUrl && isValidValue(tokenFromUrl)) {
			storage.setItem('base44_access_token', tokenFromUrl);
			// Nettoyer l'URL
			urlParams.delete('access_token');
			const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
			window.history.replaceState({}, document.title, newUrl);
		}
	}

	// Dans Capacitor, TOUJOURS utiliser l'URL publique comme fromUrl (redirect_uri OAuth)
	// file:// n'est pas une redirect_uri valide pour Base44 OAuth → le token reviendrait sur le mauvais domaine
	const safeHref = isCapacitor
		? APP_PUBLIC_URL
		: (typeof window !== 'undefined' ? window.location.href : '/');

	// Ne jamais laisser appBaseUrl à null — le SDK Base44 l'utilise pour les appels API
	const rawAppBaseUrl = getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL });
	const appBaseUrl = rawAppBaseUrl && rawAppBaseUrl !== 'null' && rawAppBaseUrl !== 'undefined'
		? rawAppBaseUrl
		: APP_PUBLIC_URL;

	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID || BASE44_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: safeHref,
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || 'prod' }),
		appBaseUrl,
		isCapacitor,
	}
}

export const appParams = {
	...getAppParams()
}