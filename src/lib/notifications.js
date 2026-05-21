import { base44 } from "@/api/base44Client";

/**
 * Demander la permission pour les notifications
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
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
 * Enregistrer le token pour les notifications push
 * Pour le web, on utilise l'API Push (optionnel)
 */
export async function registerPushToken(livreurId = null) {
  try {
    // Vérifier si le navigateur supporte les notifications
    if (!('Notification' in window)) {
      console.warn('Notifications non supportées');
      return null;
    }

    // Demander la permission
    const permission = await requestNotificationPermission();
    if (!permission.granted) {
      console.warn('Permission notifications refusée');
      return null;
    }

    // Pour une vraie implémentation push, il faudrait un service worker
    // Ici on crée un token simple basé sur l'email + timestamp
    const user = await base44.auth.me();
    const token = `web_${user.email}_${Date.now()}`;

    // Enregistrer le token en backend
    await base44.functions.invoke('enregistrerTokenPush', {
      token,
      platform: 'web',
      livreur_id: livreurId,
    });

    return token;
  } catch (error) {
    console.error('Erreur registration push:', error);
    return null;
  }
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