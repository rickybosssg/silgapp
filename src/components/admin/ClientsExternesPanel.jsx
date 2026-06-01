import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, Eye, Lock, Unlock, Phone, Mail, Calendar, Activity, Truck, Trash2, Tag, Plus, ToggleLeft, ToggleRight, X, MapPin, Package, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function formaterTel(tel) {
  if (!tel) return "-";
  const digits = tel.replace(/\D/g, "").slice(-8);
  if (digits.length !== 8) return tel;
  return digits.slice(0, 2) + " " + digits.slice(2, 4) + " " + digits.slice(4, 6) + " " + digits.slice(6, 8);
}

function getInitiales(nom, prenom) {
  const n = (nom || "").charAt(0).toUpperCase();
  const p = (prenom || "").charAt(0).toUpperCase();
  return p ? p + n : n + (nom || "").charAt(1).toUpperCase();
}

const COULEURS_AVATAR = [
  "from-pink-500 to-rose-500",
  "from-violet-500 to-purple-500",
  "from-blue-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-cyan-500 to-sky-500",
];

function getCouleurAvatar(nom) {
  let hash = 0;
  for (let i = 0; i < (nom || "").length; i++) hash += nom.charCodeAt(i);
  return COULEURS_AVATAR[hash % COULEURS_AVATAR.length];
}

