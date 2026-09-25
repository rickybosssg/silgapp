import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Users, Wallet, TrendingUp, Eye, Ban, CheckCircle, Percent } from "lucide-react";

/**
 * SuperAdminEntreprises — Page de gestion des entreprises pour le Super Admin SILGAPP.
 *
 * Accessible depuis le menu admin: /admin/entreprises
 *
 * Fonctionnalités:
 *   - Liste des entreprises (avec stats globales)
 *   - Création d'entreprise
 *   - Création d'Admin Entreprise
 *   - Modification du taux SILGAPP
 *   - Enregistrement de paiement
 *   - Suspension / réactivation
 *   - Détail par entreprise (admins, ledger)
 */
export default function SuperAdminEntreprises() {
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEnterprise, setSelectedEnterprise] = useState(null);
  const [error, setError] = useState("");

  const loadEnterprises = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageEnterprise", { action: "list_enterprises" });
      setEnterprises(res?.data?.enterprises || res?.enterprises || []);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useState(() => {
    loadEnterprises();
  }, []);

  // ── Stats globales ──
  const totalDue = enterprises.reduce((sum, e) => sum + Number(e.montant_du_silgapp || 0), 0);
  const totalCommissions = enterprises.reduce((sum, e) => sum + Number(e.total_commissions_silgapp || 0), 0);
  const totalPaid = enterprises.reduce((sum, e) => sum + Number(e.total_paiements || 0), 0);
  const totalVolume = enterprises.reduce((sum, e) => sum + Number(e.volume_courses_total || 0), 0);
  const activeCount = enterprises.filter((e) => e.statut === "actif").length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-sm text-gray-500">Chargement des entreprises...</p>
      </div>
    );
  }

  if (selectedEnterprise) {
    return (
      <EnterpriseDetail
        enterpriseId={selectedEnterprise}
        onBack={() => {
          setSelectedEnterprise(null);
          loadEnterprises();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            SILGAPP Entreprise
          </h1>
          <p className="text-sm text-gray-500">Gestion des entreprises partenaires</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4" /> Créer
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* ── Stats globales ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Building2} label="Entreprises actives" value={activeCount} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={TrendingUp} label="Volume total" value={`${totalVolume.toLocaleString("fr-FR")} F`} color="text-purple-600" bg="bg-purple-50" />
        <StatCard icon={Wallet} label="Commissions générées" value={`${totalCommissions.toLocaleString("fr-FR")} F`} color="text-amber-600" bg="bg-amber-50" />
        <StatCard icon={Wallet} label="Total dû à SILGAPP" value={`${totalDue.toLocaleString("fr-FR")} F`} color="text-red-600" bg="bg-red-50" />
      </div>

      {/* ── Liste des entreprises ── */}
      <div className="space-y-2">
        {enterprises.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Aucune entreprise créée</p>
              <Button onClick={() => setShowCreate(true)} size="sm" className="mt-3">
                <Plus className="w-4 h-4" /> Créer une entreprise
              </Button>
            </CardContent>
          </Card>
        ) : (
          enterprises.map((ent) => (
            <Card key={ent.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                    style={{ background: ent.couleur_primaire || "#007AFF" }}
                  >
                    {ent.logo_url ? (
                      <img src={ent.logo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Building2 className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{ent.nom}</p>
                    <p className="text-xs text-gray-500">
                      {ent.country_code} · {ent.nb_admins || 0} admin(s) · {ent.nb_livreurs || 0} livreur(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">
                      {(ent.montant_du_silgapp || 0).toLocaleString("fr-FR")} F
                    </p>
                    <p className="text-[10px] text-gray-500">Dû SILGAPP</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ent.statut === "actif" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {ent.statut}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => setSelectedEnterprise(ent.enterprise_financier_id)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span>Taux: <strong>{ent.commission_silgapp_pct}%</strong></span>
                  <span>Volume: <strong>{(ent.volume_courses_total || 0).toLocaleString("fr-FR")} F</strong></span>
                  <span>Payé: <strong className="text-emerald-600">{(ent.total_paiements || 0).toLocaleString("fr-FR")} F</strong></span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── Modal création ── */}
      {showCreate && (
        <CreateEnterpriseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadEnterprises();
          }}
        />
      )}
    </div>
  );
}

// ── Stats card ──
function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Modal création d'entreprise ──
function CreateEnterpriseModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nom: "",
    country_code: "BF",
    telephone: "",
    email: "",
    adresse: "",
    logo_url: "",
    couleur_primaire: "#007AFF",
    commission_silgapp_pct: 5,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", {
        action: "create_enterprise",
        ...form,
      });
      onCreated();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-base">Créer une entreprise</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Nom de l'entreprise *</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Pays *</Label>
                <Input value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} required maxLength={2} />
              </div>
              <div>
                <Label className="text-xs">Taux SILGAPP (%)</Label>
                <Input type="number" step="0.1" value={form.commission_silgapp_pct} onChange={(e) => setForm({ ...form, commission_silgapp_pct: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Téléphone</Label>
              <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Adresse</Label>
              <Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Logo URL</Label>
              <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Couleur principale</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.couleur_primaire} onChange={(e) => setForm({ ...form, couleur_primaire: e.target.value })} className="w-10 h-8 rounded" />
                <Input value={form.couleur_primaire} onChange={(e) => setForm({ ...form, couleur_primaire: e.target.value })} className="flex-1" />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Création..." : "Créer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Détail d'une entreprise ──
function EnterpriseDetail({ enterpriseId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showRate, setShowRate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageEnterprise", {
        action: "get_enterprise",
        enterprise_id: enterpriseId,
      });
      setData(res?.data || res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useState(() => {
    load();
  }, []);

  if (loading) return <div className="p-6 text-center text-sm text-gray-500">Chargement...</div>;
  if (!data?.enterprise) return <div className="p-6 text-center text-sm text-red-500">Entreprise introuvable</div>;

  const { enterprise, admins, ledger } = data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <button onClick={onBack} className="text-sm text-blue-500">← Retour</button>

      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: enterprise.couleur_primaire || "#007AFF" }}>
              {enterprise.logo_url ? <img src={enterprise.logo_url} alt="" className="w-full h-full object-cover rounded-xl" /> : <Building2 className="w-6 h-6" />}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">{enterprise.nom}</h2>
              <p className="text-xs text-gray-500">{enterprise.country_code} · {enterprise.statut}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Taux:</span> <strong>{enterprise.commission_silgapp_pct}%</strong></div>
            <div><span className="text-gray-500">Volume:</span> <strong>{(enterprise.volume_courses_total || 0).toLocaleString("fr-FR")} F</strong></div>
            <div><span className="text-gray-500">Commissions:</span> <strong>{(enterprise.total_commissions_silgapp || 0).toLocaleString("fr-FR")} F</strong></div>
            <div><span className="text-gray-500">Dû:</span> <strong className="text-red-600">{(enterprise.montant_du_silgapp || 0).toLocaleString("fr-FR")} F</strong></div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAddAdmin(true)}><Users className="w-4 h-4" /> Admin</Button>
        <Button size="sm" variant="outline" onClick={() => setShowRate(true)}><Percent className="w-4 h-4" /> Taux</Button>
        <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}><Wallet className="w-4 h-4" /> Paiement</Button>
        {enterprise.statut === "actif" ? (
          <Button size="sm" variant="destructive" onClick={async () => {
            if (confirm("Suspendre cette entreprise ?")) {
              await base44.functions.invoke("manageEnterprise", { action: "suspend_enterprise", enterprise_id: enterprise.id, motif: "Suspension manuelle" });
              load();
            }
          }}><Ban className="w-4 h-4" /> Suspendre</Button>
        ) : (
          <Button size="sm" onClick={async () => {
            await base44.functions.invoke("manageEnterprise", { action: "reactivate_enterprise", enterprise_id: enterprise.id });
            load();
          }}><CheckCircle className="w-4 h-4" /> Réactiver</Button>
        )}
      </div>

      {/* Admins */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Administrateurs ({admins?.length || 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {admins?.length > 0 ? admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-900">{a.email}</p>
                <p className="text-xs text-gray-500">{a.silgapp_role === "admin_entreprise" ? "Actif" : "Désactivé"}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={async () => {
                await base44.functions.invoke("manageEnterprise", {
                  action: "toggle_admin",
                  user_email: a.email,
                  active: a.silgapp_role !== "admin_entreprise",
                });
                load();
              }}>
                {a.silgapp_role === "admin_entreprise" ? "Désactiver" : "Activer"}
              </Button>
            </div>
          )) : <p className="text-sm text-gray-400">Aucun admin</p>}
        </CardContent>
      </Card>

      {/* Ledger récent */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Historique financier</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ledger?.length > 0 ? ledger.slice(0, 10).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm border-b pb-1">
              <div>
                <span className="font-medium">{e.type === "commission_course" ? "Commission" : e.type === "paiement" ? "Paiement" : "Ajustement"}</span>
                <p className="text-[10px] text-gray-400">{new Date(e.created_date).toLocaleString("fr-FR")}</p>
              </div>
              <span className="font-bold">{e.montant > 0 ? "+" : ""}{e.montant.toLocaleString("fr-FR")} F</span>
            </div>
          )) : <p className="text-sm text-gray-400">Aucune écriture</p>}
        </CardContent>
      </Card>

      {/* Modals */}
      {showAddAdmin && (
        <AddAdminModal enterpriseId={enterprise.enterprise_financier_id} onClose={() => setShowAddAdmin(false)} onAdded={() => { setShowAddAdmin(false); load(); }} />
      )}
      {showPayment && (
        <PaymentModal enterprise={enterprise} onClose={() => setShowPayment(false)} onDone={() => { setShowPayment(false); load(); }} />
      )}
      {showRate && (
        <RateModal enterprise={enterprise} onClose={() => setShowRate(false)} onDone={() => { setShowRate(false); load(); }} />
      )}
    </div>
  );
}

