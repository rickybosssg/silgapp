import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, Copy, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Affiche automatiquement le QR code + code PIN de récupération ou livraison.
 * Les codes sont générés côté backend à l'acceptation — plus de bouton manuel.
 */
export default function QRCodeDisplay({ course, type }) {
  const isPickup = type === "pickup";
  const qrToken = isPickup ? course.pickup_qr_token : course.delivery_qr_token;
  const code4 = isPickup ? course.pickup_code_4_digits : course.delivery_code_4_digits;
  const confirmedAt = isPickup ? course.pickup_confirmed_at : course.delivery_confirmed_at;
  const confirmedBy = isPickup ? course.pickup_confirmed_by : course.delivery_confirmed_by;

  // Déjà confirmé
  if (confirmedAt) {
    return (
      <Card className="p-5 bg-green-50 border-green-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-900">
              {isPickup ? "Récupération confirmée " : "Livraison confirmée "}
            </h3>
            <p className="text-sm text-green-700">
              Validé par {confirmedBy === "qr" ? "QR code" : "code manuel"}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {new Date(confirmedAt).toLocaleString("fr-FR")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Codes pas encore générés (livreur pas encore assigné)
  if (!qrToken || !code4) {
    return (
      <Card className="p-5 text-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground">
          Le code sera généré automatiquement quand un livreur accepte la course
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border border-slate-200 shadow-md rounded-2xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isPickup ? "bg-red-500" : "bg-accent"}`}>
          {isPickup ? <Package className="w-4 h-4 text-white" /> : <Truck className="w-4 h-4 text-white" />}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-white text-sm leading-tight">{isPickup ? "Code de récupération" : "Code de livraison"}</h3>
          <p className="text-white/50 text-[10px] leading-tight">
            {isPickup ? "Le livreur arrive bientôt" : "Bientôt livré"}
          </p>
        </div>
        <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Actif</Badge>
      </div>

      <div className="p-4">
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Présentez ce QR code ou donnez le code à 4 chiffres au livreur pour confirmer{" "}
          {isPickup ? "la récupération du colis" : "la livraison"}.
        </p>

        {/* QR Code */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-xl mb-3 flex flex-col items-center">
          <div className="bg-white p-3 rounded-xl shadow-sm">
            <QRCodeSVG
              value={qrToken}
              size={160}
              level="H"
              includeMargin={true}
            />
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">
            Scannez avec l'app SILGAPP livreur
          </p>
        </div>

        {/* Code PIN */}
        <div className="bg-slate-900 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
            Code de secours
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-center bg-slate-800 rounded-lg py-2.5 px-4">
              <span className="text-2xl font-black text-white tracking-[0.4em]">{code4}</span>
            </div>
            <button
              className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
              onClick={() => {
                navigator.clipboard.writeText(code4);
                toast.success("Code copié !");
              }}
            >
              <Copy className="w-4 h-4 text-slate-300" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Si le scan QR ne fonctionne pas, donnez ce code au livreur
          </p>
        </div>
      </div>
    </Card>
  );
}