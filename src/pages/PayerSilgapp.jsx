import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Wallet, Upload, CheckCircle2, Phone, Image as ImageIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const NUMERO_DEPOT = "+226 66 92 51 90";

const TYPE_DETTE_LABEL = {
  commission_livreur: "Commission livreur due",
  frais_annulation_client: "Frais d'annulation client",
  commission_boutique: "Commission boutique due",
  commission_restaurant: "Commission restaurant due",
};

export default function PayerSilgapp({ userType: forcedType }) {
  const [userType, setUserType] = useState(forcedType || null);
  const [userInfo, setUserInfo] = useState(null);
  const [montantDu, setMontantDu] = useState(0);
  const [montantPaye, setMontantPaye] = useState("");
  const [preuveUrl, setPreuveUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Detect user type and fetch debt
  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        if (!me) return;

        // Try to find in Livreur
        const livreurs = await base44.entities.Livreur.filter({ user_email: me.email }).catch(() => []);
        if (livreurs?.length > 0) {
          setUserType("livreur");
          setUserInfo({ id: livreurs[0].id, nom: `${livreurs[0].prenom || ""} ${livreurs[0].nom || ""}`.trim(), telephone: livreurs[0].telephone, country_code: livreurs[0].country_code });
          setMontantDu(livreurs[0].montant_du_silga || 0);
          return;
        }

        // Try ClientExterne
        const clients = await base44.entities.ClientExterne.filter({ user_email: me.email }).catch(() => []);
        if (clients?.length > 0) {
          setUserType("client");
          setUserInfo({ id: clients[0].id, nom: clients[0].nom || clients[0].prenom || "", telephone: clients[0].telephone, country_code: clients[0].country_code });
          // Fetch unpaid frais annulation
          const frais = await base44.entities.FraisAnnulation.filter({ client_id: clients[0].id }).catch(() => []);
          const impaye = (frais || []).filter(f => f.statut_paiement !== "paye").reduce((s, f) => s + (f.montant || 0), 0);
          setMontantDu(impaye);
          return;
        }

        // Try Boutique
        const boutiques = await base44.entities.Boutique.filter({ user_email: me.email }).catch(() => []);
        if (boutiques?.length > 0) {
          setUserType("boutique");
          setUserInfo({ id: boutiques[0].id, nom: boutiques[0].nom, telephone: boutiques[0].telephone, country_code: boutiques[0].pays_code });
          setMontantDu(boutiques[0].montant_du_silga || 0);
          return;
        }

        // Try Restaurant
        const restaurants = await base44.entities.Restaurant.filter({ user_email: me.email }).catch(() => []);
        if (restaurants?.length > 0) {
          setUserType("restaurant");
          setUserInfo({ id: restaurants[0].id, nom: restaurants[0].nom, telephone: restaurants[0].telephone, country_code: restaurants[0].pays_code });
          setMontantDu(restaurants[0].montant_du_silga || 0);
          return;
        }
      } catch (e) {
        console.error("PayerSilgapp init error:", e);
      }
    };
    init();
  }, []);

  // Poll for dynamic debt updates
  useEffect(() => {
    if (!userInfo || !userType) return;
    const interval = setInterval(async () => {
      try {
        if (userType === "livreur") {
          const l = await base44.entities.Livreur.filter({ id: userInfo.id });
          if (l?.[0]) setMontantDu(l[0].montant_du_silga || 0);
        } else if (userType === "client") {
          const frais = await base44.entities.FraisAnnulation.filter({ client_id: userInfo.id });
          const impaye = (frais || []).filter(f => f.statut_paiement !== "paye").reduce((s, f) => s + (f.montant || 0), 0);
          setMontantDu(impaye);
        } else if (userType === "boutique") {
          const b = await base44.entities.Boutique.filter({ id: userInfo.id });
          if (b?.[0]) setMontantDu(b[0].montant_du_silga || 0);
        } else if (userType === "restaurant") {
          const r = await base44.entities.Restaurant.filter({ id: userInfo.id });
          if (r?.[0]) setMontantDu(r[0].montant_du_silga || 0);
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [userInfo, userType]);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPreuveUrl(file_url);
      toast.success("Preuve téléversée");
    } catch (e) {
      toast.error("Erreur téléversement");
    } finally {
      setUploading(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("soumettrePaiementSilgapp", {
        user_type: userType,
        user_id: userInfo.id,
        user_nom: userInfo.nom,
        user_telephone: userInfo.telephone,
        type_dette: userType === "livreur" ? "commission_livreur" : userType === "client" ? "frais_annulation_client" : userType === "boutique" ? "commission_boutique" : "commission_restaurant",
        montant_du: montantDu,
        montant_paye: Number(montantPaye),
        preuve_url: preuveUrl,
        country_code: userInfo.country_code,
      });
      if (res?.data?.success === false) throw new Error(res.data.error);
      return res;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Preuve envoyée");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Demande envoyée</h2>
          <p className="text-sm text-gray-500">Votre demande est en cours de traitement.</p>
          <p className="text-xs text-gray-400">Vous recevrez une notification dès qu'un administrateur aura traité votre paiement.</p>
          <Link to="/">
            <Button className="w-full mt-4">Retour</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!userType) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  const typeDette = userType === "livreur" ? "commission_livreur" : userType === "client" ? "frais_annulation_client" : userType === "boutique" ? "commission_boutique" : "commission_restaurant";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-lg font-black text-gray-900">Payer SILGAPP</h1>
            <p className="text-xs text-gray-500">{TYPE_DETTE_LABEL[typeDette]}</p>
          </div>
        </div>

        {/* Montant dû — carte principale */}
        <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-3xl p-6 text-white text-center shadow-lg">
          <Wallet className="w-10 h-10 mx-auto mb-2 opacity-70" />
          <p className="text-xs opacity-80 mb-1">Montant dû à SILGAPP</p>
          <p className="text-4xl font-black">{montantDu.toLocaleString()}<span className="text-lg font-normal ml-1">F</span></p>
          <span className="inline-block mt-2 text-xs bg-white/20 px-3 py-1 rounded-full">{TYPE_DETTE_LABEL[typeDette]}</span>
        </div>

        {/* Numéro de dépôt */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Phone className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Numéro de dépôt (Orange Money)</p>
            <p className="font-black text-gray-900 text-lg">{NUMERO_DEPOT}</p>
          </div>
        </div>

        {montantDu <= 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <p className="font-bold text-green-800">Vous êtes à jour !</p>
            <p className="text-xs text-green-600 mt-1">Aucun montant dû à SILGAPP pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Montant payé */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 shadow-sm">
              <label className="text-sm font-semibold text-gray-700">Montant payé</label>
              <Input type="number" placeholder="Ex: 1000" value={montantPaye}
                onChange={e => setMontantPaye(e.target.value)}
                className="text-lg font-bold" />
              {Number(montantPaye) > 0 && Number(montantPaye) > montantDu && (
                <p className="text-xs text-red-500 font-medium">Le montant payé ne peut pas dépasser le montant dû ({montantDu.toLocaleString()} F)</p>
              )}
            </div>

            {/* Preuve de dépôt */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 shadow-sm">
              <label className="text-sm font-semibold text-gray-700">Photo de la preuve de dépôt</label>
              {preuveUrl ? (
                <div className="relative">
                  <img src={preuveUrl} alt="Preuve" className="w-full rounded-xl max-h-64 object-cover" />
                  <button onClick={() => setPreuveUrl(null)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-primary transition-colors">
                  {uploading ? (
                    <p className="text-sm text-gray-400">Téléversement...</p>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-xs text-gray-400">Cliquer pour ajouter une photo</p>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => handleUpload(e.target.files?.[0])} disabled={uploading} />
                </label>
              )}
            </div>

            {/* Bouton envoyer */}
            <Button
              className="w-full h-14 text-base font-black rounded-2xl"
              disabled={!montantPaye || !preuveUrl || submitMutation.isPending || uploading || Number(montantPaye) > montantDu}
              onClick={() => submitMutation.mutate()}
            >
              {submitMutation.isPending ? "Envoi..." : "Envoyer ma preuve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}