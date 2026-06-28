import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Package,
  MapPin,
  Phone,
  CheckCircle,
  Clock,
  X,
  Truck,
  ChefHat,
  Rocket,
  MessageCircle,
  Star,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CommandeQRPartenaire from "@/components/partenaire/CommandeQRPartenaire";
import ChatWindow from "@/components/chat/ChatWindow";

const STATUTS = {
  commande_envoyee: { label: "Nouvelle", color: "bg-red-50 text-red-700", border: "border-l-red-500", icon: Clock },
  commande_recue: { label: "Nouvelle", color: "bg-red-50 text-red-700", border: "border-l-red-500", icon: Clock },
  paiement_verification: { label: "Paiement à vérifier", color: "bg-red-50 text-red-700", border: "border-l-red-500", icon: Clock },
  paiement_valide: { label: "Paiement validé", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: CheckCircle },
  paiement_refuse: { label: "Paiement refusé", color: "bg-red-50 text-red-700", border: "border-l-red-500", icon: X },
  en_preparation: { label: "Préparation", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: ChefHat },
  prete_recuperation: { label: "Livreur recherché", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: Package },
  livreur_assigne: { label: "Livreur assigné", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: Truck },
  commande_recuperee: { label: "Récupérée", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: Package },
  en_livraison: { label: "En livraison", color: "bg-blue-50 text-blue-700", border: "border-l-blue-500", icon: Truck },
  livree: { label: "Livrée", color: "bg-green-50 text-green-700", border: "border-l-green-500", icon: CheckCircle },
  terminee: { label: "Terminée", color: "bg-green-50 text-green-700", border: "border-l-green-500", icon: CheckCircle },
  annulee: { label: "Annulée", color: "bg-gray-50 text-gray-600", border: "border-l-gray-400", icon: X },
};

const ACTIVE_DELIVERY_STATUSES = new Set(["prete_recuperation", "livreur_assigne", "commande_recuperee", "en_livraison"]);

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function openWhatsApp(phone, message) {
  const clean = normalizePhone(phone);
  if (!clean) return;
  const text = encodeURIComponent(message || "Bonjour, je vous contacte depuis SILGAPP.");
  window.open(`https://wa.me/${clean.replace(/^\+/, "")}?text=${text}`, "_blank");
}

function LivreurCompactCard({ livreur }) {
  if (!livreur) return null;
  const fullName = `${livreur.prenom || ""} ${livreur.nom || ""}`.trim() || "Livreur";
  const note = Number(livreur.note_moyenne || 0);
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={livreur.photo_url || "/icons/icon-192.png"}
          alt={fullName}
          className="w-12 h-12 rounded-2xl object-cover border border-white shadow-sm bg-white"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-blue-950 truncate">Livreur assigné</p>
          <p className="text-sm font-bold text-gray-900 truncate">{fullName}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{livreur.quartier || livreur.ville || "Quartier non renseigne"}</span>
            {note > 0 && <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-500 fill-amber-500" />{note.toFixed(1)}</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={livreur.telephone ? `tel:${livreur.telephone}` : undefined}
          className="h-10 rounded-xl bg-white text-blue-700 font-black text-xs flex items-center justify-center gap-2 border border-blue-100"
        >
          <Phone className="w-4 h-4" /> Appeler
        </a>
        <button
          type="button"
          onClick={() => openWhatsApp(livreur.telephone, `Bonjour ${fullName}, je vous contacte concernant une commande SILGAPP.`)}
          className="h-10 rounded-xl bg-green-600 text-white font-black text-xs flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp
        </button>
      </div>
    </div>
  );
}

