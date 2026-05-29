import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MessageCircle, CheckCircle2, XCircle, Clock, User, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function TestWhatsAppAlertes() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState([]);
  const [testEnCours, setTestEnCours] = useState(false);

  // Récupérer les livreurs
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-test-whatsapp"],
    queryFn: () => base44.entities.Livreur.list(),
    refetchInterval: 5000,
  });

  // Récupérer les dernières notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-test-whatsapp"],
    queryFn: () => base44.entities.Notification.list(undefined, undefined, 20),
    refetchInterval: 3000,
  });

  // Récupérer les alertes WhatsApp
  const { data: alertes = [] } = useQuery({
    queryKey: ["alertes-whatsapp-test"],
    queryFn: () => base44.entities.WhatsAppAlerte.list(undefined, undefined, 50),
    refetchInterval: 3000,
  });

  // Mutation pour simuler un livreur inactif
  const setLivreurInactif = useMutation({
    mutationFn: async (livreurId) => {
      const now = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min dans le passé
      await base44.entities.Livreur.update(livreurId, {
        app_active: false,
        last_seen_at: now,
      });
    },
    onSuccess: () => {
      toast.success("Livreur défini comme INACTIF (app_active=false, last_seen=-5min)");
      queryClient.invalidateQueries({ queryKey: ["livreurs-test-whatsapp"] });
    },
  });

  // Mutation pour simuler un livreur actif
  const setLivreurActif = useMutation({
    mutationFn: async (livreurId) => {
      const now = new Date().toISOString();
      await base44.entities.Livreur.update(livreurId, {
        app_active: true,
        last_seen_at: now,
      });
    },
    onSuccess: () => {
      toast.success("Livreur défini comme ACTIF (app_active=true, last_seen=now)");
      queryClient.invalidateQueries({ queryKey: ["livreurs-test-whatsapp"] });
    },
  });

  // Mutation pour créer une notification test
  const createNotificationTest = useMutation({
    mutationFn: async ({ livreurId, livreurEmail }) => {
      const course = await base44.entities.CourseExterne.create({
        client_nom: "Test WhatsApp",
        client_telephone: "+22600000000",
        type_course: "expedier",
        adresse_depart: "Ouaga 2000",
        adresse_arrivee: "Gounghin",
        statut: "recherche_livreur",
        dispatch_status: "recherche_livreur",
      });

      const notification = await base44.entities.Notification.create({
        titre: "Nouvelle course disponible",
        message: "Une nouvelle course est disponible dans votre secteur",
        type: "nouvelle_course",
        course_id: course.id,
        destinataire_email: livreurEmail,
      });

      return { course, notification };
    },
    onSuccess: (data) => {
      toast.success(`Notification créée ! Course: ${data.course.id}, Notification: ${data.notification.id}`);
      queryClient.invalidateQueries({ queryKey: ["notifications-test-whatsapp"] });
      queryClient.invalidateQueries({ queryKey: ["alertes-whatsapp-test"] });
      
      // Ajouter le log
      setLogs(prev => [{
        timestamp: new Date().toISOString(),
        type: 'notification_created',
        message: `Notification ${data.notification.id} créée pour course ${data.course.id}`,
      }, ...prev].slice(0, 50));
    },
  });

  // Mutation pour reset
  const resetLivreur = useMutation({
    mutationFn: async (livreurId) => {
      await base44.entities.Livreur.update(livreurId, {
        app_active: true,
        last_seen_at: new Date().toISOString(),
        statut: "disponible",
      });
    },
    onSuccess: () => {
      toast.success("Livreur réinitialisé");
      queryClient.invalidateQueries({ queryKey: ["livreurs-test-whatsapp"] });
    },
  });

  const handleTestLivreurActif = (livreur) => {
    setTestEnCours(true);
    setLogs(prev => [{
      timestamp: new Date().toISOString(),
      type: 'test_start',
      message: `=== TEST LIVREUR ACTIF ===`,
    }, ...prev]);

    // 1. Mettre à jour comme actif
    setLivreurActif.mutate(livreur.id, {
      onSuccess: () => {
        setTimeout(() => {
          // 2. Créer notification
          createNotificationTest.mutate({
            livreurId: livreur.id,
            livreurEmail: livreur.user_email,
          }, {
            onSuccess: () => {
              setTimeout(() => {
                // 3. Vérifier alerte
                const alerte = alertes.find(a => 
                  a.livreur_id === livreur.id && 
                  a.statut === 'sent'
                );
                
                if (alerte) {
                  setLogs(prev => [{
                    timestamp: new Date().toISOString(),
                    type: 'error',
                    message: `❌ WhatsApp ENVOYÉ alors que livreur ACTIF (BUG!)`,
                  }, ...prev]);
                  toast.error("BUG: WhatsApp envoyé alors que livreur actif!");
                } else {
                  setLogs(prev => [{
                    timestamp: new Date().toISOString(),
                    type: 'success',
                    message: `✅ WhatsApp BLOQUÉ (livreur actif) - CORRECT!`,
                  }, ...prev]);
                  toast.success("WhatsApp correctement bloqué ✅");
                }
                setTestEnCours(false);
              }, 2000);
            },
          });
        }, 1000);
      },
    });
  };

  const handleTestLivreurInactif = (livreur) => {
    setTestEnCours(true);
    setLogs(prev => [{
      timestamp: new Date().toISOString(),
      type: 'test_start',
      message: `=== TEST LIVREUR INACTIF ===`,
    }, ...prev]);

    // 1. Mettre à jour comme inactif
    setLivreurInactif.mutate(livreur.id, {
      onSuccess: () => {
        setTimeout(() => {
          // 2. Créer notification
          createNotificationTest.mutate({
            livreurId: livreur.id,
            livreurEmail: livreur.user_email,
          }, {
            onSuccess: () => {
              setTimeout(() => {
                // 3. Vérifier alerte
                const alerte = alertes.find(a => 
                  a.livreur_id === livreur.id && 
                  a.statut === 'sent'
                );
                
                if (!alerte) {
                  setLogs(prev => [{
                    timestamp: new Date().toISOString(),
                    type: 'error',
                    message: `❌ WhatsApp NON ENVOYÉ alors que livreur INACTIF (BUG!)`,
                  }, ...prev]);
                  toast.error("BUG: WhatsApp non envoyé alors que livreur inactif!");
                } else {
                  setLogs(prev => [{
                    timestamp: new Date().toISOString(),
                    type: 'success',
                    message: `✅ WhatsApp ENVOYÉ (livreur inactif) - CORRECT! (SID: ${alerte.twilio_sid})`,
                  }, ...prev]);
                  toast.success("WhatsApp correctement envoyé ✅");
                }
                setTestEnCours(false);
              }, 2000);
            },
          });
        }, 1000);
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🧪 Test WhatsApp Alerts</h1>
            <p className="text-gray-500 mt-1">Vérifier que WhatsApp est envoyé uniquement si livreur inactif</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries();
              toast.success("Données rafraîchies");
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraîchir
          </Button>
        </div>

        {/* Livreurs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Livreurs Disponibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {livreurs.filter(l => l.actif !== false).slice(0, 5).map((livreur) => (
                <div key={livreur.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{livreur.nom} {livreur.prenom}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{livreur.user_email}</span>
                        <Badge variant={livreur.app_active ? "default" : "secondary"}>
                          {livreur.app_active ? "✅ Actif" : "❌ Inactif"}
                        </Badge>
                        {livreur.last_seen_at && (
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" />
                            {Math.round((Date.now() - new Date(livreur.last_seen_at).getTime()) / 1000)}s
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestLivreurActif(livreur)}
                      disabled={testEnCours}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                      Test Actif
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestLivreurInactif(livreur)}
                      disabled={testEnCours}
                    >
                      <XCircle className="w-4 h-4 mr-2 text-red-600" />
                      Test Inactif
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resetLivreur.mutate(livreur.id)}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
              {livreurs.length === 0 && (
                <p className="text-gray-500 text-sm">Aucun livreur trouvé</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alertes récentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Alertes WhatsApp Récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertes.slice(0, 10).map((alerte) => (
                <div key={alerte.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={alerte.statut === 'sent' ? 'default' : alerte.statut === 'failed' ? 'destructive' : 'secondary'}>
                      {alerte.statut}
                    </Badge>
                    <span className="text-sm text-gray-600">Livreur: {alerte.livreur_id}</span>
                    {alerte.twilio_sid && (
                      <span className="text-xs text-gray-400">SID: {alerte.twilio_sid}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {alerte.heure_envoi ? new Date(alerte.heure_envoi).toLocaleString() : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Logs de test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Logs de Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500">Aucun log - lancez un test pour voir les logs ici</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-2">
                    <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`ml-2 ${
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'test_start' ? 'text-blue-400' :
                      'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>📋 Instructions de Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p><strong>Test Livreur Actif :</strong> WhatsApp DOIT être BLOQUÉ ✅</p>
            <p><strong>Test Livreur Inactif :</strong> WhatsApp DOIT être ENVOYÉ ✅</p>
            <p><strong>Logs Base44 :</strong> Dashboard → Code → Functions → envoyerAlerteWhatsApp → Logs</p>
            <p><strong>Anti-doublon :</strong> Un seul WhatsApp par course (notification_id)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}