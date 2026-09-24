import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Ticket, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function AdminPassOffersPanel({ countryCode }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: offers } = useQuery({
    queryKey: ["pass-offers-admin", countryCode],
    queryFn: () =>
      base44.entities.PassOffer.filter(
        countryCode ? { country_code: countryCode } : {},
        "ordre",
        100
      ),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return base44.entities.PassOffer.update(id, rest);
      }
      return base44.entities.PassOffer.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pass-offers-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pass-offers"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Pass enregistré");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }) =>
      base44.entities.PassOffer.update(id, { actif }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pass-offers-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pass-offers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PassOffer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pass-offers-admin"] });
      queryClient.invalidateQueries({ queryKey: ["pass-offers"] });
      toast.success("Pass supprimé");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-primary" />
          <h2 className="font-black text-lg">Pass Zéro Commission — Offres</h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> Nouveau
        </Button>
      </div>

      {showForm && (
        <PassOfferForm
          editing={editing}
          countryCode={countryCode}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <div className="grid gap-3">
        {(offers || []).map((offer) => (
          <div
            key={offer.id}
            className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between"
          >
            <div>
              <p className="font-bold text-slate-900">{offer.nom}</p>
              <p className="text-xs text-slate-500">
                {offer.duree_jours} jour{offer.duree_jours > 1 ? "s" : ""} •{" "}
                {offer.prix?.toLocaleString()} {offer.devise || "FCFA"} • {offer.country_code}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={offer.actif}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ id: offer.id, actif: checked })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(offer);
                  setShowForm(true);
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Supprimer ce Pass ?"))
                    deleteMutation.mutate(offer.id);
                }}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
        {(!offers || offers.length === 0) && (
          <p className="text-center text-sm text-slate-400 py-8">
            Aucun Pass configuré.
          </p>
        )}
      </div>
    </div>
  );
}

function PassOfferForm({ editing, countryCode, onSave, onCancel }) {
  const [form, setForm] = useState(
    editing
      ? { ...editing, prix: String(editing.prix ?? ""), duree_jours: String(editing.duree_jours ?? "") }
      : {
          nom: "",
          description: "",
          duree_jours: "",
          prix: "",
          country_code: countryCode || "BF",
          devise: "FCFA",
          actif: true,
          ordre: 99,
        }
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-bold">
        {editing ? "Modifier le Pass" : "Nouveau Pass"}
      </h3>
      <div>
        <Label>Nom du Pass</Label>
        <Input
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
          placeholder="Ex: Pass 7 jours"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Description affichée au livreur"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Durée (jours)</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={form.duree_jours}
            onChange={(e) => setForm({ ...form, duree_jours: e.target.value })}
            placeholder="1"
          />
        </div>
        <div>
          <Label>Prix</Label>
          <Input
            type="number"
            min="0"
            value={form.prix}
            onChange={(e) => setForm({ ...form, prix: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Pays</Label>
          <Input
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
            placeholder="BF, CI, ..."
          />
        </div>
        <div>
          <Label>Devise</Label>
          <Input
            value={form.devise}
            onChange={(e) => setForm({ ...form, devise: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!form.nom || form.duree_jours === "" || isNaN(Number(form.duree_jours)) || Number(form.duree_jours) < 1 || !Number.isInteger(Number(form.duree_jours)) || form.prix === "" || isNaN(Number(form.prix)) || Number(form.prix) < 0}
          onClick={() => {
            const dureeNum = Number(form.duree_jours);
            if (form.duree_jours === "" || isNaN(dureeNum) || dureeNum < 1 || !Number.isInteger(dureeNum)) {
              toast.error("Durée invalide (entier ≥ 1 requis)");
              return;
            }
            const prixNum = Number(form.prix);
            if (isNaN(prixNum) || prixNum < 0) {
              toast.error("Prix invalide");
              return;
            }
            onSave({ ...form, duree_jours: dureeNum, prix: prixNum });
          }}
        >
          Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
}