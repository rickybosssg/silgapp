import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, ChevronRight, ChevronLeft, Loader2, Check } from "lucide-react";
import { useCreateCampaignDraft } from "@/hooks/useMetaAdsData";

const OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Trafic (clics vers le site/app)" },
];

const STEPS = ["Objectif", "Créatif", "Ciblage", "Budget", "Récapitulatif"];

export default function MetaAdsNewCampaignWizard({ open, onClose, creatives, config }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    objective: "OUTCOME_TRAFFIC",
    creative_id: "",
    country_codes: "BF",
    daily_budget: 1000,
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const mutation = useCreateCampaignDraft();

  const approvedCreatives = (creatives || []).filter(c => c.status === "approved");
  const budgetCap = config?.dailyBudgetCap || 1000;

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleCreate = async () => {
    setProcessing(true);
    setError(null);
    try {
      const creative_ids = form.creative_id ? JSON.stringify([form.creative_id]) : null;
      const result = await mutation.mutateAsync({
        name: form.name,
        objective: form.objective,
        daily_budget: form.daily_budget,
        creative_ids,
        country_codes: form.country_codes,
        target_audience: "Ouagadougou + 25km, 18-45 ans, tous genres, Facebook uniquement",
        idempotency_key: `mc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
      setSuccess(result?.campaign || result);
    } catch (e) {
      setError(e.message || "Erreur lors de la création");
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setError(null);
    setSuccess(null);
    setForm({ name: "", objective: "OUTCOME_TRAFFIC", creative_id: "", country_codes: "BF", daily_budget: 1000 });
    onClose();
  };

  const canNext = () => {
    if (step === 0) return form.name && form.objective;
    if (step === 1) return true; // créatif optionnel
    if (step === 3) return form.daily_budget > 0 && form.daily_budget <= budgetCap;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle campagne Meta</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800">Brouillon créé avec succès !</p>
            <p className="text-xs text-slate-500">La campagne est en statut « Brouillon ». Elle doit être approuvée puis lancée manuellement.</p>
            <Button onClick={handleClose} className="w-full">Fermer</Button>
          </div>
        ) : (
          <>
            {/* Steps indicator */}
            <div className="flex items-center gap-1 mb-4">
              {STEPS.map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                    {i + 1}. {s}
                  </div>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </React.Fragment>
              ))}
            </div>

            {/* Step 0: Objectif */}
            {step === 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Nom de la campagne</Label>
                  <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: SILGAPP — Acquisition BF — 002" className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Objectif</Label>
                  <Select value={form.objective} onValueChange={(v) => update("objective", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 1: Créatif */}
            {step === 1 && (
              <div className="space-y-3">
                <Label className="text-xs">Créatif / Publication Facebook</Label>
                {approvedCreatives.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    Aucun créatif approuvé disponible. Vous pouvez créer la campagne sans créatif et l'ajouter plus tard.
                  </p>
                ) : (
                  <Select value={form.creative_id} onValueChange={(v) => update("creative_id", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sélectionner un créatif" /></SelectTrigger>
                    <SelectContent>
                      {approvedCreatives.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[10px] text-slate-400">Facebook-only. Instagram n'est pas requis.</p>
              </div>
            )}

            {/* Step 2: Ciblage */}
            {step === 2 && (
              <div className="space-y-2 text-xs">
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                  <div><b>Pays:</b> Burkina Faso (BF) — verrouillé</div>
                  <div><b>Ville:</b> Ouagadougou</div>
                  <div><b>Rayon:</b> 25 km</div>
                  <div><b>Âge:</b> 18-45 ans</div>
                  <div><b>Genre:</b> Tous</div>
                  <div><b>Plateforme:</b> Facebook uniquement</div>
                </div>
                <p className="text-[10px] text-slate-400">Le ciblage est prédéfini et ne peut pas être élargi à un autre pays.</p>
              </div>
            )}

            {/* Step 3: Budget */}
            {step === 3 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Budget quotidien (FCFA)</Label>
                  <Input
                    type="number"
                    value={form.daily_budget}
                    onChange={(e) => update("daily_budget", parseInt(e.target.value) || 0)}
                    min={100}
                    max={budgetCap}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="bg-blue-50 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex justify-between"><span>Plafond max:</span><b>{budgetCap.toLocaleString()} F / jour</b></div>
                  <div className="flex justify-between"><span>≈ USD:</span><b>${(form.daily_budget / 600).toFixed(2)} / jour</b></div>
                  <div className="flex justify-between"><span>Compte Meta:</span><b>234850849367733</b></div>
                </div>
                {form.daily_budget > budgetCap && (
                  <p className="text-xs text-red-500">⚠️ Le budget dépasse le plafond de {budgetCap.toLocaleString()} F.</p>
                )}
              </div>
            )}

            {/* Step 4: Récapitulatif */}
            {step === 4 && (
              <div className="space-y-2 text-xs">
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                  <div><b>Nom:</b> {form.name}</div>
                  <div><b>Objectif:</b> {OBJECTIVES.find(o => o.value === form.objective)?.label}</div>
                  <div><b>Créatif:</b> {form.creative_id ? approvedCreatives.find(c => c.id === form.creative_id)?.name || form.creative_id : "Aucun"}</div>
                  <div><b>Pays:</b> Burkina Faso</div>
                  <div><b>Zone:</b> Ouagadougou + 25km, 18-45 ans</div>
                  <div><b>Budget:</b> {form.daily_budget.toLocaleString()} F / jour (≈ ${(form.daily_budget / 600).toFixed(2)})</div>
                  <div><b>Plateforme:</b> Facebook uniquement</div>
                </div>
                <p className="text-amber-600 text-[11px]">⚠️ La campagne sera créée en Brouillon. Aucune diffusion automatique.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <DialogFooter className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => step === 0 ? handleClose() : setStep(step - 1)} disabled={processing}>
                <ChevronLeft className="w-3 h-3 mr-1" /> {step === 0 ? "Annuler" : "Précédent"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext()}>
                  Suivant <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleCreate} disabled={processing || form.daily_budget > budgetCap}>
                  {processing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Création…</> : <><Rocket className="w-3 h-3 mr-1" /> Créer en brouillon</>}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}