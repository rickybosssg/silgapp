import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  User, X, Check, Star, Search, Loader2, Smartphone, Phone
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
      
      const existing = contacts.find(c => 
        normalizePhone(c.telephone) === normalizePhone(contact.telephone)
      );
      
      if (existing) {
        existing.usage_count = (existing.usage_count || 1) + 1;
        existing.last_used = new Date().toISOString();
      } else {
        contacts.push({
          ...contact,
          usage_count: 1,
          last_used: new Date().toISOString(),
        });
      }
      
      await Preferences.set({
        key: FREQUENT_CONTACTS_KEY,
        value: JSON.stringify(contacts),
      });
      
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
    if (digits.length === 8) {
      return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "+226 $1 $2 $3 $4");
    }
    return phone;
  };

  const loadPhoneContacts = async () => {
    setLoading(true);
    try {
      // Vérifier si on est sur mobile natif
      if (!Capacitor.isNativePlatform()) {
        toast.info("Fonctionnalité disponible uniquement sur l'application mobile");
        return;
      }

      // Utiliser l'API Contacts native via window.contacts (Capacitor plugin)
      if (window.contacts && window.contacts.getContacts) {
        const result = await window.contacts.getContacts({
          fields: ['name', 'phone'],
          limit: 100,
        });
        
        if (result.contacts && result.contacts.length > 0) {
          const formatted = result.contacts
            .filter(c => c.name || (c.phone && c.phone.length > 0))
            .map(c => ({
              nom: c.name || 'Contact',
              telephone: c.phone?.[0] || c.phones?.[0]?.value || '',
            }))
            .slice(0, 100);
          
          setPhoneContacts(formatted);
          toast.success(`${formatted.length} contacts importés`);
        } else {
          toast.info("Aucun contact trouvé dans votre répertoire");
        }
      } else {
        toast.error("Plugin contacts non disponible. Vérifiez la configuration Capacitor.");
      }
    } catch (err) {
      console.error("Erreur lecture contacts téléphone:", err);
      if (err.message?.includes('permission')) {
        toast.error("Permission refusée. Autorisez l'accès aux contacts dans les paramètres.");
      } else {
        toast.error("Impossible d'accéder aux contacts");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContact = async (contact, fromPhone = false) => {
    await saveFrequentContact({
      nom: contact.nom,
      telephone: contact.telephone,
    });

    onSelect({
      nom: contact.nom,
      telephone: contact.telephone,
    });

    setShowContacts(false);
    toast.success(`✅ ${contact.nom} sélectionné`);
    
    if (fromPhone) {
      toast.info("Contact ajouté à vos favoris SILGAPP");
    }
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setShowContacts(true);
          setActiveTab("frequent");
        }}
        className="w-full h-12 border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400 font-medium"
      >
        <><User className="w-5 h-5 mr-2" /> 📖 Choisir un contact</>
      </Button>

      {showContacts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col bg-white">
            <div className="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
              <h3 className="font-bold text-lg">
                {type === "destinataire" ? "Destinataire" : "Expéditeur"}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setShowContacts(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2 bg-purple-100">
                <TabsTrigger value="frequent" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                  <Star className="w-4 h-4 mr-1" />
                  Fréquents
                </TabsTrigger>
                <TabsTrigger 
                  value="phone" 
                  className="data-[state=active]:bg-purple-600 data-[state=active]:text-white"
                  onClick={() => {
                    if (phoneContacts.length === 0 && isNative) {
                      loadPhoneContacts();
                    }
                  }}
                >
                  <Smartphone className="w-4 h-4 mr-1" />
                  Téléphone
                </TabsTrigger>
              </TabsList>

              <TabsContent value="frequent" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher..."
                    className="pl-9 h-11"
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
                        className="w-full p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-900">{contact.nom}</p>
                            <p className="text-sm text-gray-600">{formatPhone(contact.telephone)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-100 text-gray-600 text-xs">
                            {contact.usage_count || 1}x
                          </Badge>
                          <Check className="w-5 h-5 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">
                      {searchQuery ? "Aucun contact trouvé" : "Aucun contact fréquent"}
                    </p>
                    <p className="text-xs mt-1">
                      {searchQuery ? "Essayez un autre terme" : "Sélectionnez des contacts pour les ajouter ici"}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="phone" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
                {!isNative ? (
                  <div className="text-center py-8 text-gray-500">
                    <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">Fonctionnalité mobile uniquement</p>
                    <p className="text-xs mt-1 text-gray-400">
                      Disponible sur l'application Android/iOS
                    </p>
                  </div>
                ) : phoneContacts.length === 0 ? (
                  <div className="text-center py-8">
                    {loading ? (
                      <>
                        <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-purple-600" />
                        <p className="text-sm font-medium text-purple-600">Chargement des contacts...</p>
                      </>
                    ) : (
                      <>
                        <Phone className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-400" />
                        <p className="text-sm font-medium text-gray-700">Importer vos contacts</p>
                        <p className="text-xs mt-1 text-gray-500 mb-4">
                          Accédez à votre répertoire téléphonique
                        </p>
                        <Button
                          onClick={loadPhoneContacts}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <Smartphone className="w-4 h-4 mr-2" />
                          Importer depuis mon téléphone
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Rechercher dans le répertoire..."
                        className="pl-9 h-11"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{filteredPhone.length} contact{filteredPhone.length > 1 ? 's' : ''}</span>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-purple-600"
                        onClick={loadPhoneContacts}
                      >
                        Actualiser
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {filteredPhone.map((contact, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectContact(contact, true)}
                          className="w-full p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Phone className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-bold text-gray-900">{contact.nom}</p>
                            <p className="text-sm text-gray-600">{formatPhone(contact.telephone)}</p>
                          </div>
                          <Check className="w-5 h-5 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="p-4 border-t bg-gray-50 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowContacts(false)}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                Utiliser la saisie manuelle
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}