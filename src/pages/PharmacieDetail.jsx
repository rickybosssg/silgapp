import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pill, MapPin, Clock, Phone, Loader2, MessageCircle, Info } from "lucide-react";
import MessagesPage from "@/components/chat/MessagesPage";

export default function PharmacieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.email) {
        base44.entities.ClientExterne.filter({ user_email: u.email })
          .then(c => setClientProfil(c?.[0] || null))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: pharmacie, isLoading } = useQuery({
    queryKey: ["pharmacie", id],
    queryFn: () => base44.entities.Pharmacie.get(id),
    enabled: !!id,
  });

  const handleStartChat = async () => {
    if (!clientProfil) return;
    setStarting(true);
    try {
      const res = await base44.functions.invoke("demarrerConversationPharmacie", { pharmacie_id: id });
      if (res?.data?.conversation_id) {
        setConversationId(res.data.conversation_id);
        setShowChat(true);
      }
    } catch (err) {
      alert("Erreur: " + (err?.message || "échec"));
    }
    setStarting(false);
  };

  if (isLoading || !clientProfil) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!pharmacie) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Pharmacie introuvable</p></div>;

  if (showChat && conversationId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto h-screen bg-white flex flex-col">
          <MessagesPage
            myType="client"
            myId={clientProfil.id}
            myName={`${clientProfil.prenom || ''} ${clientProfil.nom || ''}`.trim() || 'Client'}
            initialConversationId={conversationId}
            onBack={() => { setShowChat(false); setConversationId(null); }}
          />
        </div>
      </div>
    );
  }

  const isOuvert = pharmacie.ouvert && pharmacie.actif;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/client/pharmacies")} className="text-white/80 hover:text-white p-1"><ArrowLeft className="w-6 h-6" /></button>
          <div className="flex-1">
            <h1 className="text-lg font-black">{pharmacie.nom}</h1>
            <p className="text-white/70 text-xs">Pharmacie partenaire SILGAPP</p>
          </div>
          {isOuvert
            ? <span className="text-[10px] font-bold text-green-100 bg-green-500/30 px-2 py-1 rounded-full">Ouvert</span>
            : <span className="text-[10px] font-bold text-red-100 bg-red-500/30 px-2 py-1 rounded-full">Fermé</span>}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Bienvenue */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          {pharmacie.logo_url && <img src={pharmacie.logo_url} alt={pharmacie.nom} className="w-full h-32 rounded-xl object-cover" />}
          <h2 className="text-lg font-black text-gray-900 text-center">
            Bienvenue sur la pharmacie en ligne {pharmacie.nom}
          </h2>
          {pharmacie.description && <p className="text-sm text-gray-600 text-center">{pharmacie.description}</p>}
        </div>

        {/* Informations utiles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-black text-gray-600 uppercase tracking-widest flex items-center gap-1.5"><Info className="w-4 h-4" /> Informations utiles</p>
          {pharmacie.horaires && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div><span className="font-semibold">Horaires: </span>{pharmacie.horaires}</div>
            </div>
          )}
          {pharmacie.adresse && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div><span className="font-semibold">Adresse: </span>{pharmacie.adresse}{pharmacie.quartier ? `, ${pharmacie.quartier}` : ""}{pharmacie.ville ? `, ${pharmacie.ville}` : ""}</div>
            </div>
          )}
          {pharmacie.telephone && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div><span className="font-semibold">Téléphone: </span>{pharmacie.telephone}</div>
            </div>
          )}
        </div>

        {/* Bouton discuter */}
        <button
          onClick={handleStartChat}
          disabled={starting}
          className="w-full bg-gradient-to-r from-gray-700 to-gray-900 text-white rounded-2xl p-5 flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
          <span className="font-black text-base">💬 DISCUTER AVEC LA PHARMACIE</span>
        </button>

        <p className="text-xs text-gray-400 text-center px-4">
          Demandez la disponibilité d'un médicament, envoyez une ordonnance, commandez des produits.
          La pharmacie vous indiquera le montant et son numéro de paiement.
        </p>
      </div>
    </div>
  );
}