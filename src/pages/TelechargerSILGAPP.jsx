import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Download, User, Truck, Smartphone, CheckCircle, 
  AlertCircle, MessageCircle, Shield, QrCode, ExternalLink,
  Play, Star, Zap, MapPin, Phone
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function TelechargerSILGAPP() {
  const [downloadCount, setDownloadCount] = useState(0);

  useEffect(() => {
    // Simuler un compteur de téléchargements
    const stored = localStorage.getItem("silgapp_download_count");
    const count = stored ? parseInt(stored) : 1247;
    setDownloadCount(count);
  }, []);

  const handleDownload = () => {
    // Incrémenter le compteur
    const newCount = downloadCount + 1;
    setDownloadCount(newCount);
    localStorage.setItem("silgapp_download_count", newCount.toString());
    
    // Ouvrir le lien Google Drive
    window.open("https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing", "_blank");
  };

  const apkUrl = "https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing";
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-slate-900">
      {/* Header avec logo et titre */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">SILGAPP</h1>
                <p className="text-xs text-white/60 font-medium">Livraison rapide & sécurisée</p>
              </div>
            </div>
            <Badge className="bg-red-600 text-white border-0">
              <Star className="w-3 h-3 mr-1" />
              v2.0.4
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Hero section */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2">
            <Download className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-white">
              {downloadCount.toLocaleString()} téléchargements ce mois
            </span>
          </div>
          
          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">
            🚀 Téléchargez SILGAPP
          </h2>
          
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            L'application de livraison qui connecte clients et livreurs en temps réel
          </p>
        </section>

        {/* Carte de téléchargement principale */}
        <Card className="bg-gradient-to-br from-white to-gray-50 border-0 shadow-2xl shadow-black/50 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            {/* Bouton de téléchargement */}
            <div className="text-center space-y-4">
              <Button
                onClick={handleDownload}
                className="w-full h-16 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-700 hover:to-red-700 text-white text-lg font-bold shadow-lg shadow-red-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Download className="w-6 h-6 mr-3" />
                Télécharger l'APK SILGAPP
                <ExternalLink className="w-5 h-5 ml-2" />
              </Button>
              
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Gratuit
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Version officielle
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  28.5 MB
                </span>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
              <div className="bg-white p-3 rounded-xl shadow-lg">
                <QRCodeSVG 
                  value={apkUrl}
                  size={160}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="text-center sm:text-left">
                <h3 className="font-bold text-gray-900 mb-2">📱 Scannez pour télécharger</h3>
                <p className="text-sm text-gray-600">
                  Utilisez votre appareil photo pour scanner le QR code et télécharger directement l'application
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Sections Client / Livreur */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Client */}
          <Card className="bg-white border border-gray-200 shadow-lg">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Je suis client</h3>
                  <p className="text-xs text-gray-500">Commandez en toute simplicité</p>
                </div>
              </div>
              
              <ul className="space-y-2">
                {[
                  "Commandez une livraison",
                  "Suivez votre livreur en temps réel",
                  "Gérez vos courses facilement",
                  "Paiement sécurisé",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Livreur */}
          <Card className="bg-white border border-gray-200 shadow-lg">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Je suis livreur</h3>
                  <p className="text-xs text-gray-500">Gagnez de l'argent</p>
                </div>
              </div>
              
              <ul className="space-y-2">
                {[
                  "Recevez des courses automatiquement",
                  "Activez votre GPS pour être visible",
                  "Gagnez de l'argent avec SILGAPP",
                  <span key="support" className="flex items-center gap-1 text-orange-600 font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    Contactez le support pour activer votre compte
                  </span>,
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        {/* Instructions d'installation */}
        <Card className="bg-white border border-gray-200 shadow-lg">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-red-600" />
              <h3 className="font-bold text-xl text-gray-900">📖 Instructions d'installation</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { step: 1, text: "Cliquez sur « Télécharger l'APK SILGAPP »" },
                { step: 2, text: "Téléchargez le fichier APK" },
                { step: 3, text: "Ouvrez le fichier téléchargé" },
                { step: 4, text: "Autorisez l'installation de sources inconnues si demandé" },
                { step: 5, text: "Installez SILGAPP" },
                { step: 6, text: "Ouvrez l'application" },
                { step: 7, text: "Activez votre GPS" },
                { step: 8, text: "Complétez vos informations et commencez" },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-red-600">{item.step}</span>
                  </div>
                  <p className="text-sm text-gray-700 pt-1">{item.text}</p>
                </div>
              ))}
            </div>

            {/* Alertes importantes */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 text-sm mb-1">Important</h4>
                  <p className="text-xs text-amber-800">
                    Si Android bloque l'installation, cliquez sur <strong>« Autoriser cette source »</strong> dans les paramètres. 
                    C'est une mesure de sécurité normale pour les applications hors Play Store.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Compatibilité */}
        <Card className="bg-white border border-gray-200 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Smartphone className="w-6 h-6 text-red-600" />
              <h3 className="font-bold text-xl text-gray-900">ℹ️ Compatibilité</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
                  <Play className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-green-900">Android</p>
                  <p className="text-xs text-green-700">Application native (APK)</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-blue-900">iPhone (iOS)</p>
                  <p className="text-xs text-blue-700">Version navigateur web</p>
                </div>
                <CheckCircle className="w-5 h-5 text-blue-600 ml-auto" />
              </div>
            </div>
          </div>
        </Card>

        {/* Sécurité */}
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-0 shadow-lg">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-green-400" />
              <h3 className="font-bold text-xl text-white">🔒 Sécurité</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/80">
                  <strong className="text-white">Application officielle SILGAPP</strong> - Développée et maintenue par l'équipe SILGAPP
                </p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/80">
                  <strong className="text-white">Téléchargez uniquement</strong> à partir de ce lien officiel pour éviter les contrefaçons
                </p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/80">
                  <strong className="text-white">Mises à jour automatiques</strong> - L'application vous notifiera des nouvelles versions
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Assistance */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 shadow-lg">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-6 h-6 text-green-600" />
              <h3 className="font-bold text-xl text-gray-900">💬 Assistance</h3>
            </div>

            <p className="text-sm text-gray-700">
              Besoin d'aide pour l'installation ou l'activation de votre compte ?
            </p>

            <a
              href="https://wa.me/22666925190"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full p-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Phone className="w-5 h-5" />
              +226 66 92 51 90
              <ExternalLink className="w-4 h-4" />
            </a>

            <p className="text-xs text-gray-500 text-center">
              Disponible sur WhatsApp • Réponse rapide garantie
            </p>
          </div>
        </Card>

        {/* Footer avec partage */}
        <footer className="text-center space-y-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-center gap-2 text-white/60">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">Fait avec ❤️ au Burkina Faso</span>
          </div>

          <div className="flex items-center justify-center gap-4">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              <span className="text-sm font-medium">Facebook</span>
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent("Téléchargez SILGAPP - L'application de livraison rapide ! " + pageUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              <span className="text-sm font-medium">WhatsApp</span>
            </a>
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent("Téléchargez SILGAPP - L'application de livraison rapide !")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-white transition-colors"
            >
              <span className="text-sm font-medium">Twitter</span>
            </a>
          </div>

          <p className="text-xs text-white/40">
            © 2026 SILGAPP. Tous droits réservés.
          </p>
        </footer>
      </main>
    </div>
  );
}