import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X, Check, Star, Search, Loader2, Smartphone, Phone, BookUser, AlertCircle, Bug
} from "lucide-react";
import { toast } from "sonner";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

const FREQUENT_CONTACTS_KEY = "silgapp_frequent_contacts";

// ─── Détection plateforme robuste ─────────────────────────────────────────────
function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const capacitorNative = Capacitor.isNativePlatform();
  // Dans une WebView Capacitor avec serveur distant, isNativePlatform() peut être false
  // On détecte aussi via window.Capacitor ou l'absence totale de window.chrome
  const hasCapacitorGlobal = !!(window.Capacitor && window.Capacitor.Plugins);
  const isWebView = !!(window.ReactNativeWebView || (isAndroid && !/chrome\/\d+/i.test(ua)) || hasCapacitorGlobal);
  const isNative = capacitorNative || hasCapacitorGlobal || isWebView;
  const hasContactPickerAPI = !!(navigator.contacts && navigator.contacts.select);
  const hasCapacitorContacts = !!(window.Capacitor?.Plugins?.Contacts || window.CapacitorContacts);
  
  return {
    isNative,
    isAndroid,
    isIOS,
    capacitorNative,
    hasCapacitorGlobal,
    hasContactPickerAPI,
    hasCapacitorContacts,
    ua: ua.slice(0, 80),
  };
}

