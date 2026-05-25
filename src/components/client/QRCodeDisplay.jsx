import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function QRCodeDisplay({ course, type }) {
  const [codesGenerated, setCodesGenerated] = React.useState(false);
  const [pickupData, setPickupData] = React.useState(null);
  const [deliveryData, setDeliveryData] = React.useState(null);

  React.useEffect(() => {
    if (course.pickup_qr_token && course.delivery_qr_token) {
      setCodesGenerated(true);
      setPickupData({
        qr_token: course.pickup_qr_token,
        code_4_digits: course.pickup_code_4_digits,
      });
      setDeliveryData({
        qr_token: course.delivery_qr_token,
        code_4_digits: course.delivery_code_4_digits,
      });
    }
  }, [course]);

  const handleGenerateCodes = async () => {
    try {
      const result = await base44.functions.invoke("validateQRCode", {
        course_id: course.id,
        action: "generate_codes",
      });
      
      setCodesGenerated(true);
      setPickupData({
        qr_token: result.pickup_qr_token,
        code_4_digits: result.pickup_code_4_digits,
      });
      setDeliveryData({
        qr_token: result.delivery_qr_token,
        code_4_digits: result.delivery_code_4_digits,
      });
      
      toast.success("Codes QR générés avec succès");
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
  };

  const handleCopyCode = (code, label) => {
    navigator.clipboard.writeText(code);
    toast.success(`${label} copié !`);
  };

  if (!codesGenerated) {
    return (
      <Card className="p-6 text-center">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          Les codes QR seront générés quand la course sera acceptée par un livreur
        </p>
        <Button onClick={handleGenerateCodes} className="gap-2">
          <Package className="w-4 h-4" />
          Générer les codes maintenant
        </Button>
      </Card>
    );
  }

  const isPickup = type === "pickup";
  const data = isPickup ? pickupData : deliveryData;
  const isConfirmed = isPickup ? course.pickup_confirmed_at : course.delivery_confirmed_at;

  if (isConfirmed) {
    return (
      <Card className="p-6 bg-green-50 border-green-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-green-900">
              {isPickup ? "Récupération confirmée" : "Livraison confirmée"}
            </h3>
            <p className="text-sm text-green-700">
              Confirmé par {course[isPickup ? 'pickup_confirmed_by' : 'delivery_confirmed_by'] === 'qr' ? 'QR code' : 'code manuel'}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {new Date(isPickup ? course.pickup_confirmed_at : course.delivery_confirmed_at).toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        {isPickup ? (
          <>
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg">Code de récupération</h3>
          </>
        ) : (
          <>
            <Truck className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-lg">Code de livraison</h3>
          </>
        )}
      </div>

      {/* QR Code */}
      <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300 mb-4">
        <QRCodeSVG 
          value={data.qr_token}
          size={200}
          level="H"
          includeMargin={true}
        />
        <p className="text-xs text-center text-muted-foreground mt-2">
          Présentez ce QR code au livreur pour {isPickup ? "récupérer le colis" : "confirmer la livraison"}
        </p>
      </div>

      {/* Code manuel 4 chiffres */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-blue-900 mb-2">
          Code de secours à 4 chiffres
        </p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 text-center bg-white rounded-lg py-3 px-4 border-2 border-blue-300">
            <span className="text-2xl font-bold text-blue-900 tracking-widest">
              {data.code_4_digits}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCopyCode(data.code_4_digits, "Code")}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Si le scan QR ne fonctionne pas, donnez ce code au livreur
        </p>
      </div>

      {isPickup && course.type_course === "recevoir" && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            💡 Pour une réception : montrez ce code à l'expéditeur quand il viendra récupérer le colis
          </p>
        </div>
      )}

      {!isPickup && course.type_course === "expedier" && course.recipient_has_app === false && (
        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs text-purple-800">
            📱 Le destinataire n'a pas SILGAPP. Ce QR code sera visible sur le lien de suivi WhatsApp
          </p>
        </div>
      )}
    </Card>
  );
}