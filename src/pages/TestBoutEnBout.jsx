import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, MapPin, Clock, Banknote, Truck, User, Package } from "lucide-react";
import { toast } from "sonner";

/**
 * TEST DE BOUT EN BOUT - DIAGNOSTIC COMPLET SILGAPP EXTERNE
 * Teste toute la chaîne : GPS, ETA, QR, Distance, Prix, Sync temps réel
 */
export default function TestBoutEnBout() {
  const [tests, setTests] = useState([]);
  const [running, setRunning] = useState(false);
  const [courseTest, setCourseTest] = useState(null);

  const addTest = (name, status, details, critical = false) => {
    setTests(prev => [...prev, { name, status, details, timestamp: new Date().toLocaleTimeString(), critical }]);
  };

  const runAllTests = async () => {
    setRunning(true);
    setTests([]);
    addTest("🚀 Démarrage du diagnostic complet", "running", "Test de toute la chaîne SILGAPP Externe");

    try {
      // ─── TEST 1 : GPS LIVREUR ─────────────────────────────────────────────
      addTest("📍 Test 1 : GPS Livreur", "running", "Vérification position livreurs actifs");
      const livreurs = await base44.entities.Livreur.filter({ type_livreur: "externe", statut: "disponible", app_active: true });
      if (livreurs && livreurs.length > 0) {
        const avecGPS = livreurs.filter(l => l.latitude && l.longitude);
        const gpsFrais = livreurs.filter(l => {
          if (!l.derniere_position_date) return false;
          const age = Date.now() - new Date(l.derniere_position_date).getTime();
          return age < 300000; // 5 min
        });
        addTest(
          "GPS Livreur",
          avecGPS.length > 0 ? "success" : "warning",
          `${avecGPS.length}/${livreurs.length} livreurs avec GPS | ${gpsFrais.length} avec GPS récent (<5min)`,
          true
        );
      } else {
        addTest("GPS Livreur", "error", "Aucun livreur externe disponible avec app_active=true", true);
      }

      // ─── TEST 2 : GPS CLIENT / DESTINATAIRE ───────────────────────────────
      addTest("📍 Test 2 : GPS Client/Destinataire", "running", "Vérification synchronisation GPS");
      const clients = await base44.entities.ClientExterne.filter({ actif: true });
      const avecGPSClient = clients?.filter(c => c.latitude && c.longitude) || [];
      addTest(
        "GPS Client",
        avecGPSClient.length > 0 ? "success" : "warning",
        `${avecGPSClient.length}/${clients?.length || 0} clients avec GPS actif`,
        true
      );

      // ─── TEST 3 : COURSES ACTIVES ─────────────────────────────────────────
      addTest("📦 Test 3 : Courses actives", "running", "Analyse des courses en cours");
      const courses = await base44.entities.CourseExterne.filter({}, "-created_date", 50);
      const actives = courses?.filter(c => !["livree", "annulee"].includes(c.statut)) || [];
      const avecLivreur = actives.filter(c => c.livreur_id);
      const avecGPSDepart = actives.filter(c => c.gps_depart_lat && c.gps_depart_lng);
      const avecGPSArrivee = actives.filter(c => c.gps_arrivee_lat && c.gps_arrivee_lng);
      const avecQR = actives.filter(c => c.pickup_qr_token && c.delivery_qr_token);
      
      addTest("Courses actives", "success", `${actives.length} courses | ${avecLivreur.length} avec livreur`, true);
      addTest("GPS Départ", avecGPSDepart.length > 0 ? "success" : "error", `${avecGPSDepart.length}/${actives.length} avec GPS départ`, true);
      addTest("GPS Arrivée", avecGPSArrivee.length > 0 ? "success" : "error", `${avecGPSArrivee.length}/${actives.length} avec GPS arrivée`, true);
      addTest("QR Codes", avecQR.length > 0 ? "success" : "warning", `${avecQR.length}/${actives.length} avec QR générés`, true);

      // ─── TEST 4 : ETA LIVREUR ─────────────────────────────────────────────
      addTest("⏱️ Test 4 : ETA Livreur", "running", "Vérification calcul ETA");
      if (avecLivreur.length > 0) {
        const courseAvecETA = avecLivreur.find(c => 
          c.statut === "livreur_en_route" && 
          c.gps_depart_lat && 
          c.livreur_id
        );
        
        if (courseAvecETA) {
          // Récupérer le livreur pour vérifier son GPS
          const livreur = await base44.entities.Livreur.filter({ id: courseAvecETA.livreur_id }).then(r => r?.[0]);
          if (livreur?.latitude && livreur?.longitude) {
            const distance = haversine(
              livreur.latitude, livreur.longitude,
              courseAvecETA.gps_depart_lat, courseAvecETA.gps_depart_lng
            );
            const eta = Math.round((distance / 25) * 60);
            addTest(
              "ETA Calcul",
              "success",
              `Distance: ${distance.toFixed(2)} km | ETA: ~${eta} min`,
              true
            );
          } else {
            addTest("ETA Calcul", "error", "Livreur sans GPS actif - ETA impossible", true);
          }
        } else {
          addTest("ETA Calcul", "warning", "Aucune course en phase 'livreur_en_route' pour tester", false);
        }
      } else {
        addTest("ETA Calcul", "warning", "Aucune course avec livreur assigné", false);
      }

      // ─── TEST 5 : DISTANCE RÉELLE & PRIX ──────────────────────────────────
      addTest("💰 Test 5 : Distance réelle & Prix", "running", "Vérification calculs post-livraison");
      const livrees = courses?.filter(c => c.statut === "livree") || [];
      const avecDistance = livrees.filter(c => c.distance_reelle_km > 0);
      const avecPrix = livrees.filter(c => c.prix_final > 0);
      const avecCommission = livrees.filter(c => c.commission_silga > 0 && c.montant_livreur > 0);
      
      if (livrees.length > 0) {
        addTest("Courses livrées", "success", `${livrees.length} courses terminées`, true);
        addTest("Distance réelle", avecDistance.length > 0 ? "success" : "error", `${avecDistance.length}/${livrees.length} avec distance`, true);
        addTest("Prix final", avecPrix.length > 0 ? "success" : "error", `${avecPrix.length}/${livrees.length} avec prix`, true);
        addTest("Commission Silga", avecCommission.length > 0 ? "success" : "error", `${avecCommission.length}/${livrees.length} avec commission`, true);
        
        // Vérifier incohérences
        const incoherences = livrees.filter(c => {
          const dist = c.distance_reelle_km || 0;
          const prix = c.prix_final || 0;
          const attendu = Math.round(dist * 100);
          return prix > 0 && attendu > 0 && Math.abs(prix - attendu) > 50; // Tolérance 50F
        });
        if (incoherences.length > 0) {
          addTest("⚠️ Incohérences prix", "error", `${incoherences.length} courses avec prix incohérent (distance×100 ≠ prix_final)`, true);
        }
      } else {
        addTest("Distance & Prix", "warning", "Aucune course livrée pour tester les calculs", false);
      }

      // ─── TEST 6 : SYNCHRONISATION TEMPS RÉEL ──────────────────────────────
      addTest("🔄 Test 6 : Synchronisation temps réel", "running", "Vérification polling et mises à jour");
      const courseRecente = courses?.[0];
      if (courseRecente) {
        const age = Date.now() - new Date(courseRecente.updated_date).getTime();
        addTest(
          "Dernière mise à jour",
          age < 60000 ? "success" : "warning",
          `Course #${courseRecente.id?.slice(-6)} mise à jour il y a ${Math.round(age/1000)}s`,
          true
        );
      }

      // ─── TEST 7 : QR CODES ────────────────────────────────────────────────
      addTest("📱 Test 7 : QR Codes", "running", "Vérification génération et validation");
      if (avecQR.length > 0) {
        const sample = avecQR[0];
        const pickupConfirmee = sample.pickup_confirmed_at;
        const deliveryConfirmee = sample.delivery_confirmed_at;
        addTest("QR Pickup", pickupConfirmee ? "success" : "warning", 
          pickupConfirmee ? `Confirmée à ${new Date(pickupConfirmee).toLocaleTimeString()}` : "En attente", false);
        addTest("QR Delivery", deliveryConfirmee ? "success" : "warning", 
          deliveryConfirmee ? `Confirmée à ${new Date(deliveryConfirmee).toLocaleTimeString()}` : "En attente", false);
      } else {
        addTest("QR Codes", "warning", "Aucune course avec QR pour tester", false);
      }

      // ─── TEST 8 : RÔLES & SYNCHRONISATION ─────────────────────────────────
      addTest("👥 Test 8 : Rôles & Synchronisation", "running", "Vérification expéditeur/destinataire");
      const expedier = courses?.filter(c => c.type_course === "expedier") || [];
      const recevoir = courses?.filter(c => c.type_course === "recevoir") || [];
      
      const expedierAvecDestinataire = expedier.filter(c => c.destinataire_client_id);
      const recevoirAvecExpediteur = recevoir.filter(c => c.expediteur_client_id);
      
      addTest("Type Expédier", "success", `${expedier.length} courses | ${expedierAvecDestinataire.length} avec destinataire lié`, true);
      addTest("Type Recevoir", "success", `${recevoir.length} courses | ${recevoirAvecExpediteur.length} avec expéditeur lié`, true);

      // ─── TEST 9 : UI BUGS ─────────────────────────────────────────────────
      addTest("🐛 Test 9 : UI Bugs (zéros, undefined, null)", "running", "Recherche valeurs parasites");
      const uiBugs = [];
      
      // Vérifier courses avec valeurs nulles affichées
      courses?.forEach(c => {
        if (c.prix_estimate === 0) uiBugs.push(`Course #${c.id?.slice(-6)}: prix_estimate = 0`);
        if (c.prix_final === 0) uiBugs.push(`Course #${c.id?.slice(-6)}: prix_final = 0`);
        if (c.distance_reelle_km === 0) uiBugs.push(`Course #${c.id?.slice(-6)}: distance = 0`);
      });
      
      if (uiBugs.length > 0) {
        addTest("UI Bugs", "error", `${uiBugs.length} valeurs suspectes trouvées : ${uiBugs.slice(0, 3).join(" | ")}`, true);
      } else {
        addTest("UI Bugs", "success", "Aucune valeur parasite détectée", false);
      }

      // ─── TEST 10 : ADMIN DASHBOARD ────────────────────────────────────────
      addTest("📊 Test 10 : Admin Dashboard", "running", "Vérification données admin");
      const today = new Date().toDateString();
      const coursesToday = courses?.filter(c => new Date(c.created_date).toDateString() === today) || [];
      const caToday = coursesToday
        .filter(c => c.statut === "livree")
        .reduce((sum, c) => sum + (c.prix_final || 0), 0);
      
      addTest("Courses du jour", "success", `${coursesToday.length} courses créées aujourd'hui`, true);
      addTest("CA du jour", "success", `${caToday.toLocaleString()} FCFA`, true);

      addTest("✅ Diagnostic terminé", "success", "Tous les tests sont complétés", true);

    } catch (error) {
      addTest("❌ Erreur critique", "error", error.message, true);
    }

    setRunning(false);
    toast.success("Diagnostic complet terminé");
  };

  // Haversine
  function haversine(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🔍 Diagnostic Complet SILGAPP Externe</h1>
          <p className="text-sm text-muted-foreground">Test de bout en bout : GPS, ETA, QR, Distance, Prix, Sync</p>
        </div>
        <Button 
          onClick={runAllTests} 
          disabled={running}
          className="gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {running ? "Tests en cours..." : "Lancer le diagnostic"}
        </Button>
      </div>

      {/* Résultats */}
      <div className="space-y-2">
        {tests.map((test, i) => (
          <Card key={i} className={`p-4 border-l-4 ${
            test.status === "success" ? "border-l-green-500 bg-green-50" :
            test.status === "error" ? "border-l-red-500 bg-red-50" :
            test.status === "warning" ? "border-l-yellow-500 bg-yellow-50" :
            "border-l-blue-500 bg-blue-50"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                {test.status === "success" ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                 test.status === "error" ? <XCircle className="w-5 h-5 text-red-600" /> :
                 test.status === "warning" ? <AlertTriangle className="w-5 h-5 text-yellow-600" /> :
                 <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">{test.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {test.timestamp}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{test.details}</p>
                {test.critical && (
                  <Badge className="mt-1 bg-red-100 text-red-700 border-red-300 text-[10px]">
                    Critique
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {tests.length === 0 && (
        <Card className="p-8 text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Cliquez sur "Lancer le diagnostic" pour tester toute la chaîne SILGAPP Externe
          </p>
        </Card>
      )}
    </div>
  );
}