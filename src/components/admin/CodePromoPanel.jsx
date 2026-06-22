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
  { code: "BF", nom: "Burkina Faso", emoji: "" },
  { code: "CI", nom: "Côte d'Ivoire", emoji: "" },
  { code: "TG", nom: "Togo", emoji: "" },
  { code: "BJ", nom: "Bénin", emoji: "" },
  { code: "SN", nom: "Sénégal", emoji: "" },
  { code: "ML", nom: "Mali", emoji: "" },
  { code: "GN", nom: "Guinée", emoji: "" },
  { code: "NE", nom: "Niger", emoji: "" },
];

function CreateCodeModal({ onClose, onCreated }) {
  const [code, setCode] = useState("");
  const [proprietaireNom, setProprietaireNom] = useState("");
  const [proprietaireEmail, setProprietaireEmail] = useState("");
  const [countryCode, setCountryCode] = useState("BF");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!code.trim() || !proprietaireNom.trim() || !countryCode) {
      toast.error("Code, nom propriétaire et pays sont obligatoires");
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

    // Chercher si le propriétaire a un ClientExterne
    let proprietaireClientId = null;
    if (proprietaireEmail) {
      try {
        const clients = await base44.entities.ClientExterne.filter({ user_email: proprietaireEmail });
        if (clients?.length > 0) proprietaireClientId = clients[0].id;
      } catch {}
    }

    const created = await base44.entities.CodePromo.create({
      code: code.trim().toUpperCase(),
      proprietaire_nom: proprietaireNom.trim(),
      proprietaire_email: proprietaireEmail.trim() || null,
      proprietaire_client_id: proprietaireClientId,
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
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Nouveau code promo</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-3">
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
            <Input value={proprietaireNom} onChange={e => setProprietaireNom(e.target.value)} placeholder="ex: Aissam" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Email du propriétaire (optionnel)</label>
            <Input value={proprietaireEmail} onChange={e => setProprietaireEmail(e.target.value)} placeholder="email@exemple.com" type="email" />
          </div>
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
           Le propriétaire gagnera <strong>100 FCFA fixe</strong> à chaque première course d'un client inscrit avec son code.
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
                        {c.actif ? " Actif" : " Inactif"}
                      </Badge>
                      {pays && <span className="text-sm">{pays.emoji} {pays.nom}</span>}
                    </div>
                    <p className="text-sm font-semibold text-foreground"> {c.proprietaire_nom}</p>
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
                        <span className="text-gray-700"> {p.client_nouveau_nom}</span>
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
