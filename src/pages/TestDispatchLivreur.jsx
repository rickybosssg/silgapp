import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Bell, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestDispatchLivreur() {
  const [testResult, setTestResult] = useState(null);
  const [step, setStep] = useState(0);

  const createTestCourse = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('testModalLivreur', {});
      return res.data;
    },
    onSuccess: (data) => {
      setTestResult(data);
      setStep(1);
      toast.success("Course de test créée !");
    },
    onError: (err) => {
      toast.error(err.message || "Échec du test");
    },
  });

  const checkLivreurNotif = useMutation({
    mutationFn: async () => {
      if (!testResult?.course_id) throw new Error("Pas de course de test");
      
      // Vérifier la course
      const course = await base44.entities.CourseExterne.get(testResult.course_id);
      
      // Vérifier notifications
      const notifs = await base44.entities.Notification.filter({
        course_id: testResult.course_id,
        type: "nouvelle_course",
      });

      return { course, notifs };
    },
    onSuccess: (data) => {
      setTestResult(prev => ({ ...prev, check: data }));
      setStep(2);
      toast.success("Vérification effectuée !");
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
            🧪 Test Dispatch Livreur
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Test complet : création course → notification → modal → acceptation
          </p>
        </div>

        {/* Étape 1 : Créer course */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Étape 1 : Créer une course de test
            </CardTitle>
            <CardDescription>
              Crée une course avec dispatch_status="propose" et livreur notifié
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => createTestCourse.mutate()}
              disabled={createTestCourse.isPending}
              className="w-full"
            >
              {createTestCourse.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Création...</>
              ) : "🚀 Créer course de test"}
            </Button>
            
            {testResult && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  ✅ Course créée : {testResult.course_id}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Livreur ID: {testResult.livreur_id}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Notification ID: {testResult.notif_id}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Étape 2 : Vérifier */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Étape 2 : Vérifier notifications
            </CardTitle>
            <CardDescription>
              Vérifie que la course et la notification sont bien créées
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => checkLivreurNotif.mutate()}
              disabled={!testResult?.course_id || checkLivreurNotif.isPending}
              variant="outline"
              className="w-full"
            >
              {checkLivreurNotif.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Vérification...</>
              ) : "🔍 Vérifier état"}
            </Button>

            {testResult?.check && (
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    📋 Course
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Statut: <strong>{testResult.check.course.statut}</strong>
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Dispatch: <strong>{testResult.check.course.dispatch_status}</strong>
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Livreur notifié: <strong>{testResult.check.course.livreur_nom}</strong>
                  </p>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                    🔔 Notifications
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    Count: <strong>{testResult.check.notifs?.length || 0}</strong>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Étape 3 : Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>📱 Instructions pour tester sur mobile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Ouvrez l'APK SILGAPP Livreur sur votre appareil</li>
              <li>Connectez-vous avec le compte livreur test</li>
              <li>Cliquez sur "Créer course de test" ci-dessus</li>
              <li>Attendez 3-5 secondes (polling)</li>
              <li>Le modal devrait s'afficher automatiquement</li>
              <li>Faites une capture d'écran du modal</li>
            </ol>

            {step >= 1 && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  ⚠️ Si le modal ne s'affiche pas :
                </p>
                <ul className="text-xs text-amber-600 dark:text-amber-400 mt-2 space-y-1">
                  <li>• Vérifiez que le livreur est en statut "disponible"</li>
                  <li>• Actualisez l'APK (pull-to-refresh)</li>
                  <li>• Cliquez sur le bouton DEBUG "Voir mes courses"</li>
                  <li>• Partagez la capture du panel DEBUG</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debug rapide */}
        {testResult?.course_id && (
          <Card>
            <CardHeader>
              <CardTitle>🔧 Lien rapide vers course</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                ID: {testResult.course_id}
              </p>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  window.open(`/admin/externe/courses?filter=${testResult.course_id}`, '_blank');
                }}
              >
                Ouvrir dans admin
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}