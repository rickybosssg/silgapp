import { base44 } from "@/api/base44Client";

/**
 * Détecter l'environnement d'exécution
 */
export function detectEnvironment() {
  // Capacitor/Cordova (APK Android / iOS)
  if (typeof window !== 'undefined' && window.Capacitor) {
    return {
      platform: 'capacitor',
      isNative: true,
      os: window.Capacitor.getPlatform(), // 'android', 'ios', 'web'
    };
  }
  
  // Web standard
  return {
    platform: 'web',
    isNative: false,
    os: 'web',
  };
}

/**
 * Obtenir un plugin Capacitor de manière sécurisée (évite les erreurs de build)
 */
async function getCapacitorPlugin(pluginName, packageName) {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // Vérifier si Capacitor est disponible
  if (!window.Capacitor) {
    return null;
  }
  
  try {
    // Import dynamique pour éviter les erreurs de build
    const module = await import(/* @vite-ignore */ packageName);
    return module[pluginName];
  } catch (error) {
    console.warn(`Plugin ${packageName} non disponible:`, error.message);
    return null;
  }
}

/**
 * Vérifier si les notifications sont supportées dans l'environnement actuel
 */
export async function checkNotificationSupport() {
  const env = detectEnvironment();
  
  if (env.isNative && env.os === 'android') {
    // Android natif - vérifier si PushNotifications plugin est disponible
    const PushNotifications = await getCapacitorPlugin('PushNotifications', '@capacitor/push-notifications');
    if (PushNotifications) {
      try {
        await PushNotifications.requestPermissions();
        return { 
          supported: true, 
          type: 'native',
          platform: 'android',
          error: null 
        };
      } catch (error) {
        return { 
          supported: true, 
          type: 'native',
          platform: 'android',
          error: 'Permission check failed: ' + error.message 
        };
      }
    }
    return { 
      supported: false, 
      type: 'native',
      platform: 'android',
      error: 'Plugin PushNotifications non disponible (APK build requis)' 
    };
  }
  
  // Web
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return { 
      supported: true, 
      type: 'web',
      platform: 'web',
      error: null 
    };
  }
  
  return { 
    supported: false, 
    type: 'unknown',
    platform: env.os,
    error: 'Notifications non supportées' 
  };
}

/**
 * Demander la permission pour les notifications
 */
export async function requestNotificationPermission() {
  const env = detectEnvironment();
  
  if (env.isNative && env.os === 'android') {
    const PushNotifications = await getCapacitorPlugin('PushNotifications', '@capacitor/push-notifications');
    if (PushNotifications) {
      try {
        const result = await PushNotifications.requestPermissions();
        const granted = result.receive === 'granted' || result.display === 'granted';
        return { 
          granted, 
          type: 'native',
          error: granted ? null : 'Permission refusée' 
        };
      } catch (error) {
        return { 
          granted: false, 
          type: 'native',
          error: 'Erreur: ' + error.message 
        };
      }
    }
    return { 
      granted: false, 
      type: 'native',
      error: 'Plugin non disponible' 
    };
  }
  
  // Web
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, error: 'Notifications non supportées' };
  }

  if (Notification.permission === 'granted') {
    return { granted: true };
  }

  if (Notification.permission === 'denied') {
    return { granted: false, error: 'Notifications bloquées' };
  }

  const permission = await Notification.requestPermission();
  return { granted: permission === 'granted' };
}

/**
 * Afficher une notification locale
 */
export function showLocalNotification(titre, message, options = {}) {
  const env = detectEnvironment();
  
  if (env.isNative) {
    // Notification native via plugin
    showNativeNotification(titre, message, options);
    return;
  }
  
  // Web
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(titre, {
    body: message,
    icon: options.icon || '/favicon.ico',
    badge: options.badge || '/favicon.ico',
    tag: options.tag || 'silga-notification',
    requireInteraction: options.requireInteraction || false,
    data: options.data || {},
  });

  notification.onclick = () => {
    window.focus();
    if (options.onClick) options.onClick();
    notification.close();
  };

  return notification;
}

/**
 * Afficher une notification native (Android/iOS)
 */
async function showNativeNotification(titre, message, options = {}) {
  // Essayer LocalNotifications d'abord
  const LocalNotifications = await getCapacitorPlugin('LocalNotifications', '@capacitor/local-notifications');
  if (LocalNotifications) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          title: titre,
          body: message,
          id: Date.now(),
          icon: options.icon || 'ic_launcher',
          sound: options.sound || 'beep.wav',
          data: options.data || {},
        }]
      });
      return;
    } catch (err) {
      console.warn('Erreur LocalNotifications:', err.message);
    }
  }
  
  console.log('Notifications locales non disponibles');
}

