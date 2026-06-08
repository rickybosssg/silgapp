import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Wifi, MapPin, Bell, Clock, Shield } from "lucide-react";
import { toast } from "sonner";

// Helper pour afficher dynamiquement les icônes
const IconWrapper = ({ icon: Icon, className }) => <Icon className={className} />;

export default function TestSystemeAuto() {
  const [tests, setTests] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('testAuto', { user_type: "client" });
      setTests(res.data);
      toast.success("Tests automatiques complétés ✓");
    } catch (err) {
      toast.error("Erreur tests: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium">Exécution des tests automatiques...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background p-4 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black">Tests Système Automatiques</h1>
          <p className="text-sm text-muted-foreground">Vérification de la configuration GPS/sync</p>
        </div>

        {tests && (
          <>
            {/* Score global */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Résultat Global</h2>
                <Badge variant={tests.pourcentage === "100%" ? "default" : "secondary"}>
                  {tests.statut}
                </Badge>
              </div>
              <div className="text-4xl font-black text-primary mb-2">{tests.pourcentage}</div>
              <p className="text-sm text-muted-foreground">Score: {tests.score}</p>
            </Card>

            {/* Tests détaillés */}
            <div className="grid gap-3">
              {[
                { key: "notifications", label: "Notifications Push", icon: Bell },
                { key: "gps", label: "GPS Actif", icon: MapPin },
                { key: "synchronisation", label: "Synchronisation", icon: Wifi },
                { key: "presence_temps_reel", label: "Présence Temps Réel", icon: Clock },
                { key: "fallback_gps", label: "Fallback GPS", icon: MapPin },
              ].map(({ key, label, icon: Icon }) => (
                <Card key={key} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        tests.tests[key] ? "bg-green-100" : "bg-red-100"
                      }`}>
                        <IconWrapper icon={Icon} className={`w-5 h-5 ${
                          tests.tests[key] ? "text-green-600" : "text-red-600"
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {tests.tests[key] ? "Test réussi" : "Échec du test"}
                        </p>
                      </div>
                    </div>
                    {tests.tests[key] ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Button onClick={runTests} className="w-full">
              <Loader2 className="w-4 h-4 mr-2" />
              Relancer les tests
            </Button>
          </>
        )}
      </div>
    </div>
  );
}