import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Baby,
  Bandage,
  Clock,
  CreditCard,
  FileText,
  HeartPulse,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Pill,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  Thermometer,
  Truck,
} from "lucide-react";
import MessagesPage from "@/components/chat/MessagesPage";

const VENUS_AVATAR_URL = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const serviceCards = [
  { Icon: Pill, label: "Medicaments", desc: "Disponibilite et prix" },
  { Icon: FileText, label: "Ordonnance", desc: "Envoyez votre prescription" },
  { Icon: Truck, label: "Livraison", desc: "A domicile via SILGAPP" },
  { Icon: ShieldCheck, label: "Garde", desc: "Service d'urgence" },
];

const frequentProducts = [
  { Icon: Pill, label: "Medicaments", desc: "Disponibilite a confirmer" },
  { Icon: HeartPulse, label: "Antalgiques", desc: "Douleurs et fievres" },
  { Icon: Thermometer, label: "Thermometres", desc: "Controle temperature" },
  { Icon: Bandage, label: "Pansements", desc: "Premiers soins" },
  { Icon: Sparkles, label: "Produits de soins", desc: "Hygiene et bien-etre" },
  { Icon: Baby, label: "Produits bebe", desc: "Soins enfant" },
  { Icon: Stethoscope, label: "Materiel medical", desc: "Selon disponibilite" },
  { Icon: Syringe, label: "Vitamines", desc: "Conseil pharmacie" },
];

const benefits = [
  { Icon: FileText, text: "Envoyez votre ordonnance directement a la pharmacie." },
  { Icon: Send, text: "Verifiez la disponibilite avant de vous deplacer." },
  { Icon: CreditCard, text: "Payez au numero Mobile Money de la pharmacie." },
  { Icon: Truck, text: "Demandez une livraison a domicile avec suivi SILGAPP." },
];

