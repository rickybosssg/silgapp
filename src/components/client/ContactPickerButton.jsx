import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BookUser, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pickNativeContact } from "@/lib/nativeAndroid";

const INDICATIFS = {
  BF: "226", CI: "225", TG: "228", BJ: "229",
  SN: "221", ML: "223", GN: "224", NE: "227",
};

function normaliserNumero(numero, countryCode = "BF") {
  if (!numero) return "";
  let n = String(numero).replace(/[\s\-().]/g, "").replace(/^\+/, "");
  const indicatif = INDICATIFS[countryCode] || "226";
  if (n.startsWith("00" + indicatif)) n = n.slice(2);
  if (/^\d{8}$/.test(n)) n = indicatif + n;
  return n.startsWith("+") ? n : "+" + n;
}

export default function ContactPickerButton({ onSelect, countryCode = "BF", label }) {
  const [loading, setLoading] = useState(false);

  const handlePick = async () => {
    setLoading(true);
    try {
      if (!Capacitor.isNativePlatform()) {
        toast.info("Selection des contacts disponible uniquement sur l'application Android.");
        return;
      }

      const contact = await pickNativeContact();
      const telephone = normaliserNumero(contact?.telephone || contact?.phone, countryCode);
      if (!telephone || telephone === "+") {
        toast.info("Ce contact n'a pas de numero de telephone.");
        return;
      }
      onSelect({ nom: contact?.nom || contact?.name || "Contact", telephone });
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
