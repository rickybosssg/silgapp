import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, CheckCircle2, XCircle, Loader2, Smartphone, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { requestNotificationPermission, registerPushToken, showLocalNotification } from "@/lib/notifications";

export default function TestNotificationsPush() {
  const [permission, setPermission] = useState('default');
  const [token, setToken] = useState(null);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);

  const addLog = (message) => {
    setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const { data: stats, refetch } = useQuery({
    queryKey: ["notification-stats"],
    queryFn: () => base44.functions.invoke('getNotificationStats', {}),
    enabled: false,
  });

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        addLog('Initialisation...');

        // Vérifier support notifications
        if (!('Notification' in window)) {
          addLog('❌ Notifications non supportées par ce navigateur');
          setError('Notifications non supportées');
          setLoading(false);
          return;
        }
        addLog('✅ Notifications supportées');

        // Auth
        const user = await base44.auth.me();
        if (!user) {
          addLog('❌ Utilisateur non connecté');
          setError('Utilisateur non connecté');
          setLoading(false);
          return;
        }
        addLog(`✅ Connecté: ${user.email}`);

        // Permission
        const perm = Notification.permission || 'default';
        setPermission(perm);
        addLog(`📱 Permission: ${perm}`);

        // Token existant
        try {
          const tokens = await base44.entities.NotificationToken.filter({
            user_email: user.email,
            actif: true,
          });
          addLog(`🔍 Tokens trouvés: ${tokens.length}`);
          
          if (tokens.length > 0) {
            setToken(tokens[0].token);
            addLog('✅ Token chargé');
          } else {
            addLog('ℹ️ Aucun token enregistré');
          }
        } catch (err) {
          addLog(`⚠️ Erreur lecture tokens: ${err.message}`);
        }

        setLoading(false);
      } catch (err) {
        addLog(`❌ Erreur init: ${err.message}`);
        setError(err.message);
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleRequestPermission = async () => {
    try {
      addLog('Demande de permission...');
      const result = await requestNotificationPermission();
      setPermission(result.granted ? 'granted' : 'denied');
      
      if (result.granted) {
        addLog('✅ Permission accordée');
        toast.success('Permission accordée ✅');
        
        try {
          const registeredToken = await registerPushToken();
          if (registeredToken) {
            setToken(registeredToken);
            addLog('✅ Token enregistré');
            toast.success('Token enregistré');
          } else {
            addLog('⚠️ Token non enregistré');
          }
        } catch (err) {
          addLog(`❌ Erreur enregistrement token: ${err.message}`);
          toast.error('Erreur token: ' + err.message);
        }
      } else {
        addLog('❌ Permission refusée');
        toast.error('Permission refusée ❌');
      }
    } catch (err) {
      addLog(`❌ Erreur: ${err.message}`);
      toast.error('Erreur: ' + err.message);
    }
  };

  const handleSendTest = async (type) => {
    setSending(true);
    setTestResult(null);
    addLog(`Envoi test ${type}...`);

    try {
      const user = await base44.auth.me();
      if (!user) {
        throw new Error('Utilisateur non connecté');
      }

      const payload = {
        titre: `Test ${type}`,
        message: `Ceci est un test de notification ${type} envoyé à ${new Date().toLocaleTimeString()}`,
        type: 'test',
        destinataire_email: user.email,
      };

      addLog('Appel fonction envoiNotificationPush...');
      const result = await base44.functions.invoke('envoiNotificationPush', payload);
      addLog(`Résultat: ${result.success ? 'succès' : 'échec'}`);
      
      setTestResult(result);
      
      if (result.success) {
        toast.success('Notification envoyée ✅');
        showLocalNotification(payload.titre, payload.message);
      } else {
        const errorMsg = result.error || result.warning || 'Échec inconnu';
        addLog(`❌ Échec: ${errorMsg}`);
        toast.error(errorMsg);
      }
    } catch (error) {
      addLog(`❌ Erreur: ${error.message}`);
      setTestResult({ error: error.message });
      toast.error('Erreur: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Chargement des notifications...</p>
        <div className="mt-4 text-xs text-muted-foreground max-w-md">
          <p className="font-mono">{debugLogs.slice(-5).map((log, i) => <div key={i}>{log}</div>)}</p>
        </div>
      </div>
    );
  }

  if (error && !token && permission === 'default') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-xl font-bold text-destructive">Erreur de chargement</h1>
        <p className="text-muted-foreground mt-2">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Bell className="w-8 h-8 text-primary" />
        <h1 className="text-2xl font-bold">Test Notifications Push</h1>
      </div>

      {/* Logs de debug */}
      <Card className="p-4 bg-slate-50">
        <h2 className="font-semibold mb-2 text-xs uppercase text-slate-500">Logs de debug</h2>
        <div className="text-xs font-mono text-slate-700 max-h-32 overflow-y-auto">
          {debugLogs.length === 0 ? (
            <p className="text-slate-400">Aucun log</p>
          ) : (
            debugLogs.slice(-10).map((log, i) => (
              <div key={i} className="py-0.5">{log}</div>
            ))
          )}
        </div>
      </Card>

      {/* Statut permission */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Permission Notifications
        </h2>
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={permission === 'granted' ? 'default' : permission === 'denied' ? 'destructive' : 'secondary'}>
            {permission === 'granted' ? '✅ Accordée' : permission === 'denied' ? '❌ Refusée' : '⏳ Non demandée'}
          </Badge>
          {permission !== 'granted' && (
            <Button size="sm" onClick={handleRequestPermission}>
              Demander la permission
            </Button>
          )}
        </div>
        {permission === 'denied' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <AlertTriangle className="w-4 h-4 inline mr-2 text-amber-600" />
            Pour activer les notifications, allez dans les paramètres de votre navigateur et autorisez les notifications pour ce site.
          </div>
        )}
      </Card>

      {/* Token enregistré */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <User className="w-5 h-5" />
          Token Push
        </h2>
        {token ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-700 font-mono break-all">{token}</p>
            <Badge className="mt-2 bg-green-500 text-white text-[10px]">Token actif</Badge>
          </div>
        ) : (
          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
            Aucun token enregistré
          </div>
        )}
      </Card>

      {/* Tests */}
      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Envoyer Notifications Test
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button
            onClick={() => handleSendTest('Admin')}
            disabled={sending}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Test Admin
          </Button>
          <Button
            onClick={() => handleSendTest('Livreur')}
            disabled={sending}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Test Livreur
          </Button>
        </div>
        {testResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.success ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Envoyée avec succès (ID: {testResult.notification_id})
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Échec: {testResult.error || testResult.warning}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Stats */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            Statistiques
          </h2>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Rafraîchir
          </Button>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-700">{stats.stats?.total_tokens || 0}</p>
              <p className="text-xs text-blue-600">Tokens enregistrés</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-purple-700">{stats.stats?.total_notifications || 0}</p>
              <p className="text-xs text-purple-600">Notifications envoyées</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cliquez sur Rafraîchir pour voir les stats</p>
        )}
      </Card>
    </div>
  );
}