export default function ContactPicker({ type = "destinataire", onSelect }) {
  const [showContacts, setShowContacts] = useState(false);
  const [frequentContacts, setFrequentContacts] = useState([]);
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("frequent");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [diagInfo, setDiagInfo] = useState(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    loadFrequentContacts();
  }, []);

  const loadFrequentContacts = async () => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      if (stored.value) {
        const parsed = JSON.parse(stored.value);
        const sorted = parsed.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
        setFrequentContacts(sorted.slice(0, 20));
      }
    } catch (err) {
      console.error("Erreur contacts fréquents:", err);
    }
  };

  const saveFrequentContact = async (contact) => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      let contacts = stored.value ? JSON.parse(stored.value) : [];
      const existing = contacts.find(c => normalizePhone(c.telephone) === normalizePhone(contact.telephone));
      if (existing) {
        existing.usage_count = (existing.usage_count || 1) + 1;
        existing.last_used = new Date().toISOString();
      } else {
        contacts.push({ ...contact, usage_count: 1, last_used: new Date().toISOString() });
      }
      await Preferences.set({ key: FREQUENT_CONTACTS_KEY, value: JSON.stringify(contacts) });
      await loadFrequentContacts();
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
    }
  };

  const normalizePhone = (phone) => {
    if (!phone) return "";
    return phone.replace(/\D/g, "").slice(-8);
  };

  const formatPhone = (phone) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 8) return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "+226 $1 $2 $3 $4");
    if (digits.length === 11 && digits.startsWith("226")) {
      const d = digits.slice(3);
      return "+226 " + d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
    }
    return phone;
  };

  // ─── Chargement contacts depuis le téléphone ─────────────────────────────
  const loadPhoneContacts = async () => {
    setLoading(true);
    setPermissionDenied(false);
    const platform = detectPlatform();
    console.log("[ContactPicker] Platform info:", platform);

    // ── Méthode 1 : Contact Picker API Web (Chrome Android ≥ 80, Capacitor WebView) ──
    if (platform.hasContactPickerAPI) {
      try {
        console.log("[ContactPicker] Using Contact Picker API (navigator.contacts)");
        const props = ["name", "tel"];
        const contacts = await navigator.contacts.select(props, { multiple: true });
        const formatted = contacts
          .filter(c => c.tel && c.tel.length > 0)
          .map(c => ({
            nom: c.name?.[0] || "Contact",
            telephone: c.tel[0]?.replace(/\s/g, "") || "",
          }))
          .filter(c => c.telephone);

        setDiagInfo({ ...platform, method: "ContactPickerAPI", count: formatted.length, error: null });
        setPhoneContacts(formatted);
        if (formatted.length > 0) {
          toast.success(`${formatted.length} contact${formatted.length > 1 ? "s" : ""} importé${formatted.length > 1 ? "s" : ""}`);
        } else {
          toast.info("Aucun contact sélectionné");
        }
        setLoading(false);
        return;
      } catch (err) {
        console.warn("[ContactPicker] Contact Picker API failed:", err.message);
        setDiagInfo({ ...platform, method: "ContactPickerAPI", count: 0, error: err.message });
        if (err.name === "SecurityError" || err.message?.includes("permission")) {
          setPermissionDenied(true);
          toast.error("Permission refusée pour les contacts");
          setLoading(false);
          return;
        }
        // Continuer vers méthode suivante
      }
    }

    // ── Méthode 2 : Plugin Capacitor Contacts (@capacitor-community/contacts) ──
    const ContactsPlugin = window.Capacitor?.Plugins?.Contacts || window.CapacitorContacts;
    if (ContactsPlugin) {
      try {
        console.log("[ContactPicker] Using Capacitor Contacts plugin");
        // Demander permission
        try {
          const perm = await ContactsPlugin.requestPermissions();
          console.log("[ContactPicker] Permission result:", perm);
          if (perm?.contacts === "denied" || perm?.readContacts === "denied") {
            setPermissionDenied(true);
            setDiagInfo({ ...platform, method: "CapacitorContacts", count: 0, error: "Permission denied" });
            toast.error("Permission contacts refusée");
            setLoading(false);
            return;
          }
        } catch (permErr) {
          console.warn("[ContactPicker] Permission request error:", permErr.message);
        }

        const result = await ContactsPlugin.getContacts({ projection: { name: true, phones: true } });
        const formatted = (result?.contacts || [])
          .filter(c => c.phones && c.phones.length > 0)
          .map(c => ({
            nom: c.name?.display || c.name?.given || c.name?.family || "Contact",
            telephone: c.phones[0]?.number?.replace(/\s/g, "") || "",
          }))
          .filter(c => c.telephone)
          .slice(0, 300);

        setDiagInfo({ ...platform, method: "CapacitorContacts", count: formatted.length, error: null });
        setPhoneContacts(formatted);
        if (formatted.length > 0) toast.success(`${formatted.length} contacts chargés`);
        else toast.info("Aucun contact trouvé");
        setLoading(false);
        return;
      } catch (err) {
        console.error("[ContactPicker] Capacitor Contacts error:", err.message);
        setDiagInfo({ ...platform, method: "CapacitorContacts", count: 0, error: err.message });
      }
    }

    // ── Méthode 3 : window.contacts (Cordova/ancienne API) ──
    if (window.contacts && window.contacts.getContacts) {
      try {
        console.log("[ContactPicker] Using window.contacts (Cordova)");
        const result = await window.contacts.getContacts({ fields: ["name", "phone"], limit: 300 });
        const formatted = (result.contacts || [])
          .filter(c => c.phone && c.phone.length > 0)
          .map(c => ({
            nom: c.name || "Contact",
            telephone: c.phone?.[0] || "",
          }))
          .filter(c => c.telephone);
        setDiagInfo({ ...platform, method: "CordovaContacts", count: formatted.length, error: null });
        setPhoneContacts(formatted);
        if (formatted.length > 0) toast.success(`${formatted.length} contacts importés`);
        setLoading(false);
        return;
      } catch (err) {
        console.error("[ContactPicker] window.contacts error:", err.message);
        setDiagInfo({ ...platform, method: "CordovaContacts", count: 0, error: err.message });
      }
    }

    // ── Aucune méthode disponible ──
    const finalDiag = { ...platform, method: "none", count: 0, error: "Aucune API disponible" };
    setDiagInfo(finalDiag);
    setShowDiag(true); // Afficher le diagnostic automatiquement
    console.error("[ContactPicker] No contact API available:", finalDiag);
    toast.error("Impossible d'accéder aux contacts sur cet appareil");
    setLoading(false);
  };

  const handleSelectContact = async (contact, fromPhone = false) => {
    await saveFrequentContact({ nom: contact.nom, telephone: contact.telephone });
    onSelect({ nom: contact.nom, telephone: contact.telephone });
    setShowContacts(false);
    toast.success(`✅ ${contact.nom} sélectionné`);
    if (fromPhone) toast.info("Contact ajouté à vos favoris SILGAPP");
  };

  const filteredFrequent = frequentContacts.filter(c =>
    c.nom?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telephone?.includes(searchQuery)
  );

  const filteredPhone = phoneContacts.filter(c =>
    c.nom?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telephone?.includes(searchQuery)
  );

  const platform = detectPlatform();
  const label = type === "destinataire" ? "Destinataire" : "Expéditeur";

  return (
    <>
      {/* Bouton principal premium */}
      <button
        type="button"
        onClick={() => { setShowContacts(true); setActiveTab("frequent"); }}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 active:scale-[0.98] transition-all duration-200"
      >
        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-200">
          <BookUser className="w-5 h-5 text-white" />
        </div>
        <div className="text-left flex-1">
          <p className="font-bold text-purple-800 text-sm">Choisir dans mes contacts</p>
          <p className="text-xs text-purple-500 mt-0.5">Répertoire • Contacts fréquents</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
          <Search className="w-4 h-4 text-purple-600" />
        </div>
      </button>

      {showContacts && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-purple-600 to-purple-700 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <BookUser className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Choisir un {label.toLowerCase()}</h3>
                    <p className="text-xs text-purple-200">Sélectionnez dans vos contacts</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Bouton diagnostic */}
                  <button
                    type="button"
                    onClick={() => { setShowDiag(!showDiag); if (!diagInfo) setDiagInfo(detectPlatform()); }}
                    className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                    title="Diagnostic"
                  >
                    <Bug className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowContacts(false)}
                    className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Panel diagnostic */}
            {showDiag && (
              <div className="bg-gray-900 text-green-400 p-3 text-xs font-mono flex-shrink-0 overflow-auto max-h-48">
                <p className="text-yellow-400 font-bold mb-1">🔍 DIAGNOSTIC CONTACTS</p>
                <p>APK détecté : <span className={platform.isNative ? "text-green-400" : "text-red-400"}>{platform.isNative ? "OUI ✓" : "NON ✗"}</span></p>
                <p>Capacitor.isNativePlatform() : <span className={platform.capacitorNative ? "text-green-400" : "text-red-400"}>{platform.capacitorNative ? "true ✓" : "false ✗"}</span></p>
                <p>Capacitor global : <span className={platform.hasCapacitorGlobal ? "text-green-400" : "text-red-400"}>{platform.hasCapacitorGlobal ? "OUI ✓" : "NON ✗"}</span></p>
                <p>Android : <span className={platform.isAndroid ? "text-green-400" : "text-gray-400"}>{platform.isAndroid ? "OUI ✓" : "NON"}</span></p>
                <p>Contact Picker API : <span className={platform.hasContactPickerAPI ? "text-green-400" : "text-red-400"}>{platform.hasContactPickerAPI ? "DISPONIBLE ✓" : "NON DISPONIBLE ✗"}</span></p>
                <p>Plugin Capacitor Contacts : <span className={platform.hasCapacitorContacts ? "text-green-400" : "text-red-400"}>{platform.hasCapacitorContacts ? "INSTALLÉ ✓" : "NON INSTALLÉ ✗"}</span></p>
                {diagInfo?.method && <p>Méthode utilisée : <span className="text-cyan-400">{diagInfo.method}</span></p>}
                {diagInfo?.count !== undefined && <p>Contacts trouvés : <span className="text-cyan-400">{diagInfo.count}</span></p>}
                {diagInfo?.error && <p>Erreur : <span className="text-red-400">{diagInfo.error}</span></p>}
                <p className="text-gray-500 truncate mt-1">UA: {platform.ua}</p>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 rounded-none h-12 flex-shrink-0">
                <TabsTrigger value="frequent" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none rounded-none font-semibold gap-2">
                  <Star className="w-4 h-4" />
                  Fréquents
                </TabsTrigger>
                <TabsTrigger
                  value="phone"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none rounded-none font-semibold gap-2"
                  onClick={() => { if (phoneContacts.length === 0) loadPhoneContacts(); }}
                >
                  <Smartphone className="w-4 h-4" />
                  Téléphone
                </TabsTrigger>
              </TabsList>

              {/* Onglet Fréquents */}
              <TabsContent value="frequent" className="flex-1 overflow-y-auto p-4 space-y-3 m-0">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un contact..."
                    className="pl-10 h-12 rounded-xl border-gray-200 bg-gray-50 focus:bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {filteredFrequent.length > 0 ? (
                  <div className="space-y-2">
                    {filteredFrequent.map((contact, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectContact(contact)}
                        className="w-full p-3.5 rounded-2xl border border-gray-100 bg-white hover:border-purple-300 hover:bg-purple-50 active:scale-[0.98] transition-all flex items-center gap-3 shadow-sm"
                      >
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <span className="text-white font-bold text-base">
                            {(contact.nom || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="font-bold text-gray-900 truncate">{contact.nom}</p>
                          <p className="text-sm text-gray-500">{formatPhone(contact.telephone)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{contact.usage_count || 1}x</span>
                          <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                            <Check className="w-4 h-4 text-purple-600" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Star className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="font-medium text-gray-500">
                      {searchQuery ? "Aucun contact trouvé" : "Aucun contact fréquent"}
                    </p>
                    <p className="text-xs mt-1 text-gray-400">
                      {searchQuery ? "Essayez un autre terme" : "Vos contacts utilisés apparaîtront ici"}
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Onglet Téléphone */}
              <TabsContent value="phone" className="flex-1 overflow-y-auto p-4 space-y-3 m-0">
                {permissionDenied ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <p className="font-bold text-gray-700 mb-1">Permission refusée</p>
                    <p className="text-xs text-gray-500 mb-4 px-4">
                      Allez dans Paramètres &gt; Applications &gt; SILGAPP &gt; Autorisations &gt; Contacts
                    </p>
                    <button
                      type="button"
                      onClick={loadPhoneContacts}
                      className="px-5 py-2.5 bg-purple-600 text-white rounded-2xl font-bold text-sm"
                    >
                      Réessayer
                    </button>
                  </div>
                ) : phoneContacts.length === 0 ? (
                  <div className="text-center py-10">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
                        <p className="font-medium text-purple-600">Chargement des contacts...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                          <Phone className="w-8 h-8 text-purple-500" />
                        </div>
                        <div className="px-4">
                          <p className="font-bold text-gray-800">Accéder à mon répertoire</p>
                          <p className="text-xs text-gray-500 mt-1">
                            SILGAPP va demander l'autorisation d'accéder à vos contacts
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={loadPhoneContacts}
                          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl font-bold shadow-lg shadow-purple-200 active:scale-[0.98] transition-all flex items-center gap-2"
                        >
                          <Smartphone className="w-5 h-5" />
                          Ouvrir mon répertoire
                        </button>
                        {/* Info méthode disponible */}
                        <div className="text-xs text-gray-400 text-center px-4">
                          {platform.hasContactPickerAPI
                            ? "📱 API contacts disponible"
                            : platform.hasCapacitorContacts
                            ? "📱 Plugin Capacitor détecté"
                            : "ℹ️ Cliquez pour tester l'accès aux contacts"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Rechercher dans le répertoire..."
                        className="pl-10 h-12 rounded-xl border-gray-200 bg-gray-50 focus:bg-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                      <span>{filteredPhone.length} contact{filteredPhone.length > 1 ? "s" : ""}</span>
                      <button type="button" onClick={loadPhoneContacts} className="text-purple-600 font-medium">
                        Actualiser
                      </button>
                    </div>
                    <div className="space-y-2">
                      {filteredPhone.map((contact, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectContact(contact, true)}
                          className="w-full p-3.5 rounded-2xl border border-gray-100 bg-white hover:border-purple-300 hover:bg-purple-50 active:scale-[0.98] transition-all flex items-center gap-3 shadow-sm"
                        >
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-base">
                              {(contact.nom || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <p className="font-bold text-gray-900 truncate">{contact.nom}</p>
                            <p className="text-sm text-gray-500">{formatPhone(contact.telephone)}</p>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Check className="w-4 h-4 text-purple-600" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="p-4 border-t bg-gray-50 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowContacts(false)}
                className="w-full h-12 rounded-2xl border-2 border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Saisie manuelle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}