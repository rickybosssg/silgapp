import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Database, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LivreursCacheSync() {
  const [lastSync, setLastSync] = useState(null);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('syncLivreursLocaux', {});
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Échec de la synchronisation');
      }
      return result.data;
    },
    onSuccess: (data) => {
      setLastSync(new Date());
      toast.success(`${data.count} codes livreurs synchronisés`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Synchronisation des codes livreurs
        </CardTitle>
        <CardDescription>
          Synchronise tous les codes d'identification des livreurs actifs pour la connexion hors-ligne
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm">
              {syncMutation.isPending ? (
                <span className="flex items-center gap-2 text-blue-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Synchronisation en cours...
                </span>
              ) : lastSync ? (
                <span className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Dernière sync: {lastSync.toLocaleTimeString('fr-FR')}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  Jamais synchronisé
                </span>
              )}
            </p>
          </div>
          
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant={lastSync ? 'outline' : 'default'}
          >
            {syncMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Synchronisation...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Synchroniser
              </>
            )}
          </Button>
        </div>

        {syncMutation.isSuccess && (
          <div className="text-xs text-muted-foreground bg-green-50 p-3 rounded-lg border border-green-200">
            ✅ Synchronisation réussie! Les livreurs peuvent maintenant se connecter avec leur code d'identification.
          </div>
        )}

        {syncMutation.isError && (
          <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
            ❌ {syncMutation.error?.message || 'Erreur de synchronisation'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}