const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

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
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

// Détecte Capacitor (APK Android/iOS) pour adapter les URLs
const detectCapacitor = () => {
	try {
		if (typeof window === 'undefined') return false;
		if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
		// Capacitor sert le WebView sur localhost
		if (window.location.hostname === 'localhost') return true;
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

	// Dans Capacitor, ne jamais utiliser localhost comme fromUrl — utiliser l'URL publique de l'app
	const safeHref = isCapacitor
		? 'https://silgapp.base44.app'
		: (typeof window !== 'undefined' ? window.location.href : '/');

	// Ne jamais laisser appBaseUrl à null — le SDK Base44 l'utilise pour les appels API
	const rawAppBaseUrl = getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL });
	const appBaseUrl = rawAppBaseUrl && rawAppBaseUrl !== 'null' && rawAppBaseUrl !== 'undefined'
		? rawAppBaseUrl
		: 'https://app.base44.com';

	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID || "silgapp" }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: safeHref,
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl,
		isCapacitor,
	}
}

export const appParams = {
	...getAppParams()
}