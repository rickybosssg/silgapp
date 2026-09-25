import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Loader2, CheckCircle, ArrowLeft, Mail, Phone, User, MapPin } from "lucide-react";

export default function InscriptionLivreurEntreprise() {
  const [phase, setPhase] = useState("verify");
  const [branding, setBranding] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    telephone: "",
    email: "",
    vehicule: "moto",
    ville: "",
    quartier: "",
  });

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      setError("Token d'invitation manquant");
      setPhase("error");
      return;
    }
    verifyInvitation(token);
  }, []);

  const verifyInvitation = async (tok) => {
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", {
        action: "verify_invitation",
        token: tok,
      });
      setBranding(res.enterprise);
      setPhase("form");
    } catch (err) {
      setError(err?.message || "Invitation invalide ou expirée");
      setPhase("error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageDriverInvitation", {
        action: "accept_invitation",
        token,
        ...form,
        email: form.email.trim().toLowerCase(),
      });
      setPhase("success");
    } catch (err) {
      setError(err?.message || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = branding?.couleur_primaire || "#007AFF";
  const agencyName = branding?.nom_commercial || branding?.nom || "Agence";

  if (phase === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Invitation invalide</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <p className="text-xs text-gray-400">Contactez votre agence pour obtenir un nouveau lien d'invitation.</p>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Demande envoyée !</h1>
          <p className="text-sm text-gray-500 mb-2">
            Votre demande d'inscription a bien été reçue par <strong>{agencyName}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Vérifiez votre email pour activer votre compte. L'agence validera ensuite votre inscription.
          </p>
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec branding agence */}
      <header
        className="sticky top-0 z-40 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}DD)` }}
      >
        <div className="max-w-md mx-auto px-4 py-6 text-center">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={agencyName}
              className="w-16 h-16 rounded-2xl object-cover bg-white/10 mx-auto mb-3"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-8 h-8" />
            </div>
          )}
          <h1 className="text-lg font-bold">Rejoignez {agencyName}</h1>
          <p className="text-xs opacity-80 mt-1">Propulsé par SILGAPP</p>
        </div>
      </header>

      {/* Formulaire */}
      <main className="max-w-md mx-auto px-4 py-6 pb-20">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-center mb-4">
            <h2 className="text-base font-bold text-gray-900">Inscription Livreur</h2>
            <p className="text-xs text-gray-500">Remplissez vos informations pour rejoindre l'agence</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Prénom</label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={form.prenom}
                  onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
                  placeholder="Prénom"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Nom *</label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
                  placeholder="Nom"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Téléphone *</label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
                placeholder="XX XX XX XX"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">E-mail *</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
                placeholder="nom@exemple.com"
                required
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Votre email sera normalisé automatiquement.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Véhicule</label>
            <select
              value={form.vehicule}
              onChange={(e) => setForm({ ...form, vehicule: e.target.value })}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm bg-white"
            >
              <option value="moto">Moto</option>
              <option value="velo">Vélo</option>
              <option value="voiture">Voiture</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Ville</label>
              <div className="relative mt-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                  className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
                  placeholder="Ville"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Quartier</label>
              <input
                type="text"
                value={form.quartier}
                onChange={(e) => setForm({ ...form, quartier: e.target.value })}
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm mt-1"
                placeholder="Quartier"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-white font-bold text-sm shadow-lg transition-opacity disabled:opacity-60"
            style={{ background: primaryColor }}
          >
            {loading ? "Inscription..." : "Envoyer ma demande"}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Votre demande sera examinée par l'agence. Vous recevrez un email d'activation.
          </p>
        </form>
      </main>
    </div>
  );
}