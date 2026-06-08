import React, { useState, useEffect } from "react";
import { Clock, Trash2, User, Phone, ArrowRight } from "lucide-react";
import { Preferences } from "@capacitor/preferences";

const STORAGE_KEY = "silgapp_contacts_recents";

// ─── Lecture/écriture des contacts ────────────────────────────────────────────
async function lireContacts() {
  try {
    // Capacitor Preferences (APK) ou localStorage (web)
    if (typeof Preferences !== "undefined") {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      return value ? JSON.parse(value) : [];
    }
  } catch (_) {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

async function ecrireContacts(contacts) {
  const json = JSON.stringify(contacts);
  try {
    if (typeof Preferences !== "undefined") {
      await Preferences.set({ key: STORAGE_KEY, value: json });
    }
  } catch (_) {}
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (_) {}
}

// ─── Fonction exportée pour sauvegarder un contact après soumission ───────────
export async function sauvegarderContactRecent(nom, telephone, type) {
  if (!telephone?.trim()) return;
  try {
    const contacts = await lireContacts();
    const telNormalized = telephone.replace(/\s/g, "");
    const idx = contacts.findIndex(c => c.telephone.replace(/\s/g, "") === telNormalized && c.type === type);
    if (idx >= 0) {
      contacts[idx].nom = nom || contacts[idx].nom;
      contacts[idx].usage_count = (contacts[idx].usage_count || 1) + 1;
      contacts[idx].last_used = new Date().toISOString();
    } else {
      contacts.push({
        nom: nom || "",
        telephone: telNormalized,
        type, // "destinataire" | "expediteur"
        usage_count: 1,
        last_used: new Date().toISOString(),
      });
    }
    // Garder les 30 plus récents
    contacts.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
    await ecrireContacts(contacts.slice(0, 30));
  } catch (_) {}
}

// ─── Composant ────────────────────────────────────────────────────────────────
export default function ContactsRecents({ type = "destinataire", onSelect }) {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    lireContacts().then(all => {
      const filtered = all
        .filter(c => c.type === type)
        .sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1))
        .slice(0, 8);
      setContacts(filtered);
    });
  }, [type]);

  const supprimerContact = async (e, telephone) => {
    e.stopPropagation();
    const all = await lireContacts();
    const updated = all.filter(c => !(c.telephone.replace(/\s/g, "") === telephone.replace(/\s/g, "") && c.type === type));
    await ecrireContacts(updated);
    setContacts(prev => prev.filter(c => c.telephone.replace(/\s/g, "") !== telephone.replace(/\s/g, "")));
  };

  if (contacts.length === 0) return null;

  const labelType = type === "destinataire" ? "Destinataires récents" : "Expéditeurs récents";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 px-1">
        <Clock className="w-3.5 h-3.5" />
        {labelType}
      </p>
      <div className="space-y-1.5">
        {contacts.map((contact, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50 transition-all group"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {(contact.nom || contact.telephone).charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Info — cliquable */}
            <button
              type="button"
              onClick={() => onSelect({ nom: contact.nom, telephone: contact.telephone })}
              className="flex-1 text-left min-w-0"
            >
              <p className="font-semibold text-gray-900 text-sm truncate">
                {contact.nom || "Contact sans nom"}
              </p>
              <p className="text-xs text-gray-500">{contact.telephone}</p>
            </button>

            {/* Compteur utilisations */}
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
              {contact.usage_count}x
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

            {/* Bouton supprimer */}
            <button
              type="button"
              onClick={(e) => supprimerContact(e, contact.telephone)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 flex-shrink-0 transition-colors"
              title="Supprimer ce contact"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}