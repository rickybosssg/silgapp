import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  User, X, Check, Star, Search, Loader2, Smartphone, Phone, BookUser, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

const FREQUENT_CONTACTS_KEY = "silgapp_frequent_contacts";

export default function ContactPicker({ type = "destinataire", onSelect }) {
  const [showContacts, setShowContacts] = useState(false);
  const [frequentContacts, setFrequentContacts] = useState([]);
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("frequent");
  const [permissionDenied, setPermissionDenied] = useState(false);

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
      console.error("Erreur chargement contacts fréquents:", err);
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
      console.error("Erreur sauvegarde contact fréquent:", err);
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

  const loadPhoneContacts = async () => {
    setLoading(true);
    setPermissionDenied(false);
    try {
      if (!Capacitor.isNativePlatform()) {
        toast.info("Fonctionnalité disponible uniquement sur l'application mobile");
        setLoading(false);
        return;
      }

      // Essai 1 : Plugin Capacitor Contacts officiel (@capacitor-community/contacts)
      if (window.CapacitorContacts || (window.Capacitor?.Plugins?.Contacts)) {
        const ContactsPlugin = window.Capacitor?.Plugins?.Contacts || window.CapacitorContacts;
        
        // Demander la permission
        try {
          const permResult = await ContactsPlugin.requestPermissions();
          if (permResult?.contacts === 'denied' || permResult?.readContacts === 'denied') {
            setPermissionDenied(true);
            toast.error("Permission refusée. Autorisez l'accès dans Paramètres > Applications > SILGAPP > Contacts");
            setLoading(false);
            return;
          }
        } catch (_) {}

        const result = await ContactsPlugin.getContacts({
          projection: { name: true, phones: true }
        });

        const contacts = (result?.contacts || [])
          .filter(c => c.phones && c.phones.length > 0)
          .map(c => ({
            nom: c.name?.display || c.name?.given || c.name?.family || "Contact",
            telephone: c.phones[0]?.number || "",
          }))
          .filter(c => c.telephone)
          .slice(0, 200);

        setPhoneContacts(contacts);
        if (contacts.length > 0) toast.success(`${contacts.length} contacts chargés`);
        else toast.info("Aucun contact avec numéro trouvé");
        setLoading(false);
        return;
      }

      // Essai 2 : API window.contacts (ancienne méthode)
      if (window.contacts && window.contacts.getContacts) {
        const result = await window.contacts.getContacts({ fields: ['name', 'phone'], limit: 200 });
        if (result.contacts && result.contacts.length > 0) {
          const formatted = result.contacts
            .filter(c => c.phone && c.phone.length > 0)
            .map(c => ({
              nom: c.name || "Contact",
              telephone: c.phone?.[0] || c.phones?.[0]?.value || "",
            }))
            .filter(c => c.telephone)
            .slice(0, 200);
          setPhoneContacts(formatted);
          toast.success(`${formatted.length} contacts importés`);
        } else {
          toast.info("Aucun contact trouvé");
        }
        setLoading(false);
        return;
      }

      // Essai 3 : Contact Picker API Web (Chrome Android)
      if (navigator.contacts && navigator.contacts.select) {
        const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        const formatted = contacts
          .filter(c => c.tel && c.tel.length > 0)
          .map(c => ({
            nom: c.name?.[0] || "Contact",
            telephone: c.tel[0] || "",
          }))
          .filter(c => c.telephone);
        setPhoneContacts(formatted);
        if (formatted.length > 0) toast.success(`${formatted.length} contacts importés`);
        else toast.info("Aucun contact sélectionné");
        setLoading(false);
        return;
      }

      toast.error("Accès aux contacts non disponible sur cet appareil");
    } catch (err) {
      console.error("Erreur lecture contacts:", err);
      if (err.message?.toLowerCase().includes('permission') || err.message?.toLowerCase().includes('denied')) {
        setPermissionDenied(true);
        toast.error("Permission refusée. Allez dans Paramètres > Applications > SILGAPP pour l'autoriser.");
      } else {
        toast.error("Impossible d'accéder aux contacts : " + (err.message || "Erreur inconnue"));
      }
    } finally {
      setLoading(false);
    }
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

  const isNative = Capacitor.isNativePlatform();
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
                <button
                  type="button"
                  onClick={() => setShowContacts(false)}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 rounded-none h-12 flex-shrink-0">
                <TabsTrigger value="frequent" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none rounded-none font-semibold gap-2">
                  <Star className="w-4 h-4" />
                  Fréquents
                </TabsTrigger>
                <TabsTrigger
                  value="phone"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none rounded-none font-semibold gap-2"
                  onClick={() => { if (phoneContacts.length === 0 && isNative) loadPhoneContacts(); }}
                >
                  <Smartphone className="w-4 h-4" />
                  Téléphone
                </TabsTrigger>
              </TabsList>

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

              <TabsContent value="phone" className="flex-1 overflow-y-auto p-4 space-y-3 m-0">
                {!isNative ? (
                  <div className="text-center py-10 text-gray-400">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Smartphone className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="font-medium text-gray-500">Fonctionnalité mobile uniquement</p>
                    <p className="text-xs mt-1">Disponible sur l'application Android/iOS</p>
                  </div>
                ) : permissionDenied ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <p className="font-bold text-gray-700 mb-1">Permission refusée</p>
                    <p className="text-xs text-gray-500 mb-4 px-4">
                      Allez dans Paramètres &gt; Applications &gt; SILGAPP &gt; Autorisations &gt; Contacts
                    </p>
                    <Button onClick={loadPhoneContacts} className="bg-purple-600 hover:bg-purple-700 text-white">
                      Réessayer
                    </Button>
                  </div>
                ) : phoneContacts.length === 0 ? (
                  <div className="text-center py-10">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
                        <p className="font-medium text-purple-600">Chargement des contacts...</p>
                        <p className="text-xs text-gray-400">Veuillez patienter</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                          <Phone className="w-8 h-8 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">Accéder à mon répertoire</p>
                          <p className="text-xs text-gray-500 mt-1 px-4">
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