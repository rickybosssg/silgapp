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
// Note: MapPin, Navigation conservés pour usage dans le header
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import ModernMap from "@/components/client/ModernMap";
import ProfilModal from "@/components/client/ProfilModal";
import SupportWhatsApp from "@/components/client/SupportWhatsApp";
import ClientOnboarding, { profilClientComplet } from "@/components/client/ClientOnboarding";

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
  // Déjà passé par l'onboarding si GPS actif en localStorage
  const gpsDejaActif = (() => { try { return localStorage.getItem("client_gps_active") === "true"; } catch { return false; } })();
  const [onboardingDone, setOnboardingDone] = useState(gpsDejaActif);
  const [showProfilModal, setShowProfilModal] = useState(false);
  const savedGpsPos = (() => { try { return JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch { return null; } })();
  const [position, setPosition] = useState(savedGpsPos);
  const [clientProfil, setClientProfil] = useState(null);
  const [coursesActives, setCoursesActives] = useState([]);
  const [livreursProches, setLivreursProches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    loadProfil();
  }, []);

  const loadProfil = async () => {
    try {
      const user = await base44.auth.me();
      const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
      let profil;
      if (clients && clients.length > 0) {
        profil = clients[0];
      } else {
        profil = await base44.entities.ClientExterne.create({
          nom: user.full_name || user.email.split('@')[0],
          telephone: "",
          user_email: user.email,
          actif: true
        });
      }
      setClientProfil(profil);
      // Si onboarding déjà fait (GPS en localStorage), charger les courses directement
      if (gpsDejaActif) {
        const pos = (() => { try { return JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch { return null; } })();
        checkStatus(pos, profil);
      }
    } catch (err) {
      console.error("Erreur chargement profil:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = ({ gps, profil }) => {
    setPosition(gps);
    setClientProfil(profil);
    setOnboardingDone(true);
    checkStatus(gps, profil);
  };

  const checkStatus = async (pos, profil) => {
    try {
      const user = await base44.auth.me();
      const coursesClient = await base44.entities.CourseExterne.filter({ created_by_id: user.id });
      const actives = (coursesClient || []).filter(c => !["livree", "annulee"].includes(c.statut));

      let activesDestinataire = [];
      if (profil?.id) {
        const coursesDestinataire = await base44.entities.CourseExterne.filter({ destinataire_client_id: profil.id });
        activesDestinataire = (coursesDestinataire || []).filter(c =>
          !["livree", "annulee"].includes(c.statut) && c.type_course === "expedier"
        );
      }

      // Fusionner sans doublons par id
      const toutes = [...actives];
      activesDestinataire.forEach(c => { if (!toutes.find(x => x.id === c.id)) toutes.push(c); });
      setCoursesActives(toutes);

      const userNotifications = await base44.entities.Notification.filter({ destinataire_email: user.email, lue: false });
      if (userNotifications?.length > 0) setNotifications(userNotifications);

      await loadLivreursProches(pos);
    } catch (err) {
      console.error("Erreur vérification statut:", err);
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



  // Spinner uniquement si vraiment en chargement et pas encore de profil
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

  // Onboarding : laisser ClientOnboarding décider (GPS + profil)
  // ClientOnboarding attend clientProfil non-null pour calculer l'étape
  if (!onboardingDone) {
    return (
      <ClientOnboarding
        clientProfil={clientProfil}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Dashboard : clientProfil garanti non-null ici
  if (!clientProfil) return null;

  const prenom = (clientProfil?.prenom || (clientProfil?.nom || "").split(" ")[0] || "Client").trim() || "Client";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Courses actives - Floating cards */}
      {coursesActives.length > 0 && (
        <div className="fixed top-4 left-4 right-4 z-50 space-y-2 animate-in slide-in-from-top duration-300">
          {coursesActives.map((course) => (
            <Card key={course.id} className="border-l-4 border-l-primary shadow-lg cursor-pointer" onClick={() => navigate("/client/suivi", { state: { course_id: course.id } })}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <Badge className="bg-primary/10 text-primary text-xs">
                      {course.statut === "recherche_livreur" ? "🔍 Recherche" :
                       course.statut === "livreur_en_route" ? "🚀 En route" :
                       course.statut === "colis_recupere" ? "📦 Récupéré" : "🚚 Livraison"}
                    </Badge>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2">
                  {course.livreur_photo_url ? (
                    <img src={course.livreur_photo_url} alt={course.livreur_nom} className="w-8 h-8 rounded-full object-cover border-2 border-primary" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs">{course.livreur_nom || "Recherche livreur..."}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {course.adresse_depart} → {course.adresse_arrivee}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className={`px-4 py-4 ${coursesActives.length > 0 ? `mt-${Math.min(8 + coursesActives.length * 24, 56)}` : ""}`} style={coursesActives.length > 0 ? { marginTop: `${coursesActives.length * 90 + 8}px` } : {}}>
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

          {/* Bouton carte — uniquement si course active avec livreur localisable */}
          {coursesActives.some(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut)) && position && (
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
                onClick={() => window.open("https://wa.me/22667572857?text=" + encodeURIComponent("Bonjour SILGAPP 👋\nJ'ai besoin d'aide concernant ma course."), "_blank")}
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

          {/* Support WhatsApp */}
          <SupportWhatsApp />

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

      {/* Modale carte temps réel — utilise la première course avec livreur actif */}
      {showMap && position && (() => {
        const courseMap = coursesActives.find(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut)) || coursesActives[0];
        if (!courseMap) return null;
        return (
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
              courseActive={courseMap}
            />
          </div>
        );
      })()}

      {/* Profil modal — "Mes infos" */}
      {showProfilModal && clientProfil && (
        <ProfilModal
          clientProfil={clientProfil}
          onClose={() => setShowProfilModal(false)}
          onSave={(updatedProfil) => {
            if (updatedProfil) setClientProfil(updatedProfil);
            setShowProfilModal(false);
          }}
        />
      )}

      <VenusFloatingButton />
    </div>
  );
}