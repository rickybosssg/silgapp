import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageCircle, CheckCircle2, AlertCircle, Clock,
  RefreshCw, ArrowLeft, Users, Activity, Zap, Bell,
  UserCheck, UserX, Copy, ExternalLink
} from "lucide-react";

const SANDBOX_NUMERO = "+14155238886";
const SANDBOX_CODE = "join rise-bit";

export default function TwilioSandboxMonitor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [livreurs, setLivreurs] = useState([]);
  const [alertesRecentes, setAlertesRecentes] = useState([]);

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    try {
      setLoading(true);
      const [
        livreursExternes,
        alertesSent,
        alertesFailed,
        alertesAll,
      ] = await Promise.all([
        base44.entities.Livreur.filter({ type_livreur: 'externe', actif: true }),
        base44.entities.WhatsAppAlerte.filter({ statut: 'sent' }),
        base44.entities.WhatsAppAlerte.filter({ statut: 'failed' }),
        base44.entities.WhatsAppAlerte.list('-created_date', 20),
      ]);

      const inscrits = livreursExternes.filter(l => l.whatsapp_opt_in === true);
      const nonInscrits = livreursExternes.filter(l => !l.whatsapp_opt_in);

      // Dernière erreur 63015 dans les alertes
      const dernierEchec = alertesFailed
        .filter(a => a.erreur?.includes('63015'))
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

      const dernierSucces = alertesSent
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

      setStats({
        total_livreurs: livreursExternes.length,
        inscrits: inscrits.length,
        non_inscrits: nonInscrits.length,
        messages_envoyes: alertesSent.length,
        messages_echecs: alertesFailed.length,
        taux_succes: (alertesSent.length + alertesFailed.length) > 0
          ? Math.round((alertesSent.length / (alertesSent.length + alertesFailed.length)) * 100)
          : 0,
        derniere_erreur_63015: dernierEchec,
        derniere_notif: dernierSucces,
      });

      setLivreurs(livreursExternes);
      setAlertesRecentes(alertesAll);
    } catch (err) {
      toast.error("Erreur chargement données");
    } finally {
      setLoading(false);
    }
  };

  const handleCopierCode = () => {
    navigator.clipboard.writeText(SANDBOX_CODE);
    toast.success("Code copié !");
  };

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">WhatsApp Sandbox</h1>
              <p className="text-sm text-muted-foreground">État des opt-ins livreurs</p>
            </div>
          </div>
          <Button variant="outline" onClick={chargerDonnees} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </Button>
        </div>

        {/* Sandbox Info */}
        <Card className="p-5 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <h2 className="font-bold text-foreground">Sandbox Actif</h2>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Opérationnel</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Numéro : <span className="font-mono font-bold">{SANDBOX_NUMERO}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Code : <span className="font-mono font-bold text-primary">{SANDBOX_CODE}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopierCode} className="gap-2">
                <Copy className="w-3.5 h-3.5" /> Copier code
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(`https://wa.me/${SANDBOX_NUMERO.replace('+','')}?text=${encodeURIComponent(SANDBOX_CODE)}`, "_blank")} className="gap-2">
                <ExternalLink className="w-3.5 h-3.5" /> Ouvrir WhatsApp
              </Button>
            </div>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{stats?.inscrits ?? 0}</p>
                <p className="text-xs text-muted-foreground">Livreurs inscrits</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                <UserX className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats?.non_inscrits ?? 0}</p>
                <p className="text-xs text-muted-foreground">Non inscrits</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.messages_envoyes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Messages envoyés</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.taux_succes ?? 0}%</p>
                <p className="text-xs text-muted-foreground">Taux de succès</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Dernière erreur + Dernière notif */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Dernière erreur 63015
            </p>
            {stats?.derniere_erreur_63015 ? (
              <div>
                <p className="text-sm font-medium text-red-700">Opt-in expiré détecté</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(stats.derniere_erreur_63015.created_date)}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{stats.derniere_erreur_63015.livreur_telephone}</p>
              </div>
            ) : (
              <p className="text-sm text-green-600 font-medium">✅ Aucune erreur récente</p>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-green-500" /> Dernière notification envoyée
            </p>
            {stats?.derniere_notif ? (
              <div>
                <p className="text-sm font-medium text-green-700">Message délivré</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(stats.derniere_notif.created_date)}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{stats.derniere_notif.livreur_telephone}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune notification envoyée</p>
            )}
          </Card>
        </div>

        {/* Liste livreurs avec statut WhatsApp */}
        <Card className="p-5">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Livreurs externes ({livreurs.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {livreurs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun livreur externe</p>
            ) : livreurs.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${l.whatsapp_opt_in ? 'bg-green-500' : 'bg-gray-400'}`}>
                    {l.nom?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{l.prenom} {l.nom}</p>
                    <p className="text-xs text-muted-foreground font-mono">{l.telephone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {l.whatsapp_opt_in ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Inscrit
                    </Badge>
                  ) : (
                    <Badge className="bg-red-50 text-red-600 border-red-200 text-xs gap-1">
                      <AlertCircle className="w-3 h-3" /> Non inscrit
                    </Badge>
                  )}
                  {l.whatsapp_derniere_erreur === '63015' && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Expiré</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Info migration */}
        <Card className="p-5 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-amber-900">Limite Sandbox</h3>
              <p className="text-sm text-amber-700 mt-1">
                L'opt-in Sandbox expire après <strong>72h d'inactivité</strong>. Les livreurs doivent renvoyer <code className="bg-amber-100 px-1 rounded font-mono">join rise-bit</code> pour réactiver.
                Pour une solution permanente, migrez vers <strong>WhatsApp Business Production</strong>.
              </p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}