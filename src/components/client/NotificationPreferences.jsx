import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";

const TOGGLEABLE_CATEGORIES = [
  { key: "marketing", label: "Promotions & offres", description: "Codes promo, réductions spéciales" },
  { key: "info_generale", label: "Informations générales", description: "Nouveautés et annonces SILGAPP" },
];

export default function NotificationPreferences({ userEmail }) {
  const [tokens, setTokens] = useState([]);
  const [disabledCats, setDisabledCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    base44.entities.NotificationToken.filter({ user_email: userEmail })
      .then(toks => {
        setTokens(toks || []);
        try {
          setDisabledCats(JSON.parse(toks?.[0]?.preferences_categories || "[]"));
        } catch {
          setDisabledCats([]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userEmail]);

  const toggleCategory = async (catKey) => {
    const newDisabled = disabledCats.includes(catKey)
      ? disabledCats.filter(c => c !== catKey)
      : [...disabledCats, catKey];
    setDisabledCats(newDisabled);
    setUpdating(true);
    try {
      const prefStr = JSON.stringify(newDisabled);
      for (const token of tokens) {
        await base44.entities.NotificationToken.update(token.id, { preferences_categories: prefStr });
      }
    } catch (err) {
      console.error("Erreur mise à jour préférences:", err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading || tokens.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-gray-600" />
        <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Préférences notifications</p>
      </div>
      <div className="space-y-2">
        {TOGGLEABLE_CATEGORIES.map(cat => {
          const isEnabled = !disabledCats.includes(cat.key);
          return (
            <div key={cat.key} className="flex items-center justify-between bg-white rounded-xl p-3">
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-900">{cat.label}</p>
                <p className="text-[10px] text-gray-500">{cat.description}</p>
              </div>
              <button
                onClick={() => toggleCategory(cat.key)}
                disabled={updating}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${isEnabled ? "bg-primary" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400">⚠️ Les notifications de courses et sécurité sont toujours activées.</p>
    </div>
  );
}