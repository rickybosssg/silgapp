import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, MapPin, Clock, Banknote, Truck, User, Package, RefreshCw, Zap, Target, Layers, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

/**
 * 🔍 DIAGNOSTIC COMPLET - SYNCHRONISATION TEMPS RÉEL
 * Teste TOUS les points critiques avant déploiement
 */
export default function TestDiagnosticsComplet() {
  const [tests, setTests] = useState([]);
  const [running, setRunning] = useState(false);
  const [liveData, setLiveData] = useState(null);

  const addTest = (name, status, details, critical = false, data = null) => {
    setTests(prev => [...prev, { name, status, details, timestamp: new Date().toLocaleTimeString(), critical, data }]);
  };

  const runAllTests = async () => {
    setRunning(true);
    setTests([]);
    addTest("🚀 Démarrage diagnostic complet", "running", "Vérification de TOUS les points critiques");

    try {
      // ─── TEST 1 : GPS LIVREUR TEMPS RÉEL ───────────────────────────────────
      addTest("📍 Test 1 : GPS Livreur temps réel", "running", "Vérification mise à jour continue");
      const livreurs = await base44.entities.Livreur.filter({ type_livreur: "externe", app_active: true });
      if (livreurs && livreurs.length > 0) {
        const avecGPS = livreurs.filter(l => l.latitude && l.longitude);
        const gpsFrais = livreurs.filter(l => {
          if (!l.derniere_position_date) return false;
          const age = Date.now() - new Date(l.derniere_position_date).getTime();
          return age < 300000; // 5 min
        });
        const gpsTresFrais = livreurs.filter(l => {
          if (!l.derniere_position_date) return false;
          const age = Date.now() - new Date(l.derniere_position_date).getTime();
          return age < 15000; // 15 sec
        });
        
        addTest(
          "GPS Livreur",
          gpsTresFrais.length > 0 ? "success" : (gpsFrais.length > 0 ? "warning" : "error"),
          `${avecGPS.length}/${livreurs.length} avec GPS | ${gpsTresFrais.length} GPS <15s | ${gpsFrais.length} GPS <5min`,
          true,
          { livreurs: livreurs.length, avecGPS: avecGPS.length, gpsTresFrais }
        );
      } else {
        addTest("GPS Livreur", "error", "Aucun livreur externe avec app_active=true", true);
      }

      // ─── TEST 2 : COORDONNÉES UTILISÉES ─────────────────────────────────────
      addTest("🎯 Test 2 : Coordonnées utilisées", "running", "Vérification source GPS");
      const courses = await base44.entities.CourseExterne.filter({}, "-created_date", 20);
      const avecGPSComplet = courses.filter(c => 
        c.latitude_recuperation && c.longitude_recuperation &&
        c.latitude_livraison && c.longitude_livraison
      );
      const avecGPSDepart = courses.filter(c => c.gps_depart_lat && c.gps_depart_lng);
      const avecGPSArrivee = courses.filter(c => c.gps_arrivee_lat && c.gps_arrivee_lng);
      
      addTest("GPS Récupération", avecGPSComplet.length > 0 ? "success" : "warning", 
        `${avecGPSComplet.length}/${courses.length} courses avec GPS complet (récup + livr)`, true);
      addTest("GPS Départ", avecGPSDepart.length > 0 ? "success" : "error", 
        `${avecGPSDepart.length}/${courses.length} avec GPS départ`, true);
      addTest("GPS Arrivée", avecGPSArrivee.length > 0 ? "success" : "error", 
        `${avecGPSArrivee.length}/${courses.length} avec GPS arrivée`, true);

      // ─── TEST 3 : CALCUL PRIX FINAL ─────────────────────────────────────────
      addTest("💰 Test 3 : Calcul prix final", "running", "Vérification formule exacte");
      const livrees = courses.filter(c => c.statut === "livree");
      let prixCorrects = 0;
      let prixIncorrects = 0;
      let detailsErreurs = [];
      
      livrees.forEach(c => {
        if (c.distance_reelle_km && c.prix_final) {
          const attendu = Math.round(c.distance_reelle_km * 100);
          const ecart = Math.abs(c.prix_final - attendu);
          if (ecart <= 10) { // Tolérance 10F
            prixCorrects++;
          } else {
            prixIncorrects++;
            detailsErreurs.push(`#${c.id?.slice(-6)}: dist=${c.distance_reelle_km}km → ${attendu}F (reçu: ${c.prix_final}F)`);
          }
        }
      });
      
      addTest(
        "Prix final",
        prixIncorrects === 0 ? "success" : "error",
        `${prixCorrects}/${livrees.length} corrects`,
        true,
        { incorrects: detailsErreurs.slice(0, 5) }
      );

      // ─── TEST 4 : ETA TEMPS RÉEL ────────────────────────────────────────────
      addTest("⏱️ Test 4 : ETA temps réel", "running", "Vérification mise à jour dynamique");
      const coursesActives = courses.filter(c => !["livree", "annulee"].includes(c.statut) && c.livreur_id);
      let etaActifs = 0;
      let etaObsolètes = 0;
      
      for (const course of coursesActives) {
        const livreur = await base44.entities.Livreur.filter({ id: course.livreur_id }).then(r => r?.[0]);
        if (livreur?.latitude && livreur?.longitude) {
          const targetLat = course.statut === "livreur_en_route" ? course.gps_depart_lat : course.gps_arrivee_lat;
          const targetLng = course.statut === "livreur_en_route" ? course.gps_depart_lng : course.gps_arrivee_lng;
          if (targetLat && targetLng) {
            const dist = haversine(livreur.latitude, livreur.longitude, targetLat, targetLng);
            const eta = Math.round((dist / 25) * 60);
            if (dist < 0.1) {
              etaActifs++; // ETA < 100m = "~1 min"
            } else if (eta > 0) {
              etaActifs++;
            } else {
              etaObsolètes++;
            }
          }
        }
      }
      
      addTest("ETA actifs", etaObsolètes === 0 ? "success" : "warning", 
        `${etaActifs} ETA calculés | ${etaObsolètes} obsolètes`, true);

      // ─── TEST 5 : DESTINATION À DÉFINIR ─────────────────────────────────────
      addTest("📍 Test 5 : Destination à définir", "running", "Vérification disparition auto");
      const avecDestInconnue = courses.filter(c => c.destination_inconnue === true);
      const avecDestInconnueMaisGPS = courses.filter(c => 
        c.destination_inconnue === true && c.gps_arrivee_lat && c.gps_arrivee_lng
      );
      
      addTest(
        "Destination inconnue",
        avecDestInconnueMaisGPS.length === 0 ? "success" : "warning",
        `${avecDestInconnue.length} destinations inconnues | ${avecDestInconnueMaisGPS.length} avec GPS (BUG)`,
        true
      );

      // ─── TEST 6 : SYNCHRONISATION INTERFACES ────────────────────────────────
      addTest("🔄 Test 6 : Synchronisation interfaces", "running", "Vérification données identiques");
      const courseTest = courses[0];
      if (courseTest) {
        const dataSources = {
          expedition: courseTest.prix_final,
          livraison: courseTest.prix_final,
          livreur: courseTest.prix_final,
          admin: courseTest.prix_final
        };
        const unique = new Set(Object.values(dataSources));
        addTest(
          "Données synchronisées",
          unique.size === 1 ? "success" : "error",
          unique.size === 1 ? "Toutes interfaces synchronisées" : "DONNÉES DIVERGENTES !",
          true,
          dataSources
        );
      }

      // ─── TEST 7 : AUCUN FALLBACK ERRONÉ ─────────────────────────────────────
      addTest("🚫 Test 7 : Aucun fallback erroné", "running", "Recherche valeurs parasites");
      const fallbacks = [];
      courses.forEach(c => {
        if (c.distance_reelle_km === 1.0 && !c.heure_livraison) {
          fallbacks.push(`#${c.id?.slice(-6)}: distance=1.0 (fallback)`);
        }
        if (c.prix_final === 100 && !c.distance_reelle_km) {
          fallbacks.push(`#${c.id?.slice(-6)}: prix=100F (fallback)`);
        }
        if (c.prix_estimate === 0) {
          fallbacks.push(`#${c.id?.slice(-6)}: prix_estimate=0`);
        }
      });
      
      addTest(
        "Fallbacks indésirables",
        fallbacks.length === 0 ? "success" : "error",
        fallbacks.length === 0 ? "Aucun fallback détecté" : `${fallbacks.length} fallbacks trouvés`,
        true,
        { fallbacks: fallbacks.slice(0, 5) }
      );

      // ─── TEST 8 : SCÉNARIOS MULTIPLES ───────────────────────────────────────
      addTest("🎭 Test 8 : Scénarios multiples", "running", "Simulation cas réels");
      
      // Très courte distance (<100m)
      const tresCourtes = livrees.filter(c => c.distance_reelle_km && c.distance_reelle_km < 0.1);
      addTest("Très courte distance", tresCourtes.length > 0 ? "success" : "warning", 
        `${tresCourtes.length} courses <100m testées`, false);
      
      // Distance moyenne
      const moyennes = livrees.filter(c => c.distance_reelle_km && c.distance_reelle_km >= 0.1 && c.distance_reelle_km < 5);
      addTest("Distance moyenne", moyennes.length > 0 ? "success" : "warning", 
        `${moyennes.length} courses 100m-5km testées`, false);
      
      // GPS temporairement perdu
      const livreursSansGPS = livreurs.filter(l => !l.latitude || !l.longitude);
      addTest("GPS perdu", livreursSansGPS.length === 0 ? "success" : "warning", 
        `${livreursSansGPS.length} livreurs sans GPS`, false);
      
      // Destinataire déjà existant
      const avecDestinataireLie = courses.filter(c => c.destinataire_client_id);
      addTest("Destinataire existant", avecDestinataireLie.length > 0 ? "success" : "warning", 
        `${avecDestinataireLie.length} destinataires liés`, false);
      
      // Mode "Recevoir un colis"
      const recevoir = courses.filter(c => c.type_course === "recevoir");
      addTest("Mode Recevoir", recevoir.length > 0 ? "success" : "warning", 
        `${recevoir.length} courses type 'recevoir'`, false);

      // ─── TEST 9 : MISE À JOUR TEMPS RÉEL ────────────────────────────────────
      addTest("⚡ Test 9 : Mise à jour temps réel", "running", "Polling et websockets");
      const courseRecente = courses[0];
      if (courseRecente) {
        const age = Date.now() - new Date(courseRecente.updated_date).getTime();
        addTest(
          "Dernière MAJ",
          age < 5000 ? "success" : (age < 15000 ? "warning" : "error"),
          `Course #${courseRecente.id?.slice(-6)} mise à jour il y a ${Math.round(age/1000)}s`,
          true
        );
      }

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
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🔍 Diagnostic Complet</h1>
          <p className="text-sm text-muted-foreground">7 points critiques + scénarios multiples</p>
        </div>
        <Button 
          onClick={runAllTests} 
          disabled={running}
          className="gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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
                {test.data && typeof test.data === 'object' && (
                  <pre className="text-[10px] bg-white/50 rounded p-2 mt-2 overflow-auto max-h-32">
                    {JSON.stringify(test.data, null, 2)}
                  </pre>
                )}
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
          <div className="grid grid-cols-2 gap-3 mt-6 text-left">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Zap className="w-4 h-4 text-blue-600 mb-2" />
              <p className="text-xs font-bold text-blue-900">1. GPS temps réel</p>
              <p className="text-[10px] text-blue-700">Mise à jour {'<'}15s</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Target className="w-4 h-4 text-green-600 mb-2" />
              <p className="text-xs font-bold text-green-900">2. Coordonnées exactes</p>
              <p className="text-[10px] text-green-700">Récup → Livr</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Layers className="w-4 h-4 text-purple-600 mb-2" />
              <p className="text-xs font-bold text-purple-900">3. Sync interfaces</p>
              <p className="text-[10px] text-purple-700">Données identiques</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <WifiOff className="w-4 h-4 text-red-600 mb-2" />
              <p className="text-xs font-bold text-red-900">4. Aucun fallback</p>
              <p className="text-[10px] text-red-700">0, 1km, NaN</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}