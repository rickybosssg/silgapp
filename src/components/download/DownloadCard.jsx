import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, CheckCircle, ExternalLink, User, Phone, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function DownloadCard({ downloadCount, onDownload }) {
  const apkUrl = "https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing";
  const [formData, setFormData] = useState({ nom: "", telephone: "", profil: "" });
  const [leadSaved, setLeadSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveLead = async () => {
    if (!formData.nom.trim() || !formData.telephone.trim() || !formData.profil) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Leads.create({
        nom: formData.nom.trim(),
        telephone: formData.telephone.trim(),
        profil: formData.profil,
        source: "page_telechargement",
        a_telecharge: false
      });
      setLeadSaved(true);
      toast.success("✅ Merci ! Vos coordonnées sont enregistrées.");
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMainButtonClick = () => {
    if (!leadSaved) {
      handleSaveLead();
    } else {
      onDownload();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <Card className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
        
        <div className="p-4 sm:p-6 md:p-8 lg:p-12 space-y-6 md:space-y-8">
          {/* Formulaire d'inscription rapide */}
          {!leadSaved && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 sm:space-y-4"
            >
              <div className="text-center">
                <h3 className="text-base sm:text-lg font-bold text-white mb-1">📝 Inscription rapide</h3>
                <p className="text-xs sm:text-sm text-white/60">Recevez des updates et soyez contacté par SILGA</p>
              </div>
              <div className="grid gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/80 text-xs sm:text-sm flex items-center gap-2">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Nom complet
                  </Label>
                  <Input
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Ex: Jean Ouédraogo"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-sm sm:text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/80 text-xs sm:text-sm flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Téléphone
                  </Label>
                  <Input
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    placeholder="Ex: +226 70 00 00 00"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-sm sm:text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/80 text-xs sm:text-sm flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Je suis
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={formData.profil === "client" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, profil: "client" })}
                      className={`text-xs sm:text-sm font-semibold ${
                        formData.profil === "client" 
                          ? "bg-red-600 hover:bg-red-500 text-white" 
                          : "border-white/20 text-white hover:bg-white/10"
                      }`}
                    >
                      👤 Client
                    </Button>
                    <Button
                      type="button"
                      variant={formData.profil === "livreur" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, profil: "livreur" })}
                      className={`text-xs sm:text-sm font-semibold ${
                        formData.profil === "livreur" 
                          ? "bg-red-600 hover:bg-red-500 text-white" 
                          : "border-white/20 text-white hover:bg-white/10"
                      }`}
                    >
                      🛵 Livreur
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleSaveLead}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-sm sm:text-base py-5"
                >
                  {saving ? "Enregistrement..." : "✅ Enregistrer mes coordonnées"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Bouton de téléchargement */}
          <div className="space-y-4">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={handleMainButtonClick}
                disabled={!leadSaved && saving}
                className="w-full h-14 sm:h-16 md:h-20 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white text-base sm:text-xl font-bold shadow-2xl shadow-red-500/40 transition-all duration-300 disabled:opacity-50 rounded-xl sm:rounded-2xl"
              >
                <Download className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 mr-2 sm:mr-3 flex-shrink-0" />
                <span className="truncate">
                  {leadSaved ? "Télécharger l'APK" : "S'inscrire et télécharger"}
                </span>
                <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 ml-2 flex-shrink-0" />
              </Button>
            </motion.div>
            
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <span className="flex items-center gap-1.5 sm:gap-2 text-white/70">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                <span className="font-medium whitespace-nowrap">Gratuit</span>
              </span>
              <span className="flex items-center gap-1.5 sm:gap-2 text-white/70">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                <span className="font-medium whitespace-nowrap">Officiel</span>
              </span>
              <span className="flex items-center gap-1.5 sm:gap-2 text-white/70">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                <span className="font-medium whitespace-nowrap">28.5 MB</span>
              </span>
              <span className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 font-bold text-xs sm:text-sm whitespace-nowrap">
                <Download className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{downloadCount.toLocaleString()} ce mois</span>
              </span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-emerald-500/20 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-6 md:gap-8 p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10">
              <motion.div 
                className="bg-white p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl shadow-2xl flex-shrink-0"
                whileHover={{ scale: 1.05, rotate: 2 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <QRCodeSVG 
                  value={apkUrl}
                  size={120}
                  level="H"
                  includeMargin={false}
                  className="w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36"
                />
              </motion.div>
              <div className="text-center sm:text-left space-y-2 sm:space-y-3 flex-1">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white">📱 Scan & Go</h3>
                <p className="text-white/60 text-xs sm:text-sm md:text-base font-light leading-relaxed">
                  Scannez ce QR code pour télécharger instantanément l'application
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-white/40">
                  <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  <span className="truncate">Lien sécurisé Google Drive</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}