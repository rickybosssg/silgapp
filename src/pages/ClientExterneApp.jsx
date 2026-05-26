import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  MapPin, Navigation, Phone, MessageCircle, User, Package, 
  Clock, HelpCircle, ChevronRight, TrendingUp, 
  Shield, Zap, Star, Loader2, ArrowLeft
} from "lucide-react";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import ModernMap from "@/components/client/ModernMap";
import ProfilModal from "@/components/client/ProfilModal";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ClientExterneApp() {
  const navigate = useNavigate();
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsRequired, setGpsRequired] = useState(true);
  const [showProfilModal, setShowProfilModal] = useState(false);
  const [position, setPosition] = useState(null);
  const [clientProfil, setClientProfil] = useState(null);
  const [courseActive, setCourseActive] = useState(null);
  const [livreursProches, setLivreursProches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      // 1. Vérifier GPS
      const savedGps = localStorage.getItem("client_gps_active");
      const savedPos = JSON.parse(localStorage.getItem("client_gps_position") || "null");
      if (savedGps === "true") {
        setGpsActive(true);
        setGpsRequired(false);
        if (savedPos) setPosition(savedPos);
      } else {
        setLoading(false);
        return;
      }

      // 2. Vérifier profil client - création auto si inexistant
      const user = await base44.auth.me();
      const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });

      let profil;
      if (clients && clients.length > 0) {
        profil = clients[0];
        setClientProfil(profil);
      } else {
        // Création automatique d'un profil minimal
        const newProfil = await base44.entities.ClientExterne.create({
          nom: "Client",
          telephone: "+226" + (user.email?.split('@')[0] || "00000000"),
          user_email: user.email
        });
        profil = newProfil;
        setClientProfil(newProfil);
        // Inviter à compléter le profil
        setShowProfilModal(true);
      }

      // 3. Vérifier course active (créée par le client) — filtrée par user_email
      const coursesClient = await base44.entities.CourseExterne.filter({ 
        created_by_id: user.id
      });
      const activeCourseClient = coursesClient?.find(c => 
        !["livree", "annulee"].includes(c.statut)
      );
      
      // 4. Vérifier courses où le client est destinataire — utiliser profil correct
      let activeCourseDestinataire = null;
      if (profil?.id) {
        const coursesDestinataire = await base44.entities.CourseExterne.filter({
          destinataire_client_id: profil.id
        });
        activeCourseDestinataire = coursesDestinataire?.find(c => 
          !["livree", "annulee"].includes(c.statut) && c.type_course === "expedier"
        ) || null;
      }
      
      // Priorité : course active du client, sinon course en tant que destinataire
      if (activeCourseClient) {
        setCourseActive(activeCourseClient);
      } else if (activeCourseDestinataire) {
        setCourseActive(activeCourseDestinataire);
      }

      // 5. Charger notifications non lues
      const userNotifications = await base44.entities.Notification.filter({
        destinataire_email: user.email,
        lue: false
      });
      if (userNotifications && userNotifications.length > 0) {
        setNotifications(userNotifications);
      }

      // 6. Charger livreurs disponibles
      await loadLivreursProches(savedPos);

    } catch (err) {
      console.error("Erreur vérification statut:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadLivreursProches = async (pos) => {
    try {
      if (!pos) return;
      const livreurs = await base44.entities.Livreur.filter({
        type_livreur: "externe",
        statut: "disponible",
        actif: true,
        validation: "valide"
      });
      const proches = livreurs.filter(l => {
        if (!l.latitude || !l.longitude) return false;
        return haversineDistance(pos.latitude, pos.longitude, l.latitude, l.longitude) <= 5;
      }).slice(0, 5);
      setLivreursProches(proches);
    } catch (err) {
      console.error("Erreur chargement livreurs:", err);
    }
  };

  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setPosition(posData);
        setGpsActive(true);
        setGpsRequired(false);
        localStorage.setItem("client_gps_active", "true");
        localStorage.setItem("client_gps_position", JSON.stringify(posData));
        loadLivreursProches(posData);
      },
      () => toast.error("Permission GPS refusée – obligatoire pour créer une course"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-red-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (gpsRequired && !gpsActive) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-6 space-y-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <MapPin className="w-10 h-10 text-primary" />
          </div>
          <div>
            <p className="text-xl font-black text-gray-900 mb-2">GPS Obligatoire</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Pour créer une course et être localisé, l'activation du GPS est requise.
            </p>
          </div>
          <button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all"
            onClick={handleActiverGPS}
          >
            Activer le GPS
          </button>
        </div>
      </div>
    );
  }

  const prenom = clientProfil?.prenom || clientProfil?.nom?.split(" ")[0] || "Client";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Course active - Floating card */}
      {courseActive && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top duration-300">
          <Card className="border-l-4 border-l-primary shadow-lg cursor-pointer" onClick={() => navigate("/client/suivi")}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <Badge className="bg-primary/10 text-primary">
                    {courseActive.statut === "recherche_livreur" ? "🔍 Recherche" : 
                     courseActive.statut === "livreur_en_route" ? "🚀 En route" :
                     courseActive.statut === "colis_recupere" ? "📦 Récupéré" : "🚚 Livraison"}
                  </Badge>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-3">
                {courseActive.livreur_photo_url ? (
                  <img src={courseActive.livreur_photo_url} alt={courseActive.livreur_nom} className="w-10 h-10 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{courseActive.livreur_nom || "Livreur en route"}</p>
                  <p className="text-xs text-muted-foreground">
                    {courseActive.adresse_depart} → {courseActive.adresse_arrivee}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className={`px-4 py-4 ${courseActive ? "mt-32" : ""}`}>
        <div className="max-w-lg mx-auto space-y-4">

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="mb-4 space-y-2">
              {notifications.map((notif) => (
                <Card key={notif.id} className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-900">{notif.titre}</p>
                      <p className="text-sm text-yellow-700 mt-1">{notif.message}</p>
                      {notif.course_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                          onClick={() => navigate("/client/suivi")}
                        >
                          Voir la course
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-red-600 rounded-3xl p-5 shadow-lg shadow-red-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/80 text-xs mb-0.5">Bonjour 👋</p>
                <h1 className="text-2xl font-black text-white">{prenom}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <MapPin className="w-3 h-3 text-white" />
                    <span className="text-xs text-white font-medium">Ouagadougou</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-green-500/90 px-2.5 py-1 rounded-full">
                    <Navigation className="w-3 h-3 text-white" />
                    <span className="text-xs text-white font-medium">GPS actif</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl"
                onClick={() => setShowProfilModal(true)}
              >
                <User className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Actions principales */}
          <div className="grid grid-cols-2 gap-3">
            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/30 bg-gradient-to-br from-white to-primary/5"
              onClick={() => navigate("/client/course/expedier", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center mx-auto shadow-lg shadow-red-200 group-hover:scale-110 transition-transform">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Expédier</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Envoyer un colis</p>
                </div>
              </div>
            </Card>

            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-accent/30 bg-gradient-to-br from-white to-accent/5"
              onClick={() => navigate("/client/course/recevoir", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-green-600 flex items-center justify-center mx-auto shadow-lg shadow-green-200 group-hover:scale-110 transition-transform">
                  <span className="text-3xl">📥</span>
                </div>
                <div>
                  <p className="font-bold text-foreground">Recevoir</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recevoir un colis</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Bouton carte — uniquement si course active */}
          {courseActive && gpsActive && position && (
            <Card className="p-4 cursor-pointer hover:shadow-lg transition-all" onClick={() => setShowMap(true)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Voir le livreur en temps réel</p>
                  <p className="text-xs text-muted-foreground">Carte interactive style Uber/Glovo</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Card>
          )}

          {/* Raccourcis */}
          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Raccourcis</p>
            <div className="grid grid-cols-4 gap-2">
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-blue-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-[10px] font-medium">Mes courses</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-purple-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-[10px] font-medium">Historique</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-green-50"
                onClick={() => window.open("https://wa.me/22670000000", "_blank")}
              >
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="text-[10px] font-medium">Support</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-orange-50"
                onClick={() => setShowProfilModal(true)}
              >
                <User className="w-5 h-5 text-orange-600" />
                <span className="text-[10px] font-medium">Mes infos</span>
              </Button>
            </div>
          </Card>

          {/* Tarification */}
          <Card className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 shadow-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-indigo-900">Tarification transparente</p>
                <p className="text-xs text-indigo-700 mt-1.5 leading-relaxed">
                  100 F/km — Prix calculé automatiquement selon la distance réellement parcourue.
                </p>
              </div>
            </div>
          </Card>

          {/* Avantages */}
          <Card className="p-5 bg-gradient-to-br from-white to-gray-50 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-sm">
                <Star className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-foreground text-base">Facilitez-vous la vie avec SILGAPP</p>
            </div>
            <div className="space-y-3">
              {[
                { color: "green", icon: <Zap className="w-3.5 h-3.5 text-white" />, title: "Livraison rapide", desc: "Livreurs disponibles 24/7 près de chez vous" },
                { color: "blue", icon: <Shield className="w-3.5 h-3.5 text-white" />, title: "Service sécurisé", desc: "Livreurs vérifiés et suivis en temps réel" },
                { color: "purple", icon: <HelpCircle className="w-3.5 h-3.5 text-white" />, title: "Support réactif", desc: "Assistance disponible à tout moment" },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-${item.color}-50 to-white border border-${item.color}-100`}>
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br from-${item.color}-500 to-${item.color}-600 flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Modale carte temps réel */}
      {showMap && courseActive && gpsActive && position && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center justify-between p-4 border-b bg-card">
            <h2 className="text-lg font-bold text-foreground">Suivi en temps réel</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} className="h-10 w-10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
          <ModernMap 
            position={position}
            livreursProches={livreursProches}
            courseActive={courseActive}
          />
        </div>
      )}

      {/* Profil modal */}
      {showProfilModal && (
        <ProfilModal
          clientProfil={clientProfil}
          onClose={() => setShowProfilModal(false)}
          onSave={(updatedProfil) => {
            setClientProfil(updatedProfil);
            setShowProfilModal(false);
          }}
        />
      )}

      <VenusFloatingButton />
    </div>
  );
}