// ── Modal ajout admin ──
function AddAdminModal({ enterpriseId, onClose, onAdded }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", {
        action: "create_admin",
        enterprise_id: enterpriseId,
        email,
      });
      onAdded();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader><CardTitle className="text-sm">Ajouter un admin</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Email du nouvel admin *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "..." : "Ajouter"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Modal paiement ──
function PaymentModal({ enterprise, onClose, onDone }) {
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState("especes");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", {
        action: "record_payment",
        enterprise_id: enterprise.enterprise_financier_id,
        montant: Number(montant),
        moyen_paiement: moyen,
        reference,
        request_id: `PAY_${enterprise.id}_${Date.now()}`,
      });
      onDone();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-sm">Enregistrer un paiement</CardTitle>
          <p className="text-xs text-gray-500">Dû actuel: {(enterprise.montant_du_silgapp || 0).toLocaleString("fr-FR")} F</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Montant (FCFA) *</Label>
              <Input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} required />
            </div>
            <div>
              <Label className="text-xs">Moyen de paiement</Label>
              <select value={moyen} onChange={(e) => setMoyen(e.target.value)} className="w-full rounded-md border border-gray-200 p-2 text-sm">
                <option value="especes">Espèces</option>
                <option value="virement">Virement</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Référence</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° reçu..." />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "..." : "Valider"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Modal taux ──
function RateModal({ enterprise, onClose, onDone }) {
  const [taux, setTaux] = useState(enterprise.commission_silgapp_pct || 5);
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", {
        action: "modify_rate",
        enterprise_id: enterprise.enterprise_financier_id,
        nouveau_taux: Number(taux),
        motif,
      });
      onDone();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="text-sm">Modifier le taux SILGAPP</CardTitle>
          <p className="text-xs text-amber-600">⚠️ Le nouveau taux s'appliquera aux nouvelles courses. Les taux déjà verrouillés ne seront pas modifiés.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Nouveau taux (%) *</Label>
              <Input type="number" step="0.1" value={taux} onChange={(e) => setTaux(e.target.value)} required />
              <p className="text-[10px] text-gray-400 mt-1">Taux actuel: {enterprise.commission_silgapp_pct}%</p>
            </div>
            <div>
              <Label className="text-xs">Motif</Label>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Raison du changement..." />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "..." : "Modifier"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}