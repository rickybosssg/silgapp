import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, X, Phone, MessageSquare, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function VenusIncidentAlertModal() {
  const [alerts, setAlerts] = useState([]);
  const [current, setCurrent] = useState(0);

  const fetchAlerts = async () => {
    try {
      const data = await base44.entities.Notification.filter(
        { type: "incident_detecte", lue: false },
        "-created_date", 10
      );
      setAlerts(data || []);
      if ((data || []).length === 0) setCurrent(0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleDismiss = async () => {
    const alert = alerts[current];
    if (!alert) return;
    try {
      await base44.entities.Notification.update(alert.id, { lue: true });
    } catch (_) {}
    const remaining = alerts.filter((_, i) => i !== current);
    setAlerts(remaining);
    setCurrent(0);
  };

  const handleDismissAll = async () => {
    for (const a of alerts) {
      try {
        await base44.entities.Notification.update(a.id, { lue: true });
      } catch (_) {}
    }
    setAlerts([]);
    setCurrent(0);
  };

  const alert = alerts[current];

  // Extraire les infos depuis le message de notification
  const parseIncident = (msg) => {
    if (!msg) return {};
    const lines = msg.split('\n').filter(l => l.trim());
    const info = {};
    for (const line of lines) {
      if (line.startsWith('Type:')) info.type = line.replace('Type:', '').trim();
      if (line.startsWith('Client:')) info.client = line.replace('Client:', '').trim();
      if (line.startsWith('Téléphone:')) info.telephone = line.replace('Téléphone:', '').trim();
      if (line.startsWith('Course:')) info.courseId = line.replace('Course:', '').trim();
      if (line.startsWith('Livreur:')) info.livreur = line.replace('Livreur:', '').trim();
      if (line.startsWith('Message:')) info.message = line.replace('Message:', '').trim().replace(/^"|"$/g, '');
      if (line.startsWith('Date:')) info.date = line.replace('Date:', '').trim();
    }
    return info;
  };

  const incident = parseIncident(alert?.message);
  const isCritique = alert?.titre?.includes('critique') || alert?.titre?.includes('🚨');

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[96] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className={`bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 ${
              isCritique ? "border-red-500" : "border-orange-400"
            }`}
          >
            {/* Header */}
            <div className={`px-6 py-4 ${isCritique ? "bg-red-50" : "bg-orange-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isCritique ? "bg-red-100" : "bg-orange-100"
                  }`}>
                    <AlertTriangle className={`w-5 h-5 ${isCritique ? "text-red-600" : "text-orange-600"}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">
                      {isCritique ? "🚨 Incident critique détecté" : "⚠️ Incident détecté"}
                    </h3>
                    <p className="text-xs text-gray-500">{incident.type || 'Incident'}</p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {incident.client && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 font-medium min-w-[80px]">Client:</span>
                  <span className="text-gray-900">{incident.client}</span>
                </div>
              )}
              {incident.telephone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{incident.telephone}</span>
                </div>
              )}
              {incident.livreur && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 font-medium min-w-[80px]">Livreur:</span>
                  <span className="text-gray-900">{incident.livreur}</span>
                </div>
              )}
              {incident.message && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Message reçu:</span>
                  </div>
                  <p className="text-sm text-gray-700 italic">"{incident.message}"</p>
                </div>
              )}
              {incident.date && (
                <div className="text-xs text-gray-400">{incident.date}</div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {incident.telephone && (
                  <a
                    href={`https://wa.me/${incident.telephone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Contacter
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                {alerts.length > 1 && (
                  <button
                    onClick={handleDismissAll}
                    className="px-3 py-2 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
                  >
                    Tout ignorer ({alerts.length})
                  </button>
                )}
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  Prendre en charge
                </button>
              </div>
            </div>

            {/* Pagination */}
            {alerts.length > 1 && (
              <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1.5">
                {alerts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === current ? "bg-gray-900" : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}