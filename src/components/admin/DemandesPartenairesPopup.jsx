import { COMMERCE_ADMIN_MIGRATION_ENABLED } from '@/lib/commerceAdminMigration';
import CommerceAdminSurface from '@/components/admin/CommerceAdminSurface';
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Pill, X, Bell } from "lucide-react";
import PartenaireDetailDialog from "./PartenaireDetailDialog";

function LegacyDemandesPartenairesPopup({ pharmacyOnly = false } = {}) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("partenaire_demandes_dismissed") || "[]"); } catch { return []; }
  });
  const [selected, setSelected] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [noticeError, setNoticeError] = useState("");
  const [acknowledging, setAcknowledging] = useState(null);
  const [shown, setShown] = useState([]);
  useEffect(() => { base44.auth.me().then(me => { if (me?.role === "admin") setAdmin(me); }).catch(() => {}); }, []);
  const adminReady = !!admin && (admin.admin_type !== "pays" || !!admin.country_code);
  const countryScope = admin?.admin_type === "pays" ? { pays_code: admin.country_code } : {};
  const { data: nouvellesBoutiques = [], error: nouvellesError } = useQuery({
    queryKey: ["nouvelles-boutiques-directes", admin?.id, admin?.country_code],
    enabled: adminReady && !pharmacyOnly,
    queryFn: async () => {
      if (pharmacyOnly) return [];
      const rows = await base44.entities.Boutique.filter({ ...countryScope, creation_directe: true, creation_admin_notifiee: false }, "created_date", 100);
      if (!Array.isArray(rows)) throw new Error("Réponse de notification invalide");
      if (admin.admin_type === "pays" && rows.some(row => row.pays_code !== admin.country_code)) throw new Error("Pays de notification invalide");
      return rows;
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const acknowledgeCreation = async (item) => {
    if (pharmacyOnly) return;
    if (acknowledging) return;
    setAcknowledging(item.id);
    setNoticeError("");
    try {
      const me = await base44.auth.me();
      const current = await base44.entities.Boutique.get(item.id);
      if (me?.role !== "admin" || (me.admin_type === "pays" && (!me.country_code || current?.pays_code !== me.country_code))) throw new Error("Accès administrateur requis");
      if (!current?.creation_directe) throw new Error("Notification indisponible");
      const raw = await base44.entities.Boutique.update(item.id, { creation_admin_notifiee: true });
      const saved = raw?.data ?? raw;
      if (saved?.id !== item.id || saved.creation_admin_notifiee !== true) throw new Error("Lecture non confirmée. Actualisez avant de réessayer.");
      queryClient.invalidateQueries({ queryKey: ["nouvelles-boutiques-directes"] });
    } catch (error) { setNoticeError(error.message || "Impossible de confirmer la lecture"); }
    finally { setAcknowledging(null); }
  };

  // Fetch all partners en attente
  const { data: boutiquesAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-boutiques", admin?.id, admin?.country_code],
    enabled: adminReady && !pharmacyOnly,
    queryFn: () => pharmacyOnly ? Promise.resolve([]) : base44.entities.Boutique.filter({ ...countryScope, validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });
  const { data: restaurantsAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-restaurants", admin?.id, admin?.country_code],
    enabled: adminReady && !pharmacyOnly,
    queryFn: () => pharmacyOnly ? Promise.resolve([]) : base44.entities.Restaurant.filter({ ...countryScope, validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });
  const { data: pharmaciesAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-pharmacies", admin?.id, admin?.country_code],
    enabled: adminReady,
    queryFn: () => base44.entities.Pharmacie.filter({ ...countryScope, validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });

  const allDemandes = [
    ...(pharmacyOnly ? [] : nouvellesBoutiques).map(b => ({ ...b, _type: "boutique", _creation: true })),
    ...(pharmacyOnly ? [] : boutiquesAttente).map(b => ({ ...b, _type: "boutique" })),
    ...(pharmacyOnly ? [] : restaurantsAttente).map(r => ({ ...r, _type: "restaurant" })),
    ...pharmaciesAttente.map(p => ({ ...p, _type: "pharmacie" })),
  ].filter(d => !dismissed.includes(d.id));

  const demandeIds = allDemandes.map(item => item._type + ":" + item.id).sort().join("|");
  useEffect(() => {
    const ids = demandeIds ? demandeIds.split("|") : [];
    if (ids.some(id => !shown.includes(id))) {
      setShowModal(true);
      setShown(previous => [...new Set([...previous, ...ids])]);
    }
  }, [demandeIds, shown]);

  const handleDismiss = (id) => {
    const newDismissed = [...new Set([...dismissed, id])];
    setDismissed(newDismissed);
    localStorage.setItem("partenaire_demandes_dismissed", JSON.stringify(newDismissed));
  };

  const handleOpenDetail = (item) => {
    setSelected({ etablissement: item, type: item._type });
  };

  if (!adminReady || (allDemandes.length === 0 && !showModal && !nouvellesError)) return null;

  const typeIcon = (type) => type === "restaurant" ? UtensilsCrossed : type === "pharmacie" ? Pill : Store;
  const typeColor = (type) => type === "restaurant" ? "bg-orange-100 text-orange-600" : type === "pharmacie" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-600";
  const typeLabel = (type) => type === "restaurant" ? "Restaurant" : type === "pharmacie" ? "Pharmacie" : "Boutique";

  return (
    <>
      {/* Bouton flottant — point rouge si demandes en attente */}
      {allDemandes.length > 0 && !showModal && (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 shadow-xl shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-105"
        >
          <Bell className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {allDemandes.length}
          </span>
        </button>
      )}

      {/* Modal des demandes */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-white" />
                <div>
                  <h2 className="text-base font-black text-white">Nouveaux partenaires</h2>
                  <p className="text-xs text-white/70">{allDemandes.length} notification(s) à consulter</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Liste */}
            <div className="p-4 space-y-3">
              {(noticeError || nouvellesError) && <p role="alert" className="text-sm text-red-600">{noticeError || "Impossible de charger les nouvelles boutiques. Réessayez à la reconnexion."}</p>}
              {allDemandes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucune demande en attente</p>
              ) : (
                allDemandes.map(item => {
                  const Icon = typeIcon(item._type);
                  return (
                    <div key={item.id} className="rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className={`w-11 h-11 rounded-xl ${typeColor(item._type)} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                        {item.logo_url ? <img src={item.logo_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{item.nom}</p>
                        {item._creation && <p className="text-xs text-blue-700">Nouvelle boutique active · commission à vérifier</p>}
                        <p className="text-xs text-gray-500">{typeLabel(item._type)} · {item.user_email || "—"}</p>
                        <p className="text-[10px] text-gray-400">{item.quartier || ""} {item.ville ? `· ${item.ville}` : ""} · {item.pays_code}</p>
                      </div>
                      <button
                        onClick={() => handleOpenDetail(item)}
                        className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex-shrink-0"
                      >
                        {item._creation ? "Voir / commission" : "Examiner"}
                      </button>
                      {item._creation && <button disabled={!!acknowledging} onClick={() => acknowledgeCreation(item)} className="text-xs font-bold text-slate-600 p-2">Bien reçu</button>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog détail */}
      <PartenaireDetailDialog
        open={!!selected}
        etablissement={selected?.etablissement}
        type={selected?.type}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

export default function DemandesPartenairesPopup(props={}) {
  const enabled=props.commerceMigrationEnabled ?? COMMERCE_ADMIN_MIGRATION_ENABLED;
  if(enabled!==true)return <LegacyDemandesPartenairesPopup {...props} />;
  
  return <><CommerceAdminSurface context={props.commerceAdminContext} type={"boutique"} mode="popup" parentId={undefined} onClose={props.onClose} /><LegacyDemandesPartenairesPopup pharmacyOnly={true} /></>;
}
