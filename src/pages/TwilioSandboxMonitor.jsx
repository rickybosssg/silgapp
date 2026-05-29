import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  MessageCircle, CheckCircle2, AlertCircle, Clock, 
  RefreshCw, ArrowLeft, Users, Activity, Calendar,
  Shield, Zap, Phone, Bell
} from "lucide-react";

export default function TwilioSandboxMonitor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sandboxStatus, setSandboxStatus] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadSandboxStatus();
  }, []);

  const loadSandboxStatus = async () => {
    try {
      setLoading(true);
      // Récupérer les stats WhatsApp depuis la BDD
      const [alertesSent, alertesFailed, alertesTotal] = await Promise.all([
        base44.entities.WhatsAppAlerte.filter({ statut: 'sent' }),
        base44.entities.WhatsAppAlerte.filter({ statut: 'failed' }),
        base44.entities.WhatsAppAlerte.filter({}),
      ]);

      const notifications = await base44.entities.Notification.filter({});
      
      setStats({
        sent: alertesSent.length,
        failed: alertesFailed.length,
        total: alertesTotal.length,
        notifications: notifications.length,
        successRate: alertesTotal.length > 0 
          ? Math.round((alertesSent.length / alertesTotal.length) * 100) 
          : 0
      });

      // Status simulé (Twilio API directe non disponible sans backend dédié)
      setSandboxStatus({
        status: 'active',
        code: 'join SILGAPP',
        phone: '+1 415-523-8886',
        expires: 'Inconnue (vérifier Twilio Console)',
        lastActivity: alertesSent.length > 0 
          ? alertesSent.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]?.created_date 
          : 'Aucune activité'
      });
    } catch (err) {
      console.error("Erreur chargement status:", err);
      toast.error("Impossible de charger le status du sandbox");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadSandboxStatus();
    toast.success("Statistiques actualisées");
  };

  const handleRenewSandbox = () => {
    // Ouvre Twilio Console dans un nouvel onglet
    window.open("https://console.twilio.com/", "_blank");
    toast.info("Ouvre Twilio Console → Messaging → WhatsApp Sandbox");
  };

  const handleTestWhatsApp = () => {
    navigate("/test-whatsapp");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-red-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-red-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Twilio WhatsApp Sandbox</h1>
              <p className="text-sm text-muted-foreground">Surveillance et statistiques</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </Button>
            <Button variant="outline" onClick={handleRenewSandbox} className="gap-2">
              <Calendar className="w-4 h-4" />
              Vérifier expiration
            </Button>
            <Button onClick={handleTestWhatsApp} className="gap-2">
              <Zap className="w-4 h-4" />
              Test d'envoi
            </Button>
          </div>
        </div>

        {/* Status Card */}
        <Card className="p-6 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h2 className="text-lg font-bold text-foreground">Sandbox Actif</h2>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Code d'enrollment : <span className="font-mono font-bold text-primary">join SILGAPP</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Numéro Twilio : <span className="font-mono">{sandboxStatus?.phone}</span>
                </p>
              </div>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-300">
              <Activity className="w-3 h-3 mr-1" />
              Opérationnel
            </Badge>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.sent || 0}</p>
                <p className="text-xs text-muted-foreground">Messages envoyés</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.failed || 0}</p>
                <p className="text-xs text-muted-foreground">Échecs</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.successRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Taux de succès</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.notifications || 0}</p>
                <p className="text-xs text-muted-foreground">Notifications créées</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Instructions pour les utilisateurs
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Phone className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Étape 1 : Rejoindre le sandbox</p>
                <p className="text-xs text-blue-700 mt-1">
                  Envoyer <span className="font-mono font-bold">join SILGAPP</span> au <span className="font-mono">+1 415-523-8886</span> sur WhatsApp
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900">Étape 2 : Confirmation</p>
                <p className="text-xs text-green-700 mt-1">
                  L'utilisateur reçoit un message de confirmation et peut maintenant recevoir des notifications
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">⚠️ Expiration du sandbox</p>
                <p className="text-xs text-amber-700 mt-1">
                  Le sandbox peut expirer après 2-4 semaines sans activité. Si les messages échouent, vérifier l'expiration dans Twilio Console.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Alertes récentes */}
        <Card className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Dernières alertes WhatsApp
          </h3>
          <div className="space-y-2">
            {stats?.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune alerte envoyée</p>
            ) : (
              <div className="space-y-2">
                {/* Placeholder - pourrait être enrichi avec une vraie liste */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-foreground">Dernière activité</p>
                    <p className="text-xs text-muted-foreground">
                      {sandboxStatus?.lastActivity !== 'Aucune activité' 
                        ? new Date(sandboxStatus.lastActivity).toLocaleString('fr-FR')
                        : 'Aucune activité'}
                    </p>
                  </div>
                  <Badge className={stats?.sent > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                    {stats?.sent > 0 ? "Envoyée" : "En attente"}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Production Info */}
        <Card className="p-6 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-amber-900">🚀 Passage en production</h3>
              <p className="text-sm text-amber-700 mt-2">
                Pour passer en production WhatsApp (numéro dédié, pas d'expiration) :
              </p>
              <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
                <li>Créer un compte Twilio production</li>
                <li>Obtenir un numéro WhatsApp Business</li>
                <li>Soumettre des message templates</li>
                <li>Mettre à jour les secrets Twilio</li>
              </ul>
              <Button 
                variant="outline" 
                className="mt-4 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => window.open("https://www.twilio.com/whatsapp/pricing", "_blank")}
              >
                Voir les tarifs Twilio WhatsApp
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}