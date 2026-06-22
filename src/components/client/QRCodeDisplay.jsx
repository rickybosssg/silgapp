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
    <Card className="p-5 border-2 border-dashed border-primary/30">
      <div className="flex items-center gap-2 mb-4">
        {isPickup ? (
          <>
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base">Code de récupération</h3>
          </>
        ) : (
          <>
            <Truck className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-base">Code de livraison</h3>
          </>
        )}
        <Badge variant="outline" className="ml-auto text-xs text-green-700 border-green-300">Actif</Badge>
      </div>

      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
         Présentez ce QR code ou donnez le code à 4 chiffres au livreur pour confirmer{" "}
        {isPickup ? "la récupération du colis" : "la livraison"}.
      </p>

      {/* QR Code */}
      <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 mb-4 flex flex-col items-center">
        <QRCodeSVG
          value={qrToken}
          size={180}
          level="H"
          includeMargin={true}
        />
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          Scannez avec l'app SILGAPP livreur
        </p>
      </div>

      {/* Code PIN */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wide">
          Code de secours
        </p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 text-center bg-white rounded-xl py-3 px-4 border-2 border-blue-200">
            <span className="text-3xl font-black text-blue-900 tracking-[0.4em]">{code4}</span>
          </div>
          <button
            className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center"
            onClick={() => {
              navigator.clipboard.writeText(code4);
              toast.success("Code copié !");
            }}
          >
            <Copy className="w-4 h-4 text-blue-700" />
          </button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Si le scan QR ne fonctionne pas, donnez ce code au livreur
        </p>
      </div>
    </Card>
  );
}
