import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ReasoningDetailDialog from './ReasoningDetailDialog.jsx';
import { Brain, ChevronRight, Zap } from 'lucide-react';

const INTENTION_COLORS = {
  creer_course: 'bg-green-100 text-green-700',
  suivre_course: 'bg-blue-100 text-blue-700',
  contacter_livreur: 'bg-purple-100 text-purple-700',
  annuler_course: 'bg-red-100 text-red-700',
  modifier_info: 'bg-yellow-100 text-yellow-700',
  demander_info: 'bg-indigo-100 text-indigo-700',
  salutation: 'bg-gray-100 text-gray-700',
  clarifier: 'bg-orange-100 text-orange-700',
  autre: 'bg-gray-100 text-gray-700',
};

const ACTION_LABELS = {
  poser_question: 'Question posée',
  creer_course: 'Course créée',
  suivre_course: 'Suivi de course',
  contacter_livreur: 'Contact livreur',
  annuler_course: 'Course annulée',
  repondre_info: 'Info répondue',
  clarifier: 'Clarification',
  saluer: 'Salutation',
};

export default function ReasoningLogTab() {
  const [selectedLog, setSelectedLog] = useState(null);
  const [filterIntent, setFilterIntent] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['venus-reasoning-logs', filterIntent],
    queryFn: async () => {
      const filter = filterIntent ? { intention: filterIntent } : {};
      return await base44.entities.VenusReasoningLog.filter(filter, '-date_traitement', 50);
    },
    refetchInterval: 10000,
  });

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-3 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterIntent('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              !filterIntent ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tous
          </button>
          {Object.keys(INTENTION_COLORS).map(intent => (
            <button
              key={intent}
              onClick={() => setFilterIntent(intent === filterIntent ? '' : intent)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                filterIntent === intent ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {intent.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun raisonnement enregistré</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <button
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="w-full text-left p-4 hover:bg-gray-50 transition-all flex items-start gap-3"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${INTENTION_COLORS[log.intention] || 'bg-gray-100'}`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{log.client_nom || log.client_telephone}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{log.date_traitement ? new Date(log.date_traitement).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                  <div className="text-sm text-gray-600 truncate mb-1">"{log.message_recu}"</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${INTENTION_COLORS[log.intention] || 'bg-gray-100'}`}>
                      {log.intention?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {ACTION_LABELS[log.action_choisie] || log.action_choisie}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      log.confiance >= 80 ? 'bg-green-100 text-green-700' :
                      log.confiance >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {log.confiance}% confiance
                    </span>
                    <span className="text-xs text-gray-400">{log.temps_traitement_ms}ms</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedLog && (
        <ReasoningDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}