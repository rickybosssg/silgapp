import React from "react";

/**
 * InvitationWhatsAppModal
 * Affiché après création réussie d'une course si la personne contactée
 * (expéditeur ou destinataire) n'est pas inscrite sur SILGAPP.
 *
 * Props:
 * telephone — numéro de la personne à inviter
 * nomContact — nom de la personne à inviter (si connu)
 * nomExpediteur — nom du client qui envoie l'invitation
 * onClose — fermer sans envoyer
 * onSend — appelé juste avant d'ouvrir WhatsApp (pour future API)
 */
export default function InvitationWhatsAppModal({ telephone, nomContact, nomExpediteur, onClose, onSend }) {
  const normaliserTel = (tel) => {
    if (!tel) return "";
    const digits = tel.replace(/\D/g, "");
    if (digits.startsWith("226") && digits.length >= 11) return digits;
    if (digits.length === 8) return "226" + digits;
    if (digits.length > 8) return digits;
    return digits;
  };

  const handleEnvoyer = () => {
    onSend?.();

    const expediteur = nomExpediteur || "Votre contact";
    const message = `Bonjour

${expediteur} est en train de vous envoyer un colis via SILGAPP.

Pour suivre vos livraisons, recevoir vos colis plus facilement et profiter de tous les services SILGAPP, installez l'application dès maintenant :

https://silga-dispatch-go.base44.app
https://silga-dispatch-go.base44.app/telecharger

 Suivi des colis
 Livraisons rapides
 Géolocalisation en temps réel

Merci et bienvenue sur SILGAPP.`;

    const telNormalise = normaliserTel(telephone);
    const url = `https://wa.me/${telNormalise}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header vert */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 pt-7 pb-5 text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <span className="text-4xl"></span>
          </div>
          <h2 className="text-xl font-black text-white">Course créée avec succès !</h2>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 space-y-4">
          {/* Icône WhatsApp + texte */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-600" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm leading-snug">
                {nomContact
                  ? <><span className="text-green-700">{nomContact}</span> n'est pas encore inscrit(e) sur SILGAPP.</>
                  : "Cette personne n'est pas encore inscrite sur SILGAPP."
                }
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Souhaitez-vous lui envoyer une invitation afin qu'elle puisse suivre ses colis et utiliser SILGAPP&nbsp;?
              </p>
            </div>
          </div>

          {/* Aperçu numéro */}
          {telephone && (
            <div className="bg-gray-50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold uppercase">Vers</span>
              <span className="text-sm font-bold text-gray-800 font-mono">{telephone}</span>
            </div>
          )}
        </div>

        {/* Boutons */}
        <div className="px-6 pb-7 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="h-12 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50 transition-all"
          >
            Plus tard
          </button>
          <button
            onClick={handleEnvoyer}
            className="h-12 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-sm shadow-lg shadow-green-200 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Envoyer l'invitation
          </button>
        </div>
      </div>
    </div>
  );
}