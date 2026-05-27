import React from "react";
import { Phone, MessageCircle, Star, Bike, Car } from "lucide-react";
import { Card } from "@/components/ui/card";

function openWhatsApp(phone) {
  const num = (phone || "").replace(/\D/g, "");
  window.location.href = `whatsapp://send?phone=${num}`;
  setTimeout(() => window.open(`https://wa.me/${num}`, "_blank"), 1500);
}

function vehiculeLabel(v) {
  if (v === "voiture") return "🚗 Voiture";
  if (v === "velo") return "🚲 Vélo";
  if (v === "a_pied") return "🚶 À pied";
  return "🏍️ Moto";
}

export default function LivreurAssigneCard({ course }) {
  if (!course?.livreur_id) return null;

  const prenom = course.livreur_nom
    ? course.livreur_nom.split(" ")[0]
    : "Livreur";

  const noteMoyenne = course.livreur_note_moyenne || 0;
  const nombreAvis = course.livreur_nombre_avis || 0;

  return (
    <Card className="overflow-hidden border-2 border-green-200 shadow-lg">
      {/* Header vert style Uber */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3">
        <p className="text-white text-xs font-semibold opacity-90">
          🎉 {prenom} a accepté votre course !
        </p>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar / Photo */}
          <div className="relative flex-shrink-0">
            {course.livreur_photo_url ? (
              <img
                src={course.livreur_photo_url}
                alt={prenom}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-green-200 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center border-2 border-green-200">
                <span className="text-2xl font-black text-green-600">
                  {prenom.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Indicateur en ligne */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          </div>

          {/* Infos */}
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-gray-900">{prenom}</p>

            {/* Note */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {noteMoyenne > 0 ? (
                <>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= Math.round(noteMoyenne)
                            ? "fill-yellow-400 text-yellow-400"
                            : "fill-gray-200 text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-gray-700">
                    {noteMoyenne.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({nombreAvis} avis)
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400 italic">Nouveau livreur</span>
              )}
            </div>

            {/* Véhicule */}
            {course.livreur_vehicule && (
              <p className="text-xs text-gray-500 mt-1">
                {vehiculeLabel(course.livreur_vehicule)}
              </p>
            )}
          </div>
        </div>

        {/* Boutons contact */}
        {course.livreur_telephone && (
          <div className="flex gap-2 mt-4">
            <a
              href={`tel:${course.livreur_telephone}`}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm border border-blue-100 active:bg-blue-100"
            >
              <Phone className="w-4 h-4" />
              Appeler
            </a>
            <button
              onClick={() => openWhatsApp(course.livreur_telephone)}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-green-50 text-green-700 font-semibold text-sm border border-green-100 active:bg-green-100"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}