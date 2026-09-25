import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2, Plus, Users, Wallet, TrendingUp, Eye, Ban, CheckCircle,
  Percent, Truck, Package, ArrowLeft, UserMinus, UserPlus, Power,
  Clock, Zap, Send,
} from "lucide-react";

/**
 * SuperAdminEntreprises — Gestion complète SILGAPP ENTREPRISE depuis le Super Admin.
 *
 * Accessible depuis: /admin/entreprises
 *
 * Toutes les opérations sont sécurisées côté backend (manageEnterprise, role=admin only).
 * Aucune intervention Base44 n'est nécessaire pour créer/gérer une agence.
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

  useEffect(() => {
    loadEnterprises();
  }, []);

  const totalDue = enterprises.reduce((s, e) => s + Number(e.montant_du_silgapp || 0), 0);
  const totalCommissions = enterprises.reduce((s, e) => s + Number(e.total_commissions_silgapp || 0), 0);
  const totalPaid = enterprises.reduce((s, e) => s + Number(e.total_paiements || 0), 0);
  const totalVolume = enterprises.reduce((s, e) => s + Number(e.volume_courses_total || 0), 0);
  const activeCount = enterprises.filter((e) => e.statut === "actif").length;
  const totalLivreurs = enterprises.reduce((s, e) => s + Number(e.nb_livreurs || 0), 0);
  const totalCourses = enterprises.reduce((s, e) => s + Number(e.nb_courses || 0), 0);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-500">Chargement des entreprises...</div>;
  }

  if (selectedEnterprise) {
    return (
      <EnterpriseDetail
        enterpriseId={selectedEnterprise}
        onBack={() => { setSelectedEnterprise(null); loadEnterprises(); }}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> SILGAPP Entreprise
          </h1>
          <p className="text-sm text-gray-500">Gestion autonome des agences partenaires</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4" /> Nouvelle entreprise
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Building2} label="Entreprises actives" value={activeCount} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={Truck} label="Livreurs Enterprise" value={totalLivreurs} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard icon={Package} label="Courses Enterprise" value={totalCourses} color="text-cyan-600" bg="bg-cyan-50" />
        <StatCard icon={TrendingUp} label="Volume total" value={`${totalVolume.toLocaleString("fr-FR")} F`} color="text-purple-600" bg="bg-purple-50" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Commissions SILGAPP" value={`${totalCommissions.toLocaleString("fr-FR")} F`} color="text-amber-600" bg="bg-amber-50" />
        <StatCard icon={Wallet} label="Total encaissé" value={`${totalPaid.toLocaleString("fr-FR")} F`} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard icon={Wallet} label="Total restant dû" value={`${totalDue.toLocaleString("fr-FR")} F`} color="text-red-600" bg="bg-red-50" />
        <StatCard icon={Building2} label="Total entreprises" value={enterprises.length} color="text-gray-600" bg="bg-gray-100" />
      </div>

      <AutoCloseConfigCard />

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
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Entreprise</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Pays</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Admins</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Livreurs</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Courses</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Volume</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Taux</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Commissions</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Payé</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Reste dû</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Statut</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enterprises.map((ent) => (
                    <tr key={ent.id} className="border-b hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => setSelectedEnterprise(ent.enterprise_financier_id)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: ent.couleur_primaire || "#007AFF" }}>
                            {ent.logo_url ? <img src={ent.logo_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Building2 className="w-3.5 h-3.5" />}
                          </div>
                          <span className="font-bold text-gray-900 truncate max-w-[120px]">{ent.nom}</span>
                        </div>
                      </td>
                      <td className="text-center px-2 py-2 text-gray-600">{ent.country_code}</td>
                      <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_admins || 0}</td>
                      <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_livreurs || 0}</td>
                      <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_courses || 0}</td>
                      <td className="text-right px-2 py-2 text-gray-600 tabular-nums whitespace-nowrap">{(ent.volume_courses_total || 0).toLocaleString("fr-FR")} F</td>
                      <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.commission_silgapp_pct}%</td>
                      <td className="text-right px-2 py-2 text-amber-600 tabular-nums whitespace-nowrap">{(ent.total_commissions_silgapp || 0).toLocaleString("fr-FR")} F</td>
                      <td className="text-right px-2 py-2 text-emerald-600 tabular-nums whitespace-nowrap">{(ent.total_paiements || 0).toLocaleString("fr-FR")} F</td>
                      <td className="text-right px-2 py-2 text-red-600 font-bold tabular-nums whitespace-nowrap">{(ent.montant_du_silgapp || 0).toLocaleString("fr-FR")} F</td>
                      <td className="text-center px-2 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ent.statut === "actif" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {ent.statut}
                        </span>
                      </td>
                      <td className="text-center px-2 py-2">
                        <Eye className="w-4 h-4 text-gray-400 inline-block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {showCreate && (
        <CreateEnterpriseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadEnterprises(); }}
        />
      )}
    </div>
  );
}

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

function CreateEnterpriseModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nom: "", country_code: "BF", telephone: "", email: "", adresse: "",
    logo_url: "", couleur_primaire: "#007AFF", commission_silgapp_pct: 5,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", { action: "create_enterprise", ...form });
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
        <CardHeader><CardTitle className="text-base">+ Nouvelle entreprise</CardTitle></CardHeader>
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
            <p className="text-[10px] text-gray-400">L'enterprise_id sera généré automatiquement et de manière sécurisée par le backend.</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Création..." : "Créer l'entreprise"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EnterpriseDetail({ enterpriseId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showAddLivreur, setShowAddLivreur] = useState(false);
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageEnterprise", { action: "get_enterprise", enterprise_id: enterpriseId });
      setData(res?.data || res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-6 text-center text-sm text-gray-500">Chargement...</div>;
  if (!data?.enterprise) return <div className="p-6 text-center text-sm text-red-500">Entreprise introuvable</div>;

  const { enterprise, admins, livreurs, courses, ledger } = data;

  const tabs = [
    { id: "overview", label: "Vue générale", icon: Building2 },
    { id: "admins", label: `Admins (${admins?.length || 0})`, icon: Users },
    { id: "livreurs", label: `Livreurs (${livreurs?.length || 0})`, icon: Truck },
    { id: "courses", label: `Courses (${courses?.length || 0})`, icon: Package },
    { id: "compta", label: "Comptabilité", icon: Wallet },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-500">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

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

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAddAdmin(true)}><Users className="w-4 h-4" /> Ajouter admin</Button>
        <Button size="sm" variant="outline" onClick={() => setShowRate(true)}><Percent className="w-4 h-4" /> Taux</Button>
        <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}><Wallet className="w-4 h-4" /> Paiement</Button>
        {enterprise.statut === "actif" ? (
          <Button size="sm" variant="destructive" onClick={async () => {
            if (confirm("Suspendre cette entreprise ? Les courses en cours ne seront pas interrompues, mais aucune nouvelle course ne pourra être créée.")) {
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

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab enterprise={enterprise} admins={admins} livreurs={livreurs} courses={courses} ledger={ledger} />}
      {tab === "admins" && <AdminsTab admins={admins} enterprise={enterprise} onRefresh={load} />}
      {tab === "livreurs" && <LivreursTab livreurs={livreurs} enterprise={enterprise} onAdd={() => setShowAddLivreur(true)} onRefresh={load} />}
      {tab === "courses" && <CoursesTab courses={courses} />}
      {tab === "compta" && <ComptaTab enterprise={enterprise} ledger={ledger} />}

      {showAddAdmin && <AddAdminModal enterpriseId={enterprise.enterprise_financier_id} onClose={() => setShowAddAdmin(false)} onAdded={() => { setShowAddAdmin(false); load(); }} />}
      {showPayment && <PaymentModal enterprise={enterprise} onClose={() => setShowPayment(false)} onDone={() => { setShowPayment(false); load(); }} />}
      {showRate && <RateModal enterprise={enterprise} onClose={() => setShowRate(false)} onDone={() => { setShowRate(false); load(); }} />}
      {showAddLivreur && <AddLivreurModal enterpriseId={enterprise.enterprise_financier_id} countryCode={enterprise.country_code} onClose={() => setShowAddLivreur(false)} onAdded={() => { setShowAddLivreur(false); load(); }} />}
    </div>
  );
}

function OverviewTab({ enterprise, admins, livreurs, courses, ledger }) {
  const coursesLivrees = (courses || []).filter((c) => c.statut === "livree");
  const coursesEnCours = (courses || []).filter((c) => !["livree", "annulee"].includes(c.statut));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Courses totales" value={courses?.length || 0} />
        <MiniStat label="Courses livrées" value={coursesLivrees.length} color="text-emerald-600" />
        <MiniStat label="En cours" value={coursesEnCours.length} color="text-blue-600" />
        <MiniStat label="Livreurs" value={livreurs?.length || 0} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label="Téléphone" value={enterprise.telephone || "-"} />
          <Row label="Email" value={enterprise.email || "-"} />
          <Row label="Adresse" value={enterprise.adresse || "-"} />
          <Row label="Pays" value={enterprise.country_code} />
          <Row label="Date création" value={enterprise.date_creation ? new Date(enterprise.date_creation).toLocaleDateString("fr-FR") : "-"} />
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className={`text-xl font-bold ${color || "text-gray-900"}`}>{value}</p>
        <p className="text-[10px] text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}:</span> <span className="font-medium">{value}</span></div>;
}

function AdminsTab({ admins, enterprise, onRefresh }) {
  return (
    <div className="space-y-2">
      {admins?.length > 0 ? admins.map((a) => (
        <Card key={a.id}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{a.full_name || a.email}</p>
                <p className="text-xs text-gray-500">{a.email}</p>
                {a.status === "pending" ? (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                    En attente d'activation
                  </span>
                ) : a.silgapp_role === "admin_entreprise" ? (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                    Actif
                  </span>
                ) : (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
                    Désactivé
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {a.status === "pending" ? (
                  <Button size="sm" variant="ghost" title="Renvoyer l'invitation" onClick={async () => {
                    await base44.functions.invoke("manageEnterprise", { action: "resend_invitation", email: a.email });
                    onRefresh();
                  }}>
                    <Send className="w-4 h-4" /> Renvoyer
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await base44.functions.invoke("manageEnterprise", {
                        action: "toggle_admin",
                        user_email: a.email,
                        active: a.silgapp_role !== "admin_entreprise",
                      });
                      onRefresh();
                    }}>
                      <Power className="w-4 h-4" />
                      {a.silgapp_role === "admin_entreprise" ? "Désactiver" : "Activer"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={async () => {
                      if (confirm(`Retirer ${a.email} de cette entreprise ? Il perdra l'accès au dashboard entreprise.`)) {
                        await base44.functions.invoke("manageEnterprise", { action: "remove_admin", user_email: a.email });
                        onRefresh();
                      }
                    }}>
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )) : <p className="text-sm text-gray-400 text-center py-4">Aucun administrateur. Cliquez sur "Ajouter admin".</p>}
    </div>
  );
}

function LivreursTab({ livreurs, enterprise, onAdd, onRefresh }) {
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={onAdd}><UserPlus className="w-4 h-4" /> Ajouter un livreur</Button>
      {livreurs?.length > 0 ? livreurs.map((l) => (
        <Card key={l.id}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{l.prenom} {l.nom}</p>
                <p className="text-xs text-gray-500">{l.telephone} · {l.vehicule || l.type_vehicule || "moto"}</p>
                <p className="text-[10px] text-gray-400">{l.ville || l.quartier || ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${l.actif ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {l.actif ? "Actif" : "Inactif"}
                </span>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await base44.functions.invoke("manageEnterprise", { action: "toggle_livreur", livreur_id: l.id, active: !l.actif });
                  onRefresh();
                }}>
                  <Power className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )) : <p className="text-sm text-gray-400 text-center py-4">Aucun livreur rattaché.</p>}
    </div>
  );
}

function CoursesTab({ courses }) {
  if (!courses?.length) return <p className="text-sm text-gray-400 text-center py-4">Aucune course.</p>;
  return (
    <div className="space-y-2">
      {courses.slice(0, 50).map((c) => (
        <Card key={c.id}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{c.client_nom || "Client"} · {c.type_course}</p>
                <p className="text-xs text-gray-500 truncate">{c.adresse_depart} → {c.adresse_arrivee}</p>
              </div>
              <div className="text-right ml-2">
                <p className="text-sm font-bold">{(c.prix_final || 0).toLocaleString("fr-FR")} F</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  c.statut === "livree" ? "bg-emerald-100 text-emerald-700" :
                  c.statut === "annulee" ? "bg-red-100 text-red-700" :
                  "bg-blue-100 text-blue-700"
                }`}>{c.statut}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ComptaTab({ enterprise, ledger }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Volume courses" value={`${(enterprise.volume_courses_total || 0).toLocaleString("fr-FR")} F`} />
        <MiniStat label="Commissions SILGAPP" value={`${(enterprise.total_commissions_silgapp || 0).toLocaleString("fr-FR")} F`} color="text-amber-600" />
        <MiniStat label="Total payé" value={`${(enterprise.total_paiements || 0).toLocaleString("fr-FR")} F`} color="text-emerald-600" />
        <MiniStat label="Reste dû" value={`${(enterprise.montant_du_silgapp || 0).toLocaleString("fr-FR")} F`} color="text-red-600" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Historique des écritures ({ledger?.length || 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ledger?.length > 0 ? ledger.slice(0, 30).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm border-b pb-1">
              <div>
                <span className="font-medium">
                  {e.type === "commission_course" ? "Commission" : e.type === "paiement" ? "Paiement" : "Ajustement"}
                </span>
                {e.taux != null && <span className="text-xs text-gray-400 ml-1">({e.taux}%)</span>}
                <p className="text-[10px] text-gray-400">{new Date(e.created_date).toLocaleString("fr-FR")}</p>
                {e.reference && <p className="text-[10px] text-gray-400">Réf: {e.reference}</p>}
              </div>
              <div className="text-right">
                <span className="font-bold">{e.montant > 0 ? "+" : ""}{e.montant.toLocaleString("fr-FR")} F</span>
                {e.nouveau_solde != null && <p className="text-[10px] text-gray-400">Solde: {e.nouveau_solde.toLocaleString("fr-FR")} F</p>}
              </div>
            </div>
          )) : <p className="text-sm text-gray-400">Aucune écriture</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function AddAdminModal({ enterpriseId, onClose, onAdded }) {
  const [form, setForm] = useState({ email: "", nom: "", prenom: "", telephone: "" });
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
        email: form.email,
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
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
        <CardHeader><CardTitle className="text-sm">+ Ajouter un administrateur</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Prénom</Label>
              <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <p className="text-[10px] text-gray-400 mt-1">Le compte sera créé/invité avec le rôle admin_entreprise.</p>
            </div>
            <div>
              <Label className="text-xs">Téléphone</Label>
              <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? "Création..." : "Créer l'admin"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AddLivreurModal({ enterpriseId, countryCode, onClose, onAdded }) {
  const [form, setForm] = useState({ nom: "", prenom: "", telephone: "", vehicule: "moto", ville: "", quartier: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await base44.functions.invoke("manageEnterprise", {
        action: "add_livreur",
        enterprise_id: enterpriseId,
        ...form,
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
        <CardHeader><CardTitle className="text-sm">+ Ajouter un livreur</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Prénom</Label>
              <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Nom *</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs">Téléphone *</Label>
              <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs">Véhicule</Label>
              <select value={form.vehicule} onChange={(e) => setForm({ ...form, vehicule: e.target.value })} className="w-full rounded-md border border-gray-200 p-2 text-sm">
                <option value="moto">Moto</option>
                <option value="velo">Vélo</option>
                <option value="voiture">Voiture</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Ville</Label>
              <Input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Quartier</Label>
              <Input value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })} />
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

  const nouveauDu = (enterprise.montant_du_silgapp || 0) - (Number(montant) || 0);

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
              <Label className="text-xs">Montant reçu (FCFA) *</Label>
              <Input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} required />
              {montant && <p className="text-[10px] text-gray-400 mt-1">Nouveau dû: {nouveauDu.toLocaleString("fr-FR")} F</p>}
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

// ── Carte de configuration : Clôture automatique des courses ──
function AutoCloseConfigCard() {
  const [enabled, setEnabled] = useState(null);
  const [delay, setDelay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const entries = await base44.entities.SystemConfig.filter({
        $or: [
          { cle: "auto_close_courses_enabled" },
          { cle: "auto_close_courses_delay_minutes" },
        ],
      });
      const map = {};
      for (const e of entries || []) map[e.cle] = e.valeur;
      setEnabled(map.auto_close_courses_enabled !== undefined ? map.auto_close_courses_enabled === "true" : true);
      setDelay(map.auto_close_courses_delay_minutes ? parseInt(map.auto_close_courses_delay_minutes, 10) : 120);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, []);

  const updateConfig = async (newEnabled, newDelay) => {
    setSaving(true);
    setError("");
    try {
      const entries = await base44.entities.SystemConfig.filter({
        $or: [
          { cle: "auto_close_courses_enabled" },
          { cle: "auto_close_courses_delay_minutes" },
        ],
      });
      const existing = {};
      for (const e of entries || []) existing[e.cle] = e;

      const updates = [];
      const enabledVal = String(newEnabled);
      const delayVal = String(newDelay);

      if (existing.auto_close_courses_enabled) {
        if (existing.auto_close_courses_enabled.valeur !== enabledVal) {
          await base44.entities.SystemConfig.update(existing.auto_close_courses_enabled.id, { valeur: enabledVal });
        }
      } else {
        updates.push({ cle: "auto_close_courses_enabled", valeur: enabledVal, description: "Clôture automatique des courses après timeout d'acceptation (ON/OFF)." });
      }

      if (existing.auto_close_courses_delay_minutes) {
        if (existing.auto_close_courses_delay_minutes.valeur !== delayVal) {
          await base44.entities.SystemConfig.update(existing.auto_close_courses_delay_minutes.id, { valeur: delayVal });
        }
      } else {
        updates.push({ cle: "auto_close_courses_delay_minutes", valeur: delayVal, description: "Délai en minutes après acceptation avant clôture automatique. Défaut: 120." });
      }

      if (updates.length > 0) {
        await base44.entities.SystemConfig.bulkCreate(updates);
      }

      setEnabled(newEnabled);
      setDelay(newDelay);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><CardContent className="p-4 text-sm text-gray-500">Chargement config clôture auto...</CardContent></Card>;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Clôture automatique des courses</p>
            <p className="text-[10px] text-gray-500">Clôture les courses acceptées depuis trop longtemps</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Activé</p>
              <p className="text-[10px] text-gray-400">Clôture auto après le délai configuré</p>
            </div>
            <button
              onClick={() => updateConfig(!enabled, delay)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <div>
            <Label className="text-xs">Délai (minutes)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min="30"
                value={delay ?? ""}
                onChange={(e) => setDelay(Number(e.target.value))}
                className="w-24"
                disabled={saving}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving || !delay || delay < 30}
                onClick={() => updateConfig(enabled, delay)}
              >
                {saving ? "..." : "Enregistrer"}
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Délai recommandé: 120 min (2h). Minimum: 30 min.
              {enabled ? " ✅ Actif" : " ⏸️ Désactivé"}
            </p>
          </div>

          <div className="flex items-start gap-1.5 text-[10px] text-gray-400">
            <Zap className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>Workflow: toutes les 10 min. Réutilise le mécanisme officiel (calculPrixCourseExterne, verifierEncoursLivreur). Marque <code>auto_completed=true</code> pour traçabilité.</span>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}