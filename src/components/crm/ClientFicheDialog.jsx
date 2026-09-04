import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, Phone, MapPin, Package, Calendar, TrendingUp, Clock, Pencil, Save, X, MessageCircle, Ban } from "lucide-react";
import { normalizePhone } from "@/lib/crmUtils";
import { cn } from "@/lib/utils";

const STATUT_COLORS = {
  actif: "bg-green-100 text-green-700 border-green-300",
  inactif: "bg-red-100 text-red-700 border-red-300",
  vip: "bg-amber-100 text-amber-700 border-amber-300",
  nouveau: "bg-yellow-100 text-yellow-700 border-yellow-300",
};

const STATUT_LABELS = { actif: "Actif", inactif: "Inactif", vip: "VIP", nouveau: "Nouveau" };

const TYPE_COLIS_LABELS = {
  petit_colis: "Petit colis", moyen_colis: "Moyen colis", gros_colis: "Gros colis",
  document: "Document", nourriture: "Nourriture", autre: "Autre",
};

export default function ClientFicheDialog({ open, onClose, client: initialClient, prospection: initialProspection }) {
  const [client, setClient] = useState(initialClient);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ nom: "", prenom: "", statut_crm: "nouveau", notes_admin: "", roles: [] });

  // ── Pipeline prospection ──
  const [prospection, setProspection] = useState(initialProspection);
  const [pipelineSaving, setPipelineSaving] = useState(false);

  useEffect(() => {
    if (initialProspection !== undefined) setProspection(initialProspection);
  }, [initialProspection]);

  const PIPELINE_OPTIONS = [
    { key: "a_contacter", label: "À contacter" },
    { key: "contacte", label: "Contacté" },
    { key: "interesse", label: "Intéressé" },
    { key: "a_relancer", label: "À relancer" },
    { key: "app_installee", label: "App installée" },
    { key: "converti", label: "Converti" },
    { key: "pas_interesse", label: "Pas intéressé" },
    { key: "ne_plus_contacter", label: "Ne plus contacter" },
  ];

  const TYPE_OPTIONS = [
    { key: "particulier", label: "Particulier" },
    { key: "commerce", label: "Commerce" },
    { key: "restaurant", label: "Restaurant" },
    { key: "entreprise", label: "Entreprise" },
    { key: "autre", label: "Autre" },
  ];

  const updatePipeline = async (updates) => {
    if (!client?.id) return;
    setPipelineSaving(true);
    try {
      const now = new Date().toISOString();
      if (prospection) {
        const updated = await base44.entities.CrmProspection.update(prospection.id, {
          ...updates,
          dernier_contact_at: updates.pipeline_status ? now : prospection.dernier_contact_at,
          nb_contacts: updates.pipeline_status ? (prospection.nb_contacts || 0) + 1 : prospection.nb_contacts,
        });
        setProspection(updated);
      } else {
        const created = await base44.entities.CrmProspection.create({
          client_id: client.id,
          client_nom: `${client.prenom || ""} ${client.nom || ""}`.trim(),
          client_telephone: client.telephone || "",
          client_phone_normalized: client.telephone_normalized || "",
          country_code: client.country_code || "",
          pipeline_status: updates.pipeline_status || "a_contacter",
          crm_type: updates.crm_type || "particulier",
          origine: "crm",
          dernier_contact_at: updates.pipeline_status ? now : null,
          nb_contacts: updates.pipeline_status ? 1 : 0,
        });
        setProspection(created);
      }
    } catch (err) {
      console.error("Erreur pipeline:", err);
    } finally {
      setPipelineSaving(false);
    }
  };

  // ── Lien WhatsApp (manuel — n'envoie pas automatiquement) ──
  const waPhone = (() => {
    if (!client) return null;
    let num = String(client.telephone || "").replace(/\D/g, "");
    if (!num) return null;
    // Normalisation simple: si commence par 0, remplacer par indicatif pays
    const dialMap = { BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221", ML: "223", GN: "224", NE: "227", GH: "233", MA: "212" };
    const dial = dialMap[client.country_code] || "";
    if (num.startsWith("0")) num = dial + num.slice(1);
    else if (dial && num.length <= 9) num = dial + num;
    return num;
  })();

  const isPro = prospection?.crm_type === "commerce" || prospection?.crm_type === "restaurant" || prospection?.crm_type === "entreprise";
  const waMessage = isPro
    ? "Bonjour 👋\nVous avez déjà utilisé SILGAPP pour vos livraisons.\nAvec l'application SILGAPP, vous pouvez demander directement un livreur pour livrer vos clients.\nVous continuez à vendre, SILGAPP s'occupe de la livraison."
    : "Bonjour 👋\nVous avez déjà utilisé le service de livraison SILGAPP.\nVous pouvez maintenant faire directement vos demandes de livraison depuis l'application SILGAPP, sans passer par notre équipe.\nC'est simple, rapide et vous permet de suivre votre livraison.";
  const waLink = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}` : null;

  // ── Indicateur App CORRIGÉ ──
  // "App installée" = a un compte User (user_email). Pas basé sur app_active/last_seen_at.
  const hasAppAccount = !!(client?.user_email);

  useEffect(() => {
    if (initialClient) setClient(initialClient);
  }, [initialClient]);

  useEffect(() => {
    if (!open || !client?.id) return;
    const loadCourses = async () => {
      setLoading(true);
      try {
        const normalized = client.telephone_normalized || normalizePhone(client.telephone, client.country_code || "");
        // Requêtes filtrées par telephone_normalized — pas de chargement de 50 courses
        const results = [];
        const seenIds = new Set();

        try {
          const r1 = await base44.entities.CourseExterne.filter(
            { client_phone_normalized: normalized }, "-created_date", 20
          );
          for (const c of r1 || []) { if (!seenIds.has(c.id)) { seenIds.add(c.id); results.push(c); } }
        } catch {}

        try {
          const r2 = await base44.entities.CourseExterne.filter(
            { expediteur_phone_normalized: normalized }, "-created_date", 20
          );
          for (const c of r2 || []) { if (!seenIds.has(c.id)) { seenIds.add(c.id); results.push(c); } }
        } catch {}

        try {
          const r3 = await base44.entities.CourseExterne.filter(
            { destinataire_phone_normalized: normalized }, "-created_date", 20
          );
          for (const c of r3 || []) { if (!seenIds.has(c.id)) { seenIds.add(c.id); results.push(c); } }
        } catch {}

        results.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
        setCourses(results);
      } catch {
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    loadCourses();
  }, [open, client]);

  const startEdit = () => {
    let roles = [];
    try { roles = client.roles ? JSON.parse(client.roles) : []; } catch {}
    setEditForm({
      nom: client.nom || "",
      prenom: client.prenom || "",
      statut_crm: client.statut_crm || "nouveau",
      notes_admin: client.notes_admin || "",
      roles,
    });
    setEditing(true);
  };

  const toggleRole = (role) => {
    setEditForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await base44.entities.ClientExterne.update(client.id, {
        nom: editForm.nom || "Client",
        prenom: editForm.prenom,
        statut_crm: editForm.statut_crm,
        notes_admin: editForm.notes_admin || null,
        roles: JSON.stringify(editForm.roles),
        est_expediteur: editForm.roles.includes("expediteur"),
        est_destinataire: editForm.roles.includes("destinataire"),
      });
      setClient(updated);
      setEditing(false);
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  const fullName = `${client.prenom || ""} ${client.nom || ""}`.trim() || client.telephone || "Client";
  const statut = client.statut_crm || "nouveau";
  let quartiers = [];
  try { quartiers = JSON.parse(client.quartiers_utilises || "[]"); } catch {}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                {fullName.charAt(0).toUpperCase()}
              </div>
              {fullName}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {!editing ? (
                <Button size="sm" variant="outline" onClick={startEdit} className="h-8 text-xs gap-1">
                  <Pencil className="w-3 h-3" /> Modifier
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-8 text-xs gap-1">
                    <X className="w-3 h-3" />
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={saving} className="h-8 text-xs gap-1">
                    <Save className="w-3 h-3" /> {saving ? "..." : "Enregistrer"}
                  </Button>
                </div>
              )}
              <Badge className={STATUT_COLORS[statut] || STATUT_COLORS.nouveau}>
                {statut === "vip" && <Star className="w-3 h-3 mr-1" />}
                {STATUT_LABELS[statut] || statut}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Infos de base ou formulaire d'édition */}
          {editing ? (
            <div className="space-y-3 bg-blue-50/30 rounded-xl p-4 border border-blue-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Prénom</p>
                  <Input value={editForm.prenom} onChange={e => setEditForm({...editForm, prenom: e.target.value})} className="h-9" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Nom</p>
                  <Input value={editForm.nom} onChange={e => setEditForm({...editForm, nom: e.target.value})} className="h-9" />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Statut CRM</p>
                <div className="flex gap-1.5">
                  {["nouveau", "actif", "vip", "inactif"].map(s => (
                    <button key={s} onClick={() => setEditForm({...editForm, statut_crm: s})}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        editForm.statut_crm === s ? "bg-blue-500 text-white" : "bg-white text-gray-500 border border-gray-200"
                      }`}>
                      {STATUT_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Rôles</p>
                <div className="flex gap-1.5">
                  {["client", "expediteur", "destinataire"].map(r => (
                    <button key={r} onClick={() => toggleRole(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        editForm.roles.includes(r) ? "bg-green-500 text-white" : "bg-white text-gray-500 border border-gray-200"
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase">Notes admin</p>
                <Textarea value={editForm.notes_admin} onChange={e => setEditForm({...editForm, notes_admin: e.target.value})}
                  placeholder="Notes internes..." className="min-h-[60px] text-sm" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">{client.telephone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">{client.quartier || client.ville || "—"}</span>
                </div>
              </div>

              {/* Stats CRM */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <Package className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-gray-800">{client.nb_courses_total || 0}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-semibold">Courses livrées</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-gray-800">{client.nb_courses_admin || 0}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-semibold">Admin</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                  <span className="text-base font-bold text-amber-600 block">FCFA</span>
                  <p className="text-sm font-bold text-gray-800 leading-tight">{(client.montant_total_depense || 0).toLocaleString()}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-semibold">Dépensé</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
                  <Clock className="w-4 h-4 text-purple-500 mx-auto mb-1" />
                  <p className="text-[10px] font-bold text-gray-800 leading-tight">
                    {client.derniere_course_date ? new Date(client.derniere_course_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500 uppercase font-semibold">Dernière</p>
                </div>
              </div>
            </>
          )}

          {/* Quartiers préférés */}
          {!editing && quartiers.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Quartiers les plus utilisés
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quartiers.slice(0, 5).map((q, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] bg-white">
                    {q.quartier} ({q.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes admin */}
          {!editing && client.notes_admin && (
            <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-200">
              <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-wide mb-1">Notes admin</p>
              <p className="text-sm text-gray-700">{client.notes_admin}</p>
            </div>
          )}

          {/* ── Indicateur App CORRIGÉ ── */}
          {!editing && (
            <div className={hasAppAccount ? "bg-purple-50 rounded-xl p-3 border border-purple-200" : "bg-gray-50 rounded-xl p-3 border border-gray-200"}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: hasAppAccount ? "#7c3aed" : "#6b7280" }}>
                Compte application
              </p>
              {hasAppAccount ? (
                <p className="text-sm font-bold text-purple-700">App installée</p>
              ) : (
                <p className="text-sm font-bold text-gray-500">Pas de compte App — CRM uniquement</p>
              )}
              {client.last_seen_at && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Dernière activité: {new Date(client.last_seen_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          )}

          {/* ── Pipeline prospection ── */}
          {!editing && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200 space-y-3">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Pipeline prospection</p>

              {/* Statut pipeline */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Statut</p>
                <div className="flex flex-wrap gap-1">
                  {PIPELINE_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => updatePipeline({ pipeline_status: opt.key })}
                      disabled={pipelineSaving}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-50",
                        (prospection?.pipeline_status || "a_contacter") === opt.key
                          ? "bg-blue-500 text-white shadow-sm"
                          : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type CRM */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Type CRM</p>
                <div className="flex flex-wrap gap-1">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => updatePipeline({ crm_type: opt.key })}
                      disabled={pipelineSaving}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-50",
                        (prospection?.crm_type || "particulier") === opt.key
                          ? "bg-purple-500 text-white shadow-sm"
                          : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Infos prospection */}
              {prospection && (
                <div className="flex flex-wrap gap-2 text-[10px]">
                  {prospection.dernier_contact_at && (
                    <span className="text-gray-500">
                      Dernier contact: {new Date(prospection.dernier_contact_at).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  <span className="text-gray-500">Contacts: {prospection.nb_contacts || 0}</span>
                  {prospection.prochaine_relance_at && (
                    <span className="text-amber-600 font-semibold">
                      Relance: {new Date(prospection.prochaine_relance_at).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              )}

              {/* Bouton WhatsApp — ouvre WhatsApp, n'envoie PAS automatiquement */}
              {waLink && (prospection?.pipeline_status !== "ne_plus_contacter") && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  Contacter sur WhatsApp
                </a>
              )}
              {prospection?.pipeline_status === "ne_plus_contacter" && (
                <div className="w-full h-11 rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold text-sm flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" /> Ne plus contacter
                </div>
              )}
            </div>
          )}

          {/* Historique des courses */}
          {!editing && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Historique des courses ({courses.length})
              </p>
              {loading ? (
                <p className="text-sm text-gray-400 text-center py-4">Chargement...</p>
              ) : courses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucune course trouvée</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {courses.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-700 truncate">
                          {c.adresse_depart || "—"} → {c.adresse_arrivee || "—"}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(c.created_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                          {c.livreur_nom && ` • ${c.livreur_nom}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(c.prix_final || c.prix_estimate) && (
                          <span className="text-[10px] font-bold text-green-600">
                            {(c.prix_final || c.prix_estimate).toLocaleString()} F
                          </span>
                        )}
                        <Badge variant="outline" className={`text-[9px] ${
                          c.statut === "livree" ? "bg-green-50 text-green-700 border-green-200" :
                          c.statut === "annulee" ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {c.statut}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}