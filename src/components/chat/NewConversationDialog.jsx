import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, UserPlus, Loader2, User, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function NewConversationDialog({ open, onClose, myType, myId, myName, onStart }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(""); setResults([]); return; }
    if (search.length < 2) { setResults([]); return; }
    
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const s = search.toLowerCase();
        const promises = [];
        
        // Chercher parmi les livreurs (sauf soi-même si livreur)
        if (myType !== "livreur" || true) {
          promises.push(
            base44.entities.Livreur.list().then(all => {
              // Filtrer côté client (pas de filtre full-text dispo)
              return all.filter(l => {
                if (myType === "livreur" && l.id === myId) return false;
                const txt = `${l.prenom || ""} ${l.nom || ""} ${l.telephone || ""}`.toLowerCase();
                return txt.includes(s);
              }).slice(0, 10).map(l => ({
                type: "livreur",
                id: l.id,
                name: `${l.prenom || ""} ${l.nom || ""}`.trim() || l.telephone,
                phone: l.telephone,
                photo: l.photo_url,
              }));
            }).catch(() => [])
          );
        }
        
        // Chercher parmi les clients
        if (myType !== "client" || true) {
          promises.push(
            base44.entities.ClientExterne.list().then(all => {
              return all.filter(c => {
                if (myType === "client" && c.id === myId) return false;
                const txt = `${c.prenom || ""} ${c.nom || ""} ${c.telephone || ""}`.toLowerCase();
                return txt.includes(s);
              }).slice(0, 10).map(c => ({
                type: "client",
                id: c.id,
                name: `${c.prenom || ""} ${c.nom || ""}`.trim() || c.telephone,
                phone: c.telephone,
              }));
            }).catch(() => [])
          );
        }
        
        const arr = await Promise.all(promises);
        setResults([...arr[0], ...arr[1]].slice(0, 15));
      } catch {}
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, open, myType, myId]);

  const startConversation = async (user) => {
    // Créer les participants
    const participants = [
      { type: myType, id: myId, name: myName },
      { type: user.type, id: user.id, name: user.name },
    ];
    
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un livreur ou client..."
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
            <p className="text-xs text-gray-400 text-center py-8">
              Aucun résultat pour "{search}"
            </p>
          )}
          {results.map(user => (
            <button
              key={`${user.type}-${user.id}`}
              onClick={() => startConversation(user)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0",
                user.type === "livreur" ? "bg-blue-500" : "bg-emerald-500"
              )}>
                {user.type === "livreur" ? <Truck className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.type}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {user.type === "livreur" ? "Livreur" : "Client"}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}