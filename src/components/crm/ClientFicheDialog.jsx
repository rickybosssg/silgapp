import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, Phone, MapPin, Package, Calendar, TrendingUp, Clock, Pencil, Save, X } from "lucide-react";
import { normalizePhone } from "@/lib/crmUtils";

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

export default function ClientFicheDialog({ open, onClose, client: initialClient }) {
  const [client, setClient] = useState(initialClient);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ nom: "", prenom: "", statut_crm: "nouveau", notes_admin: "", roles: [] });

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