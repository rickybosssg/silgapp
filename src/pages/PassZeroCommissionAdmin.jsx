import React, { useState } from "react";
import AdminPassOffersPanel from "@/components/admin/AdminPassOffersPanel";
import AdminHappyHourPanel from "@/components/admin/AdminHappyHourPanel";
import AdminPassAchatsPanel from "@/components/admin/AdminPassAchatsPanel";
import { Ticket, Clock, CheckCircle2 } from "lucide-react";

const TABS = [
  { id: "offres", label: "Offres Pass", icon: Ticket },
  { id: "achats", label: "Achats à valider", icon: CheckCircle2 },
  { id: "happyhour", label: "Happy Hour", icon: Clock },
];

export default function PassZeroCommissionAdmin({ countryCode }) {
  const [tab, setTab] = useState("offres");

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-black text-slate-900">Pass Zéro Commission & Happy Hour</h1>
        <p className="text-sm text-slate-500">
          Gérez les offres Pass, validez les achats des livreurs et configurez les Happy Hours.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap ${
                tab === t.id
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "offres" && <AdminPassOffersPanel countryCode={countryCode} />}
      {tab === "achats" && <AdminPassAchatsPanel countryCode={countryCode} />}
      {tab === "happyhour" && <AdminHappyHourPanel countryCode={countryCode} />}
    </div>
  );
}