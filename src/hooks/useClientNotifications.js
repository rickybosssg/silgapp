import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { registerPushToken, subscribeToNotifications, showLocalNotification } from "@/lib/notifications";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

// Types de notifications importantes pour clients/expéditeurs/destinataires
const CLIENT_IMPORTANT_TYPES = [
  "nouvelle_course",
  "course_assignee",
  "course_acceptee",
  "colis_recupere",
  "en_livraison",
  "course_livree",
  "course_bloquee",
  "course_annulee",
  "course_refusee",
  "rappel_reponse",
  "prix_manuel_propose",
];

const TYPE_LABELS = {
  nouvelle_course:  "🆕 Nouvelle course",
  course_assignee:  "🚴 Livreur assigné",
  course_acceptee:  "✅ Course acceptée",
  colis_recupere:   "📦 Colis récupéré",
  en_livraison:     "🚚 En route pour livraison",
  course_livree:    "🎉 Colis livré !",
  course_bloquee:   "⚠️ Course bloquée",
  course_annulee:   "❌ Course annulée",
  course_refusee:   "🔄 Livreur indisponible",
  rappel_reponse:   "⏰ Rappel",
  prix_manuel_propose: "💰 Prix proposé par le livreur",
};

/**
 * Hook pour les notifications clients/expéditeurs/destinataires.
 * Enregistre le token push, s'abonne aux notifications temps réel,
 * et déclenche son + vibration pour les événements importants.
 *
 * @param {string|null} userEmail - Email de l'utilisateur connecté
 * @param {function} [onNotification] - Callback optionnel lors d'une nouvelle notif
 */
export function useClientNotifications(userEmail, onNotification) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userEmail || subscribedRef.current) return;
    subscribedRef.current = true;

    // Enregistrer le token push (même logique que livreur)
    registerPushToken(null, {
      email: userEmail,
      user_email: userEmail,
      user_type: "client",
    }).catch(() => null);

    // S'abonner aux notifications temps réel
    // Note : subscribeToNotifications appelle déjà showLocalNotification en interne
    // → on gère uniquement le toast ici pour éviter le double déclenchement
    const unsub = subscribeToNotifications((notif) => {
      const isImportant = CLIENT_IMPORTANT_TYPES.includes(notif.type);
      const label = TYPE_LABELS[notif.type] || notif.titre;

      // ✅ Son + vibration immédiat — au moment exact de la réception de la notification
      if (isImportant) {
        playNotificationSound();
        navigator.vibrate?.([500, 150, 500, 150, 500]);
      }

      // Toast visible dans l'app — durée plus longue pour les importants
      if (isImportant) {
        toast.success(label, {
          description: notif.message,
          duration: 6000,
        });
      } else {
        toast.info(notif.titre, { description: notif.message, duration: 4000 });
      }

      if (onNotification) onNotification(notif);
    }, userEmail);

    return () => {
      subscribedRef.current = false;
      unsub?.();
    };
  }, [userEmail]);
}