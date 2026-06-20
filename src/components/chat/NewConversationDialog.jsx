import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, UserPlus, Loader2, User, Truck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NewConversationDialog({ open, onClose, myType, myId, myName, onStart }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setResults([]);
      return;
    }
    if (search.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const term = search.toLowerCase();
        const activeCoursePartnerIds = new Set();

        if (myType === "client" || myType === "livreur") {
          try {
            const courses = await base44.entities.CourseExterne.filter({}, "-created_date", 200);
            for (const course of courses || []) {
              if (course.statut === "livree" || course.statut === "annulee") continue;

              if (
                myType === "client" &&
                (course.expediteur_client_id === myId ||
                  course.destinataire_client_id === myId ||
                  course.created_by_id === myId)
              ) {
                if (course.livreur_id) activeCoursePartnerIds.add(`livreur:${course.livreur_id}`);
              }

              if (myType === "livreur" && course.livreur_id === myId) {
                if (course.expediteur_client_id) activeCoursePartnerIds.add(`client:${course.expediteur_client_id}`);
                if (course.destinataire_client_id) activeCoursePartnerIds.add(`client:${course.destinataire_client_id}`);
              }
            }
          } catch {
            // La validation serveur reste la source de verite au demarrage de la conversation.
          }
        }

        const livreursPromise = base44.entities.Livreur.list()
          .then((all) => all.filter((livreur) => {
            if (myType === "livreur" && livreur.id === myId) return false;
            const text = `${livreur.prenom || ""} ${livreur.nom || ""} ${livreur.telephone || ""}`.toLowerCase();
            if (!text.includes(term)) return false;
            if (myType === "client" && !activeCoursePartnerIds.has(`livreur:${livreur.id}`)) return false;
            return true;
          }).slice(0, 10).map((livreur) => ({
            type: "livreur",
            id: livreur.id,
            name: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim() || livreur.telephone,
            phone: livreur.telephone,
            photo: livreur.photo_url,
            restricted: myType === "client",
          })))
          .catch(() => []);

        const clientsPromise = base44.entities.ClientExterne.list()
          .then((all) => all.filter((client) => {
            if (myType === "client" && client.id === myId) return false;
            const text = `${client.prenom || ""} ${client.nom || ""} ${client.telephone || ""}`.toLowerCase();
            if (!text.includes(term)) return false;
            if (myType === "livreur" && !activeCoursePartnerIds.has(`client:${client.id}`)) return false;
            return true;
          }).slice(0, 10).map((client) => ({
            type: "client",
            id: client.id,
            name: `${client.prenom || ""} ${client.nom || ""}`.trim() || client.telephone,
            phone: client.telephone,
            restricted: myType === "livreur",
          })))
          .catch(() => []);

        const [livreurs, clients] = await Promise.all([livreursPromise, clientsPromise]);
        setResults([...livreurs, ...clients].slice(0, 15));
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [search, open, myType, myId]);

  const startConversation = async (user) => {
    const participants = [
      { type: myType, id: myId, name: myName },
      { type: user.type, id: user.id, name: user.name },
    ];

    if (myType !== user.type) {
      setValidating(true);
      try {
        const res = await base44.functions.invoke("verifierConversationAutorisee", { participants });
        if (!res?.data?.autorise) {
          alert(res?.data?.raison || "Conversation non autorisee: aucune course active ne vous relie.");
          return;
        }
      } catch {
        alert("Erreur de validation. Veuillez reessayer.");
        return;
      } finally {
        setValidating(false);
      }
    }

    const existing = await base44.entities.Conversation.list();
    const found = existing.find((conversation) => {
      try {
        const parts = JSON.parse(conversation.participants || "[]");
        const ids = parts.map((p) => `${p.type}:${p.id}`).sort().join(",");
        const newIds = participants.map((p) => `${p.type}:${p.id}`).sort().join(",");
        return ids === newIds;
      } catch {
        return false;
      }
    });

    if (found) {
      onStart(found.id);
    } else {
      const conversation = await base44.entities.Conversation.create({
        participants: JSON.stringify(participants),
        group_type: "direct",
        title: `${myName} - ${user.name}`,
      });
      onStart(conversation.id);
    }
    onClose();
  };

  const restrictedText = myType === "client"
    ? "Livreurs avec course active uniquement"
    : "Clients avec course active uniquement";

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
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                <Lock className="w-3 h-3" />
                {restrictedText}
              </span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                myType === "client"
                  ? "Rechercher un livreur lie a vos courses..."
                  : myType === "livreur"
                    ? "Rechercher un client lie a vos courses..."
                    : "Rechercher un livreur ou client..."
              }
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
              Tapez au moins 2 caracteres pour rechercher
            </p>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-xs text-gray-400">Aucun resultat pour "{search}"</p>
              {(myType === "client" || myType === "livreur") && (
                <p className="text-[10px] text-amber-600 bg-amber-50 rounded-xl px-3 py-1.5 mx-4">
                  {myType === "client"
                    ? "Vous ne voyez que les livreurs avec qui vous avez une course active."
                    : "Vous ne voyez que les clients avec qui vous avez une course active."}
                </p>
              )}
            </div>
          )}
          {results.map((userResult) => (
            <button
              key={`${userResult.type}-${userResult.id}`}
              onClick={() => startConversation(userResult)}
              disabled={validating}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0",
                userResult.type === "livreur" ? "bg-blue-500" : "bg-emerald-500"
              )}>
                {userResult.type === "livreur" ? <Truck className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{userResult.name}</p>
                <p className="text-xs text-gray-500 capitalize">{userResult.type}</p>
              </div>
              <div className="flex items-center gap-1">
                {userResult.restricted && (
                  <span className="text-[9px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                    Course active
                  </span>
                )}
                <span className="text-[10px] font-semibold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {userResult.type === "livreur" ? "Livreur" : "Client"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
