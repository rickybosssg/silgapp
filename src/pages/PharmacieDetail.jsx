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

  const services = [
    { icon: "💊", label: "Médicaments", desc: "Disponibilité & prix" },
    { icon: "📋", label: "Ordonnance", desc: "Envoyez votre prescription" },
    { icon: "🚚", label: "Livraison", desc: "À domicile via SILGAPP" },
    { icon: "🕐", label: "Garde", desc: "Service d'urgence" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* ── Header bleu foncé premium ── */}
      <div className="relative bg-gradient-to-br from-[#0B1437] via-[#13205C] to-[#1E3A8A] text-white px-4 pt-5 pb-20 sticky top-0 z-20 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-blue-500/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-cyan-400/10 rounded-full blur-2xl" />
        <div className="relative max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate("/client/pharmacies")} className="text-white/70 hover:text-white p-1.5 -ml-1.5 rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black truncate">{pharmacie.nom}</h1>
              <p className="text-blue-200/60 text-[11px] font-medium">Pharmacie partenaire SILGAPP</p>
            </div>
            {isOuvert
              ? <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-100 bg-emerald-500/25 border border-emerald-400/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ouvert
                </span>
              : <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-100 bg-red-500/25 border border-red-400/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Fermé
                </span>}
          </div>
          {/* Logo / image hero */}
          <div className="relative h-36 rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/40 ring-1 ring-white/10">
            {pharmacie.logo_url
              ? <img src={pharmacie.logo_url} alt={pharmacie.nom} className="w-full h-full object-cover" />
              : <img src="https://images.unsplash.com/photo:1631549916768-3c7a4d6e5e9e?w=800&q=80" alt="Pharmacie" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1437]/80 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20">
                <Pill className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-tight">Pharmacie en ligne</p>
                <p className="text-blue-200/70 text-[10px]">Service de garde & livraison</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-14 space-y-4 relative z-10">
        {/* ── Carte bienvenue ── */}
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 ring-1 ring-slate-100 p-5 space-y-3">
          <h2 className="text-base font-black text-slate-900 text-center leading-snug">
            Bienvenue chez <span className="text-blue-700">{pharmacie.nom}</span>
          </h2>
          {pharmacie.description
            ? <p className="text-sm text-slate-500 text-center leading-relaxed">{pharmacie.description}</p>
            : <p className="text-sm text-slate-400 text-center leading-relaxed italic">Votre santé, notre priorité. Commandez vos médicaments en ligne et recevez-les à domicile.</p>}
        </div>

        {/* ── Grille services ── */}
        <div className="grid grid-cols-4 gap-2.5">
          {services.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-2.5 text-center">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center mx-auto mb-1.5 text-lg">{s.icon}</div>
              <p className="text-[10px] font-bold text-slate-800 leading-tight">{s.label}</p>
              <p className="text-[8px] text-slate-400 leading-tight mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Bandeau images médicaments ── */}
        <div className="grid grid-cols-3 gap-2">
          <img src="https://images.unsplash.com/photo-1584308666744-24d5c6f6e2f0?w=400&q=80" alt="Médicaments" className="w-full h-24 rounded-2xl object-cover shadow-md ring-1 ring-slate-100" />
          <img src="https://images.unsplash.com/photo-1471864140706-3a81e9bd0e1f?w=400&q=80" alt="Pharmacie" className="w-full h-24 rounded-2xl object-cover shadow-md ring-1 ring-slate-100" />
          <img src="https://images.unsplash.com/photo-1607619056571-3e9e9e9e9e9e?w=400&q=80" alt="Pilules" className="w-full h-24 rounded-2xl object-cover shadow-md ring-1 ring-slate-100" />
        </div>

        {/* ── Informations utiles ── */}
        <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-100 p-5 space-y-3.5">
          <p className="text-[11px] font-black text-blue-700 uppercase tracking-[0.15em] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Informations utiles
          </p>
          {pharmacie.horaires && (
            <div className="flex items-start gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div className="pt-1"><span className="font-bold text-slate-800">Horaires</span><p className="text-slate-500 text-[13px]">{pharmacie.horaires}</p></div>
            </div>
          )}
          {pharmacie.adresse && (
            <div className="flex items-start gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <div className="pt-1"><span className="font-bold text-slate-800">Adresse</span><p className="text-slate-500 text-[13px]">{pharmacie.adresse}{pharmacie.quartier ? `, ${pharmacie.quartier}` : ""}{pharmacie.ville ? `, ${pharmacie.ville}` : ""}</p></div>
            </div>
          )}
          {pharmacie.telephone && (
            <div className="flex items-start gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-blue-600" />
              </div>
              <div className="pt-1"><span className="font-bold text-slate-800">Téléphone</span><p className="text-slate-500 text-[13px]">{pharmacie.telephone}</p></div>
            </div>
          )}
        </div>

        {/* ── Bouton discuter ── */}
        <button
          onClick={handleStartChat}
          disabled={starting}
          className="w-full bg-gradient-to-r from-[#13205C] to-[#1E3A8A] text-white rounded-2xl p-4 flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 active:scale-[0.98] transition-all disabled:opacity-60 ring-1 ring-blue-400/20"
        >
          {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
          <span className="font-black text-sm tracking-wide">DISCUTER AVEC LA PHARMACIE</span>
        </button>

        <p className="text-[11px] text-slate-400 text-center px-6 leading-relaxed">
          Demandez la disponibilité d'un médicament, envoyez une ordonnance, commandez des produits.
          La pharmacie vous indiquera le montant et son numéro de paiement.
        </p>
      </div>
    </div>
  );
}