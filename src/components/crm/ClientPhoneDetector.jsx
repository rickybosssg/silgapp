import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, UserCheck, UserPlus, Star, UserX, ExternalLink } from "lucide-react";
import ClientFicheDialog from "./ClientFicheDialog";
import { normalizePhone } from "@/lib/crmUtils";

export default function ClientPhoneDetector({ phone, countryCode, onClientFound, onClientName }) {
  const [client, setClient] = useState(null);
  const [searching, setSearching] = useState(false);
  const [ficheOpen, setFicheOpen] = useState(false);

  // Refs pour éviter la boucle de re-rendu : onClientFound/onClientName sont
  // des fonctions inline du parent qui changent à chaque rendu, ce qui recréait
  // searchClient → relançait l'useEffect → boucle infinie.
  const onClientFoundRef = useRef(onClientFound);
  const onClientNameRef = useRef(onClientName);
  onClientFoundRef.current = onClientFound;
  onClientNameRef.current = onClientName;

  const normalizedPhone = normalizePhone(phone, countryCode);
  const normalizedPhoneRef = useRef(normalizedPhone);
  normalizedPhoneRef.current = normalizedPhone;

  const searchClient = useRef(async () => {
    const np = normalizedPhoneRef.current;
    if (!np || np.length < 8) {
      setClient(null);
      return;
    }
    setSearching(true);
    try {
      const results = await base44.entities.ClientExterne.filter({ telephone_normalized: np });
      // Vérifier que le téléphone n'a pas changé pendant la requête
      if (normalizedPhoneRef.current !== np) return;
      if (results && results.length > 0) {
        setClient(results[0]);
        onClientFoundRef.current?.(results[0]);
        if (results[0].nom && !results[0].cree_via_crm) {
          onClientNameRef.current?.(results[0].nom, results[0].prenom);
        }
      } else {
        setClient(null);
        onClientFoundRef.current?.(null);
      }
    } catch {
      setClient(null);
    } finally {
      setSearching(false);
    }
  });

  useEffect(() => {
    if (!normalizedPhone || normalizedPhone.length < 8) {
      setClient(null);
      // setDetectedClient(null) dans le parent — ne touche PAS à clientTelephone.
      // Le traceur dans AdminCourseForm surveille toute écriture dans clientTelephone.
      onClientFoundRef.current?.(null);
      return;
    }
    const timer = setTimeout(() => searchClient.current(), 400);
    return () => clearTimeout(timer);
  }, [normalizedPhone]);

  if (!normalizedPhone || normalizedPhone.length < 8) return null;

  const getBadge = () => {
    if (searching) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold border border-gray-200">
          <Loader2 className="w-3 h-3 animate-spin" /> Recherche...
        </span>
      );
    }
    if (client) {
      const statut = client.statut_crm || "nouveau";
      if (statut === "vip") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-300">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Client VIP
          </span>
        );
      }
      if (statut === "inactif") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-300">
            <UserX className="w-3 h-3" /> Client inactif
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-300">
          <UserCheck className="w-3 h-3" /> Client existant
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold border border-yellow-300">
        <UserPlus className="w-3 h-3" /> Nouveau client
      </span>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mt-1">
        {getBadge()}
        {client && (
          <div className="flex items-center gap-2">
            {client.nb_courses_total > 0 && (
              <span className="text-[10px] text-gray-500 font-medium">
                {client.nb_courses_total} course{client.nb_courses_total > 1 ? "s" : ""} • {Number(client.montant_total_depense || 0).toLocaleString("fr-FR")} FCFA
              </span>
            )}
            <button
              type="button"
              onClick={() => setFicheOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-semibold hover:bg-blue-100 border border-blue-200 transition-all"
            >
              <ExternalLink className="w-3 h-3" /> Fiche client
            </button>
          </div>
        )}
      </div>
      {client && (
        <ClientFicheDialog
          open={ficheOpen}
          onClose={() => setFicheOpen(false)}
          client={client}
        />
      )}
    </>
  );
}