function AttribuerCodePromoModal({ client, onClose, onDone }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const countryCode = client.country_code || "BF";

  const handleAttribuer = async () => {
    if (!code.trim()) { toast.error("Code requis"); return; }
    setLoading(true);
    const codeFormate = code.trim().toUpperCase();
    const existing = await base44.entities.CodePromo.filter({ code: codeFormate });
    if (existing?.length > 0) { toast.error("Ce code existe déjà"); setLoading(false); return; }
    await base44.entities.CodePromo.create({
      code: codeFormate,
      proprietaire_nom: `${client.prenom || ""} ${client.nom || ""}`.trim() || client.nom,
      proprietaire_email: client.email || null,
      proprietaire_client_id: client.id,
      country_code: countryCode,
      actif: true,
      nb_inscrits: 0,
      nb_premieres_courses: 0,
      total_primes_generees: 0,
    });
    toast.success(`Code ${codeFormate} attribué à ${client.nom} !`);
    setLoading(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <Tag className="w-4 h-4 text-purple-600" />
            </div>
            <h3 className="font-bold text-base">Attribuer un code promo</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground">Code ambassadeur pour <strong>{client.nom}</strong></p>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Code promo *</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ex: AISSA100"
            className="flex h-10 w-full rounded-xl border border-input bg-gray-50 px-3 py-1 text-base shadow-sm font-mono font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
          <span className="text-base">💡</span>
          <span>Le client gagnera <strong>100 FCFA fixe</strong> à chaque première course d'un ami inscrit avec ce code.</span>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Annuler</Button>
          <Button className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-xl" onClick={handleAttribuer} disabled={loading}>
            {loading ? "En cours..." : "Attribuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClientDetailModal({ client, courses, migrationEnCours, onClose, onBloquer, onMigrer, onSupprimer, onRefetch }) {
  const [showAttribuerCode, setShowAttribuerCode] = useState(false);
  const couleur = getCouleurAvatar(client.nom);

  const { data: codePromo } = useQuery({
    queryKey: ["code-promo-client", client.id],
    queryFn: () => base44.entities.CodePromo.filter({ proprietaire_client_id: client.id }),
    select: d => d?.[0] || null,
  });

  const coursesDuClient = courses.filter(c => {
    const tel = (c.client_telephone || "").replace(/\D/g, "").slice(-8);
    const clientTel = (client.telephone || "").replace(/\D/g, "").slice(-8);
    return tel === clientTel || c.expediteur_client_id === client.id || c.destinataire_client_id === client.id;
  });
  const livrees = coursesDuClient.filter(c => c.statut === "livree").length;
  const annulees = coursesDuClient.filter(c => c.statut === "annulee").length;

  const handleToggleCode = async () => {
    if (!codePromo) return;
    await base44.entities.CodePromo.update(codePromo.id, { actif: !codePromo.actif });
    toast.success(codePromo.actif ? "Code désactivé" : "Code réactivé");
    onRefetch();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header modal */}
        <div className={`bg-gradient-to-r ${couleur} p-5 rounded-t-2xl`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <span className="text-white font-black text-xl">{getInitiales(client.nom, client.prenom)}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{client.nom}</h2>
                {client.prenom && <p className="text-white/80 text-sm">{client.prenom}</p>}
                <div className="flex items-center gap-1.5 mt-1">
                  <Phone className="w-3 h-3 text-white/70" />
                  <span className="text-white/90 text-xs font-mono">{formaterTel(client.telephone)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
              <Badge className={`text-xs ${client.actif === false ? "bg-red-500/90 text-white" : "bg-white/20 text-white border-white/30"}`}>
                {client.actif === false ? "🔒 Bloqué" : "✅ Actif"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats courses */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-2xl font-black text-gray-800">{coursesDuClient.length}</p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">Créées</p>
            </div>
            <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100">
              <p className="text-2xl font-black text-green-700">{livrees}</p>
              <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wide mt-0.5">Livrées</p>
            </div>
            <div className="bg-red-50 rounded-2xl p-3 text-center border border-red-100">
              <p className="text-2xl font-black text-red-600">{annulees}</p>
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mt-0.5">Annulées</p>
            </div>
          </div>

          {/* Infos */}
          <div className="space-y-2">
            {client.email && (
              <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">{client.email}</span>
              </div>
            )}
            {client.quartier && (
              <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>{client.quartier}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>Inscrit le {format(new Date(client.created_date), "dd MMMM yyyy", { locale: fr })}</span>
            </div>
            <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl text-sm">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">GPS :</span>
              <span className={`font-semibold ${client.latitude ? "text-green-600" : "text-red-500"}`}>
                {client.latitude ? "✅ Activé" : "❌ Non activé"}
              </span>
            </div>
          </div>

          {/* Dernières courses */}
          {coursesDuClient.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dernières courses</p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {coursesDuClient.slice(0, 10).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.adresse_depart} → {c.adresse_arrivee || "?"}</p>
                      <p className="text-gray-400">{format(new Date(c.created_date), "dd/MM HH:mm")}</p>
                    </div>
                    <Badge
                      className={`ml-2 flex-shrink-0 text-[10px] ${
                        c.statut === "livree" ? "bg-green-100 text-green-700 border-green-200" :
                        c.statut === "annulee" ? "bg-red-100 text-red-600 border-red-200" :
                        "bg-orange-100 text-orange-700 border-orange-200"
                      }`}
                    >
                      {c.statut === "livree" ? "✓ Livrée" : c.statut === "annulee" ? "✕ Annulée" : "En cours"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Code Promo Ambassadeur */}
          <div className="border-2 border-purple-100 rounded-2xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 space-y-3">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-widest flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />Code Promo Ambassadeur
            </p>
            {codePromo ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black font-mono text-purple-800 text-xl tracking-widest bg-white px-3 py-1.5 rounded-xl border border-purple-200 shadow-sm">
                    {codePromo.code}
                  </span>
                  <Badge className={`text-xs px-2.5 py-1 ${codePromo.actif ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                    {codePromo.actif ? "● Actif" : "○ Inactif"}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-xl p-2 border border-purple-100">
                    <p className="text-lg font-black text-purple-700">{codePromo.nb_inscrits || 0}</p>
                    <p className="text-[10px] text-gray-400">Inscrits</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-purple-100">
                    <p className="text-lg font-black text-purple-700">{codePromo.nb_premieres_courses || 0}</p>
                    <p className="text-[10px] text-gray-400">Courses</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-purple-100">
                    <p className="text-lg font-black text-purple-700">{(codePromo.total_primes_generees || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">FCFA</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50" onClick={handleToggleCode}>
                  {codePromo.actif ? <><ToggleRight className="w-3.5 h-3.5 mr-1.5 text-green-600" />Désactiver le code</> : <><ToggleLeft className="w-3.5 h-3.5 mr-1.5" />Activer le code</>}
                </Button>
              </div>
            ) : (
              <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 rounded-xl" onClick={() => setShowAttribuerCode(true)}>
                <Plus className="w-3.5 h-3.5" />🎁 Attribuer un code promo
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            {!client.deja_livreur && (
              <Button
                disabled={migrationEnCours === client.id}
                className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600"
                onClick={() => onMigrer(client)}
              >
                {migrationEnCours === client.id ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Migration en cours...</>
                ) : (
                  <><Truck className="w-4 h-4 mr-2" />🚚 Migrer vers Livreur Externe</>
                )}
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant={client.actif === false ? "default" : "destructive"}
                className="flex-1 rounded-xl"
                onClick={() => { onBloquer(client); onClose(); }}
              >
                {client.actif === false ? <><Unlock className="w-4 h-4 mr-1" />Débloquer</> : <><Lock className="w-4 h-4 mr-1" />Bloquer</>}
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Fermer</Button>
            </div>
            <Button
              variant="destructive"
              className="w-full rounded-xl bg-red-700 hover:bg-red-800 text-xs"
              onClick={() => {
                if (window.confirm(`Supprimer définitivement ${client.nom} ? Cette action est irréversible.`)) {
                  onSupprimer(client);
                  onClose();
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />Supprimer définitivement ce client
            </Button>
          </div>
        </div>
      </div>
      {showAttribuerCode && (
        <AttribuerCodePromoModal client={client} onClose={() => setShowAttribuerCode(false)} onDone={onRefetch} />
      )}
    </div>
  );
}

export default function ClientsExternesPanel() {
  const [recherche, setRecherche] = useState("");
  const [clientDetail, setClientDetail] = useState(null);
  const [migrationEnCours, setMigrationEnCours] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);

  const { data: clients = [], refetch } = useQuery({
    queryKey: ["clients-externes-panel"],
    queryFn: () => base44.entities.ClientExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-all"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 500),
    initialData: [],
  });

  const clientsFiltres = useMemo(() => {
    if (!recherche) return clients;
    const q = recherche.toLowerCase().replace(/\s/g, "");
    return clients.filter(c => {
      const tel = (c.telephone || "").replace(/\D/g, "");
      return (
        (c.nom || "").toLowerCase().includes(recherche.toLowerCase()) ||
        tel.includes(q) ||
        (c.email || "").toLowerCase().includes(recherche.toLowerCase())
      );
    });
  }, [clients, recherche]);

  const handleBloquer = async (client) => {
    await base44.entities.ClientExterne.update(client.id, { actif: client.actif === false ? true : false });
    refetch();
  };

  const handleSupprimer = async (client) => {
    setSuppressionEnCours(client.id);
    await base44.entities.ClientExterne.delete(client.id);
    toast.success(`Client ${client.nom} supprimé`);
    setSuppressionEnCours(null);
    refetch();
  };

  const handleMigrer = async (client) => {
    setMigrationEnCours(client.id);
    try {
      const result = await base44.functions.invoke("migrerClientVersLivreur", { client_id: client.id });
      if (result.error) {
        if (result.error === "Déjà livreur") {
          toast.info(result.message || "Ce client est déjà un livreur");
          setClientDetail(null);
          refetch();
        } else {
          toast.error(result.error || "Erreur inconnue");
        }
      } else if (result.success) {
        toast.success(`✅ ${result.livreur?.prenom || ''} ${result.livreur?.nom || ''} est maintenant livreur externe !`);
        setClientDetail(null);
        refetch();
      } else {
        toast.error("Erreur inattendue");
      }
    } catch (err) {
      toast.error(err.message || "Erreur lors de la migration");
    } finally {
      setMigrationEnCours(null);
    }
  };

  const getCourseStats = (client) => {
    const tel = (client.telephone || "").replace(/\D/g, "").slice(-8);
    const c = courses.filter(cs => {
      const ctel = (cs.client_telephone || "").replace(/\D/g, "").slice(-8);
      return ctel === tel || cs.expediteur_client_id === client.id || cs.destinataire_client_id === client.id;
    });
    return {
      total: c.length,
      livrees: c.filter(cs => cs.statut === "livree").length,
      annulees: c.filter(cs => cs.statut === "annulee").length,
      lastActivity: c.length > 0 ? c[0].created_date : null,
    };
  };

  const clientsActifs = clients.filter(c => c.actif !== false).length;
  const clientsAvecGPS = clients.filter(c => c.latitude).length;
  const clientsBloques = clients.filter(c => c.actif === false).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-md shadow-pink-200">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Clients inscrits</h2>
            <p className="text-xs text-muted-foreground">{clients.length} comptes enregistrés</p>
          </div>
        </div>
        <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-sm font-bold px-3 py-1">{clients.length}</Badge>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl p-3 text-white text-center shadow-md shadow-pink-100">
          <p className="text-2xl font-black">{clients.length}</p>
          <p className="text-[10px] font-semibold opacity-80 mt-0.5">TOTAL</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-green-500 rounded-2xl p-3 text-white text-center shadow-md shadow-green-100">
          <p className="text-2xl font-black">{clientsActifs}</p>
          <p className="text-[10px] font-semibold opacity-80 mt-0.5">ACTIFS</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl p-3 text-white text-center shadow-md shadow-blue-100">
          <p className="text-2xl font-black">{clientsAvecGPS}</p>
          <p className="text-[10px] font-semibold opacity-80 mt-0.5">GPS OK</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-3 text-white text-center shadow-md shadow-red-100">
          <p className="text-2xl font-black">{clientsBloques}</p>
          <p className="text-[10px] font-semibold opacity-80 mt-0.5">BLOQUÉS</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, téléphone ou email..."
          className="pl-10 rounded-xl bg-gray-50 border-gray-200 focus:bg-white"
        />
        {recherche && (
          <button onClick={() => setRecherche("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Résultats */}
      {recherche && (
        <p className="text-xs text-muted-foreground -mt-2">
          {clientsFiltres.length} résultat{clientsFiltres.length > 1 ? "s" : ""} pour « {recherche} »
        </p>
      )}

      {/* Liste clients */}
      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
        {clientsFiltres.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm font-medium">{recherche ? "Aucun client trouvé" : "Aucun client inscrit"}</p>
            {recherche && <p className="text-xs mt-1 opacity-60">Essayez un autre terme de recherche</p>}
          </div>
        ) : (
          clientsFiltres.map(client => {
            const stats = getCourseStats(client);
            const couleur = getCouleurAvatar(client.nom);
            const initiales = getInitiales(client.nom, client.prenom);
            return (
              <div
                key={client.id}
                className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer"
                onClick={() => setClientDetail(client)}
              >
                {/* Avatar */}
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${couleur} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <span className="text-white font-black text-sm">{initiales}</span>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-sm text-foreground truncate">{client.nom}</p>
                    {client.actif === false && (
                      <Badge className="bg-red-100 text-red-600 border-red-200 text-[10px] px-1.5 flex-shrink-0">Bloqué</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" />
                    {formaterTel(client.telephone)}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                      <Package className="w-2.5 h-2.5" />{stats.total}
                    </span>
                    {stats.livrees > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" />{stats.livrees}
                      </span>
                    )}
                    {stats.annulees > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5">
                        <XCircle className="w-2.5 h-2.5" />{stats.annulees}
                      </span>
                    )}
                    <span className={`text-[10px] rounded-full px-2 py-0.5 ${client.latitude ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                      📍 {client.latitude ? "GPS" : "No GPS"}
                    </span>
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="flex flex-col gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant={client.actif === false ? "default" : "destructive"}
                    className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => handleBloquer(client)}
                  >
                    {client.actif === false ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 w-7 p-0 rounded-lg bg-red-700 hover:bg-red-800"
                    disabled={suppressionEnCours === client.id}
                    onClick={() => {
                      if (window.confirm(`Supprimer définitivement ${client.nom} ?`)) handleSupprimer(client);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {clientDetail && (
        <ClientDetailModal
          client={clientDetail}
          courses={courses}
          migrationEnCours={migrationEnCours}
          onClose={() => setClientDetail(null)}
          onBloquer={handleBloquer}
          onMigrer={handleMigrer}
          onSupprimer={handleSupprimer}
          onRefetch={refetch}
        />
      )}
    </div>
  );
}