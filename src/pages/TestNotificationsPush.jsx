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
  const [permission, setPermission] = useState(Notification?.permission || 'default');
  const [token, setToken] = useState(null);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const { data: stats, refetch } = useQuery({
    queryKey: ["notification-stats"],
    queryFn: () => base44.functions.invoke('getNotificationStats', {}),
    enabled: false,
  });

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      if (!user) return;

      // Vérifier permission
      setPermission(Notification?.permission || 'default');

      // Récupérer token existant
      const tokens = await base44.entities.NotificationToken.filter({
        user_email: user.email,
        actif: true,
      });

      if (tokens.length > 0) {
        setToken(tokens[0].token);
      }
    });
  }, []);

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result.granted ? 'granted' : 'denied');
    
    if (result.granted) {
      toast.success('Permission accordée ✅');
      const registeredToken = await registerPushToken();
      setToken(registeredToken);
      toast.success('Token enregistré');
    } else {
      toast.error('Permission refusée ❌');
    }
  };

  const handleSendTest = async (type) => {
    setSending(true);
    setTestResult(null);

    try {
      const user = await base44.auth.me();
      const payload = {
        titre: `Test ${type}`,
        message: `Ceci est un test de notification ${type} envoyé à ${new Date().toLocaleTimeString()}`,
        type: 'test',
        destinataire_email: user.email,
      };

      const result = await base44.functions.invoke('envoiNotificationPush', payload);
      setTestResult(result);
      
      if (result.success) {
        toast.success('Notification envoyée ✅');
        // Afficher aussi en local
        showLocalNotification(payload.titre, payload.message);
      } else {
        toast.error(result.error || 'Échec de l\'envoi');
      }
    } catch (error) {
      setTestResult({ error: error.message });
      toast.error('Erreur: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Bell className="w-8 h-8 text-primary" />
        <h1 className="text-2xl font-bold">Test Notifications Push</h1>
      </div>

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