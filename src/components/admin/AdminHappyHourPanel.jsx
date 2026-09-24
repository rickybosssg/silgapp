import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const JOURS = [
  { value: 0, label: "Dimanche" },
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
];

export default function AdminHappyHourPanel({ countryCode }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: configs } = useQuery({
    queryKey: ["happy-hour-admin", countryCode],
    queryFn: () =>
      base44.entities.HappyHourConfig.filter(
        countryCode ? { country_code: countryCode } : {},
        "-created_date",
        100
      ),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return base44.entities.HappyHourConfig.update(id, rest);
      }
      return base44.entities.HappyHourConfig.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["happy-hour-admin"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Happy Hour enregistré");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }) =>
      base44.entities.HappyHourConfig.update(id, { actif }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["happy-hour-admin"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HappyHourConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["happy-hour-admin"] });
      toast.success("Happy Hour supprimé");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="font-black text-lg">Happy Hour</h2>
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
        <HappyHourForm
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
        {(configs || []).map((config) => (
          <div
            key={config.id}
            className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between"
          >
            <div>
              <p className="font-bold text-slate-900">{config.nom}</p>
              <p className="text-xs text-slate-500">
                {config.country_code} •{" "}
                {config.recurrence === "hebdomadaire"
                  ? JOURS.find((j) => j.value === config.jour_semaine)?.label || `Jour ${config.jour_semaine}`
                  : config.date_specifique}{" "}
                • {config.heure_debut} → {config.heure_fin}
              </p>
              <p className="text-xs text-slate-400">
                Commission : {config.taux_promotionnel}% • {config.fuseau_horaire}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.actif}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ id: config.id, actif: checked })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(config);
                  setShowForm(true);
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Supprimer ce Happy Hour ?"))
                    deleteMutation.mutate(config.id);
                }}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
        {(!configs || configs.length === 0) && (
          <p className="text-center text-sm text-slate-400 py-8">
            Aucun Happy Hour configuré.
          </p>
        )}
      </div>
    </div>
  );
}

function HappyHourForm({ editing, countryCode, onSave, onCancel }) {
  const [form, setForm] = useState(
    editing || {
      nom: "",
      country_code: countryCode || "BF",
      jour_semaine: 5,
      date_specifique: "",
      heure_debut: "17:00",
      heure_fin: "20:00",
      fuseau_horaire: "Africa/Ouagadougou",
      taux_promotionnel: 0,
      recurrence: "hebdomadaire",
      actif: true,
    }
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-bold">
        {editing ? "Modifier le Happy Hour" : "Nouveau Happy Hour"}
      </h3>
      <div>
        <Label>Nom</Label>
        <Input
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
          placeholder="Ex: Happy Hour Vendredi BF"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Pays</Label>
          <Input
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
          />
        </div>
        <div>
          <Label>Taux promotionnel (%)</Label>
          <Input
            type="number"
            value={form.taux_promotionnel}
            onChange={(e) => setForm({ ...form, taux_promotionnel: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label>Récurrence</Label>
        <Select
          value={form.recurrence}
          onValueChange={(v) => setForm({ ...form, recurrence: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hebdomadaire">Hebdomadaire</SelectItem>
            <SelectItem value="unique">Date unique</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.recurrence === "hebdomadaire" ? (
        <div>
          <Label>Jour de la semaine</Label>
          <Select
            value={String(form.jour_semaine)}
            onValueChange={(v) => setForm({ ...form, jour_semaine: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOURS.map((j) => (
                <SelectItem key={j.value} value={String(j.value)}>
                  {j.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label>Date spécifique</Label>
          <Input
            type="date"
            value={form.date_specifique || ""}
            onChange={(e) => setForm({ ...form, date_specifique: e.target.value })}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Heure début</Label>
          <Input
            type="time"
            value={form.heure_debut}
            onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
          />
        </div>
        <div>
          <Label>Heure fin</Label>
          <Input
            type="time"
            value={form.heure_fin}
            onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Fuseau horaire</Label>
        <Input
          value={form.fuseau_horaire}
          onChange={(e) => setForm({ ...form, fuseau_horaire: e.target.value })}
          placeholder="Africa/Ouagadougou"
        />
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!form.nom || !form.heure_debut || !form.heure_fin}
          onClick={() => onSave(form)}
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