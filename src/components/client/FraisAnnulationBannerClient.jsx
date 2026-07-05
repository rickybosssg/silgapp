import React from "react";
import { CreditCard, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

export default function FraisAnnulationBannerClient({ fraisImpayes = [] }) {
  if (fraisImpayes.length === 0) return null;

  const total = fraisImpayes.reduce((s, f) => s + (f.montant || 250), 0);

  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border-2 border-red-200 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 shadow-md">
        <CreditCard className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-red-900 text-sm">
          Frais d'annulation impayés — {total.toLocaleString()} {fraisImpayes[0]?.devise || "FCFA"}
        </p>
        <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
          {fraisImpayes.length} annulation{fraisImpayes.length > 1 ? "s" : ""} après acceptation livreur. 
          Réglez vos frais auprès de SILGAPP pour éviter le blocage de votre compte.
        </p>
        <div className="flex gap-2 mt-2">
          <Link
            to="/payer-silgapp"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-xl"
          >
            <Wallet className="w-3.5 h-3.5" /> Payer SILGAPP
          </Link>
          <a
            href="https://wa.me/22667572857"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 bg-red-100 px-3 py-1.5 rounded-xl"
          >
            💬 Contacter SILGAPP
          </a>
        </div>
      </div>
    </div>
  );
}