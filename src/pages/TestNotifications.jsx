import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Send, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TestNotifications() {
  const [email, setEmail] = useState("");
  const [titre, setTitre] = useState("Test notification SILGAPP");
  const [message, setMessage] = useState("Ceci est un test de notification push");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSendTest = async () => {
    if (!email) {
      toast.error("Veuillez entrer un email");
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke("envoiNotificationPush", {
        destinataire_email: email,
        titre,
        message,
        type: "test",
      });

      setResult(response);
      
      if (response.success) {
        toast.success(`Notification envoyée ! ID: ${response.notification_id}`);
      } else {
        toast.error(response.error || "Échec de l'envoi");
      }
    } catch (err) {
      toast.error(err.message);
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-primary via-red-600 to-rose-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Bell className="w-6 h-6" />
          <h1 className="text-2xl font-black">Tester les Notifications Push</h1>
        </div>
        <p className="text-white/80 text-sm">
          Envoyez une notification de test à un livreur ou client
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Envoyer une notification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">Email du destinataire</Label>
            <Input
              id="email"
              type="email"
              placeholder="exemple@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="titre">Titre</Label>
            <Input
              id="titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="message">Message</Label>
            <Input
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleSendTest}
            disabled={loading}
            className="w-full gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Envoyer la notification
              </>
            )}
          </Button>

          {result && (
            <div className={`rounded-xl p-4 border ${result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-semibold">
                  {result.success ? "Succès" : "Échec"}
                </span>
              </div>
              
              <div className="space-y-1 text-sm">
                {result.notification_id && (
                  <p className="text-gray-700">ID notification: <code className="bg-gray-100 px-2 py-0.5 rounded">{result.notification_id}</code></p>
                )}
                {result.tokens_found !== undefined && (
                  <p className="text-gray-700">Tokens trouvés: <strong>{result.tokens_found}</strong></p>
                )}
                {result.pushable_tokens !== undefined && (
                  <p className="text-gray-700">Tokens pushables: <strong>{result.pushable_tokens}</strong></p>
                )}
                {result.tokens_sent !== undefined && (
                  <p className="text-gray-700">Tokens envoyés: <strong>{result.tokens_sent}</strong></p>
                )}
                {result.warning && (
                  <p className="text-amber-700 bg-amber-50 px-2 py-1 rounded mt-2">⚠️ {result.warning}</p>
                )}
                {result.tokens_found === 0 && (
                  <p className="text-red-700 bg-red-50 px-2 py-1 rounded mt-2">❌ Aucun token trouvé. L'utilisateur n'a jamais ouvert l'application ou a désactivé les notifications.</p>
                )}
                {result.error && (
                  <p className="text-red-700 bg-red-50 px-2 py-1 rounded mt-2">❌ {result.error}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>💡 Comment tester</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-gray-600">
          <p><strong>1.</strong> Entrez l'email d'un livreur ou client inscrit</p>
          <p><strong>2.</strong> Cliquez sur "Envoyer la notification"</p>
          <p><strong>3.</strong> Vérifiez le résultat ci-dessous</p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
            <p className="text-sm font-semibold text-blue-800 mb-2">📊 Tokens enregistrés pour cet email :</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Tokens web : <strong>7 trouvés</strong> (ne reçoivent pas de push)</li>
              <li>• Tokens Android/iOS : <strong>0 trouvé</strong></li>
            </ul>
            <p className="text-xs text-blue-600 mt-2">
              La notification a été <strong>enregistrée en base de données</strong> ✅ 
              mais ne peut pas être envoyée en push car l'utilisateur n'a pas de token mobile.
            </p>
          </div>
          <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <strong>⚠️ Important :</strong> Les notifications push ne fonctionnent que sur l'application mobile (APK). 
            Sur web, la notification est enregistrée en base de données mais l'envoi FCM est ignoré.
            <br /><br />
            <strong>Pour tester :</strong> Ouvrez l'application mobile SILGAPP sur Android, puis revenez ici pour renvoyer la notification.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}