export default function PharmacieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    base44.auth.me().then((user) => {
      if (!user?.email) return;
      base44.entities.ClientExterne.filter({ user_email: user.email })
        .then((clients) => setClientProfil(clients?.[0] || null))
        .catch(() => {});
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
      const response = await base44.functions.invoke("demarrerConversationPharmacie", {
        pharmacie_id: id,
      });
      if (response?.data?.conversation_id) {
        setConversationId(response.data.conversation_id);
        setShowChat(true);
      }
    } catch (error) {
      alert("Erreur: " + (error?.message || "echec du demarrage de la discussion"));
    } finally {
      setStarting(false);
    }
  };

  if (isLoading || !clientProfil) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!pharmacie) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Pharmacie introuvable</p>
      </div>
    );
  }

  if (showChat && conversationId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-lg mx-auto h-screen bg-white flex flex-col">
          <MessagesPage
            myType="client"
            myId={clientProfil.id}
            myName={`${clientProfil.prenom || ""} ${clientProfil.nom || ""}`.trim() || "Client"}
            initialConversationId={conversationId}
            onBack={() => {
              setShowChat(false);
              setConversationId(null);
            }}
          />
        </div>
      </div>
    );
  }

  const isOuvert = pharmacie.ouvert && pharmacie.actif;
  const address = [
    pharmacie.adresse,
    pharmacie.quartier,
    pharmacie.ville,
  ].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="relative bg-gradient-to-br from-[#071737] via-[#0B2A5B] to-[#0F4C81] text-white px-4 pt-5 pb-20 sticky top-0 z-20 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-cyan-400/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-blue-300/10 rounded-full blur-2xl" />

        <div className="relative max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate("/client/pharmacies")}
              className="text-white/75 hover:text-white p-1.5 -ml-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black truncate">{pharmacie.nom}</h1>
              <p className="text-blue-100/70 text-[11px] font-medium">Pharmacie partenaire SILGAPP</p>
            </div>

            {isOuvert ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-100 bg-emerald-500/25 border border-emerald-400/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ouvert
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-100 bg-red-500/25 border border-red-400/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Ferme
              </span>
            )}
          </div>

          <div className="relative h-36 rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/40 ring-1 ring-white/10">
            <img
              src={pharmacie.logo_url || "https://images.unsplash.com/photo-1631549916768-3c7a4d6e5e9e?w=900&q=80"}
              alt={pharmacie.nom}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#071737]/85 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20">
                <Pill className="w-5 h-5 text-cyan-200" />
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-tight">Pharmacie en ligne</p>
                <p className="text-blue-100/70 text-[10px]">Ordonnance, paiement et livraison</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-14 space-y-4 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-blue-900/5 ring-1 ring-slate-100 p-5 space-y-3">
          <h2 className="text-base font-black text-slate-900 text-center leading-snug">
            Bienvenue sur la pharmacie en ligne <span className="text-blue-700">{pharmacie.nom}</span>
          </h2>
          <p className="text-sm text-slate-500 text-center leading-relaxed">
            {pharmacie.description || "Demandez un produit, envoyez une ordonnance ou une preuve de paiement directement dans la discussion."}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          {serviceCards.map(({ Icon, label, desc }) => (
            <div key={label} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-2.5 text-center">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center mx-auto mb-1.5">
                <Icon className="w-5 h-5 text-blue-700" />
              </div>
              <p className="text-[10px] font-bold text-slate-800 leading-tight">{label}</p>
              <p className="text-[8px] text-slate-400 leading-tight mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-100 p-5 space-y-4">
          <div>
            <p className="text-[11px] font-black text-blue-700 uppercase tracking-[0.15em]">Produits frequemment demandes</p>
            <p className="text-xs text-slate-500 mt-1">Ces categories servent a orienter la discussion. Elles ne representent pas un stock garanti.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {frequentProducts.map(({ Icon, label, desc }) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 leading-tight">{label}</p>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900 to-slate-950 rounded-3xl shadow-xl shadow-blue-900/10 p-5 text-white overflow-hidden relative">
          <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-cyan-400/10 blur-2xl" />
          <div className="relative flex gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/10 ring-1 ring-white/15 overflow-hidden flex-shrink-0">
              <img src={VENUS_AVATAR_URL} alt="Venus SILGAPP" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-black">Venus vous souhaite la bienvenue.</p>
              <p className="text-xs text-blue-100/80 leading-relaxed mt-1">
                Envoyez votre ordonnance, verifiez la disponibilite de vos produits et faites-vous livrer rapidement avec SILGAPP.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-100 p-5 space-y-3">
          <p className="text-[11px] font-black text-blue-700 uppercase tracking-[0.15em]">Pourquoi utiliser la pharmacie en ligne ?</p>
          <div className="space-y-3">
            {benefits.map(({ Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-blue-700" />
                </div>
                <p className="text-sm text-slate-600 leading-relaxed pt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-100 p-5 space-y-3.5">
          <p className="text-[11px] font-black text-blue-700 uppercase tracking-[0.15em] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Informations utiles
          </p>

          {pharmacie.horaires && (
            <InfoRow icon={<Clock className="w-4 h-4 text-blue-700" />} title="Horaires" text={pharmacie.horaires} />
          )}

          {address && (
            <InfoRow icon={<MapPin className="w-4 h-4 text-blue-700" />} title="Adresse" text={address} />
          )}

          {pharmacie.telephone && (
            <InfoRow icon={<Phone className="w-4 h-4 text-blue-700" />} title="Telephone" text={pharmacie.telephone} />
          )}

          {pharmacie.informations_utiles && (
            <InfoRow icon={<FileText className="w-4 h-4 text-blue-700" />} title="A savoir" text={pharmacie.informations_utiles} />
          )}
        </div>

        <button
          onClick={handleStartChat}
          disabled={starting}
          className="w-full bg-gradient-to-r from-[#071737] to-[#0F4C81] text-white rounded-2xl p-4 flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 active:scale-[0.98] transition-all disabled:opacity-60 ring-1 ring-blue-400/20"
        >
          {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
          <span className="font-black text-sm tracking-wide">DISCUTER AVEC LA PHARMACIE</span>
        </button>

        <p className="text-[11px] text-slate-400 text-center px-6 leading-relaxed">
          Vous pouvez demander la disponibilite d'un medicament, envoyer une ordonnance, un audio ou une preuve de paiement.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon, title, text }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="pt-1">
        <span className="font-bold text-slate-800">{title}</span>
        <p className="text-slate-500 text-[13px]">{text}</p>
      </div>
    </div>
  );
}
