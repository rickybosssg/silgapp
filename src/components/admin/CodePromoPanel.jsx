import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Tag, ToggleLeft, ToggleRight, Users, TrendingUp, Gift, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const PAYS_LISTE = [
  { code: "BF", nom: "Burkina Faso", emoji: "🇧🇫" },
  { code: "CI", nom: "Côte d'Ivoire", emoji: "🇨🇮" },
  { code: "TG", nom: "Togo", emoji: "🇹🇬" },
  { code: "BJ", nom: "Bénin", emoji: "🇧🇯" },
  { code: "SN", nom: "Sénégal", emoji: "🇸🇳" },
  { code: "ML", nom: "Mali", emoji: "🇲🇱" },
  { code: "GN", nom: "Guinée", emoji: "🇬🇳" },
  { code: "NE", nom: "Niger", emoji: "🇳🇪" },
];

function CreateCodeModal({ onClose, onCreated }) {
  const [code, setCode] = useState("");
  const [proprietaireNom, setProprietaireNom] = useState("");
  const [proprietaireEmail, setProprietaireEmail] = useState("");
  const [countryCode, setCountryCode] = useState("BF");
  const [loading, setLoading] = useState(false);
  const [proprietaireType, setProprietaireType] = useState("client"); // "client" | "livreur"
  const [livreurSearch, setLivreurSearch] = useState("");
  const [livreurResults, setLivreurResults] = useState([]);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [searching, setSearching] = useState(false);
  const [partenaireSearch, setPartenaireSearch] = useState("");
  const [partenaireResults, setPartenaireResults] = useState([]);
  const [selectedPartenaire, setSelectedPartenaire] = useState(null);

  const searchLivreurs = async (query) => {
    setLivreurSearch(query);
    if (!query || query.length < 2) { setLivreurResults([]); return; }
    setSearching(true);
    try {
      const results = await base44.entities.Livreur.list("-created_date", 20);
      const filtered = results.filter(l => {
        const nom = `${l.prenom || ""} ${l.nom || ""}`.toLowerCase();
        const tel = (l.telephone || "").toLowerCase();
        return nom.includes(query.toLowerCase()) || tel.includes(query.toLowerCase());
      });
      setLivreurResults(filtered);
    } catch {}
    setSearching(false);
  };

  const selectLivreur = (livreur) => {
    setSelectedLivreur(livreur);
    setProprietaireNom(`${livreur.prenom || ""} ${livreur.nom || ""}`.trim());
    setProprietaireEmail(livreur.user_email || "");
    setLivreurSearch("");
    setLivreurResults([]);
  };

  const searchPartenaires = async (query) => {
    setPartenaireSearch(query);
    if (!query || query.length < 2) { setPartenaireResults([]); return; }
    setSearching(true);
    try {
      const [boutiques, restaurants, pharmacies] = await Promise.all([
        base44.entities.Boutique.list("-created_date", 50),
        base44.entities.Restaurant.list("-created_date", 50),
        base44.entities.Pharmacie.list("-created_date", 50),
      ]);
      const q = query.toLowerCase();
      const match = (e, type) => (e.nom || "").toLowerCase().includes(q) || (e.quartier || "").toLowerCase().includes(q);
      const results = [
        ...(boutiques || []).filter(e => match(e)).map(e => ({ ...e, _type: "boutique" })),
        ...(restaurants || []).filter(e => match(e)).map(e => ({ ...e, _type: "restaurant" })),
        ...(pharmacies || []).filter(e => match(e)).map(e => ({ ...e, _type: "pharmacie" })),
      ];
      setPartenaireResults(results.slice(0, 20));
    } catch {}
    setSearching(false);
  };

  const selectPartenaire = (etab) => {
    setSelectedPartenaire(etab);
    setProprietaireNom(etab.nom || "");
    setProprietaireEmail(etab.user_email || "");
    setPartenaireSearch("");
    setPartenaireResults([]);
  };

  const handleCreate = async () => {
    if (!code.trim() || !proprietaireNom.trim() || !countryCode) {
      toast.error("Code, nom propriétaire et pays sont obligatoires");
      return;
    }
    if (proprietaireType === "livreur" && !selectedLivreur) {
      toast.error("Sélectionnez un livreur dans les résultats de recherche");
      return;
    }
    if (proprietaireType === "partenaire" && !selectedPartenaire) {
      toast.error("Sélectionnez un établissement dans les résultats de recherche");
      return;
    }
    setLoading(true);
    // Vérifier unicité du code
    const existing = await base44.entities.CodePromo.filter({ code: code.trim().toUpperCase() });
    if (existing?.length > 0) {
      toast.error("Ce code promo existe déjà");
      setLoading(false);
      return;
    }

    // Chercher si le propriétaire a un ClientExterne (si type client)
    // Insensible à la casse — l'email User est toujours en minuscules
    let proprietaireClientId = null;
    if (proprietaireType === "client" && proprietaireEmail) {
      try {
        const allClients = await base44.entities.ClientExterne.list("-created_date", 500);
        const emailLower = proprietaireEmail.trim().toLowerCase();
        const found = allClients.find(c => (c.user_email || "").toLowerCase() === emailLower || (c.email || "").toLowerCase() === emailLower);
        if (found) proprietaireClientId = found.id;
      } catch {}
    }

    const created = await base44.entities.CodePromo.create({
      code: code.trim().toUpperCase(),
      proprietaire_nom: proprietaireNom.trim(),
      proprietaire_email: proprietaireEmail.trim() || null,
      proprietaire_client_id: proprietaireType === "client" ? proprietaireClientId : null,
      proprietaire_livreur_id: proprietaireType === "livreur" ? (selectedLivreur?.id || null) : null,
      proprietaire_partenaire_id: proprietaireType === "partenaire" ? (selectedPartenaire?.partenaire_id || null) : null,
      proprietaire_type: proprietaireType,
      country_code: countryCode,
      actif: true,
      nb_inscrits: 0,
      nb_premieres_courses: 0,
      total_primes_generees: 0,
    });
    toast.success(`Code promo ${created.code} créé !`);
    setLoading(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Nouveau code promo</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-3">
          {/* Type de propriétaire */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Type de propriétaire *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setProprietaireType("client"); setSelectedLivreur(null); setSelectedPartenaire(null); }}
                className={`h-10 rounded-lg border-2 text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  proprietaireType === "client"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 hover:border-primary/40 text-gray-600"
                }`}
              >
                👤 Client
              </button>
              <button
                type="button"
                onClick={() => { setProprietaireType("livreur"); setSelectedPartenaire(null); }}
                className={`h-10 rounded-lg border-2 text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  proprietaireType === "livreur"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 hover:border-primary/40 text-gray-600"
                }`}
              >
                🏍️ Livreur
              </button>
              <button
                type="button"
                onClick={() => { setProprietaireType("partenaire"); setSelectedLivreur(null); }}
                className={`h-10 rounded-lg border-2 text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                  proprietaireType === "partenaire"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 hover:border-primary/40 text-gray-600"
                }`}
              >
                🏪 Partenaire
              </button>
            </div>
          </div>

          {/* Recherche partenaire si type = partenaire */}
          {proprietaireType === "partenaire" && (
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Rechercher un établissement *</label>
              <Input
                value={partenaireSearch}
                onChange={e => searchPartenaires(e.target.value)}
                placeholder="Nom de boutique, restaurant ou pharmacie..."
                disabled={!!selectedPartenaire}
              />
              {selectedPartenaire ? (
                <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <div>
                    <p className="text-sm font-bold text-green-800">{selectedPartenaire.nom}</p>
                    <p className="text-xs text-green-600 capitalize">{selectedPartenaire._type} · {selectedPartenaire.quartier || selectedPartenaire.ville || ""}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedPartenaire(null); setProprietaireNom(""); setProprietaireEmail(""); }}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                partenaireResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-1">
                    {partenaireResults.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => selectPartenaire(e)}
                        className="w-full text-left p-2 rounded hover:bg-gray-100 transition-colors"
                      >
                        <p className="text-sm font-semibold">{e.nom}</p>
                        <p className="text-xs text-gray-500 capitalize">{e._type} · {e.quartier || e.ville || ""}</p>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Recherche livreur si type = livreur */}
          {proprietaireType === "livreur" && (
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Rechercher un livreur *</label>
              <Input
                value={livreurSearch}
                onChange={e => searchLivreurs(e.target.value)}
                placeholder="Nom ou téléphone..."
                disabled={!!selectedLivreur}
              />
              {selectedLivreur ? (
                <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <div>
                    <p className="text-sm font-bold text-green-800">{selectedLivreur.prenom} {selectedLivreur.nom}</p>
                    <p className="text-xs text-green-600">{selectedLivreur.telephone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedLivreur(null); setProprietaireNom(""); setProprietaireEmail(""); }}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                livreurResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-1">
                    {livreurResults.map(l => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => selectLivreur(l)}
                        className="w-full text-left p-2 rounded hover:bg-gray-100 transition-colors"
                      >
                        <p className="text-sm font-semibold">{l.prenom} {l.nom}</p>
                        <p className="text-xs text-gray-500">{l.telephone} · {l.country_code}</p>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Code promo *</label>
            <Input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ex: AISSA100"
              className="font-mono font-bold tracking-widest"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Nom du propriétaire *</label>
            <Input value={proprietaireNom} onChange={e => setProprietaireNom(e.target.value)} placeholder="ex: Aissam" disabled={proprietaireType === "livreur" && !!selectedLivreur} />
          </div>
          {proprietaireType === "client" && (
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Email du propriétaire (optionnel)</label>
              <Input value={proprietaireEmail} onChange={e => setProprietaireEmail(e.target.value)} placeholder="email@exemple.com" type="email" />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Pays *</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYS_LISTE.map(p => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setCountryCode(p.code)}
                  className={`h-10 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-all ${
                    countryCode === p.code
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                      : "border-gray-200 hover:border-primary/40"
                  }`}
                >
                  <span className="text-base">{p.emoji}</span>
                  <span className="text-[10px]">{p.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          💡 {proprietaireType === "livreur"
            ? "Le livreur gagnera <strong>100 FCFA fixe</strong> déduits de son dû SILGAPP à chaque première course d'un client inscrit avec son code."
            : proprietaireType === "partenaire"
            ? "Le partenaire gagnera <strong>100 FCFA fixe</strong> à chaque première course d'un client inscrit avec son code."
            : "Le propriétaire gagnera <strong>100 FCFA fixe</strong> à chaque première course d'un client inscrit avec son code."}
        </div>

        <Button onClick={handleCreate} disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer le code promo"}
        </Button>
      </Card>
    </div>
  );
}

export default function CodePromoPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();

  const { data: codes = [], refetch } = useQuery({
    queryKey: ["codes-promo"],
    queryFn: () => base44.entities.CodePromo.list("-created_date"),
    initialData: [],
  });

  const { data: primes = [] } = useQuery({
    queryKey: ["primes-promo"],
    queryFn: () => base44.entities.PrimePromo.list("-created_date", 200),
    initialData: [],
  });

  const handleToggle = async (codePromo) => {
    await base44.entities.CodePromo.update(codePromo.id, { actif: !codePromo.actif });
    toast.success(codePromo.actif ? "Code désactivé" : "Code activé");
    refetch();
  };

  const handleDelete = async (codePromo) => {
    if (!window.confirm(`Supprimer définitivement le code ${codePromo.code} ?`)) return;
    await base44.entities.CodePromo.delete(codePromo.id);
    toast.success("Code supprimé");
    refetch();
  };

  const getPrimesForCode = (codeId) => primes.filter(p => p.code_promo_id === codeId);
  const getPays = (code) => PAYS_LISTE.find(p => p.code === code);

  const totalInscrits = codes.reduce((s, c) => s + (c.nb_inscrits || 0), 0);
  const totalPremiersCourses = codes.reduce((s, c) => s + (c.nb_premieres_courses || 0), 0);
  const totalPrimes = codes.reduce((s, c) => s + (c.total_primes_generees || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-purple-600" />
          <h2 className="font-bold text-foreground">Codes Promo</h2>
          <Badge variant="outline">{codes.length} codes</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 gap-1.5">
          <Plus className="w-4 h-4" />
          Nouveau code
        </Button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-blue-50 border-blue-200 text-center">
          <p className="text-xl font-bold text-blue-700">{totalInscrits}</p>
          <p className="text-xs text-blue-600">Inscrits total</p>
        </Card>
        <Card className="p-3 bg-green-50 border-green-200 text-center">
          <p className="text-xl font-bold text-green-700">{totalPremiersCourses}</p>
          <p className="text-xs text-green-600">1ères courses</p>
        </Card>
        <Card className="p-3 bg-purple-50 border-purple-200 text-center">
          <p className="text-xl font-bold text-purple-700">{totalPrimes.toLocaleString()} F</p>
          <p className="text-xs text-purple-600">Primes générées</p>
        </Card>
      </div>

      {/* Liste des codes */}
      {codes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Aucun code promo créé pour l'instant
        </div>
      ) : (
        <div className="space-y-3">
          {codes.map(c => {
            const pays = getPays(c.country_code);
            const primesCode = getPrimesForCode(c.id);
            return (
              <Card key={c.id} className={`p-4 border-2 ${c.actif ? "border-purple-200" : "border-gray-200 opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-black text-lg text-purple-700 font-mono tracking-widest">{c.code}</span>
                      <Badge className={c.actif ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                        {c.actif ? "✅ Actif" : "❌ Inactif"}
                      </Badge>
                      {pays && <span className="text-sm">{pays.emoji} {pays.nom}</span>}
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {c.proprietaire_type === "livreur" ? "🏍️" : c.proprietaire_type === "partenaire" ? "🏪" : "👤"} {c.proprietaire_nom}
                    </p>
                    {c.proprietaire_email && <p className="text-xs text-muted-foreground">{c.proprietaire_email}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.nb_inscrits || 0} inscrits</span>
                      <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{c.nb_premieres_courses || 0} 1ères courses</span>
                      <span className="flex items-center gap-1"><Gift className="w-3 h-3" />{(c.total_primes_generees || 0).toLocaleString()} F primes</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(c)} title={c.actif ? "Désactiver" : "Activer"}>
                      {c.actif ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(c)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Détail primes récentes */}
                {primesCode.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-dashed space-y-1">
                    <p className="text-xs font-bold text-gray-600">Primes récentes :</p>
                    {primesCode.slice(0, 3).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">👤 {p.client_nouveau_nom}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{p.prix_course?.toLocaleString()} F</span>
                          <Badge className={
                            p.statut === "validee" ? "bg-green-100 text-green-700 text-[10px] py-0" :
                            p.statut === "annulee" ? "bg-red-100 text-red-700 text-[10px] py-0" :
                            "bg-yellow-100 text-yellow-700 text-[10px] py-0"
                          }>
                            {p.statut === "validee" ? `+${p.prime_proprietaire} F` : p.statut === "annulee" ? "Annulée" : "En attente"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateCodeModal
          onClose={() => setShowCreate(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}