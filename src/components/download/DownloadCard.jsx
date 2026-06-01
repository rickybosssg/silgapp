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
      toast.success("✅ Merci ! Vos coordonnées sont enregistrées. Vous pouvez maintenant télécharger l'application.");
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadWithLead = () => {
    if (!leadSaved) {
      handleSaveLead();
      return;
    }
    onDownload();
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <Card className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
        
        <div className="p-8 sm:p-12 space-y-8">
          {/* Formulaire d'inscription rapide */}
          {!leadSaved && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-white mb-1">📝 Inscription rapide</h3>
                <p className="text-sm text-white/60">Recevez des updates et soyez contacté par SILGA</p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm flex items-center gap-2">
                    <User className="w-4 h-4" /> Nom complet
                  </Label>
                  <Input
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Ex: Jean Ouédraogo"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Téléphone
                  </Label>
                  <Input
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    placeholder="Ex: +226 70 00 00 00"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" /> Je suis
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={formData.profil === "client" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, profil: "client" })}
                      className={formData.profil === "client" ? "bg-red-600 hover:bg-red-500" : "border-white/20 text-white hover:bg-white/10"}
                    >
                      👤 Client
                    </Button>
                    <Button
                      type="button"
                      variant={formData.profil === "livreur" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, profil: "livreur" })}
                      className={formData.profil === "livreur" ? "bg-red-600 hover:bg-red-500" : "border-white/20 text-white hover:bg-white/10"}
                    >
                      🛵 Livreur
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleSaveLead}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold"
                >
                  {saving ? "Enregistrement..." : "✅ Enregistrer mes coordonnées"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Bouton de téléchargement */}
          <div className="text-center space-y-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={handleDownloadWithLead}
                disabled={!leadSaved && saving}
                className="w-full h-20 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white text-xl font-bold shadow-2xl shadow-red-500/40 transition-all duration-300 disabled:opacity-50"
              >
                <Download className="w-8 h-8 mr-3" />
                {leadSaved ? "Télécharger l'APK SILGAPP" : "S'inscrire et télécharger"}
                <ExternalLink className="w-6 h-6 ml-2" />
              </Button>
            </motion.div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">Gratuit</span>
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">Version officielle</span>
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">28.5 MB</span>
              </span>
              <span className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 font-bold">
                <Download className="w-4 h-4" />
                {downloadCount.toLocaleString()} téléchargements ce mois
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-emerald-500/20 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-center gap-8 p-8 rounded-3xl bg-white/5 border border-white/10">
              <motion.div 
                className="bg-white p-4 rounded-2xl shadow-2xl"
                whileHover={{ scale: 1.05, rotate: 2 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <QRCodeSVG 
                  value={apkUrl}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </motion.div>
              <div className="text-center sm:text-left space-y-3">
                <h3 className="text-2xl font-bold text-white">📱 Scan & Go</h3>
                <p className="text-white/60 font-light leading-relaxed">
                  Scannez ce QR code avec votre appareil photo pour télécharger instantanément l'application
                </p>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Lien sécurisé Google Drive</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}