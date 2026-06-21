import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, UserPlus, Loader2, User, Truck, Store, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function NewConversationDialog({ open, onClose, myType, myId, myName, onStart }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // 🔐 Règle métier : client↔livreur UNIQUEMENT si course active entre eux
  // client↔client : OK, livreur↔livreur : OK
  useEffect(() => {
    if (!open) { setSearch(""); setResults([]); return; }
    if (search.length < 2) { setResults([]); return; }
    
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const s = search.toLowerCase();

        // Charger les courses actives de l'utilisateur pour filtrer client↔livreur
        let activeCoursePartnerIds = new Set();
        if (myType === "client" || myType === "livreur") {
          try {
            const filterField = myType === "client" ? "expediteur_client_id" : "livreur_id";
            const partnerField = myType === "client" ? "livreur_id" : "expediteur_client_id";
            const courses = await base44.entities.CourseExterne.filter({}, "-created_date", 200);
            for (const c of courses || []) {
              if (c.statut === "livree" || c.statut === "annulee") continue;
              if (myType === "client" && (c.expediteur_client_id === myId || c.destinataire_client_id === myId || c.created_by_id === myId)) {
                if (c.livreur_id) activeCoursePartnerIds.add(`livreur:${c.livreur_id}`);
              }
              if (myType === "livreur" && c.livreur_id === myId) {
                if (c.expediteur_client_id) activeCoursePartnerIds.add(`client:${c.expediteur_client_id}`);
                if (c.destinataire_client_id) activeCoursePartnerIds.add(`client:${c.destinataire_client_id}`);
              }
            }
          } catch (_) {}
        }

        const promises = [];
        
        // Chercher parmi les livreurs
        promises.push(
          base44.entities.Livreur.list().then(all => {
            return all.filter(l => {
              if (myType === "livreur" && l.id === myId) return false;
              const txt = `${l.prenom || ""} ${l.nom || ""} ${l.telephone || ""}`.toLowerCase();
              if (!txt.includes(s)) return false;

              // 🔐 RESTRICTION : client cherche livreur → course active obligatoire
              if (myType === "client" && !activeCoursePartnerIds.has(`livreur:${l.id}`)) return false;

              return true;
            }).slice(0, 10).map(l => ({
              type: "livreur",
              id: l.id,
              name: `${l.prenom || ""} ${l.nom || ""}`.trim() || l.telephone,
              phone: l.telephone,
              photo: l.photo_url,
              restricted: myType === "client", // badge d'info
            }));
          }).catch(() => [])
        );
        
        // Chercher parmi les clients
        promises.push(
          base44.entities.ClientExterne.list().then(all => {
            return all.filter(c => {
              if (myType === "client" && c.id === myId) return false;
              const txt = `${c.prenom || ""} ${c.nom || ""} ${c.telephone || ""}`.toLowerCase();
              if (!txt.includes(s)) return false;

              // 🔐 RESTRICTION : livreur cherche client → course active obligatoire
              if (myType === "livreur" && !activeCoursePartnerIds.has(`client:${c.id}`)) return false;

              return true;
            }).slice(0, 10).map(c => ({
              type: "client",
              id: c.id,
              name: `${c.prenom || ""} ${c.nom || ""}`.trim() || c.telephone,
              phone: c.telephone,
              restricted: myType === "livreur",
            }));
          }).catch(() => [])
        );
        
        // 🔓 Client peut contacter librement les boutiques & restaurants (renseignements / commandes)
        if (myType === "client") {
          // Récupérer le pays du client pour l'isolation
          let clientPays = null;
          try {
            const me = await base44.entities.ClientExterne.filter({ id: myId });
            if (me && me.length > 0) clientPays = me[0].country_code;
          } catch (_) {}

          promises.push(
            base44.entities.Boutique.filter({ actif: true }).then(all => {
              return (all || []).filter(b => {
                if (clientPays && b.pays_code !== clientPays) return false;
                const txt = `${b.nom || ""} ${b.ville || ""} ${b.quartier || ""} ${b.categorie || ""}`.toLowerCase();
                return txt.includes(s);
              }).slice(0, 10).map(b => ({
                type: "partenaire",
                subType: "boutique",
                id: b.id,
                name: b.nom,
                phone: b.telephone,
                photo: b.logo_url,
              }));
            }).catch(() => [])
          );

          promises.push(
            base44.entities.Restaurant.filter({ actif: true }).then(all => {
              return (all || []).filter(r => {
                if (clientPays && r.pays_code !== clientPays) return false;
                const txt = `${r.nom || ""} ${r.ville || ""} ${r.quartier || ""} ${r.specialite || ""}`.toLowerCase();
                return txt.includes(s);
              }).slice(0, 10).map(r => ({
                type: "partenaire",
                subType: "restaurant",
                id: r.id,
                name: r.nom,
                phone: r.telephone,
                photo: r.logo_url,
              }));
            }).catch(() => [])
          );
        }

        const arr = await Promise.all(promises);
        setResults([...arr[0], ...arr[1], ...(arr[2] || []), ...(arr[3] || [])].slice(0, 15));
      } catch {}
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, open, myType, myId]);

  const [validating, setValidating] = useState(false);

  const startConversation = async (user) => {
    const participants = [
      { type: myType, id: myId, name: myName },
      { type: user.type, id: user.id, name: user.name },
    ];

    // 🔐 Validation serveur : client↔livreur nécessite course active
    if (myType !== user.type) {
      setValidating(true);
      try {
        const res = await base44.functions.invoke('verifierConversationAutorisee', { participants });
        if (!res?.data?.autorise) {
          alert(res?.data?.raison || 'Conversation non autorisée — aucune course active ne vous relie.');
          setValidating(false);
          return;
        }
      } catch (err) {
        alert('Erreur de validation. Veuillez réessayer.');
        setValidating(false);
        return;
      }
      setValidating(false);
    }
    
    // Vérifier si une conversation existe déjà
    const existing = await base44.entities.Conversation.list();
    const found = existing.find(c => {
      try {
        const parts = JSON.parse(c.participants || "[]");
        const ids = parts.map(p => `${p.type}:${p.id}`).sort().join(",");
        const newIds = participants.map(p => `${p.type}:${p.id}`).sort().join(",");
        return ids === newIds;
      } catch { return false; }
    });

    if (found) {
      onStart(found.id);
    } else {
      const conv = await base44.entities.Conversation.create({
        participants: JSON.stringify(participants),
        group_type: "direct",
        title: `${myName} ↔ ${user.name}`,
      });
      onStart(conv.id);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 rounded-2xl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" />
            Nouvelle discussion
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          {(myType === "client" || myType === "livreur") && (
            <div className="flex items-center gap-1.5 mb-2 px-1 flex-wrap">
              {myType === "client" && (
                <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full font-semibold">
                  🏪 Boutiques & restaurants librement contactables
                </span>
              )}
              <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                {myType === "client" ? "🔒 Livreurs avec course active uniquement" : "🔒 Clients avec course active uniquement"}
              </span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={myType === "client" ? "Rechercher un livreur, une boutique, un restaurant..." : myType === "livreur" ? "Rechercher un client lié à vos courses..." : "Rechercher un livreur ou client..."}
              autoFocus
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto px-2 pb-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
          {!loading && search.length < 2 && (
            <p className="text-xs text-gray-400 text-center py-8">
              Tapez au moins 2 caractères pour rechercher
            </p>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-xs text-gray-400">
                Aucun résultat pour "{search}"
              </p>
              {(myType === "client" || myType === "livreur") && (
                <p className="text-[10px] text-amber-600 bg-amber-50 rounded-xl px-3 py-1.5 mx-4">
                  {myType === "client"
                    ? "🔒 Vous ne voyez que les livreurs avec qui vous avez une course active."
                    : "🔒 Vous ne voyez que les clients avec qui vous avez une course active."}
                </p>
              )}
            </div>
          )}
          {results.map(user => (
            <button
              key={`${user.type}-${user.id}`}
              onClick={() => startConversation(user)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0 overflow-hidden",
                user.type === "livreur" ? "bg-blue-500" : user.type === "partenaire" ? "bg-purple-500" : "bg-emerald-500"
              )}>
                {user.photo
                  ? <img src={user.photo} alt="" className="w-full h-full object-cover" />
                  : user.type === "livreur" ? <Truck className="w-4 h-4" />
                  : user.type === "partenaire" ? (user.subType === "restaurant" ? <UtensilsCrossed className="w-4 h-4" /> : <Store className="w-4 h-4" />)
                  : <User className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.subType === "restaurant" ? "Restaurant" : user.subType === "boutique" ? "Boutique" : user.type}</p>
              </div>
              <div className="flex items-center gap-1">
                {user.restricted && (
                  <span className="text-[9px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                    Course active
                  </span>
                )}
                <span className="text-[10px] font-semibold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {user.subType === "restaurant" ? "Restaurant" : user.subType === "boutique" ? "Boutique" : user.type === "livreur" ? "Livreur" : "Client"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}