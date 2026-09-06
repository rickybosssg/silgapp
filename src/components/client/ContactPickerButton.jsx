import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BookUser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pickNativeContact } from "@/lib/nativeAndroid";
import { normalizePhone } from "@/lib/phoneUtils";

export default function ContactPickerButton({ onSelect, countryCode = "", label }) {
  const [loading, setLoading] = useState(false);

  const handlePick = async () => {
    setLoading(true);
    try {
      if (!Capacitor.isNativePlatform()) {
        toast.info("Selection des contacts disponible uniquement sur l'application Android.");
        return;
      }

      const contact = await pickNativeContact();
      const rawPhone = contact?.telephone || contact?.phone || "";
      const normalized = normalizePhone(rawPhone, countryCode);
      if (!normalized) {
        toast.info("Ce contact n'a pas de numero de telephone.");
        return;
      }
      onSelect({ nom: contact?.nom || contact?.name || "Contact", telephone: normalized });
    } catch (err) {
      const msg = err?.message || String(err);
      if (!/annule/i.test(msg)) {
        toast.error("Impossible d'acceder au repertoire. Verifiez les permissions Contacts.");
      }
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