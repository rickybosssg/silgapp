import React, { useState } from "react";
import { BookUser, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Bouton pour sélectionner un contact depuis le répertoire Android natif.
 * Utilise @capacitor-community/contacts.
 * Fallback : toast d'info sur web.
 * 
 * Props :
 * - onSelect: ({ nom, telephone }) => void
 * - countryCode: code pays (ex: "BF") pour normaliser le numéro
 * - label: texte du bouton (optionnel)
 */

const INDICATIFS = {
  BF: "226", CI: "225", TG: "228", BJ: "229",
  SN: "221", ML: "223", GN: "224", NE: "227",
};

function normaliserNumero(numero, countryCode = "BF") {
  if (!numero) return "";
  // Supprimer espaces, tirets, parenthèses, points
  let n = numero.replace(/[\s\-().]/g, "");
  // Supprimer préfixe +
  n = n.replace(/^\+/, "");
  const indicatif = INDICATIFS[countryCode] || "226";
  // Déjà avec indicatif
  if (n.startsWith(indicatif) && n.length === indicatif.length + 8) return "+" + n;
  // Commence par 00 + indicatif
  if (n.startsWith("00" + indicatif)) return "+" + n.slice(2);
  // Numéro local à 8 chiffres
  if (/^\d{8}$/.test(n)) return "+" + indicatif + n;
  // Sinon retourner tel quel avec +
  return "+" + n;
}

export default function ContactPickerButton({ onSelect, countryCode = "BF", label }) {
  const [loading, setLoading] = useState(false);

  const handlePick = async () => {
    setLoading(true);
    try {
      // Tenter import Capacitor Contacts
      if (typeof window !== "undefined" && window.Capacitor) {
        const { Contacts } = await import("@capacitor-community/contacts");

        // Demander la permission
        const perm = await Contacts.requestPermissions();
        if (perm?.contacts !== "granted") {
          toast.error("Permission contacts refusée. Autorisez l'accès dans les paramètres.");
          return;
        }

        // Récupérer tous les contacts (avec numéro)
        const result = await Contacts.getContacts({
          projection: {
            name: true,
            phones: true,
          },
        });

        const contacts = (result?.contacts || []).filter(c =>
          c.phones && c.phones.length > 0
        );

        if (contacts.length === 0) {
          toast.info("Aucun contact avec numéro trouvé dans votre répertoire.");
          return;
        }

        // Créer un sélecteur natif : sheet en bas
        showContactSheet(contacts, onSelect, countryCode);
      } else {
        toast.info("Sélection des contacts disponible uniquement sur l'application Android.");
      }
    } catch (err) {
      console.error("[ContactPicker]", err);
      toast.error("Impossible d'accéder au répertoire. Vérifiez les permissions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePick}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-60"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <BookUser className="w-3.5 h-3.5" />}
      {label || "Mes contacts"}
    </button>
  );
}

/**
 * Affiche un bottom sheet modal pour sélectionner un contact.
 * Injecté en dehors du composant React pour simplicité.
 */
function showContactSheet(contacts, onSelect, countryCode) {
  // Créer le conteneur
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); 
    display: flex; align-items: flex-end;
    animation: fadeIn 0.2s ease;
  `;

  const sheet = document.createElement("div");
  sheet.style.cssText = `
    background: white; border-radius: 24px 24px 0 0;
    padding: 16px 16px 32px; width: 100%; max-height: 75vh;
    display: flex; flex-direction: column;
    box-shadow: 0 -8px 32px rgba(0,0,0,0.15);
    animation: slideUp 0.25s ease;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;";
  header.innerHTML = `
    <span style="font-weight: 900; font-size: 15px; color: #111;">📋 Choisir un contact</span>
    <button id="close-contact-sheet" style="width:32px;height:32px;border-radius:12px;border:none;background:#f3f4f6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">✕</button>
  `;

  // Search
  const searchWrap = document.createElement("div");
  searchWrap.style.cssText = "position: relative; margin-bottom: 10px;";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Rechercher un contact...";
  searchInput.style.cssText = `
    width: 100%; padding: 10px 12px 10px 36px; border-radius: 12px;
    border: 2px solid #e5e7eb; font-size: 14px; box-sizing: border-box;
    outline: none; background: #f9fafb;
  `;
  searchInput.onfocus = () => { searchInput.style.borderColor = "#dc2626"; };
  searchInput.onblur  = () => { searchInput.style.borderColor = "#e5e7eb"; };
  const searchIcon = document.createElement("span");
  searchIcon.style.cssText = "position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:15px;";
  searchIcon.textContent = "🔍";
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);

  // Liste scrollable
  const list = document.createElement("div");
  list.style.cssText = "overflow-y: auto; flex: 1;";

  const renderContacts = (search = "") => {
    list.innerHTML = "";
    const filtered = contacts.filter(c => {
      const nom = [c.name?.display, c.name?.given, c.name?.family].filter(Boolean).join(" ");
      return !search || nom.toLowerCase().includes(search.toLowerCase());
    }).slice(0, 100);

    filtered.forEach(c => {
      const nom = [c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(" ")][0] || "Sans nom";
      const phones = c.phones || [];
      phones.forEach(phone => {
        const numBrut = phone.number || "";
        const numNorm = normaliserNumero(numBrut, countryCode);
        const item = document.createElement("button");
        item.type = "button";
        item.style.cssText = `
          display: flex; align-items: center; gap: 12px;
          width: 100%; padding: 10px 12px; border: none;
          background: white; border-radius: 14px; cursor: pointer;
          transition: background 0.15s; text-align: left; margin-bottom: 4px;
        `;
        item.onmouseenter = () => { item.style.background = "#f3f4f6"; };
        item.onmouseleave = () => { item.style.background = "white"; };
        item.innerHTML = `
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#dc2626,#ef4444);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:white;font-weight:900;font-size:14px;">
            ${(nom[0] || "?").toUpperCase()}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nom}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${numNorm}</div>
          </div>
        `;
        item.addEventListener("click", () => {
          onSelect({ nom, telephone: numNorm });
          document.body.removeChild(overlay);
        });
        list.appendChild(item);
      });
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:#9ca3af;font-size:13px;">Aucun contact trouvé</div>`;
    }
  };

  renderContacts();
  searchInput.addEventListener("input", () => renderContacts(searchInput.value));

  sheet.appendChild(header);
  sheet.appendChild(searchWrap);
  sheet.appendChild(list);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Fermeture
  const closeBtn = header.querySelector("#close-contact-sheet");
  closeBtn?.addEventListener("click", () => document.body.removeChild(overlay));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });

  // Focus search
  setTimeout(() => searchInput.focus(), 300);
}