export default function CommandesManager({ type, etablissementId, etablissementNom }) {
  const isRestaurant = type === "restaurant";
  const entityName = isRestaurant ? "CommandeRestaurant" : "CommandeBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [chatOpenId, setChatOpenId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const { data: commandes = [], isLoading } = useQuery({
    queryKey: ["commandes", type, etablissementId],
    queryFn: () => base44.entities[entityName].filter({ [idField]: etablissementId }, "-created_date", 100),
    refetchInterval: 5000,
  });

  const courseIds = useMemo(() => [...new Set((commandes || []).map(c => c.course_id).filter(Boolean))], [commandes]);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-commandes-partenaires", courseIds.join("|")],
    queryFn: async () => Promise.all(courseIds.map(id => base44.entities.CourseExterne.get(id).catch(() => null))),
    enabled: courseIds.length > 0,
    refetchInterval: 5000,
  });

  const courseById = useMemo(() => {
    const map = new Map();
    (courses || []).filter(Boolean).forEach(c => map.set(c.id, c));
    return map;
  }, [courses]);

  const livreurIds = useMemo(() => [...new Set((courses || []).map(c => c?.livreur_id).filter(Boolean))], [courses]);

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-commandes-partenaires", livreurIds.join("|")],
    queryFn: async () => Promise.all(livreurIds.map(id => base44.entities.Livreur.get(id).catch(() => null))),
    enabled: livreurIds.length > 0,
    refetchInterval: 5000,
  });

  const livreurById = useMemo(() => {
    const map = new Map();
    (livreurs || []).filter(Boolean).forEach(l => map.set(l.id, l));
    return map;
  }, [livreurs]);

  const handleAction = async (commande, action) => {
    setActionLoading(commande.id);
    try {
      await base44.functions.invoke("changerStatutCommande", { commande_id: commande.id, type, action });
      queryClient.invalidateQueries({ queryKey: ["commandes", type, etablissementId] });
      queryClient.invalidateQueries({ queryKey: ["courses-commandes-partenaires"] });
    } catch (err) {
      alert("Erreur: " + (err?.message || "echec"));
    }
    setActionLoading(null);
  };

  const filtered = filter === "all"
    ? commandes
    : filter === "en_livraison"
      ? commandes.filter(c => ["livreur_assigne", "commande_recuperee", "en_livraison"].includes(c.statut))
      : commandes.filter(c => c.statut === filter);
  const counts = commandes.reduce((acc, c) => { acc[c.statut] = (acc[c.statut] || 0) + 1; return acc; }, {});

  const activeFilters = [
    { key: "all", label: "Toutes", count: commandes.length },
    { key: "commande_envoyee", label: "Nouvelles", count: (counts.commande_envoyee || 0) + (counts.commande_recue || 0) },
    { key: "paiement_verification", label: "Paiement", count: counts.paiement_verification || 0 },
    { key: "en_preparation", label: "Préparation", count: counts.en_preparation || 0 },
    { key: "prete_recuperation", label: "Prêtes", count: counts.prete_recuperation || 0 },
    { key: "en_livraison", label: "Livraison", count: (counts.en_livraison || 0) + (counts.commande_recuperee || 0) + (counts.livreur_assigne || 0) },
    { key: "livree", label: "Livrées", count: counts.livree || 0 },
  ].filter(f => f.count > 0 || f.key === "all");

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-gray-900 text-base px-1">Commandes reçues</h2>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {activeFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all " + (filter === f.key ? "bg-purple-600 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200")}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Aucune commande</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(cmd => {
          const course = cmd.course_id ? courseById.get(cmd.course_id) : null;
          const effectiveStatut = course?.statut === "colis_recupere" ? "commande_recuperee" : cmd.statut;
          const s = STATUTS[effectiveStatut] || STATUTS.commande_envoyee;
          const Icon = s.icon;
          const items = (() => { try { return JSON.parse(cmd.items || "[]"); } catch { return []; } })();
          const itemCount = items.reduce((sum, it) => sum + (it.quantite || 1), 0);
          const isExpanded = expandedId === cmd.id;
          const livreur = course?.livreur_id ? livreurById.get(course.livreur_id) : null;
          const isChatOpen = chatOpenId === cmd.id;

          return (
            <div key={cmd.id} className={"bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4 " + s.border + " overflow-hidden"}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : cmd.id)}
                className="w-full px-3 py-3 flex items-center gap-3 text-left"
              >
                <div className={"w-9 h-9 rounded-xl flex items-center justify-center " + s.color}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-gray-900 text-sm truncate">{cmd.client_nom || "Client"}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">
                    #{(cmd.id || "").slice(-6)} - {itemCount} article(s) - {(cmd.total || 0).toLocaleString()} FCFA
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={"text-[10px] font-bold px-2 py-1 rounded-full " + s.color}>{s.label}</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(cmd.created_date)}</span>
                </div>
                <ChevronRight className={"w-4 h-4 text-gray-400 transition-transform " + (isExpanded ? "rotate-90" : "")} />
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-50">
                  <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
                    <div className="rounded-xl bg-gray-50 p-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Téléphone</p>
                      <p className="font-bold text-gray-800">{cmd.client_telephone || "-"}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Adresse</p>
                      <p className="font-bold text-gray-800 truncate">{cmd.adresse_livraison || cmd.quartier_livraison || "-"}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-2.5 space-y-1">
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600">{it.nom} x {it.quantite}</span>
                        <span className="font-semibold text-gray-700">{((it.prix || 0) * (it.quantite || 1)).toLocaleString()} F</span>
                      </div>
                    ))}
                  </div>

                  {cmd.preuve_paiement_url && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 font-medium">Preuve de paiement</p>
                      <img src={cmd.preuve_paiement_url} alt="Preuve" className="w-full rounded-xl max-h-40 object-cover border border-gray-100" />
                    </div>
                  )}

                  {cmd.note_client && (
                    <div className="text-xs text-gray-500 italic bg-amber-50/50 rounded-lg p-2">{cmd.note_client}</div>
                  )}

                  {cmd.statut === "commande_envoyee" && (
                    <Button size="sm" onClick={() => handleAction(cmd, "verifier_paiement")} disabled={actionLoading === cmd.id} className="bg-red-600 hover:bg-red-700 text-xs h-9">
                      {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />} Vérifier paiement
                    </Button>
                  )}
                  {cmd.statut === "paiement_verification" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAction(cmd, "valider_paiement")} disabled={actionLoading === cmd.id} className="bg-green-600 hover:bg-green-700 text-xs h-9">
                        {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Valider
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction(cmd, "refuser_paiement")} disabled={actionLoading === cmd.id} className="text-red-500 border-red-200 text-xs h-9">
                        <X className="w-3 h-3" /> Refuser
                      </Button>
                    </div>
                  )}
                  {cmd.statut === "paiement_valide" && (
                    <Button size="sm" onClick={() => handleAction(cmd, "commencer_preparation")} disabled={actionLoading === cmd.id} className="bg-blue-600 hover:bg-blue-700 text-xs h-9">
                      {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChefHat className="w-3 h-3" />} Commencer préparation
                    </Button>
                  )}
                  {cmd.statut === "en_preparation" && (
                    <Button size="sm" onClick={() => handleAction(cmd, "prete_recuperation")} disabled={actionLoading === cmd.id} className="bg-blue-600 hover:bg-blue-700 text-xs h-9">
                      {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />} Prête - déclencher livraison
                    </Button>
                  )}

                  {cmd.statut === "prete_recuperation" && !livreur && (
                    <p className="text-xs text-blue-600 font-bold flex items-center gap-1 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Recherche livreur en cours...</p>
                  )}

                  {livreur && ACTIVE_DELIVERY_STATUSES.has(effectiveStatut) && <LivreurCompactCard livreur={livreur} />}

                  {cmd.course_id && ["prete_recuperation", "livreur_assigne"].includes(cmd.statut) && (
                    <CommandeQRPartenaire courseId={cmd.course_id} />
                  )}

                  {cmd.statut === "commande_recuperee" && (
                    <p className="text-xs text-blue-700 font-bold flex items-center gap-1 py-1"><Package className="w-3 h-3" /> Commande récupérée - livreur en route vers le client</p>
                  )}
                  {cmd.statut === "en_livraison" && (
                    <p className="text-xs text-blue-700 font-bold flex items-center gap-1 py-1"><Truck className="w-3 h-3" /> En livraison</p>
                  )}
                  {cmd.statut === "livree" && (
                    <p className="text-xs text-green-700 font-bold flex items-center gap-1 py-1"><CheckCircle className="w-3 h-3" /> Livrée</p>
                  )}

                  {!["livree", "annulee", "prete_recuperation", "livreur_assigne", "commande_recuperee", "en_livraison"].includes(cmd.statut) && (
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Annuler cette commande ?")) handleAction(cmd, "annuler"); }} disabled={actionLoading === cmd.id} className="text-red-500 text-xs h-9">Annuler</Button>
                  )}

                  {cmd.course_id && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setChatOpenId(isChatOpen ? null : cmd.id)}
                        className="w-full h-10 rounded-xl text-xs font-black"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {isChatOpen ? "Fermer la messagerie" : "Messagerie"}
                      </Button>
                      {isChatOpen && (
                        <ChatWindow
                          courseId={cmd.course_id}
                          senderType="partenaire"
                          senderId={etablissementId}
                          senderName={etablissementNom || (isRestaurant ? cmd.restaurant_nom : cmd.boutique_nom) || "Partenaire"}
                          contextInfo={{
                            reference: `Commande #${(cmd.id || "").slice(-6)}`,
                            client: cmd.client_nom || "Client",
                            partenaire: etablissementNom || cmd.boutique_nom || cmd.restaurant_nom || "Partenaire",
                            statut: s.label,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
