import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const COOLDOWN_MS = 30000; // 30s — regroupement des événements similaires
const TOAST_DURATION_MS = 6000; // Auto-dismiss après 6s

const EVENT_TYPE_LABELS = {
  COURSE_CREATED: { singular: "une nouvelle course a été créée", plural: "courses ont été créées récemment" },
  COURSE_ACCEPTED: { singular: "une course a été acceptée", plural: "courses ont été acceptées récemment" },
  COURSE_CANCELLED: { singular: "une course vient d'être annulée", plural: "courses ont été annulées récemment" },
  COURSE_DELIVERED: { singular: "une course vient d'être livrée", plural: "courses ont été livrées récemment" },
  PRICE_CHANGED: { singular: "le prix d'une course a été modifié", plural: "prix de courses ont été modifiés récemment" },
  PAYMENT_RECEIVED: { singular: "un paiement vient d'être enregistré", plural: "paiements ont été enregistrés récemment" },
  DRIVER_DEBT_THRESHOLD: { singular: "un livreur vient de dépasser le seuil de montant dû à SILGAPP", plural: "livreurs ont dépassé le seuil de montant dû à SILGAPP" },
};

export function useVenusAdminNotifications(isAdmin) {
  const queryClient = useQueryClient();
  const [activeToast, setActiveToast] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIdsRef = useRef(new Set());
  const cooldownRef = useRef(new Map()); // event_type → { count, firstEventAt }
  const toastTimeoutRef = useRef(null);

  // Chargement initial : compteur non lus + marquage comme "déjà vus" (pas de toast pour les anciens)
  useEffect(() => {
    if (!isAdmin) return;
    const loadInitial = async () => {
      try {
        const events = await base44.entities.VenusAdminEvent.filter({ status: "new" }, "-created_date", 100);
        setUnreadCount(events?.length || 0);
        events?.forEach(e => seenIdsRef.current.add(e.id));
      } catch {}
    };
    loadInitial();
  }, [isAdmin]);

  // Message groupé déterministe (pas d'IA)
  const buildGroupedMessage = useCallback((eventType, count) => {
    const labels = EVENT_TYPE_LABELS[eventType];
    if (!labels) return `Eric, ${count} événement(s) récent(s).`;
    return count === 1 ? `Eric, ${labels.singular}.` : `Eric, ${count} ${labels.plural}.`;
  }, []);

  // Afficher ou mettre à jour le toast pour P0/P1 — avec cooldown + regroupement
  const showOrUpdateToast = useCallback((evt) => {
    const now = Date.now();
    const existing = cooldownRef.current.get(evt.event_type);

    let count;
    if (existing && (now - existing.firstEventAt) < COOLDOWN_MS) {
      existing.count += 1;
      count = existing.count;
    } else {
      cooldownRef.current.set(evt.event_type, { count: 1, firstEventAt: now });
      count = 1;
    }

    // count=1 → message détaillé ; count>1 → message groupé
    const message = count === 1
      ? (evt.summary?.startsWith("Eric,") ? evt.summary : `Eric, ${evt.summary || evt.title}.`)
      : buildGroupedMessage(evt.event_type, count);

    setActiveToast({ id: now, priority: evt.priority, message, event_type: evt.event_type, count });

    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setActiveToast(null), TOAST_DURATION_MS);
  }, [buildGroupedMessage]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  // Souscription realtime — événements nouveaux
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = base44.entities.VenusAdminEvent.subscribe((event) => {
      if (event.type !== "create") return;
      const evt = event.data;
      if (!evt || seenIdsRef.current.has(evt.id)) return; // Anti-doublon
      seenIdsRef.current.add(evt.id);

      // Incrémenter le compteur non lus
      setUnreadCount(prev => prev + 1);
      // Rafraîchir le panneau immédiatement
      queryClient.invalidateQueries(["venus-admin-events"]);

      // P3 → ne pas interrompre Eric
      if (evt.priority === "P3") return;

      // P0/P1 → toast immédiat avec cooldown + regroupement
      if (evt.priority === "P0" || evt.priority === "P1") {
        showOrUpdateToast(evt);
      }
      // P2 → badge uniquement (compteur déjà incrémenté), pas de toast
    });
    return () => {
      unsubscribe();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [isAdmin, showOrUpdateToast, queryClient]);

  const resetUnread = useCallback(() => setUnreadCount(0), []);

  return { activeToast, unreadCount, dismissToast, resetUnread };
}