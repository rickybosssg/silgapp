import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, Trash2, Pencil, ArrowRight, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Sauvegarde ou incrémente un contact dans la base de données.
 * À appeler après une course créée avec succès.
 */
export async function sauvegarderContactDB(clientId, clientTelephone, nom, telephone, type) {
  if (!clientId || !telephone?.trim()) return;
  try {
    const telNormalized = telephone.replace(/\s/g, "");
    // Chercher si ce contact existe déjà pour ce client
    const existants = await base44.entities.ContactCarnet.filter({
      client_id: clientId,
      telephone: telNormalized,
      type,
    });
    if (existants && existants.length > 0) {
      const contact = existants[0];
      await base44.entities.ContactCarnet.update(contact.id, {
        nom: nom || contact.nom,
        nb_utilisations: (contact.nb_utilisations || 1) + 1,
        derniere_utilisation: new Date().toISOString(),
      });
    } else {
      await base44.entities.ContactCarnet.create({
        client_id: clientId,
        client_telephone: clientTelephone,
        nom: nom || "",
        telephone: telNormalized,
        type,
        nb_utilisations: 1,
        derniere_utilisation: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[CarnetAdresses] Erreur sauvegarde:", err);
  }
}

export default function CarnetAdresses({ clientId, type, onSelect }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editNom, setEditNom] = useState("");
  const [editTel, setEditTel] = useState("");

  const { data: contacts = [] } = useQuery({
    queryKey: ["carnet-adresses", clientId, type],
    queryFn: () => base44.entities.ContactCarnet.filter({ client_id: clientId, type }),
    enabled: !!clientId,
    select: (data) =>
      [...data]
        .sort((a, b) => {
          // Trier par nb_utilisations desc, puis par derniere_utilisation desc
          if ((b.nb_utilisations || 1) !== (a.nb_utilisations || 1))
            return (b.nb_utilisations || 1) - (a.nb_utilisations || 1);
          return new Date(b.derniere_utilisation || 0) - new Date(a.derniere_utilisation || 0);
        })
        .slice(0, 10),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ContactCarnet.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["carnet-adresses", clientId, type] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ContactCarnet.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carnet-adresses", clientId, type] });
      setEditingId(null);
    },
  });

  if (!clientId || contacts.length === 0) return null;

  const label = type === "destinataire" ? "Destinataires récents" : "Expéditeurs récents";

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setEditNom(contact.nom || "");
    setEditTel(contact.telephone || "");
  };

  const saveEdit = (id) => {
    updateMutation.mutate({ id, data: { nom: editNom, telephone: editTel.replace(/\s/g, "") } });
  };

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 px-1">
        <Clock className="w-3.5 h-3.5" />
        {label}
      </p>
      <div className="space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-xl border border-gray-200 bg-white overflow-hidden"
          >
            {editingId === contact.id ? (
              /* ── Mode édition ── */
              <div className="p-3 space-y-2">
                <Input
                  value={editNom}
                  onChange={(e) => setEditNom(e.target.value)}
                  placeholder="Nom"
                  className="h-9 text-sm"
                />
                <Input
                  value={editTel}
                  onChange={(e) => setEditTel(e.target.value)}
                  placeholder="Téléphone"
                  className="h-9 text-sm"
                  type="tel"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(contact.id)}
                    className="flex-1 h-9 rounded-lg bg-green-500 text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 h-9 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              /* ── Mode affichage ── */
              <div className="flex items-center gap-3 p-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">
                    {(contact.nom || contact.telephone).charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info cliquable */}
                <button
                  type="button"
                  onClick={() => onSelect({ nom: contact.nom, telephone: contact.telephone })}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {contact.nom || "Sans nom"}
                  </p>
                  <p className="text-xs text-gray-500">{contact.telephone}</p>
                </button>

                {/* Compteur */}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {contact.nb_utilisations || 1}x
                </span>

                {/* Bouton sélectionner */}
                <button
                  type="button"
                  onClick={() => onSelect({ nom: contact.nom, telephone: contact.telephone })}
                  className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 hover:bg-purple-200 flex-shrink-0 transition-colors"
                  title="Utiliser ce contact"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Bouton modifier */}
                <button
                  type="button"
                  onClick={() => startEdit(contact)}
                  className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 hover:bg-blue-100 flex-shrink-0 transition-colors"
                  title="Modifier"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Bouton supprimer */}
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(contact.id)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 flex-shrink-0 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
