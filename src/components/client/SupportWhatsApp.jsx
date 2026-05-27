import React from "react";

const SUPPORT_NUMBER = "22667572857";
const SUPPORT_MSG = "Bonjour SILGAPP 👋\nJ'ai besoin d'aide concernant ma course.";

export function openWhatsAppNative(phone, message = "") {
  // Normaliser le numéro : chiffres uniquement, avec indicatif
  let num = phone?.replace(/\D/g, "") || "";
  // Si commence par 0, remplacer par 226
  if (num.startsWith("0") && num.length <= 9) num = "226" + num.slice(1);
  // Si numéro local (8 chiffres BF), ajouter 226
  if (num.length === 8) num = "226" + num;

  const encoded = encodeURIComponent(message);
  // Sur Android/iOS, whatsapp:// ouvre l'app directement
  // On utilise un lien <a> avec window.open pour éviter de naviguer dans la SPA
  const waUrl = `https://wa.me/${num}?text=${encoded}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
}

export default function SupportWhatsApp({ compact = false }) {
  const handleClick = () => {
    openWhatsAppNative(SUPPORT_NUMBER, SUPPORT_MSG);
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className="flex items-center gap-2 text-green-600 font-semibold text-sm hover:text-green-700 active:scale-95 transition-all"
      >
        <WhatsAppIcon className="w-5 h-5 fill-green-500" />
        Contacter le support
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
          <WhatsAppIcon className="w-6 h-6 fill-green-600" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-green-900 text-sm">Besoin d'aide ?</p>
          <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
            Notre équipe SILGAPP est disponible pour vous assister.
          </p>
          <p className="text-xs text-green-600 font-bold mt-1">📞 67 57 28 57</p>
        </div>
      </div>
      <button
        onClick={handleClick}
        className="w-full h-11 rounded-xl bg-gradient-to-b from-green-500 to-green-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-green-200 active:scale-95 transition-all hover:from-green-600 hover:to-green-700"
      >
        <WhatsAppIcon className="w-5 h-5 fill-white" />
        Contacter le support SILGAPP
      </button>
    </div>
  );
}

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}