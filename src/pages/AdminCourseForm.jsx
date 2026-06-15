import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Package, Send, User, Loader2 } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext";

// Génère QR tokens et PIN codes
function generarQRData() {
  const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
  const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
  const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
  const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
  return { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 };
}

export default function AdminCourseForm() {
  const navigate = useNavigate();
  const { countryCode: adminCountryCode, isPays } = useAdminContext();
  const [submitting, setSubmitting] = useState(false);

  const [typeCourse, setTypeCourse] = useState("expedier");
  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState("");
  const [countryCode, setCountryCode] = useState(adminCountryCode || "BF");

  // Champs optionnels
  const [clientNom, setClientNom] = useState("");
  const [clientPrenom, setClientPrenom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [expediteurNom, setExpediteurNom] = useState("");
  const [expediteurTelephone, setExpediteurTelephone] = useState("");
  const [destinataireNom, setDestinataireNom] = useState("");
  const [destinataireTelephone, setDestinataireTelephone] = useState("");
  const [typeColis, setTypeColis] = useState("petit_colis");
  const [notes, setNotes] = useState("");
  const [ville, setVille] = useState("");

  const handleSubmit = async () => {
    if (!adresseDepart.trim()) { toast.error("Point de départ requis"); return; }
    if (!adresseArrivee.trim()) { toast.error("Point d'arrivée requis"); return; }

    setSubmitting(true);
    try {
      const { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 } = generarQRData();

      const courseData = {
        country_code: countryCode,
        source: "admin",
        type_course: typeCourse,
        adresse_depart: adresseDepart.trim(),
        adresse_arrivee: adresseArrivee.trim(),
        ville_depart: ville || null,
        ville_arrivee: ville || null,
        client_nom: clientNom.trim() || "Client",
        client_telephone: clientTelephone.trim() || "",
        expediteur_nom: expediteurNom.trim() || null,
        expediteur_telephone: expediteurTelephone.trim() || null,
        destinataire_nom: destinataireNom.trim() || null,
        destinataire_telephone: destinataireTelephone.trim() || null,
        type_colis: typeCourse === "deplacement" ? "autre" : typeColis,
        notes: notes.trim() || null,
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        pricing_mode: "admin_manuel",
        prix_estimate: 0,
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
        // Passager (déplacement)
        passager_nom: typeCourse === "deplacement" ? (clientNom.trim() || "Passager") : null,
        passager_telephone: typeCourse === "deplacement" ? (clientTelephone.trim() || null) : null,
        nb_passagers: typeCourse === "deplacement" ? 1 : null,
      };

      const course = await base44.entities.CourseExterne.create(courseData);
      toast.success("Course créée avec succès !");

      // Lancer dispatch auto
      try {
        await base44.functions.invoke("dispatchExterneAuto", {
          action: "lancer_recherche_auto",
          course_id: course.id,
        });
      } catch (e) {
        console.error("Erreur dispatch:", e);
      }

      // Envoyer WhatsApp auto si numéros renseignés
      const whatsappPayload = { course_id: course.id };
      if (expediteurTelephone.trim() || clientTelephone.trim()) {
        try {
          await base44.functions.invoke("sendCourseWhatsApp", {
            course_id: course.id,
            type_destinataire: "expediteur",
          });
        } catch (e) { console.error("WhatsApp expediteur:", e); }
      }
      if (destinataireTelephone.trim()) {
        try {
          await base44.functions.invoke("sendCourseWhatsApp", {
            course_id: course.id,
            type_destinataire: "destinataire",
          });
        } catch (e) { console.error("WhatsApp destinataire:", e); }
      }

      navigate("/admin/externe");
    } catch (err) {
      toast.error("Erreur création: " + (err?.message || "inconnue"));
    } finally {
      setSubmitting(false);
    }
  };

  const PAYS = [
    { code: "BF", nom: "Burkina Faso", drapeau: "🇧🇫" },
    { code: "CI", nom: "Côte d'Ivoire", drapeau: "🇨🇮" },
    { code: "TG", nom: "Togo", drapeau: "🇹🇬" },
    { code: "BJ", nom: "Bénin", drapeau: "🇧🇯" },
    { code: "SN", nom: "Sénégal", drapeau: "🇸🇳" },
    { code: "ML", nom: "Mali", drapeau: "🇲🇱" },
    { code: "GN", nom: "Guinée", drapeau: "🇬🇳" },
    { code: "NE", nom: "Niger", drapeau: "🇳🇪" },
    { code: "GH", nom: "Ghana", drapeau: "🇬🇭" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/admin/externe">
            <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-black text-foreground">Nouvelle course</h1>
            <p className="text-xs text-muted-foreground">Création manuelle par l'administrateur</p>
          </div>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          {/* Type de course */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">Type de course *</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "expedier", label: "Expédition", icon: "📦" },
                { key: "recevoir", label: "Réception", icon: "📥" },
                { key: "deplacement", label: "Déplacement", icon: "👤" },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeCourse(t.key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    typeCourse === t.key
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <span className={`text-xs font-bold ${typeCourse === t.key ? "text-primary" : "text-gray-600"}`}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Pays */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">Pays *</p>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYS.map(p => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.drapeau} {p.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Adresses */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">Point de départ *</p>
            <Input
              value={adresseDepart}
              onChange={e => setAdresseDepart(e.target.value)}
              placeholder="Ex: Ouaga 2000, face à la mairie"
              className="rounded-xl"
            />
          </div>

          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">Point d'arrivée *</p>
            <Input
              value={adresseArrivee}
              onChange={e => setAdresseArrivee(e.target.value)}
              placeholder="Ex: Gounghin, derrière le marché"
              className="rounded-xl"
            />
          </div>

          {/* Ville */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2">Ville</p>
            <Input
              value={ville}
              onChange={e => setVille(e.target.value)}
              placeholder="Ex: Ouagadougou"
              className="rounded-xl"
            />
          </div>

          {/* Separator */}
          <div className="border-t pt-3">
            <p className="text-xs font-bold text-gray-400 uppercase mb-3">Informations optionnelles</p>
          </div>

          {/* Client */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Nom</p>
              <Input
                value={clientNom}
                onChange={e => setClientNom(e.target.value)}
                placeholder="Nom client"
                className="rounded-xl text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Téléphone</p>
              <Input
                value={clientTelephone}
                onChange={e => setClientTelephone(e.target.value)}
                placeholder="+226..."
                className="rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Expéditeur / Destinataire selon type */}
          {typeCourse === "recevoir" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Expéditeur (nom)</p>
                  <Input
                    value={expediteurNom}
                    onChange={e => setExpediteurNom(e.target.value)}
                    placeholder="Nom expéditeur"
                    className="rounded-xl text-sm"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Tél. expéditeur</p>
                  <Input
                    value={expediteurTelephone}
                    onChange={e => setExpediteurTelephone(e.target.value)}
                    placeholder="+226..."
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>
            </>
          ) : typeCourse === "expedier" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Destinataire (nom)</p>
                  <Input
                    value={destinataireNom}
                    onChange={e => setDestinataireNom(e.target.value)}
                    placeholder="Nom destinataire"
                    className="rounded-xl text-sm"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Tél. destinataire</p>
                  <Input
                    value={destinataireTelephone}
                    onChange={e => setDestinataireTelephone(e.target.value)}
                    placeholder="+226..."
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>
            </>
          ) : null}

          {/* Type colis (pas pour déplacement) */}
          {typeCourse !== "deplacement" && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Type de colis</p>
              <Select value={typeColis} onValueChange={setTypeColis}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit_colis">Petit colis</SelectItem>
                  <SelectItem value="moyen_colis">Moyen colis</SelectItem>
                  <SelectItem value="gros_colis">Gros colis</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="nourriture">Nourriture</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Notes / Observations</p>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instructions particulières..."
              className="rounded-xl text-sm"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-12 rounded-xl gap-2 font-bold text-base"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            {submitting ? "Création..." : "Créer la course"}
          </Button>
        </div>
      </div>
    </div>
  );
}