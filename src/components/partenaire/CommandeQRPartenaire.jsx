import React from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, QrCode, KeyRound, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * Affiche le QR Code et le PIN de récupération partenaire.
 * Le partenaire montre ces codes au livreur pour qu'il valide la récupération.
 */
export default function CommandeQRPartenaire({ courseId }) {
  const { data: course, isLoading } = useQuery({
    queryKey: ["course-externe", courseId],
    queryFn: () => base44.entities.CourseExterne.get(courseId),
    enabled: !!courseId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!course) return null;

  const pickupQR = course.pickup_qr_token;
  const pickupPIN = course.pickup_code_4_digits;

  // Ne pas afficher si déjà récupéré ou si pas de codes
  if (course.statut === "colis_recupere" || course.statut === "en_livraison" || course.statut === "livree") {
    return (
      <div className="mx-4 mb-2 rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2">
        <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-xs font-bold text-green-700">Colis récupéré par le livreur</p>
      </div>
    );
  }

  if (!pickupQR && !pickupPIN) return null;

  return (
    <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="w-4 h-4 text-purple-600" />
        <p className="text-xs font-black text-purple-700 uppercase tracking-wide">
          Codes de récupération — à montrer au livreur
        </p>
      </div>

      <div className="flex gap-4 items-center">
        {/* QR Code */}
        {pickupQR && (
          <div className="flex flex-col items-center gap-1">
            <div className="bg-white p-2 rounded-xl border-2 border-purple-200 shadow-sm">
              <QRCodeSVG value={pickupQR} size={120} level="M" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">QR Code</p>
          </div>
        )}

        {/* PIN Code */}
        {pickupPIN && (
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Code PIN</p>
            <div className="text-3xl font-black text-purple-700 tracking-[0.3em] bg-white px-4 py-2 rounded-xl border-2 border-purple-200">
              {pickupPIN}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Le livreur doit scanner le QR Code ou saisir le PIN pour confirmer la récupération.
      </p>
    </div>
  );
}
