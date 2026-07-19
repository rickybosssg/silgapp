import React from 'react';
import { Workflow, ToggleLeft, ToggleRight, Package, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = {
  course: { label: 'Course', color: 'bg-blue-100 text-blue-700' },
  livraison: { label: 'Livraison', color: 'bg-green-100 text-green-700' },
  paiement: { label: 'Paiement', color: 'bg-yellow-100 text-yellow-700' },
  partenaire: { label: 'Partenaire', color: 'bg-purple-100 text-purple-700' },
  support: { label: 'Support', color: 'bg-red-100 text-red-700' },
  programmation: { label: 'Programmation', color: 'bg-indigo-100 text-indigo-700' },
  communication: { label: 'Communication', color: 'bg-cyan-100 text-cyan-700' },
};

export default function WorkflowListTab({ workflows, loading, onEdit, onRefresh }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-3">Aucun workflow trouvé. Cliquez sur « Initialiser » pour charger les 12 workflows pré-construits.</p>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" /> Rafraîchir
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{workflows.length} workflow{workflows.length > 1 ? 's' : ''} configuré{workflows.length > 1 ? 's' : ''}</p>
        <Button onClick={onRefresh} variant="ghost" size="sm">
          <RefreshCw className="w-4 h-4" /> Rafraîchir
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workflows.map((wf) => {
          const cat = CATEGORIES[wf.categorie] || CATEGORIES.course;
          let nbEtapes = 0;
          try { nbEtapes = JSON.parse(wf.etapes || '[]').length; } catch {}
          return (
            <div
              key={wf.id}
              onClick={() => onEdit(wf.code)}
              className="bg-white rounded-xl border border-border p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Workflow className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{wf.nom}</h3>
                    <code className="text-[10px] text-muted-foreground">{wf.code}</code>
                  </div>
                </div>
                {wf.actif ? (
                  <ToggleRight className="w-5 h-5 text-green-500" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{wf.description}</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Package className="w-3 h-3 mr-1" />
                  {nbEtapes} étapes
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}