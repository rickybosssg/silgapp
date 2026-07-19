import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Brain, Target, ListChecks, Wrench, Gauge, MessageSquare, Clock } from 'lucide-react';

export default function ReasoningDetailDialog({ log, onClose }) {
  let infosConnues = {}, infosManquantes = [], outils = [];
  try { infosConnues = log.infos_connues ? JSON.parse(log.infos_connues) : {}; } catch {}
  try { infosManquantes = log.infos_manquantes ? JSON.parse(log.infos_manquantes) : []; } catch {}
  try { outils = log.outils_utilises ? JSON.parse(log.outils_utilises) : []; } catch {}

  let memoireSnapshot = {};
  try { memoireSnapshot = log.memoire_courte_snapshot ? JSON.parse(log.memoire_courte_snapshot) : {}; } catch {}

  const sections = [
    { icon: Target, label: 'Intention détectée', value: log.intention?.replace(/_/g, ' ') },
    { icon: Brain, label: 'Contexte', value: log.contexte?.replace(/_/g, ' ') },
    { icon: ListChecks, label: 'Action choisie', value: log.action_choisie?.replace(/_/g, ' ') },
    { icon: Gauge, label: 'Score de confiance', value: `${log.confiance}%` },
    { icon: Clock, label: 'Temps de traitement', value: `${log.temps_traitement_ms}ms` },
  ];

  return (
    <Dialog open={!!log} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Raisonnement VENUS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message reçu */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">Message du client</span>
            </div>
            <p className="text-sm text-gray-900">"{log.message_recu}"</p>
          </div>

          {/* Sections de raisonnement */}
          <div className="grid grid-cols-2 gap-3">
            {sections.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900 capitalize">{s.value}</div>
                </div>
              );
            })}
          </div>

          {/* Outils utilisés */}
          {outils.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Wrench className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Outils utilisés</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {outils.map((o, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full">{o}</span>
                ))}
              </div>
            </div>
          )}

          {/* Informations manquantes */}
          {infosManquantes.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500">Informations manquantes</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {infosManquantes.map((m, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Mémoire courte snapshot */}
          {Object.keys(memoireSnapshot).length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500">Mémoire courte (snapshot)</span>
              <div className="mt-2 p-3 bg-gray-900 rounded-lg overflow-x-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(memoireSnapshot, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Réponse envoyée */}
          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs text-purple-600 font-medium">Réponse envoyée</span>
            </div>
            <p className="text-sm text-gray-900">{log.reponse_envoyee}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}