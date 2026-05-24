import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Database, 
  Server, 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';
import { APP_PUBLIC_URL, BASE44_APP_ID } from '@/lib/app-params';
import { isCapacitorAvailable } from '@/lib/capacitorStorage';

export default function DiagnosticBase44() {
  const [capacitorInfo, setCapacitorInfo] = useState({
    isNative: false,
    platform: 'unknown'
  });

  useEffect(() => {
    setCapacitorInfo({
      isNative: isCapacitorAvailable(),
      platform: isCapacitorAvailable() ? 'native' : 'web'
    });
  }, []);

  const { data: livreurs, isLoading: isLoadingLivreurs, error: livreursError } = useQuery({
    queryKey: ['diagnostic-livreurs'],
    queryFn: () => base44.entities.Livreur.list('-created_date', 100),
  });

  const { data: userInfo, isLoading: isLoadingUser } = useQuery({
    queryKey: ['diagnostic-user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        console.error('[Diagnostic] Auth error:', error);
        return null;
      }
    },
  });

  const configInfo = {
    appId: BASE44_APP_ID,
    publicUrl: APP_PUBLIC_URL,
    isCapacitor: capacitorInfo.isNative,
    platform: capacitorInfo.platform,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
    href: typeof window !== 'undefined' ? window.location.href : 'N/A',
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Diagnostic Base44</h1>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="icon"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Environment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Configuration Base44
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">App ID</p>
                <p className="font-mono text-sm">{configInfo.appId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plateforme</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={configInfo.isCapacitor ? 'default' : 'secondary'}>
                    {configInfo.isCapacitor ? 'APK (Native)' : 'Web (Preview)'}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Public URL</p>
                <p className="font-mono text-xs truncate">{configInfo.publicUrl}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hostname</p>
                <p className="font-mono text-xs">{configInfo.hostname}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Utilisateur Actuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUser ? (
              <p className="text-muted-foreground">Chargement...</p>
            ) : userInfo ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="font-medium">{userInfo.full_name}</span>
                  <Badge>{userInfo.role}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{userInfo.email}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="w-4 h-4" />
                <span>Non authentifié</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Livreurs Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Données Livreurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingLivreurs ? (
              <p className="text-muted-foreground">Chargement des livreurs...</p>
            ) : livreursError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Erreur: {livreursError.message}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="font-medium">{livreurs?.length || 0} livreurs trouvés</span>
                  </div>
                  <Badge variant="outline">
                    Source: {configInfo.isCapacitor ? 'Capacitor' : 'Web'}
                  </Badge>
                </div>

                {livreurs && livreurs.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <p className="text-sm font-medium">Liste des livreurs:</p>
                    <div className="grid gap-2">
                      {livreurs.map((livreur, idx) => (
                        <div
                          key={livreur.id}
                          className="p-3 bg-muted rounded-lg border border-border"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {livreur.prenom} {livreur.nom}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {livreur.telephone} • {livreur.quartier}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge variant={livreur.actif ? 'default' : 'destructive'}>
                                {livreur.actif ? 'Actif' : 'Inactif'}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                Code: {livreur.code_identification || 'Aucun'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {livreurs && livreurs.length === 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Aucun livreur trouvé dans cette base de données. Vérifiez que vous êtes connecté au bon workspace Base44.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debug Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Informations Techniques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 gap-2 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">User Agent:</span>
                <p className="break-all">{configInfo.userAgent}</p>
              </div>
              <div>
                <span className="text-muted-foreground">URL complète:</span>
                <p className="break-all">{configInfo.href}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}