/**
 * Enregistrer le token pour les notifications push
 * Web: token factice
 * Android: vrai token FCM via Capacitor
 */
export async function registerPushToken(livreurId = null) {
  try {
    const env = detectEnvironment();
    console.log('[registerPushToken] Environment:', env);

    // Environnement natif (Android APK)
    if (env.isNative && env.os === 'android') {
      const PushNotifications = await getCapacitorPlugin('PushNotifications', '@capacitor/push-notifications');
      
      if (!PushNotifications) {
        console.warn('[registerPushToken] PushNotifications non disponible');
        return null;
      }
      
      try {
        // Demander permission
        const permResult = await PushNotifications.requestPermissions();
        console.log('[registerPushToken] Permission:', permResult);
        
        if (permResult.receive !== 'granted' && permResult.display !== 'granted') {
          console.warn('[registerPushToken] Permission refusée');
          return null;
        }

        // S'enregistrer pour recevoir les notifications push
        await PushNotifications.register();
        console.log('[registerPushToken] Enregistré auprès de FCM');

        // Écouter l'événement d'enregistrement (une seule fois)
        return new Promise((resolve, reject) => {
          const listenerName = 'registration';
          
          const listener = async (data) => {
            console.log('[registerPushToken] Token FCM reçu:', data.value);
            
            // Supprimer le listener
            try {
              await PushNotifications.removeListener(listenerName, listener);
            } catch (err) {
              // Ignorer
            }
            
            const user = await base44.auth.me();
            const token = data.value;

            // Enregistrer le token en backend
            try {
              await base44.functions.invoke('enregistrerTokenPush', {
                token,
                platform: 'android',
                livreur_id: livreurId,
              });
              console.log('[registerPushToken] Token enregistré en DB');
              resolve(token);
            } catch (err) {
              console.error('[registerPushToken] Erreur backend:', err);
              reject(err);
            }
          };

          // Ajouter le listener
          PushNotifications.addListener(listenerName, listener);
          
          // Timeout de sécurité (30s)
          setTimeout(() => {
            console.warn('[registerPushToken] Timeout - aucun token reçu');
            resolve(null);
          }, 30000);
        });

      } catch (error) {
        console.error('[registerPushToken] Erreur FCM:', error);
        throw error;
      }
    }

    // Web (fallback)
    console.log('[registerPushToken] Mode web');
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('[registerPushToken] Notifications web non supportées');
      return null;
    }

    const permission = await requestNotificationPermission();
    if (!permission.granted) {
      console.warn('[registerPushToken] Permission web refusée');
      return null;
    }

    const user = await base44.auth.me();
    const token = `web_${user.email}_${Date.now()}`;

    await base44.functions.invoke('enregistrerTokenPush', {
      token,
      platform: 'web',
      livreur_id: livreurId,
    });

    return token;
  } catch (error) {
    console.error('[registerPushToken] Erreur générale:', error);
    return null;
  }
}

/**
 * Obtenir le token FCM actuel (pour vérification)
 */
export async function getCurrentFCMToken() {
  const env = detectEnvironment();
  
  if (env.isNative && env.os === 'android') {
    const PushNotifications = await getCapacitorPlugin('PushNotifications', '@capacitor/push-notifications');
    
    if (PushNotifications) {
      try {
        const result = await PushNotifications.checkPermissions();
        
        if (result.receive === 'granted' || result.display === 'granted') {
          // Note: Capacitor ne permet pas de récupérer le token directement
          // Il faut le stocker lors de l'enregistrement
          return null; // Sera récupéré depuis la DB
        }
      } catch (error) {
        console.error('Erreur check token:', error);
      }
    }
  }
  
  return null;
}

/**
 * S'abonner aux notifications en temps réel via l'entity Notification
 */
export function subscribeToNotifications(onNotification, userEmail) {
  const unsubscribe = base44.entities.Notification.subscribe((event) => {
    if (event.type === 'create' && event.data.destinataire_email === userEmail) {
      const notification = event.data;
      
      // Afficher la notification
      showLocalNotification(notification.titre, notification.message, {
        tag: `notification-${notification.id}`,
        data: {
          type: notification.type,
          course_id: notification.course_id,
        },
      });

      // Callback
      if (onNotification) {
        onNotification(notification);
      }
    }
  });

  return unsubscribe;
}